"""GET/POST /api/scout_sync — Sync scout list across all dashboards.
GET: Returns the shared scout list JSON.
POST: Saves the scout list JSON. Body: {"scout": [...]}
Uses a dedicated "Scout Sync" sheet tab to store the data.
"""
from http.server import BaseHTTPRequestHandler
from api._shared import json_response, read_body, _get_gsheet
import json


def _get_sync_sheet():
    """Get or create the Scout Sync sheet tab."""
    sh = _get_gsheet()
    if sh is None:
        return None
    try:
        wb = sh.spreadsheet
        try:
            return wb.worksheet("Scout Sync")
        except Exception:
            # Create the tab
            sync_sh = wb.add_worksheet(title="Scout Sync", rows=2, cols=2)
            sync_sh.update_cell(1, 1, "Key")
            sync_sh.update_cell(1, 2, "Value")
            sync_sh.update_cell(2, 1, "scout_list")
            sync_sh.update_cell(2, 2, "[]")
            return sync_sh
    except Exception as e:
        print(f"[ScoutSync] Failed to get/create sheet: {e}")
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            sync_sh = _get_sync_sheet()
            if sync_sh is None:
                json_response(self, 500, {"error": "Could not connect"})
                return
            try:
                val = sync_sh.cell(2, 2).value or "[]"
                data = json.loads(val)
            except Exception:
                data = []
            json_response(self, 200, {"ok": True, "scout": data})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_POST(self):
        try:
            body = read_body(self)
            scout = body.get("scout", [])
            sync_sh = _get_sync_sheet()
            if sync_sh is None:
                json_response(self, 500, {"error": "Could not connect"})
                return
            # Store as JSON string in cell B2
            sync_sh.update_cell(2, 2, json.dumps(scout, ensure_ascii=False))
            json_response(self, 200, {"ok": True, "saved": len(scout)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
