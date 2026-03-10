from googleapiclient.discovery import build
from django.conf import settings

def fetch_comments(video_id, max_results=100, page_token=None):
    youtube = build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)
    
    # Get actual total comments count from video statistics
    video_response = youtube.videos().list(
        part="statistics",
        id=video_id
    ).execute()
    
    total_video_comments = 0
    if video_response.get("items"):
        stats = video_response["items"][0].get("statistics", {})
        total_video_comments = int(stats.get("commentCount", 0))

    request = youtube.commentThreads().list(
        part="snippet",
        videoId=video_id,
        maxResults=max_results,
        textFormat="plainText",
        pageToken=page_token
    )
    response = request.execute()
    comments = []
    for item in response.get("items", []):
        snippet = item["snippet"]["topLevelComment"]["snippet"]
        comments.append({
            "id": item["id"],
            "text": snippet["textDisplay"],
            "author": snippet.get("authorDisplayName", "Unknown")
        })
    
    return {
        "comments": comments,
        "nextPageToken": response.get("nextPageToken", None),
        "totalResults": response.get("pageInfo", {}).get("totalResults", len(comments)),
        "totalVideoComments": total_video_comments
    }
