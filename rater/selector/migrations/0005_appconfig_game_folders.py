from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("selector", "0003_photoitem_file_hash"),
    ]

    operations = [
        migrations.AddField(
            model_name="appconfig",
            name="final_folder",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
        migrations.AddField(
            model_name="appconfig",
            name="original_folder",
            field=models.CharField(blank=True, default="", max_length=1000),
        ),
    ]
