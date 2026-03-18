# Photo Tinder Selector

A Tinder-like web app for quickly rating photos as **favorite**, **disliked**, or **unread**.

Built with Django for fast local browsing and lightweight photo triage.

## Features

- Set a **source folder** to scan photos from
- Set an **output folder** to export favorite photos into
- Maintain a database of:
  - photo id
  - filepath
  - filename
  - state (`0=unread`, `1=favorite`, `2=dislike`)
- Browse photos in a **random order**
- Tinder-style interactions:
  - swipe right / like → favorite
  - swipe left / dislike → disliked
  - swipe down / skip → remains unread
- Home / Favorite / Disliked / Export top navigation
- Mobile-friendly full-width photo viewing
- Export all favorited photos by copying them to the configured output folder

## Project Structure

```text
Photo-Tinder-Selector/
├── README.md
├── .gitignore
└── rater/
    ├── manage.py
    ├── rater/
    ├── selector/
    ├── templates/
    └── static/
```

## Requirements

- Python 3.14
- Django 6

## Local Setup

From the project root:

```bash
cd rater
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py runserver
```

Then open:

```text
http://127.0.0.1:8000/
```

## First Use

1. Open **Export**
2. Set:
   - **Source folder**: where your images live
   - **Output folder**: where favorites should be copied
3. Click **Save folders**
4. Click **Rescan source**
5. Go back to **Home** and start rating

## Notes

- This project currently uses a local SQLite database.
- Favorite export **copies** files and does not move/delete originals.
- The web UI is intentionally lightweight and local-first.

## Built With

This project was built with:

- **OpenClaw 2026.3.13**
- **ChatGPT GPT-5.4**

## License

Private / to be decided.
