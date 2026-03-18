from django import forms
from .models import AppConfig


class AppConfigForm(forms.ModelForm):
    class Meta:
        model = AppConfig
        fields = ["source_folder", "output_folder"]
        widgets = {
            "source_folder": forms.TextInput(attrs={"class": "form-control", "placeholder": r"e.g. D:\\Photos\\Inbox"}),
            "output_folder": forms.TextInput(attrs={"class": "form-control", "placeholder": r"e.g. D:\\Photos\\Favorites"}),
        }
