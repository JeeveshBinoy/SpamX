from googleapiclient.discovery import build
from django.conf import settings

def fetch_comments(video_id, max_results=100, page_token=None):
    """
    Interacts with the Google YouTube Data API v3 to retrieve comment threads for a specific video.
    
    Args:
        video_id (str): The unique YouTube video identifier.
        max_results (int): Number of comments to fetch in this batch (max 100).
        page_token (str): Pagination token for the next batch of results.
        
    Returns:
        dict: A structured object containing comment list, next page token, and total counts.
    """
    # Initialize the YouTube API client
    youtube_service = build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)
    
    print(f"  -> YouTube: Processing video {video_id}...")
    # 1. Fetch metadata: Get the actual total comment count from video statistics
    # This helps the frontend show a progress bar or total count.
    video_meta_response = youtube_service.videos().list(
        part="statistics",
        id=video_id
    ).execute()
    
    total_video_comments_count = 0
    if video_meta_response.get("items"):
        video_stats = video_meta_response["items"][0].get("statistics", {})
        total_video_comments_count = int(video_stats.get("commentCount", 0))
        print(f"  -> YouTube: Statistics found. This video has {total_video_comments_count} total comments.")

    # 2. Fetch the actual comments (top-level threads)
    print(f"  -> YouTube: Fetching batch of comments (pageToken: {page_token or 'Initial'})...")
    youtube_request = youtube_service.commentThreads().list(
        part="snippet",
        videoId=video_id,
        maxResults=max_results,
        textFormat="plainText",
        pageToken=page_token
    )
    api_response = youtube_request.execute()
    
    # Parse the raw API response into a simplified format
    parsed_comments = []
    for comment_item in api_response.get("items", []):
        top_comment_snippet = comment_item["snippet"]["topLevelComment"]["snippet"]
        parsed_comments.append({
            "id": comment_item["id"],
            "text": top_comment_snippet["textDisplay"],
            "author": top_comment_snippet.get("authorDisplayName", "Unknown")
        })
    
    print(f"  -> YouTube: Successfully parsed {len(parsed_comments)} comments.")
    return {
        "comments": parsed_comments,
        "nextPageToken": api_response.get("nextPageToken", None),
        "totalResults": api_response.get("pageInfo", {}).get("totalResults", len(parsed_comments)),
        "totalVideoComments": total_video_comments_count
    }
