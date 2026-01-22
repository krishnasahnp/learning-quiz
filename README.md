## Learning Journal PWA + Flask Backend

This project extends the Learning Journal progressive web app with a Flask backend that serves, stores, and mutates reflections inside `backend/reflections.json`. The UI continues to live in the `templates/` + `static/` folders while Flask powers API endpoints that feed content to the browser through the Fetch API.

### Tech Stack
- Flask 3 (Python 3.10+) serving HTML templates and JSON APIs
- JSON file persistence (`backend/reflections.json`)
- Vanilla JS Fetch API for CRUD actions
- Service worker + manifest for installable PWA behaviour

### Key Features
- Dynamic reflections list fetched from `/reflections`
- Add new entries via `/add_reflection`
- Delete any entry with the new `DELETE /reflections/<timestamp>` route (extra backend-powered feature)
- PWA install prompt, offline-first caching with network-first strategy for live reflections

### Project Structure
```
.
├── flask_app.py          # Main Flask entry point
├── backend/
│   └── reflections.json  # JSON datastore
├── static/               # CSS, JS, images, manifest, service worker
└── templates/            # HTML views served by Flask
```

### Running Locally
1. Create and activate a virtual environment (recommended).
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Start Flask:
   ```
   python flask_app.py
   ```
4. Visit `http://localhost:8000/journal` to add and manage reflections.

### API Routes
| Method | Route | Description |
| --- | --- | --- |
| GET | `/reflections` | Returns the current reflections JSON payload. |
| POST | `/add_reflection` | Validates and appends a new reflection to the JSON file. |
| PUT | `/reflections/<timestamp>` | Updates fields on an existing reflection (title, reflection text, etc.). |
| DELETE | `/reflections/<timestamp>` | Removes the reflection identified by its `timestamp` value. |
| GET | `/reflections/search` | Filters reflections by query, week, or tech tag via query parameters. |
| GET | `/healthz` | Lightweight health probe for uptime checks. |

All POST bodies must be JSON. Responses are JSON and include helpful error messages for invalid data.

### Deploying to PythonAnywhere
1. **Upload / Clone**: Push all files to GitHub, then pull them into your PythonAnywhere account (or upload a zip).
2. **Virtualenv**: In PythonAnywhere bash console:
   ```bash
   cd ~/mysite  # or your project folder
   python3.10 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. **WSGI config** (`/var/www/<username>_pythonanywhere_com_wsgi.py`):
   ```python
   import sys
   path = '/home/<username>/mysite'
   if path not in sys.path:
       sys.path.append(path)

   from flask_app import app as application
   ```
4. **Static files**: In the PythonAnywhere web tab, map the URL `/static/` to `/home/<username>/mysite/static/`.
5. **Reload app**: Hit **Reload** in the web tab and browse to your site. The service worker, manifest, and fetch requests will now hit Flask on PythonAnywhere.

You can tail the error log in the web tab if anything fails (`~/<username>.pythonanywhere.com.error.log`).

