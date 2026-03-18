import random
import shutil
from pathlib import Path

from django.db.models import Count

from .models import AppConfig, PhotoItem

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}


def get_config():
    return AppConfig.get_solo()


def scan_source_folder():
    config = get_config()
    source = Path(config.source_folder).expanduser() if config.source_folder else None
    if not source or not source.exists() or not source.is_dir():
        PhotoItem.objects.update(exists_on_disk=False)
        return {"found": 0, "added": 0, "missing": PhotoItem.objects.count()}

    found_paths = set()
    added = 0
    for path in source.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        resolved = str(path.resolve())
        found_paths.add(resolved)
        _, created = PhotoItem.objects.get_or_create(
            filepath=resolved,
            defaults={"filename": path.name, "exists_on_disk": True},
        )
        if not created:
            PhotoItem.objects.filter(filepath=resolved).update(filename=path.name, exists_on_disk=True)
        else:
            added += 1

    PhotoItem.objects.exclude(filepath__in=found_paths).update(exists_on_disk=False)
    return {
        "found": len(found_paths),
        "added": added,
        "missing": PhotoItem.objects.filter(exists_on_disk=False).count(),
    }


def build_stack_queryset(view_name: str, order_mode: str = "random"):
    qs = PhotoItem.objects.filter(exists_on_disk=True)
    if view_name == "favorites":
        qs = qs.filter(state=PhotoItem.STATE_FAVORITE)
    elif view_name == "disliked":
        qs = qs.filter(state=PhotoItem.STATE_DISLIKE)
    else:
        qs = qs.filter(state=PhotoItem.STATE_UNREAD)

    if order_mode == "recent":
        return list(qs.order_by("-state_changed_at", "-id").values_list("id", flat=True))

    ids = list(qs.values_list("id", flat=True))
    random.shuffle(ids)
    return ids


def export_favorites():
    config = get_config()
    output = Path(config.output_folder).expanduser() if config.output_folder else None
    if not output:
        return {"copied": 0, "error": "Output folder is empty."}
    output.mkdir(parents=True, exist_ok=True)

    copied = 0
    for item in PhotoItem.objects.filter(state=PhotoItem.STATE_FAVORITE, exists_on_disk=True):
        src = Path(item.filepath)
        if not src.exists():
            continue
        dest = output / item.filename
        base = dest.stem
        suffix = dest.suffix
        counter = 1
        while dest.exists():
            dest = output / f"{base}_{counter}{suffix}"
            counter += 1
        shutil.copy2(src, dest)
        copied += 1
    return {"copied": copied, "error": ""}


def stats():
    grouped = PhotoItem.objects.filter(exists_on_disk=True).values("state").annotate(c=Count("id"))
    counts = {row["state"]: row["c"] for row in grouped}
    return {
        "unread": counts.get(PhotoItem.STATE_UNREAD, 0),
        "favorite": counts.get(PhotoItem.STATE_FAVORITE, 0),
        "dislike": counts.get(PhotoItem.STATE_DISLIKE, 0),
        "total": sum(counts.values()),
    }
