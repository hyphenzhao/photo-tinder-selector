import json
from pathlib import Path

from django.contrib import messages
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_POST

from .forms import AppConfigForm
from .models import PhotoItem
from .services import build_stack_queryset, export_favorites, get_config, scan_source_folder, stats


def _stack_context(view_name: str):
    scan_source_folder()
    ids = build_stack_queryset(view_name)
    return {
        "view_name": view_name,
        "stack_ids": ids,
        "stack_ids_json": json.dumps(ids),
        "stats": stats(),
    }


def home(request):
    context = _stack_context("home")
    return render(request, "selector/stack_page.html", context)


def favorites(request):
    context = _stack_context("favorites")
    return render(request, "selector/stack_page.html", context)


def disliked(request):
    context = _stack_context("disliked")
    return render(request, "selector/stack_page.html", context)


def export_page(request):
    scan_result = scan_source_folder()
    config = get_config()
    if request.method == "POST":
        if "save_config" in request.POST:
            form = AppConfigForm(request.POST, instance=config)
            if form.is_valid():
                form.save()
                scan_result = scan_source_folder()
                messages.success(request, "Folders saved and source folder rescanned.")
                return redirect("selector:export")
        elif "rescan" in request.POST:
            scan_result = scan_source_folder()
            messages.success(request, f"Scan complete. Found {scan_result['found']} images.")
            return redirect("selector:export")
        elif "export" in request.POST:
            result = export_favorites()
            if result["error"]:
                messages.error(request, result["error"])
            else:
                messages.success(request, f"Exported {result['copied']} favorite images.")
            return redirect("selector:export")
    else:
        form = AppConfigForm(instance=config)

    return render(
        request,
        "selector/export_page.html",
        {
            "form": form,
            "scan_result": scan_result,
            "stats": stats(),
            "config": config,
            "view_name": "export",
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
        }
    )

@require_GET
def stats_api(request):
    s = stats()
    return JsonResponse(s)


@require_POST
def rate_photo(request, photo_id: int):
    photo = get_object_or_404(PhotoItem, pk=photo_id)
    action = request.POST.get("action")
    if action == "favorite":
        photo.state = PhotoItem.STATE_FAVORITE
    elif action == "dislike":
        photo.state = PhotoItem.STATE_DISLIKE
    elif action == "skip":
        pass
    else:
        return JsonResponse({"ok": False, "error": "Unknown action"}, status=400)
    if action != "skip":
        photo.save(update_fields=["state", "updated_at"])
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
