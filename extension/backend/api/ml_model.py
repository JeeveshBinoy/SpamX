import concurrent.futures
from datetime import datetime
from django.conf import settings

# Module-level Gradio client (lazy-initialized, shared)
_client = None

def get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from gradio_client import Client
        space = getattr(settings, "HF_SPACE_ID", "SpamX/SpamX")
        token = getattr(settings, "HF_TOKEN", None)
        print(f"[{datetime.now()}] Connecting to Gradio Space: {space}", flush=True)
        # Use token= kwarg (not hf_token=). For public spaces, don't pass token.
        _client = Client(space) if not token else Client(space, token=token)
        print(f"[{datetime.now()}] Gradio Client initialized OK", flush=True)
    except Exception as e:
        print(f"[{datetime.now()}] Gradio Client FAILED: {e}", flush=True)
        _client = None
    return _client


def predict_spam(text, model_choice="Ensemble", client=None):
    """Returns dict: {label: 'spam'|'ham'|'error', confidence: float}"""
    if not text or not text.strip():
        return {"label": "ham", "confidence": 1.0}
    try:
        c = client or get_client()
        if c is None:
            return {"label": "error", "confidence": 0.0, "error": "Gradio client unavailable"}

        result = c.predict(text=text, model_choice=model_choice, api_name="/predict")

        # result is a tuple: (label_dict, markdown_str)
        if not isinstance(result, (list, tuple)) or len(result) < 1:
            return {"label": "error", "confidence": 0.0, "error": f"Bad response: {result}"}

        label_dict = result[0]
        if not isinstance(label_dict, dict):
            return {"label": "error", "confidence": 0.0, "error": f"Expected dict, got: {label_dict}"}

        raw_label = str(label_dict.get("label", "")).upper().strip()
        confidences = label_dict.get("confidences", [])

        confidence = 0.0
        if isinstance(confidences, list):
            for c_item in confidences:
                if str(c_item.get("label", "")).upper() == raw_label:
                    confidence = float(c_item.get("confidence", 0.0))
                    break

        label = "spam" if "SPAM" in raw_label else "ham"
        print(f"[{datetime.now()}] Predict: '{text[:40]}' -> {label} ({confidence:.2%})", flush=True)
        return {"label": label, "confidence": confidence}

    except Exception as e:
        print(f"[{datetime.now()}] predict_spam error: {e}", flush=True)
        return {"label": "error", "confidence": 0.0, "error": str(e)}


def predict_spam_batch(texts, model_choice="Ensemble"):
    """Returns list of dicts: [{text, label, confidence}]"""
    results = [{"text": t, "label": "error", "confidence": 0.0} for t in texts]
    client = get_client()
    if client is None:
        return results

    def _predict(args):
        idx, text = args
        return idx, predict_spam(text, model_choice, client=client)

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for idx, res in pool.map(_predict, enumerate(texts)):
            results[idx].update(res)
    return results


def explain_spam(text, model_choice="Ensemble"):
    """Returns dict with image, html, dataframe"""
    try:
        c = get_client()
        if c is None:
            return {"error": "Gradio client unavailable"}
        result = c.predict(text=text, model_choice=model_choice, api_name="/explain")
        if not isinstance(result, (list, tuple)) or len(result) < 3:
            return {"error": f"Bad explain response: {result}"}
        return {"image": result[0], "html": result[1], "dataframe": result[2]}
    except Exception as e:
        return {"error": str(e)}