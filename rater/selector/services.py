import hashlib
import random
import re
import shutil
import threading
from pathlib import Path

from django.db import close_old_connections
from django.db.models import Count

from .models import AppConfig, PhotoItem

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_NAME_PATTERN = re.compile(r"outfit_\d+__girl_\d+_layer[12]\.mp4", re.IGNORECASE)
SCAN_LOCK = threading.Lock()
SCAN_STATE = {
    "running": False,
    "current": 0,
    "total": 0,
    "percent": 0,
    "message": "Idle",
    "result": None,
}


def get_config():
    return AppConfig.get_solo()


def calculate_file_hash(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _set_scan_state(**kwargs):
    with SCAN_LOCK:
        SCAN_STATE.update(kwargs)


def get_scan_state():
    with SCAN_LOCK:
        return dict(SCAN_STATE)


def count_ready_videos():
    config = get_config()
    video_root = Path(config.video_folder).expanduser() if config.video_folder else None
    if not video_root or not video_root.exists() or not video_root.is_dir():
        return 0

    ready_pairs = set()
    for path in video_root.rglob("*.mp4"):
        if not path.is_file() or not VIDEO_NAME_PATTERN.match(path.name):
            continue
        stem = path.stem.rsplit("_layer", 1)[0]
        layer = path.stem.rsplit("_layer", 1)[-1]
        ready_pairs.add((stem, layer))

    stems = {stem for stem, layer in ready_pairs if (stem, "1") in ready_pairs and (stem, "2") in ready_pairs}
    return len(stems)


def scan_source_folder(progress_callback=None):
    config = get_config()
    source = Path(config.source_folder).expanduser() if config.source_folder else None
    if not source or not source.exists() or not source.is_dir():
        result = {"found": 0, "added": 0, "missing": PhotoItem.objects.filter(exists_on_disk=False).count()}
        if progress_callback:
            progress_callback(0, 0, "Source folder missing or invalid.")
        return result

    source_prefix = str(source.resolve())
    image_files = [
        path for path in source.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    total = len(image_files)
    found_paths = set()
    seen_hashes = set()
    added = 0

    for index, path in enumerate(image_files, start=1):
        resolved = str(path.resolve())
        found_paths.add(resolved)
        file_hash = calculate_file_hash(path)
        seen_hashes.add(file_hash)

        item = PhotoItem.objects.filter(file_hash=file_hash).first()
        if item:
            changed = []
            if item.filepath != resolved:
                item.filepath = resolved
                changed.append("filepath")
            if item.filename != path.name:
                item.filename = path.name
                changed.append("filename")
            if not item.exists_on_disk:
                item.exists_on_disk = True
                changed.append("exists_on_disk")
            if changed:
                item.save(update_fields=changed + ["updated_at"])
        else:
            item = PhotoItem.objects.filter(filepath=resolved).first()
            if item:
                item.filename = path.name
                item.file_hash = file_hash
                item.exists_on_disk = True
                item.save(update_fields=["filename", "file_hash", "exists_on_disk", "updated_at"])
            else:
                PhotoItem.objects.create(
                    filepath=resolved,
                    file_hash=file_hash,
                    filename=path.name,
                    exists_on_disk=True,
                )
                added += 1

        if progress_callback:
            progress_callback(index, total, f"Scanning {path.name} ({index}/{total})")

    scanned_items = PhotoItem.objects.filter(filepath__startswith=source_prefix)
    scanned_items.exclude(file_hash__in=seen_hashes).update(exists_on_disk=False)
    result = {
        "found": len(found_paths),
        "added": added,
        "missing": PhotoItem.objects.filter(exists_on_disk=False).count(),
    }
    if progress_callback:
        progress_callback(total, total, "Scan complete.")
    return result


def start_scan_task():
    state = get_scan_state()
    if state["running"]:
        return False

    def runner():
        close_old_connections()
        _set_scan_state(running=True, current=0, total=0, percent=0, message="Starting scan...", result=None)

        def callback(current, total, message):
            percent = int((current / total) * 100) if total else 0
            _set_scan_state(current=current, total=total, percent=percent, message=message)

        try:
            result = scan_source_folder(progress_callback=callback)
            config = get_config()
            result["videos_ready"] = count_ready_videos()
            config.last_scan_result = result
            config.save(update_fields=["last_scan_result", "updated_at"])
            _set_scan_state(running=False, percent=100, message="Scan complete.", result=result)
        except Exception as exc:
            _set_scan_state(running=False, message=f"Scan failed: {exc}", result={"error": str(exc)})
        finally:
            close_old_connections()

    threading.Thread(target=runner, daemon=True).start()
    return True


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

    existing_hashes = set()
    for existing in output.iterdir():
        if not existing.is_file() or existing.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        try:
            existing_hashes.add(calculate_file_hash(existing))
        except OSError:
            continue

    copied = 0
    for item in PhotoItem.objects.filter(state=PhotoItem.STATE_FAVORITE, exists_on_disk=True):
        src = Path(item.filepath)
        if not src.exists():
            continue
        try:
            src_hash = item.file_hash or calculate_file_hash(src)
        except OSError:
            continue
        if src_hash in existing_hashes:
            continue
        dest = output / item.filename
        base = dest.stem
        suffix = dest.suffix
        counter = 1
        while dest.exists():
            dest = output / f"{base}_{counter}{suffix}"
            counter += 1
        shutil.copy2(src, dest)
        existing_hashes.add(src_hash)
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
