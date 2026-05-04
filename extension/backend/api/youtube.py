# Import the Google API client builder for YouTube Data API v3
from googleapiclient.discovery import build
# Import Django settings to access the YOUTUBE_API_KEY
from django.conf import settings

# Cache video statistics (comment count) per video ID to avoid redundant API calls on pagination
_stats_cache = {}

def fetch_comments(video_id, max_results=100, page_token=None):
    """
    Fetches comment threads (including replies) for a YouTube video using the YouTube Data API v3.
    
    Args:
        video_id (str): The unique YouTube video identifier (from the ?v= URL parameter).
        max_results (int): Number of top-level comment threads to fetch per page (max 100).
        page_token (str): Pagination token for fetching the next batch of results.
        
    Returns:
        dict: Contains 'comments' list, 'nextPageToken', 'totalResults', and 'totalVideoComments'.
    """
    # Build the YouTube API client using the developer key from Django settings
    youtube_service = build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)
    
    # Log which video is being processed
    print(f"  -> YouTube: Processing video {video_id}...")
    
    # 1. Fetch video statistics — ONLY on first page request (cached for subsequent pages)
    total_video_comments_count = _stats_cache.get(video_id)
    if total_video_comments_count is None:
        # Call the Videos API to get the comment count from video statistics
        video_meta_response = youtube_service.videos().list(
            part="statistics",  # Only request statistics (comment count, view count, etc.)
            id=video_id  # The video to query
        ).execute()
        # Extract the comment count from the statistics, defaulting to 0
        total_video_comments_count = 0
        if video_meta_response.get("items"):
            video_stats = video_meta_response["items"][0].get("statistics", {})
            total_video_comments_count = int(video_stats.get("commentCount", 0))
        # Cache the result so subsequent pages don't make this API call again
        _stats_cache[video_id] = total_video_comments_count
        print(f"  -> YouTube: Statistics found. This video has {total_video_comments_count} total comments.")

    # 2. Fetch comment threads WITH replies using the CommentThreads API
    print(f"  -> YouTube: Fetching batch of comments (pageToken: {page_token or 'Initial'})...")
    youtube_request = youtube_service.commentThreads().list(
        part="snippet,replies",  # Request both the comment snippet and any replies
        videoId=video_id,  # The video whose comments to fetch
        maxResults=max_results,  # Up to 100 comment threads per page
        textFormat="plainText",  # Return plain text (no HTML) — matches DOM innerText for matching
        pageToken=page_token  # Pagination token (None for first page)
    )
    # Execute the API request
    api_response = youtube_request.execute()
    
    # 3. Parse the raw API response into a simplified flat list of comments
    parsed_comments = []
    for comment_item in api_response.get("items", []):
        # Extract the top-level comment text and author
        top_comment_snippet = comment_item["snippet"]["topLevelComment"]["snippet"]
        parsed_comments.append({
            "id": comment_item["id"],  # Unique comment ID
            "text": top_comment_snippet["textDisplay"],  # The actual comment text
            "author": top_comment_snippet.get("authorDisplayName", "Unknown")  # Author name
        })
        # Also extract and include reply comments (if any)
        replies = comment_item.get("replies", {}).get("comments", [])
        for reply in replies:
            reply_snippet = reply["snippet"]
            parsed_comments.append({
                "id": reply["id"],  # Unique reply ID
                "text": reply_snippet["textDisplay"],  # Reply text
                "author": reply_snippet.get("authorDisplayName", "Unknown")  # Reply author
            })
    
    # Log total parsed count (top-level + replies)
    print(f"  -> YouTube: Successfully parsed {len(parsed_comments)} comments (incl. replies).")
    # Return the structured response with pagination support
    return {
        "comments": parsed_comments,  # Flat list of all comments + replies
        "nextPageToken": api_response.get("nextPageToken", None),  # Token for next page (None if last page)
        "totalResults": api_response.get("pageInfo", {}).get("totalResults", len(parsed_comments)),  # Comments in this page
        "totalVideoComments": total_video_comments_count  # Total comments on the entire video
    }
