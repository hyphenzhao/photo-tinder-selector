from django.urls import path

from . import views

app_name = "selector"

urlpatterns = [
    path("", views.home, name="home"),
    path("favorites/", views.favorites, name="favorites"),
    path("game/", views.game, name="game"),
    path("disliked/", views.disliked, name="disliked"),
    path("settings/", views.settings_page, name="settings"),
    path("api/photos/<int:photo_id>/", views.photo_api, name="photo_api"),
    path("api/photos/<int:photo_id>/rate/", views.rate_photo, name="rate_photo"),
    path("api/photos/<int:photo_id>/file/", views.serve_photo_file, name="photo_file"),
    path("api/game/<int:photo_id>/", views.game_photo_api, name="game_photo_api"),
    path("api/game/<int:photo_id>/file/", views.serve_game_layer, name="game_layer_file"),
    path("api/stats/", views.stats_api, name="stats_api"),
    path("api/config/save/", views.save_config_api, name="save_config_api"),
    path("api/scan/start/", views.start_scan_api, name="start_scan_api"),
    path("api/scan/status/", views.scan_status_api, name="scan_status_api"),
]
