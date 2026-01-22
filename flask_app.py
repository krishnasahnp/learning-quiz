from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import List, Dict, Any

from flask import Flask, jsonify, render_template, request, abort

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "backend" / "reflections.json"
DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
TECH_DATA = DATA_DIR / "technical_quizzes.json"
MEMORY_DATA = DATA_DIR / "memory_match.json"
SCRAMBLE_DATA = DATA_DIR / "word_scramble.json"
REFLECTION_DATA = DATA_DIR / "reflection_puzzles.json"
LEADERBOARD_DATA = DATA_DIR / "leaderboard.json"
USERS_DATA = DATA_DIR / "users.json"

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
    static_url_path="",  # serve static assets from the root for PWA compatibility
)
file_lock = Lock()


def _ensure_json_file(path: Path, default: Any) -> None:
    if not path.exists():
        path.write_text(json.dumps(default, indent=2), encoding="utf-8")


def _read_json(path: Path, default: Any) -> Any:
    _ensure_json_file(path, default)
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _ensure_data_file() -> None:
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def _load_reflections() -> List[Dict[str, Any]]:
    _ensure_data_file()
    try:
        with DATA_FILE.open("r", encoding="utf-8") as source:
            return json.load(source)
    except json.JSONDecodeError:
        return []


def _persist_reflections(entries: List[Dict[str, Any]]) -> None:
    with DATA_FILE.open("w", encoding="utf-8") as target:
        json.dump(entries, target, indent=4)


def _normalize_entry(payload: Dict[str, Any]) -> Dict[str, Any]:
    location = payload.get("location") or {}
    normalized = {
        "week": str(payload.get("week", "")).strip(),
        "title": (payload.get("title") or payload.get("journalName") or "").strip(),
        "date": (payload.get("date") or "").strip(),
        "taskName": (payload.get("taskName") or "").strip(),
        "reflection": (payload.get("reflection") or payload.get("taskDescription") or "").strip(),
        "location": {
            "lat": (location.get("lat") or "").strip(),
            "lon": (location.get("lon") or "").strip(),
            "address": (location.get("address") or "").strip(),
        },
        "tech": payload.get("tech") or [],
        "timestamp": payload.get("timestamp") or datetime.utcnow().isoformat(),
    }
    return normalized


def _validate_entry(entry: Dict[str, Any]) -> List[str]:
    required_fields = ["week", "title", "date", "taskName", "reflection"]
    missing = [field for field in required_fields if not entry.get(field)]
    if not isinstance(entry.get("tech"), list):
        missing.append("tech (must be a list)")
    return missing


@app.route("/")
@app.route("/index")
@app.route("/index.html")
def home():
    return render_template("index.html")


@app.route("/journal")
@app.route("/journal.html")
def journal_page():
    return render_template("journal.html")


@app.route("/about")
@app.route("/about.html")
def about_page():
    return render_template("about.html")


@app.route("/projects")
@app.route("/projects.html")
def projects_page():
    return render_template("projects.html")


@app.route("/quiz")
@app.route("/quiz.html")
def quiz_page():
    return render_template("quiz.html")


@app.route("/reflections", methods=["GET"])
def get_reflections():
    entries = sorted(
        _load_reflections(),
        key=lambda entry: entry.get("date") or entry.get("timestamp"),
        reverse=True,
    )
    return jsonify(entries)


@app.route("/add_reflection", methods=["POST"])
def add_reflection():
    payload = request.get_json(silent=True) or {}
    normalized = _normalize_entry(payload)
    errors = _validate_entry(normalized)

    if errors:
        return jsonify({"status": "error", "message": "Invalid data", "errors": errors}), 400

    with file_lock:
        entries = _load_reflections()
        entries.append(normalized)
        _persist_reflections(entries)

    return jsonify({"status": "success", "entry": normalized}), 201


@app.route("/reflections/<entry_id>", methods=["DELETE"])
def delete_reflection(entry_id: str):
    if not entry_id:
        abort(400, description="Missing entry identifier")

    with file_lock:
        entries = _load_reflections()
        updated = [entry for entry in entries if str(entry.get("timestamp")) != entry_id]

        if len(entries) == len(updated):
            abort(404, description="Reflection not found")

        _persist_reflections(updated)

    return "", 204


@app.route("/reflections/<entry_id>", methods=["PUT"])
def update_reflection(entry_id: str):
    if not entry_id:
        abort(400, description="Missing entry identifier")

    payload = request.get_json(silent=True) or {}
    if not payload:
        abort(400, description="No update payload provided")

    allowed_fields = {"week", "title", "date", "taskName", "reflection", "tech", "location"}

    updates: Dict[str, Any] = {}
    for field in allowed_fields:
        if field not in payload:
            continue
        value = payload[field]

        if field == "location":
            loc = value if isinstance(value, dict) else {}
            updates["location"] = {
                "lat": str(loc.get("lat") or "").strip(),
                "lon": str(loc.get("lon") or "").strip(),
                "address": str(loc.get("address") or "").strip(),
            }
        elif field == "tech":
            if not isinstance(value, list):
                abort(400, description="tech must be an array")
            updates["tech"] = value
        else:
            updates[field] = str(value or "").strip()

    if not updates:
        abort(400, description="No valid fields provided for update")

    with file_lock:
        entries = _load_reflections()
        for index, entry in enumerate(entries):
            if str(entry.get("timestamp")) == entry_id:
                entry.update(updates)
                missing = _validate_entry(entry)
                if missing:
                    abort(400, description=f"Invalid entry after update: {missing}")

                entries[index] = entry
                _persist_reflections(entries)
                return jsonify(entry)

    abort(404, description="Reflection not found")


@app.route("/reflections/search", methods=["GET"])
def search_reflections():
    query = (request.args.get("q") or "").strip().lower()
    week = (request.args.get("week") or "").strip()
    tech = (request.args.get("tech") or "").strip()

    entries = _load_reflections()

    def matches(entry: Dict[str, Any]) -> bool:
        if query:
            haystack = " ".join(
                str(entry.get(field, "")) for field in ("title", "taskName", "reflection")
            ).lower()
            if query not in haystack:
                return False
        if week and str(entry.get("week")) != week:
            return False
        if tech:
            if tech not in entry.get("tech", []):
                return False
        return True

    filtered = sorted(
        (entry for entry in entries if matches(entry)),
        key=lambda entry: entry.get("date") or entry.get("timestamp"),
        reverse=True,
    )

    return jsonify(filtered)


@app.route("/healthz", methods=["GET"])
def healthcheck():
    return jsonify({"status": "ok"}), 200


@app.route("/service-worker.js")
def service_worker():
    return app.send_static_file("service-worker.js")


@app.route("/manifest.json")
def manifest():
    return app.send_static_file("manifest.json")


@app.route("/offline")
def offline():
    return app.send_static_file("offline.html")


@app.route("/api/questions/<mode>", methods=["GET"])
def api_questions(mode: str):
    mode = mode.lower()
    mapping = {
        "technical": (TECH_DATA, "technicalQuizzes"),
        "memory": (MEMORY_DATA, "memoryMatch"),
        "wordscramble": (SCRAMBLE_DATA, "wordScramble"),
        "reflection": (REFLECTION_DATA, "reflectionPuzzle"),
    }
    if mode not in mapping:
        abort(404, description="Unknown quiz mode")

    path, key = mapping[mode]
    data = _read_json(path, {key: []})
    return jsonify(data.get(key, []))


@app.route("/api/users", methods=["POST"])
def api_users():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("userName") or "").strip()
    if not 2 <= len(name) <= 50:
        return jsonify({"status": "error", "message": "Invalid userName"}), 400

    with file_lock:
        data = _read_json(USERS_DATA, {"users": []})
        user_id = f"user_{int(datetime.utcnow().timestamp() * 1000)}"
        record = {"userId": user_id, "userName": name, "createdAt": datetime.utcnow().isoformat()}
        data["users"].append(record)
        _write_json(USERS_DATA, data)
    return jsonify(record), 201


@app.route("/api/leaderboard", methods=["GET"])
def api_leaderboard_get():
    mode = request.args.get("mode", "all").lower()
    limit = int(request.args.get("limit", 50))
    data = _read_json(LEADERBOARD_DATA, {"leaderboard": []})
    rows = []
    for user in data.get("leaderboard", []):
        for entry in user.get("entries", []):
            if mode != "all" and entry.get("mode") != mode:
                continue
            rows.append({
                "userId": user.get("userId"),
                "userName": user.get("userName"),
                **entry,
            })
    rows.sort(key=lambda r: r.get("score", 0), reverse=True)
    return jsonify(rows[: limit or 50])


@app.route("/api/leaderboard", methods=["POST"])
def api_leaderboard_post():
    payload = request.get_json(silent=True) or {}
    required = ["userId", "userName", "mode", "score"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"status": "error", "message": f"Missing {', '.join(missing)}"}), 400

    entry = {
        "mode": payload["mode"],
        "score": int(payload.get("score", 0)),
        "questionsAttempted": int(payload.get("questionsAttempted", 0)),
        "correctAnswers": int(payload.get("correctAnswers", 0)),
        "accuracy": float(payload.get("accuracy", 0)),
        "timestamp": payload.get("timestamp") or datetime.utcnow().isoformat(),
        "duration": int(payload.get("duration", 0)),
    }

    with file_lock:
        data = _read_json(LEADERBOARD_DATA, {"leaderboard": []})
        users = data.setdefault("leaderboard", [])
        user_id = payload["userId"]
        user_name = payload["userName"]
        existing = next((u for u in users if u.get("userId") == user_id), None)
        if existing:
            existing["userName"] = user_name
            existing.setdefault("entries", []).append(entry)
        else:
            users.append({"userId": user_id, "userName": user_name, "entries": [entry]})
        _write_json(LEADERBOARD_DATA, data)
    return jsonify({"status": "ok", "entry": entry}), 201


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok"}), 200


@app.errorhandler(404)
def handle_404(error):
    if request.path.startswith("/reflections"):
        return jsonify({"status": "error", "message": str(error)}), 404
    if request.path.startswith("/api/"):
        return jsonify({"status": "error", "message": str(error)}), 404
    return error, 404


@app.errorhandler(400)
def handle_400(error):
    if request.path.startswith("/reflections") or request.path.startswith("/add_reflection"):
        return jsonify({"status": "error", "message": str(error)}), 400
    if request.path.startswith("/api/"):
        return jsonify({"status": "error", "message": str(error)}), 400
    return error, 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

