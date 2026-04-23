from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import TestCase

from .models import AppConfig, PhotoItem
from .services import calculate_file_hash, export_favorites


class ExportFavoritesTests(TestCase):
    def test_repeat_export_does_not_duplicate_existing_file(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source.jpg"
            output = root / "output"
            source.write_bytes(b"same-image-content")

            config = AppConfig.get_solo()
            config.output_folder = str(output)
            config.save(update_fields=["output_folder", "updated_at"])

            PhotoItem.objects.create(
                filepath=str(source),
                file_hash=calculate_file_hash(source),
                filename="source.jpg",
                state=PhotoItem.STATE_FAVORITE,
                exists_on_disk=True,
            )

            first = export_favorites()
            second = export_favorites()

            self.assertEqual(first["copied"], 1)
            self.assertEqual(second["copied"], 0)
            self.assertEqual(sorted(path.name for path in output.iterdir()), ["source.jpg"])

    def test_duplicate_favorites_with_same_content_are_only_copied_once(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            output = root / "output"
            source_one = root / "first.jpg"
            source_two = root / "second.jpg"
            source_one.write_bytes(b"duplicate-content")
            source_two.write_bytes(b"duplicate-content")

            config = AppConfig.get_solo()
            config.output_folder = str(output)
            config.save(update_fields=["output_folder", "updated_at"])

            file_hash = calculate_file_hash(source_one)
            PhotoItem.objects.create(
                filepath=str(source_one),
                file_hash=file_hash,
                filename="first.jpg",
                state=PhotoItem.STATE_FAVORITE,
                exists_on_disk=True,
            )
            PhotoItem.objects.create(
                filepath=str(source_two),
                filename="second.jpg",
                state=PhotoItem.STATE_FAVORITE,
                exists_on_disk=True,
            )

            result = export_favorites()

            self.assertEqual(result["copied"], 1)
            self.assertEqual(len(list(output.iterdir())), 1)
