"""GET /api/roster — Read all creators from Google Sheets and return as JSON."""
from http.server import BaseHTTPRequestHandler
from api._shared import (
    gsheet_all_records, process_records, json_response,
    require_auth, cors_headers,
)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not require_auth(self, required_roles=("admin", "partner", "finance")):
            return
        try:
            raw = gsheet_all_records()
            if raw is None:
                json_response(self, 500, {"error": "Could not read Google Sheets"})
                return
            records = process_records(raw)
            json_response(self, 200, {"ok": True, "data": records, "count": len(records)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
