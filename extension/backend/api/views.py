import json
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .ml_model import get_client, predict_spam, predict_spam_batch, explain_spam


@require_http_methods(["GET"])
def get_comments_view(request, video_id):
    print(f"[{datetime.now()}] GET /api/comments/{video_id}", flush=True)
    try:
        from .youtube import fetch_comments
        page_token = request.GET.get("pageToken")
        result = fetch_comments(video_id, page_token=page_token)
        count = len(result.get("comments", []))
        print(f"[{datetime.now()}] Fetched {count} comments (total={result.get('totalVideoComments',0)})", flush=True)
        return JsonResponse(result)
    except Exception as e:
        print(f"[{datetime.now()}] ERROR in get_comments: {e}", flush=True)
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def predict_view(request):
    print(f"[{datetime.now()}] POST /api/predict", flush=True)
    try:
        body = json.loads(request.body)
        text = body.get("text", "")
        model_choice = body.get("model_choice", "Ensemble")
        if not text:
            return JsonResponse({"error": "text is required"}, status=400)

        result = predict_spam(text, model_choice)

        if result.get("label") == "error":
            print(f"[{datetime.now()}] Predict error: {result.get('error')}", flush=True)
            return JsonResponse({"error": result["error"], "label": "error"}, status=500)

        return JsonResponse({
            "data": [{"label": result["label"], "confidence": result["confidence"]}]
        })
    except Exception as e:
        print(f"[{datetime.now()}] CRASH in predict_view: {e}", flush=True)
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def predict_batch_view(request):
    print(f"[{datetime.now()}] POST /api/predict_batch", flush=True)
    try:
        body = json.loads(request.body)
        texts = body.get("texts", [])
        model_choice = body.get("model_choice", "Ensemble")
        if not isinstance(texts, list):
            return JsonResponse({"error": "texts must be a list"}, status=400)
        print(f"[{datetime.now()}] Batch size: {len(texts)}", flush=True)

        batch = predict_spam_batch(texts, model_choice)
        return JsonResponse({"data": batch})
    except Exception as e:
        print(f"[{datetime.now()}] CRASH in predict_batch_view: {e}", flush=True)
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def predict_stream_view(request):
    """SSE endpoint — streams one JSON result per prediction as it completes."""
    from django.http import StreamingHttpResponse
    try:
        body = json.loads(request.body)
        texts = body.get("texts", [])
        model_choice = body.get("model_choice", "Ensemble")
        print(f"[{datetime.now()}] STREAM /api/predict_stream — {len(texts)} texts", flush=True)

        client = get_client()

        def event_stream():
            for i, text in enumerate(texts):
                result = predict_spam(text, model_choice, client=client)
                label = result.get("label", "error")
                confidence = result.get("confidence", 0.0)
                print(f"[{datetime.now()}] Stream #{i}: '{text[:40]}' -> {label} ({confidence:.2%})", flush=True)
                data = json.dumps({"index": i, "text": text, "label": label, "confidence": confidence})
                yield f"data: {data}\n\n"
            yield "data: {\"done\": true}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
    except Exception as e:
        print(f"[{datetime.now()}] CRASH in predict_stream_view: {e}", flush=True)
        return JsonResponse({"error": str(e)}, status=500)



@csrf_exempt
@require_http_methods(["POST"])
def explain_view(request):
    print(f"[{datetime.now()}] POST /api/explain", flush=True)
    try:
        body = json.loads(request.body)
        text = body.get("text", "")
        model_choice = body.get("model_choice", "Ensemble")
        if not text:
            return JsonResponse({"error": "text is required"}, status=400)
        result = explain_spam(text, model_choice)
        if "error" in result:
            return JsonResponse(result, status=500)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)