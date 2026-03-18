from django.contrib import admin

from .models import AppConfig, PhotoItem


@admin.register(AppConfig)
class AppConfigAdmin(admin.ModelAdmin):
    list_display = ("source_folder", "output_folder", "updated_at")


@admin.register(PhotoItem)
class PhotoItemAdmin(admin.ModelAdmin):
    list_display = ("id", "filename", "state", "exists_on_disk", "updated_at")
    list_filter = ("state", "exists_on_disk")
    search_fields = ("filename", "filepath", "file_hash")
