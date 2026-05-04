# Import standard libraries: concurrent execution, OS operations, base64 encoding, timing, and thread synchronization
import concurrent.futures, os, base64, time, threading
# Import datetime for timestamped logging
from datetime import datetime
# Import Django settings to access HF_SPACE_ID, HF_TOKEN configuration variables
from django.conf import settings

# Singleton instance of the Gradio client — reused across all prediction requests
_gradio_client_instance = None
# Thread-safe event flag for priority management: when cleared, prediction threads pause
priority_event = threading.Event()
# Initially set (unblocked) — predictions run freely until an explain request clears it
priority_event.set()

def get_client():
    """Lazily initializes and returns a singleton Gradio client connected to the HuggingFace Space."""
    global _gradio_client_instance
    # Return cached client if already connected
    if _gradio_client_instance: return _gradio_client_instance
    try:
        # Import Gradio's Client class for connecting to HuggingFace Spaces
        from gradio_client import Client
        # Read the Space ID and optional auth token from Django settings
        sid, tok = getattr(settings, "HF_SPACE_ID", "SpamX/SpamX_HF"), getattr(settings, "HF_TOKEN", None)
        # Create authenticated client if token exists, otherwise anonymous client
        _gradio_client_instance = Client(sid, token=tok) if tok else Client(sid)
        # Log successful connection with timestamp
        safe_log(f"[{datetime.now()}] Connected to {sid}")
    except Exception as e:
        # Log connection failure and reset instance to None for retry on next call
        safe_log(f"[{datetime.now()}] Connection FAILED: {e}")
        _gradio_client_instance = None
    return _gradio_client_instance

def safe_log(m):
    """Prints a log message with flush, falling back to ASCII encoding if Unicode fails."""
    try: print(m, flush=True)  # Attempt direct print with immediate flush
    except:
        # Fallback: encode to ASCII replacing non-ASCII chars, then print
        try: print(str(m).encode('ascii', 'replace').decode('ascii'), flush=True)
        except: pass  # Silently ignore if all logging fails

def _encode_image(inp):
    """Converts a SHAP plot image (file path or URL) to a base64 data URI for embedding in HTML."""
    if not inp: return None  # No image provided
    # Extract file path from string or dict input
    path = inp if isinstance(inp, str) else inp.get("path") if isinstance(inp, dict) else None
    # If input is a dict with a URL, return the URL directly (no encoding needed)
    if isinstance(inp, dict) and inp.get("url"): return inp["url"]
    # If a local file path exists, read and encode it
    if path and os.path.exists(path):
        try:
            with open(path, "rb") as f:
                # Read binary file content and encode to base64 string
                b64 = base64.b64encode(f.read()).decode('utf-8')
                # Determine MIME type from file extension
                ext = path.lower().split(".")[-1]
                mime = "image/png" if ext == "png" else "image/jpeg" if ext in ["jpg", "jpeg"] else "image/webp"
                # Return a complete data URI that can be used as an <img src>
                return f"data:{mime};base64,{b64}"
        except Exception as e: safe_log(f"Encode failed: {e}")  # Log encoding errors
    return None  # Return None if encoding fails or path doesn't exist

def _extract_confidence(data):
    """Parses the Gradio prediction response to extract a clean label ('spam'/'ham') and confidence score."""
    if not isinstance(data, dict): return "error", 0.0  # Invalid response format
    # Extract the raw label string and normalize to uppercase
    raw = str(data.get("label", "")).upper().strip()
    # Try to get confidence scores array from various possible response keys
    scores = data.get("confidences", []) or data.get("labels", [])
    # Map raw label to binary classification: SPAM or HAM
    label = "spam" if any(x in raw for x in ["SPAM", "LABEL_1"]) else "ham"
    # Try direct confidence value from common field names
    val = next((float(data[f]) for f in ["confidence", "score", "prob", "probability"] if data.get(f) is not None), 0.0)
    # If no direct confidence found, search the scores array
    if not val and scores:
        for s in scores:
            sl = str(s.get("label", "")).upper().strip()
            # Match the score entry to our predicted label
            if sl == raw or (raw in ["HAM", "LABEL_0"] and sl in ["HAM", "LABEL_0"]) or (raw in ["SPAM", "LABEL_1"] and sl in ["SPAM", "LABEL_1"]):
                val = float(s.get("confidence", s.get("score", 0.0)))
                break
        # Fallback: use the highest confidence score from any entry
        if not val: val = float(max(scores, key=lambda i: float(i.get("confidence", i.get("score", 0.0)))).get("confidence", 0.0))
    return label, val or 0.0  # Return parsed label and confidence

def predict_spam(text, model_choice="Confidence-based Gating", client=None):
    """Classifies a single comment as SPAM or HAM using the HuggingFace Space. Blocks if explain has priority."""
    # Empty or whitespace-only text is always HAM with 100% confidence
    if not text or not text.strip(): return {"label": "ham", "confidence": 1.0, "spamProb": 0.0, "hamProb": 1.0, "model": "Static"}
    # PRIORITY GATE: If explain_spam() has cleared this event, this thread blocks here
    # until explain completes and calls priority_event.set() — no comments are skipped
    priority_event.wait()
    try:
        # Use provided client or get/create the singleton Gradio client
        gc = client or get_client()
        if not gc: return {"label": "error", "confidence": 0.0, "error": "Backend connection failed"}
        # Call the /predict endpoint on the HuggingFace Space with the comment text
        res = gc.predict(text=text, model_choice=model_choice, api_name="/predict")
        # Validate response format: expect a list/tuple with at least 2 elements [classification, markdown]
        if not isinstance(res, (list, tuple)) or len(res) < 2: return {"label": "error", "confidence": 0.0, "error": f"Bad format: {res}"}
        # Parse the classification result to get clean label and confidence
        lbl, conf = _extract_confidence(res[0])
        # Extract the markdown analysis text and determine which model made the decision
        md, spec = res[1], model_choice
        # Parse "Decision Authority: MuRIL" or "Decision by: XLM-RoBERTa" from the markdown
        for d in ["Decision Authority:", "Decision by:"]:
            if d in md: spec = md.split(d)[1].split("(")[0].strip(); break
        # Return error if label parsing failed
        if lbl == "error": return {"label": "error", "confidence": 0.0, "error": "Parse failed"}
        # Log successful prediction with timestamp, label, confidence, and winning model
        safe_log(f"[{datetime.now()}] Success: {lbl.upper()} ({conf:.4f}) via {spec}")
        # Return complete prediction result with all probability fields
        return {"label": lbl, "confidence": conf, "spamProb": conf if lbl == "spam" else 1 - conf, "hamProb": conf if lbl == "ham" else 1 - conf, "model": spec, "markdown_text": md}
    except Exception as e:
        safe_log(f"Predict Error: {e}")  # Log the prediction error
        # If the error indicates a broken connection, reset the client for reconnection
        if any(x in str(e).lower() for x in ["shutdown", "broken"]):
            global _gradio_client_instance
            _gradio_client_instance = None
        return {"label": "error", "confidence": 0.0, "error": str(e)}

def explain_spam(text, model_choice="Confidence-based Gating"):
    """Generates SHAP explainability analysis for a comment. Has HIGHEST PRIORITY — pauses all predictions."""
    # Clear the priority event — this immediately blocks all predict_spam() threads at their .wait() call
    priority_event.clear()
    safe_log(f"[{datetime.now()}] !!! EXPLAIN PRIORITY ACTIVE - Background Streams Paused")
    try:
        # Retry up to 3 times for transient HuggingFace errors
        for a in range(3):
            try:
                # Get or create the Gradio client
                gc = get_client()
                if not gc: return {"error": "Client unavailable"}
                # Call the /explain endpoint — runs SHAP analysis on HuggingFace Space
                res = gc.predict(text=text, model_choice=model_choice, api_name="/explain")
                # Validate response: expect [shap_plot_image, html_narrative]
                if not isinstance(res, (list, tuple)) or len(res) < 2: return {"error": f"Incomplete: {res}"}
                # Return base64-encoded SHAP image and the HTML narrative/table
                return {"image": _encode_image(res[0]), "html": res[1]}
            except Exception as e:
                # Retry on upstream errors (HuggingFace Space overloaded)
                if "upstream" in str(e) and a < 2: time.sleep(2); continue
                return {"error": str(e)}
    finally:
        # ALWAYS re-set the priority event — unblocks all waiting predict_spam() threads
        priority_event.set()
        safe_log(f"[{datetime.now()}] EXPLAIN COMPLETE - Resuming Background Streams")
