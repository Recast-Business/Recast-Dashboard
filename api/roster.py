"""GET /api/roster — Read all creators from Google Sheets and return as JSON."""
from http.server import BaseHTTPRequestHandler
from api._shared import gsheet_all_records, process_records, json_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
