import json
from datetime import datetime
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .ml_model import get_client, predict_spam, predict_full, safe_log


@require_http_methods(["GET"])
def get_comments_view(request, video_id):
    """
    HTTP GET endpoint to fetch YouTube comments for a specific video.
    Supports pagination via the 'pageToken' query parameter.
    """
    safe_log(f"[{datetime.now()}] GET Request: Fetching comments for Video ID: {video_id}")
    try:
        from .youtube import fetch_comments
        pagination_token = request.GET.get("pageToken")
        
        # Call the YouTube API wrapper
        api_result = fetch_comments(video_id, page_token=pagination_token)
        
        comment_count = len(api_result.get("comments", []))
        total_available = api_result.get('totalVideoComments', 0)
        
        safe_log(f"[{datetime.now()}] Success: Retrieved {comment_count} comments (Video Total: {total_available})")
        print(f"  --> Batch Info: {comment_count} comments found in this page.")
        return JsonResponse(api_result)
    except Exception as fetch_error:
        safe_log(f"[{datetime.now()}] ERROR in get_comments_view: {fetch_error}")
        return JsonResponse({"error": str(fetch_error)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def predict_stream_view(request):
    """
    Server-Sent Events (SSE) endpoint for real-time comment classification.
    Streams individual JSON objects as soon as each classification completes.
    Uses ThreadPoolExecutor for parallel processing to avoid Vercel timeouts.
    """
    try:
        request_payload = json.loads(request.body)
        target_texts = request_payload.get("texts", [])
        selected_model = request_payload.get("model_choice", "Ensemble")
        
        safe_log(f"[{datetime.now()}] PARALLEL STREAM Started: {len(target_texts)} comments via {selected_model}")

        shared_client = get_client()

        def event_stream_generator():
            from concurrent.futures import ThreadPoolExecutor, as_completed

            # Use a smaller worker count to avoid overwhelming the Gradio space
            with ThreadPoolExecutor(max_workers=10) as executor:
                # Map predictions to a list of futures
                future_to_index = {
                    executor.submit(predict_spam, text, selected_model, client=shared_client): i 
                    for i, text in enumerate(target_texts)
                }

                # yield results as they complete (out of order, but index is preserved)
                for future in as_completed(future_to_index):
                    index = future_to_index[future]
                    comment_text = target_texts[index]
                    try:
                        result = future.result()
                        prediction_label = result.get("label", "error")
                        confidence_score = result.get("confidence", 0.0)
                        actual_model_used = result.get("model", selected_model)
                        
                        stream_data = json.dumps({
                            "index": index, 
                            "text": comment_text, 
                            "label": prediction_label, 
                            "confidence": confidence_score, 
                            "model": actual_model_used
                        })
                        yield f"data: {stream_data}\n\n"
                    except Exception as e:
                        safe_log(f"Future error for index {index}: {e}")
                        yield f"data: {json.dumps({'index': index, 'text': comment_text, 'label': 'error'})}\n\n"
                
            yield "data: {\"done\": true}\n\n"

        response = StreamingHttpResponse(event_stream_generator(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
    except Exception as stream_error:
        safe_log(f"[{datetime.now()}] CRASH in predict_stream_view: {stream_error}")
        return JsonResponse({"error": str(stream_error)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def analyze_view(request):
    """
    Unified endpoint for the diagnostic website.
    Returns both the classification result and the SHAP interpretability report in one request.
    This minimizes latency for the user when opening the "Insights" page.
    """
    safe_log(f"[{datetime.now()}] ANALYZE Request: Starting full analysis pipeline")
    try:
        request_payload = json.loads(request.body)
        input_text = request_payload.get("text", "")
        recommended_model = request_payload.get("model_choice", "Ensemble")
        
        if not input_text:
            return JsonResponse({"error": "No 'text' provided for analysis"}, status=400)
        
        # Run the unified orchestration logic from ml_model.py
        full_analysis_result = predict_full(input_text, recommended_model)
        
        if "error" in full_analysis_result:
            return JsonResponse(full_analysis_result, status=500)
            
        return JsonResponse(full_analysis_result)
    except Exception as analyze_error:
        safe_log(f"[{datetime.now()}] ERROR in analyze_view: {analyze_error}")
        return JsonResponse({"error": str(analyze_error)}, status=500)