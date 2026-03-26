"""GET/POST /api/agency_sync — Sync agency data across all dashboards.
GET: Returns the shared agency data JSON.
POST: Saves the agency data JSON. Body: {"agencies": [...], "links": {...}}
Uses a dedicated "Agency Sync" sheet tab to store the data.
"""
from http.server import BaseHTTPRequestHandler
from api._shared import json_response, read_body, _get_gsheet
import json


def _get_agency_sheet():
    """Get or create the Agency Sync sheet tab."""
    sh = _get_gsheet()
    if sh is None:
        return None
    try:
        wb = sh.spreadsheet
        try:
            return wb.worksheet("Agency Sync")
        except Exception:
            # Create the tab
            sync_sh = wb.add_worksheet(title="Agency Sync", rows=3, cols=2)
            sync_sh.update_cell(1, 1, "Key")
            sync_sh.update_cell(1, 2, "Value")
            sync_sh.update_cell(2, 1, "agencies")
            sync_sh.update_cell(2, 2, "[]")
            sync_sh.update_cell(3, 1, "links")
            sync_sh.update_cell(3, 2, "{}")
            return sync_sh
    except Exception as e:
        print(f"[AgencySync] Failed to get/create sheet: {e}")
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            sync_sh = _get_agency_sheet()
            if sync_sh is None:
                json_response(self, 500, {"error": "Could not connect"})
                return
            try:
                agencies_val = sync_sh.cell(2, 2).value or "[]"
                agencies = json.loads(agencies_val)
            except Exception:
                agencies = []
            try:
                links_val = sync_sh.cell(3, 2).value or "{}"
                links = json.loads(links_val)
            except Exception:
                links = {}
            json_response(self, 200, {"ok": True, "agencies": agencies, "links": links})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_POST(self):
        try:
            body = read_body(self)
            agencies = body.get("agencies", [])
            links = body.get("links", {})
            sync_sh = _get_agency_sheet()
            if sync_sh is None:
                json_response(self, 500, {"error": "Could not connect"})
                return
            # Store as JSON strings
            sync_sh.update_cell(2, 2, json.dumps(agencies, ensure_ascii=False))
            sync_sh.update_cell(3, 2, json.dumps(links, ensure_ascii=False))
            json_response(self, 200, {"ok": True, "saved": len(agencies)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
