from django.urls import path
from api import views

urlpatterns = [
    path("api/comments/<str:video_id>", views.get_comments_view),
    path("api/predict_stream", views.predict_stream_view),
    path("api/analyze", views.analyze_view),
]