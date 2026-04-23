from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("selector", "0006_appconfig_video_folder"),
    ]

    operations = [
        migrations.AddField(
            model_name="appconfig",
            name="last_scan_result",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
