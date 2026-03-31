import json
import re
from pathlib import Path

from django.contrib import messages
from django.core.paginator import Paginator
from django.db.models import Case, IntegerField, Value, When
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .forms import AppConfigForm
from .models import PhotoItem
from .services import (
    build_stack_queryset,
    export_favorites,
    get_config,
    get_scan_state,
    start_scan_task,
    stats,
)


GAME_NAME_PATTERN = re.compile(r"(?:outfit_)?(\d+)__(girl_\d+)_\d+_", re.IGNORECASE)
OUTFIT_NO_PATTERN = re.compile(r"(?:^|_)outfit_(\d+)|^(\d+)_", re.IGNORECASE)
GIRL_NO_PATTERN = re.compile(r"girl_(\d+)", re.IGNORECASE)
GAME_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")


def _ordered_photo_queryset(stack_ids):
    ordering = Case(
        *[When(id=photo_id, then=Value(index)) for index, photo_id in enumerate(stack_ids)],
        output_field=IntegerField(),
    )
    return PhotoItem.objects.filter(id__in=stack_ids, exists_on_disk=True).order_by(ordering).only("id", "filename")


def _favorite_wall_context(context):
    stack_ids = context["stack_ids"]
    page_number = int(context["request"].GET.get("page", 1))
    filters = context["wall_filters"]
    favorite_qs = [photo for photo in _ordered_photo_queryset(stack_ids) if _photo_matches_wall_filters(photo, filters, context.get("view_name") == "game")]
    page_obj = Paginator(favorite_qs, 30).get_page(page_number)
    is_game = context.get("view_name") == "game"
    context["favorite_photos"] = [
        {
            "id": photo.id,
            "filename": photo.filename,
            "image_url": f"/api/game/{photo.id}/file/?layer=1" if is_game else f"/api/photos/{photo.id}/file/",
        }
        for photo in page_obj.object_list
    ]
    context["favorites_next_page"] = page_obj.next_page_number() if page_obj.has_next() else None
    context["favorites_placeholder_count"] = 0
    return context


def _extract_outfit_no(filename: str):
    match = OUTFIT_NO_PATTERN.search(filename or "")
    if not match:
        return None
    return int(match.group(1) or match.group(2))


def _extract_girl_no(filename: str):
    match = GIRL_NO_PATTERN.search(filename or "")
    return int(match.group(1)) if match else None


def _parse_int_or_none(value):
    if value in {None, ""}:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _wall_filters_from_request(request):
    return {
        "outfit_from": _parse_int_or_none(request.GET.get("outfit_from")),
        "outfit_to": _parse_int_or_none(request.GET.get("outfit_to")),
        "girl_from": _parse_int_or_none(request.GET.get("girl_from")),
        "girl_to": _parse_int_or_none(request.GET.get("girl_to")),
        "video_ready": request.GET.get("video_ready", ""),
    }


def _photo_matches_wall_filters(photo: PhotoItem, filters, is_game: bool):
    outfit_no = _extract_outfit_no(photo.filename)
    girl_no = _extract_girl_no(photo.filename)

    if filters["outfit_from"] is not None and (outfit_no is None or outfit_no < filters["outfit_from"]):
        return False
    if filters["outfit_to"] is not None and (outfit_no is None or outfit_no > filters["outfit_to"]):
        return False
    if filters["girl_from"] is not None and (girl_no is None or girl_no < filters["girl_from"]):
        return False
    if filters["girl_to"] is not None and (girl_no is None or girl_no > filters["girl_to"]):
        return False

    if is_game and filters["video_ready"] in {"yes", "no"}:
        layers = _game_layers_for_photo(photo)
        has_videos = bool(layers["videos"].get("1") and layers["videos"].get("2"))
        if filters["video_ready"] == "yes" and not has_videos:
            return False
        if filters["video_ready"] == "no" and has_videos:
            return False

    return True


def _game_video_stem(photo: PhotoItem):
    match = GAME_NAME_PATTERN.search(photo.filename)
    if not match:
        filename = photo.filename
        if filename.startswith("0001_"):
            filename = filename.replace("0001_", "", 1)
        return Path(filename).stem
    outfit_no = int(match.group(1))
    girl_no = _extract_girl_no(match.group(2))
    if girl_no is None:
        return Path(photo.filename).stem
    return f"outfit_{outfit_no:03d}__girl_{girl_no:03d}"


def _find_game_video_path(folder: str, stem: str, layer: str):
    if not folder or not stem or not layer:
        return None
    candidate = Path(folder) / f"{stem}_layer{layer}.mp4"
    if candidate.exists() and candidate.is_file():
        return candidate
    return None


def _find_game_layer_path(folder: str, stem: str):
    if not folder or not stem:
        return None
    root = Path(folder)
    for ext in GAME_EXTENSIONS:
        candidate = root / f"{stem}{ext}"
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _game_layers_for_photo(photo: PhotoItem):
    cfg = get_config()
    match = GAME_NAME_PATTERN.search(photo.filename)
    girl_stem = match.group(2) if match else None
    original = _find_game_layer_path(cfg.original_folder, girl_stem)
    final = _find_game_layer_path(cfg.final_folder, girl_stem)
    video_stem = _game_video_stem(photo)
    video1 = _find_game_video_path(cfg.video_folder, video_stem, "1")
    video2 = _find_game_video_path(cfg.video_folder, video_stem, "2")
    return {
        "1": str(original) if original else None,
        "2": str(Path(photo.filepath)) if Path(photo.filepath).exists() else None,
        "3": str(final) if final else None,
        "girl_stem": girl_stem,
        "videos": {
            "1": str(video1) if video1 else None,
            "2": str(video2) if video2 else None,
        },
    }


def _stack_context(request, view_name: str):
    order_mode = request.GET.get("order", "random")
    if order_mode not in {"random", "recent"}:
        order_mode = "random"
    ids = build_stack_queryset(view_name, order_mode=order_mode)
    return {
        "view_name": view_name,
        "stack_ids": ids,
        "stack_ids_json": json.dumps(ids),
        "stats": stats(),
        "order_mode": order_mode,
        "wall_filters": _wall_filters_from_request(request),
    }


def home(request):
    context = _stack_context(request, "home")
    return render(request, "selector/stack_page.html", context)


def favorites(request):
    context = _stack_context(request, "favorites")
    context["request"] = request
    context["layout_mode"] = "wall" if request.GET.get("layout") == "wall" else "stack"
    _favorite_wall_context(context)
    if request.headers.get("HX-Request") == "true" and request.GET.get("page"):
        return render(request, "selector/_favorite_wall_tiles.html", context)
    if request.headers.get("HX-Request") == "true":
        return render(request, "selector/_favorite_panel.html", context)
    return render(request, "selector/stack_page.html", context)


def game(request):
    context = _stack_context(request, "favorites")
    context["request"] = request
    context["view_name"] = "game"
    context["layout_mode"] = "wall" if request.GET.get("layout") == "wall" else "stack"
    _favorite_wall_context(context)
    if request.headers.get("HX-Request") == "true" and request.GET.get("page"):
        return render(request, "selector/_favorite_wall_tiles.html", context)
    if request.headers.get("HX-Request") == "true":
        return render(request, "selector/_favorite_panel.html", context)
    return render(request, "selector/stack_page.html", context)


def disliked(request):
    context = _stack_context(request, "disliked")
    return render(request, "selector/stack_page.html", context)


def settings_page(request):
    config = get_config()
    if request.method == "POST" and "export" in request.POST:
        result = export_favorites()
        if result["error"]:
            messages.error(request, result["error"])
        else:
            messages.success(request, f"Exported {result['copied']} favorite images.")
        return redirect("selector:settings")

    form = AppConfigForm(instance=config)
    return render(
        request,
        "selector/export_page.html",
        {
            "form": form,
            "scan_result": get_scan_state().get("result") or {"found": 0, "added": 0, "missing": 0},
            "scan_state": get_scan_state(),
            "stats": stats(),
            "config": config,
            "view_name": "settings",
            "order_mode": request.GET.get("order", "random"),
        },
    )


@require_GET
def photo_api(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id, exists_on_disk=True)
    badge = None
    if photo.state == PhotoItem.STATE_FAVORITE:
        badge = "favorite"
    elif photo.state == PhotoItem.STATE_DISLIKE:
        badge = "dislike"
    return JsonResponse(
        {
            "id": photo.id,
            "filename": photo.filename,
            "state": photo.state,
            "image_url": f"/api/photos/{photo.id}/file/",
            "badge": badge,
            "timestamp": photo.state_changed_at.strftime("%Y-%m-%d %H:%M"),
        }
    )


@require_GET
def game_photo_api(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id, exists_on_disk=True)
    layers = _game_layers_for_photo(photo)
    return JsonResponse(
        {
            "id": photo.id,
            "filename": photo.filename,
            "girl_stem": layers["girl_stem"],
            "layers": {
                "1": f"/api/game/{photo.id}/file/?layer=1",
                "2": f"/api/game/{photo.id}/file/?layer=2",
                "3": f"/api/game/{photo.id}/file/?layer=3",
            },
            "videos": {
                "1": f"/api/game/{photo.id}/video/?layer=1" if layers["videos"]["1"] else None,
                "2": f"/api/game/{photo.id}/video/?layer=2" if layers["videos"]["2"] else None,
            },
        }
    )

@require_GET
def stats_api(request):
    s = stats()
    return JsonResponse(s)


@require_POST
def save_config_api(request):
    config = get_config()
    form = AppConfigForm(request.POST, instance=config)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"ok": True, "message": "Folders saved."})


@require_POST
def start_scan_api(request):
    started = start_scan_task()
    return JsonResponse({"ok": True, "started": started, "state": get_scan_state()})


@require_GET
def scan_status_api(request):
    return JsonResponse(get_scan_state())


@require_POST
def rate_photo(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id)
    action = request.POST.get("action")
    if action == "favorite":
        photo.state = PhotoItem.STATE_FAVORITE
        photo.state_changed_at = timezone.now()
    elif action == "dislike":
        photo.state = PhotoItem.STATE_DISLIKE
        photo.state_changed_at = timezone.now()
    elif action == "skip":
        if photo.state == PhotoItem.STATE_UNREAD:
            photo.state_changed_at = timezone.now()
            photo.save(update_fields=["state_changed_at", "updated_at"])
        return JsonResponse({"ok": True, "state": photo.state})
    else:
        return JsonResponse({"ok": False, "error": "Unknown action"}, status=400)
    photo.save(update_fields=["state", "state_changed_at", "updated_at"])
    return JsonResponse({"ok": True, "state": photo.state})


@require_GET
def serve_photo_file(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id)
    path = Path(photo.filepath)
    # Try direct path first
    if not path.exists() or not path.is_file():
        # Try resolving against configured source folder if available
        cfg = get_config()
        if cfg and cfg.source_folder:
            alt = Path(cfg.source_folder) / photo.filename
            if alt.exists() and alt.is_file():
                path = alt
            else:
                # Not found — return useful 404
                raise Http404(f"Image file not found: {photo.filepath}")
    # guess mime
    import mimetypes
    mime, _ = mimetypes.guess_type(str(path))
    return FileResponse(path.open("rb"), content_type=mime or 'application/octet-stream')


@require_GET
def serve_game_video(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id, exists_on_disk=True)
    layers = _game_layers_for_photo(photo)
    layer_path = layers.get("videos", {}).get(request.GET.get("layer", "1"))
    if not layer_path:
        raise Http404("Game video not found")
    path = Path(layer_path)
    if not path.exists() or not path.is_file():
        raise Http404("Game video file not found")
    import mimetypes
    mime, _ = mimetypes.guess_type(str(path))
    return FileResponse(path.open("rb"), content_type=mime or 'application/octet-stream')


@require_GET
def serve_game_layer(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id, exists_on_disk=True)
    layers = _game_layers_for_photo(photo)
    layer_path = layers.get(request.GET.get("layer", "2"))
    if not layer_path:
        raise Http404("Game image layer not found")
    path = Path(layer_path)
    if not path.exists() or not path.is_file():
        raise Http404("Game image file not found")
    import mimetypes
    mime, _ = mimetypes.guess_type(str(path))
    return FileResponse(path.open("rb"), content_type=mime or 'application/octet-stream')
