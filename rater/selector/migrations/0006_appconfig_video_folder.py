from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("selector", "0005_appconfig_game_folders"),
    ]

    operations = [
        migrations.AddField(
            model_name="appconfig",
            name="video_folder",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
    ]
