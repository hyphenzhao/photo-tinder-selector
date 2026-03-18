from django.db import models


class AppConfig(models.Model):
    source_folder = models.CharField(max_length=1000, blank=True, default="")
    output_folder = models.CharField(max_length=1000, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Photo Tinder Selector Config"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class PhotoItem(models.Model):
    STATE_UNREAD = 0
    STATE_FAVORITE = 1
    STATE_DISLIKE = 2
    STATE_CHOICES = (
        (STATE_UNREAD, "Unread"),
        (STATE_FAVORITE, "Favorite"),
        (STATE_DISLIKE, "Disliked"),
    )

    filepath = models.CharField(max_length=1200, unique=True)
    filename = models.CharField(max_length=255)
    state = models.PositiveSmallIntegerField(choices=STATE_CHOICES, default=STATE_UNREAD)
    exists_on_disk = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["filename", "id"]

    def __str__(self):
        return self.filename
