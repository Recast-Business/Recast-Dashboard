"""GET /api/find_duplicates — List duplicate creator names in the Google Sheet."""
from http.server import BaseHTTPRequestHandler
from api._shared import gsheet_all_records, json_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            raw = gsheet_all_records()
            if raw is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            # Find duplicates by name (case-insensitive)
            name_rows = {}
            for i, row in enumerate(raw):
                name = (row.get("Creator Name") or "").strip()
                if not name:
                    continue
                key = name.lower()
                if key not in name_rows:
                    name_rows[key] = []
                name_rows[key].append({
                    "row": i + 2,  # 1-indexed, +1 for header
                    "name": name,
                    "platforms": row.get("Platforms", ""),
                    "twitchHandle": row.get("Twitch Handle", ""),
                    "kickHandle": row.get("Kick Handle", ""),
                    "twitchCCV": row.get("Twitch CCV", ""),
                    "kickCCV": row.get("Kick CCV", ""),
                })

            duplicates = {k: v for k, v in name_rows.items() if len(v) > 1}
            json_response(self, 200, {
                "ok": True,
                "totalCreators": len(name_rows),
                "duplicateGroups": len(duplicates),
                "duplicates": duplicates,
            })
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
