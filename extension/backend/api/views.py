import json
from datetime import datetime
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .ml_model import get_client, predict_spam, explain_spam, safe_log

@require_http_methods(["GET"])
def get_comments_view(request, video_id):
    try:
        from .youtube import fetch_comments
        res = fetch_comments(video_id, page_token=request.GET.get("pageToken"))
        safe_log(f"[{datetime.now()}] Retrieved {len(res.get('comments', []))} comments for {video_id}")
        return JsonResponse(res)
    except Exception as e:
        safe_log(f"Error in get_comments: {e}")
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def predict_stream_view(request):
    try:
        payload = json.loads(request.body)
        texts, model = payload.get("texts", []), payload.get("model_choice", "Confidence-based Gating")
        safe_log(f"[{datetime.now()}] Stream Started: {len(texts)} comments via {model}")
        gc = get_client()

        def event_stream():
            from concurrent.futures import ThreadPoolExecutor, as_completed
            FLUSH = ": " + " " * 4096 + "\n\n"
            safe_log(f"[{datetime.now()}] >>> Stream session started for {len(texts)} comments")
            executor = ThreadPoolExecutor(max_workers=5)
            futures = {}
            try:
                futures = {executor.submit(predict_spam, t, model, client=gc): i for i, t in enumerate(texts)}
                for f in as_completed(futures):
                    idx = futures[f]
                    try:
                        r = f.result()
                        yield f"data: {json.dumps({'index': idx, 'text': texts[idx], 'label': r.get('label', 'error'), 'confidence': r.get('confidence', 0.0), 'model': r.get('model', model)})}\n\n" + FLUSH
                    except Exception as e:
                        yield f"data: {json.dumps({'index': idx, 'text': texts[idx], 'label': 'error'})}\n\n" + FLUSH
                yield "data: {\"done\": true}\n\n" + FLUSH
                safe_log(f"[{datetime.now()}] <<< Stream session completed successfully")
            except (GeneratorExit, ConnectionResetError, BrokenPipeError):
                for f in futures:
                    f.cancel()
                safe_log(f"[{datetime.now()}] !!! Stream ABORTED — cancelled {sum(1 for f in futures if f.cancelled())} pending tasks")
            except Exception as e:
                safe_log(f"[{datetime.now()}] !!! Stream session ERROR: {e}")
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

        res = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        res["Cache-Control"], res["X-Accel-Buffering"] = "no-cache", "no"
        return res
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def predict_single_view(request):
    try:
        p = json.loads(request.body)
        return JsonResponse(predict_spam(p.get("text", ""), p.get("model_choice", "Confidence-based Gating"))) if p.get("text") else JsonResponse({"error": "No text"}, status=400)
    except Exception as e: return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def explain_single_view(request):
    try:
        p = json.loads(request.body)
        return JsonResponse(explain_spam(p.get("text", ""), p.get("model_choice", "Confidence-based Gating"))) if p.get("text") else JsonResponse({"error": "No text"}, status=400)
    except Exception as e: return JsonResponse({"error": str(e)}, status=500)