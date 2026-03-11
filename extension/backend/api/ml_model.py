import concurrent.futures
from datetime import datetime
from django.conf import settings

# Module-level Gradio client (lazy-initialized, shared across requests)
_gradio_client_instance = None

def get_client():
    """
    Lazy-initializes and returns a Gradio Client instance.
    The client is shared across all threads to optimize connection handling.
    """
    global _gradio_client_instance
    if _gradio_client_instance is not None:
        return _gradio_client_instance
    try:
        from gradio_client import Client
        # Fetch configuration from Django settings (populated from .env)
        space_id = getattr(settings, "HF_SPACE_ID", "SpamX/SpamX")
        hf_token = getattr(settings, "HF_TOKEN", None)
        
        safe_log(f"[{datetime.now()}] Initializing connection to HuggingFace Space: {space_id}")
        
        # Connect to the HuggingFace Space. Public spaces do not require a token.
        if hf_token:
            _gradio_client_instance = Client(space_id, token=hf_token)
        else:
            _gradio_client_instance = Client(space_id)
            
        safe_log(f"[{datetime.now()}] Gradio Client successfully initialized")
    except Exception as initialization_error:
        safe_log(f"[{datetime.now()}] Gradio Client initialization FAILED: {initialization_error}")
        _gradio_client_instance = None
        
    return _gradio_client_instance


def safe_log(message):
    """
    Thread-safe logging helper that prevents Unicode crashes on Windows consoles.
    Encodes characters to ASCII if the console doesn't support the full character set.
    """
    try:
        print(message, flush=True)
    except:
        try:
            # Fallback for older Windows terminals that don't support UTF-8 (e.g. Malayalam characters)
            sanitized_message = str(message).encode('ascii', errors='replace').decode('ascii')
            print(sanitized_message, flush=True)
        except:
            pass

def _extract_confidence(prediction_data):
    """
    Robustly parses the label and confidence score from a variety of Gradio response formats.
    Handles nested lists, 'LABEL_0' mappings, and various key names (score, confidence, etc).
    
    Returns:
        tuple: (normalized_label_string, confidence_float)
    """
    if not isinstance(prediction_data, dict):
        return "error", 0.0
    
    # Normalize the label to uppercase for consistent comparison
    raw_label = str(prediction_data.get("label", "")).upper().strip()
    
    # Some models return scores in 'confidences' or 'labels' lists
    detailed_scores = prediction_data.get("confidences", []) or prediction_data.get("labels", [])
    
    # 1. Map raw model labels (like LABEL_1) to human-readable categories
    final_label = "spam" if "SPAM" in raw_label or "LABEL_1" in raw_label else "ham"
    
    # 2. Extract confidence score
    confidence_value = 0.0
    
    # Strategy A: Check top-level keys first
    for field_name in ["confidence", "score", "prob", "probability"]:
        if field_name in prediction_data and prediction_data[field_name] is not None:
            try:
                confidence_value = float(prediction_data[field_name])
                break
            except (ValueError, TypeError): continue

    # Strategy B: Search the detailed scores list if top-level extraction failed
    if (confidence_value == 0.0 or confidence_value is None) and isinstance(detailed_scores, list) and len(detailed_scores) > 0:
        # Step 1: Look for an exact label match
        for score_item in detailed_scores:
            score_label = str(score_item.get("label", "")).upper().strip()
            if score_label == raw_label:
                try:
                    confidence_value = float(score_item.get("confidence", score_item.get("score", 0.0)))
                    break
                except (ValueError, TypeError): continue
        
        # Step 2: Try a mapped match (e.g. if raw is LABEL_0 and item is HAM)
        if confidence_value == 0.0:
            for score_item in detailed_scores:
                score_label = str(score_item.get("label", "")).upper().strip()
                if (raw_label in ["HAM", "LABEL_0"] and score_label in ["HAM", "LABEL_0"]) or \
                   (raw_label in ["SPAM", "LABEL_1"] and score_label in ["SPAM", "LABEL_1"]):
                    try:
                        confidence_value = float(score_item.get("confidence", score_item.get("score", 0.0)))
                        break
                    except (ValueError, TypeError): continue

        # Step 3: Final fallback - pick the highest confidence item that matches the predicted class
        if confidence_value == 0.0:
            try:
                highest_score_item = max(detailed_scores, key=lambda item: float(item.get("confidence", item.get("score", 0.0))))
                highest_score_label = str(highest_score_item.get("label", "")).upper()
                is_spam_match = ("SPAM" in highest_score_label or "LABEL_1" in highest_score_label) == ("SPAM" in raw_label or "LABEL_1" in raw_label)
                if is_spam_match:
                    confidence_value = float(highest_score_item.get("confidence", highest_score_item.get("score", 0.0)))
            except (ValueError, TypeError, KeyError):
                pass

    return final_label, (confidence_value if confidence_value is not None else 0.0)


def predict_spam(text, model_choice="Ensemble", client=None):
    """
    Classifies a single text string as SPAM or HAM.
    
    Args:
        text (str): The comment text to analyze.
        model_choice (str): The specific model or "Ensemble" to use.
        client: Optional existing Gradio client to reuse.
        
    Returns:
        dict: Containing 'label', 'confidence', 'spamProb', 'hamProb', and 'model'.
    """
    if not text or not text.strip():
        # Fast path for empty input
        return {"label": "ham", "confidence": 1.0, "spamProb": 0.0, "hamProb": 1.0, "model": "Static"}
        
    try:
        gradio_client = client or get_client()
        if gradio_client is None:
            return {"label": "error", "confidence": 0.0, "error": "Backend could not connect to Gradio Space"}

        # Perform the prediction via Gradio
        raw_result = gradio_client.predict(text=text, model_choice=model_choice, api_name="/predict")

        if not isinstance(raw_result, (list, tuple)) or len(raw_result) < 1:
            return {"label": "error", "confidence": 0.0, "error": f"Unexpected response format: {raw_result}"}

        prediction_label_dict = raw_result[0]
        final_label, final_confidence = _extract_confidence(prediction_label_dict)
        
        # Determine which specific sub-model made the decision (only applies if model_choice is Ensemble)
        specific_model_name = "Ensemble"
        if len(raw_result) > 1 and isinstance(raw_result[1], str) and "Decision by:" in raw_result[1]:
            try:
                # Response format example: "RESULT: HAM | Decision by: MuRIL (High Confidence Model)"
                log_parts = raw_result[1].split("Decision by:")
                if len(log_parts) > 1:
                    specific_model_name = log_parts[1].split("(")[0].strip()
            except:
                pass
        
        if final_label == "error":
            return {"label": "error", "confidence": 0.0, "error": f"Failed to parse label dictionary: {prediction_label_dict}"}

        safe_log(f"[{datetime.now()}] Prediction Success: '{text[:30]}...' -> {final_label.upper()} ({final_confidence:.4f}) via {specific_model_name}")
        
        return {
            "label": final_label, 
            "confidence": final_confidence,
            "spamProb": final_confidence if final_label == "spam" else 1.0 - final_confidence,
            "hamProb": final_confidence if final_label == "ham" else 1.0 - final_confidence,
            "model": specific_model_name
        }

    except Exception as prediction_exception:
        safe_log(f"[{datetime.now()}] Predict Error: {prediction_exception}")
        # Reset client on connection errors to force re-initialization
        if "shutdown" in str(prediction_exception).lower() or "broken" in str(prediction_exception).lower():
            global _gradio_client_instance
            _gradio_client_instance = None
        return {"label": "error", "confidence": 0.0, "error": str(prediction_exception)}


def explain_spam(text, model_choice="Ensemble"):
    """
    Generates an interpretability report (SHAP) for a given text.
    
    Returns:
        dict: Containing 'image' (base64/path), 'html' (SHAP visualization), and 'dataframe' (token weights).
    """
    try:
        gradio_client = get_client()
        if gradio_client is None:
            return {"error": "Gradio client unavailable"}
            
        # Call the '/explain' endpoint on the Space
        explanation_response = gradio_client.predict(text=text, model_choice=model_choice, api_name="/explain")
        
        if not isinstance(explanation_response, (list, tuple)) or len(explanation_response) < 3:
            return {"error": f"Incomplete explanation response: {explanation_response}"}
            
        safe_log(f"[{datetime.now()}] Explanation Success: SHAP report generated for '{text[:30]}...'")
        return {
            "image": explanation_response[0], 
            "html": explanation_response[1], 
            "dataframe": explanation_response[2]
        }
    except Exception as explain_error:
        safe_log(f"[{datetime.now()}] Explanation Error: {explain_error}")
        return {"error": str(explain_error)}


def predict_full(text, model_choice="Ensemble"):
    """
    High-performance unified call that performs both Prediction and Explanation in one round-trip.
    Reduces latency by minimizing the number of requests between the backend and the ML server.
    """
    try:
        gradio_client = get_client()
        if gradio_client is None:
            return {"error": "Gradio client unavailable"}
        
        # 1. Attempt the optimized unified call first
        try:
            unified_result = gradio_client.predict(text=text, model_choice=model_choice, api_name="/predict_full")
            
            # Expected structure from merged Gradio endpoint:
            # [label_dict, markdown_str, image_obj, html_str, dataframe_obj]
            if not isinstance(unified_result, (list, tuple)) or len(unified_result) < 5:
                raise ValueError(f"Unexpected data count in unified response: {len(unified_result)}")

            prediction_dict = unified_result[0]
            label, confidence = _extract_confidence(prediction_dict)
            
            if label == "error":
                 raise ValueError("Result dictionary parsing failed inside unified call")

            markdown_summary = unified_result[1]
            detailed_confidences = prediction_dict.get("confidences", [])

            safe_log(f"[{datetime.now()}] PredictFull (Unified Orchestration) Successful")
            
            return {
                "label": label,
                "confidence": confidence,
                "spamProb": confidence if label == "spam" else 1.0 - confidence,
                "hamProb": confidence if label == "ham" else 1.0 - confidence,
                "model": "Ensemble", # Currently the Space's unified endpoint implies ensemble context
                "confidences": detailed_confidences,
                "markdown_text": markdown_summary,
                "image": unified_result[2],
                "html": unified_result[3],
                "dataframe": unified_result[4]
            }

        except Exception as unified_call_exception:
            # 2. Fallback: If '/predict_full' is missing or fails (e.g. Space not updated), perform calls sequentially
            safe_log(f"[{datetime.now()}] PredictFull fallback (Sequential calls) triggered: {unified_call_exception}")
            
            prediction_only = predict_spam(text, model_choice, client=gradio_client)
            if prediction_only.get("label") == "error":
                return prediction_only # Stop if classification fails
            
            explanation_only = explain_spam(text, model_choice)
            if "error" in explanation_only:
                # If explanation fails, we still return the prediction to keep the UI functional
                safe_log(f"[{datetime.now()}] Explanation part failed in fallback: {explanation_only['error']}")
                return prediction_only
                
            # Merge both results into a single object
            return {**prediction_only, **explanation_only}
            
    except Exception as general_error:
        return {"error": str(general_error)}