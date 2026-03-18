from django.urls import path

from . import views

app_name = "selector"

urlpatterns = [
    path("", views.home, name="home"),
    path("favorites/", views.favorites, name="favorites"),
    path("disliked/", views.disliked, name="disliked"),
    path("export/", views.export_page, name="export"),
    path("api/photos/<int:photo_id>/", views.photo_api, name="photo_api"),
    path("api/photos/<int:photo_id>/rate/", views.rate_photo, name="rate_photo"),
    path("api/photos/<int:photo_id>/file/", views.serve_photo_file, name="photo_file"),
    path("api/stats/", views.stats_api, name="stats_api"),
]
