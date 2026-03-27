import json
from pathlib import Path

from django.contrib import messages
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
    }


def home(request):
    context = _stack_context(request, "home")
    return render(request, "selector/stack_page.html", context)


def favorites(request):
    context = _stack_context(request, "favorites")
    context["layout_mode"] = "wall" if request.GET.get("layout") == "wall" else "stack"
    if request.headers.get("HX-Request") == "true":
        return render(request, "selector/_favorite_panel.html", context)
    return render(request, "selector/stack_page.html", context)


def disliked(request):
    context = _stack_context(request, "disliked")
    return render(request, "selector/stack_page.html", context)


def export_page(request):
    config = get_config()
    if request.method == "POST" and "export" in request.POST:
        result = export_favorites()
        if result["error"]:
            messages.error(request, result["error"])
        else:
            messages.success(request, f"Exported {result['copied']} favorite images.")
        return redirect("selector:export")

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
            "view_name": "export",
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
