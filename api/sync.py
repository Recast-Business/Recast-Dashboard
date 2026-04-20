"""GET/POST /api/sync — Unified sync endpoint for scout, agency, and presence data.
Query param ?type=scout or ?type=agency or ?type=presence to select which data.

Scout:
  GET:  Returns {"ok": true, "scout": [...]}
  POST: Body {"scout": [...]}

Agency:
  GET:  Returns {"ok": true, "agencies": [...], "links": {...}}
  POST: Body {"agencies": [...], "links": {...}}

Presence:
  GET:  Returns {"ok": true, "presence": {"user_id": timestamp, ...}}
  POST: Body {"user": "user_id"} — updates heartbeat timestamp
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from api._shared import (
    json_response, read_body, _get_gsheet, require_auth, cors_headers,
)
import json, time


def _get_or_create_tab(name, rows_spec):
    """Get or create a sheet tab. rows_spec is list of (row, col, value) for init."""
    sh = _get_gsheet()
    if sh is None:
        return None
    try:
        wb = sh.spreadsheet
        try:
            return wb.worksheet(name)
        except Exception:
            max_row = max(r for r, c, v in rows_spec)
            max_col = max(c for r, c, v in rows_spec)
            tab = wb.add_worksheet(title=name, rows=max_row, cols=max_col)
            for r, c, v in rows_spec:
                tab.update_cell(r, c, v)
            return tab
    except Exception as e:
        print(f"[Sync] Failed to get/create tab '{name}': {e}")
        return None


SCOUT_TAB_SPEC = [
    (1, 1, "Key"), (1, 2, "Value"),
    (2, 1, "scout_list"), (2, 2, "[]"),
]

AGENCY_TAB_SPEC = [
    (1, 1, "Key"), (1, 2, "Value"),
    (2, 1, "agencies"), (2, 2, "[]"),
    (3, 1, "links"), (3, 2, "{}"),
]

PRESENCE_TAB_SPEC = [
    (1, 1, "Key"), (1, 2, "Value"),
    (2, 1, "heartbeats"), (2, 2, "{}"),
]


class handler(BaseHTTPRequestHandler):
    def _get_type(self):
        qs = parse_qs(urlparse(self.path).query)
        return (qs.get("type", [""])[0] or "").lower()

    def do_GET(self):
        if not require_auth(self, required_roles=("admin", "partner", "finance")):
            return
        sync_type = self._get_type()
        try:
            if sync_type == "agency":
                tab = _get_or_create_tab("Agency Sync", AGENCY_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                try:
                    agencies = json.loads(tab.cell(2, 2).value or "[]")
                except Exception:
                    agencies = []
                try:
                    links = json.loads(tab.cell(3, 2).value or "{}")
                except Exception:
                    links = {}
                json_response(self, 200, {"ok": True, "agencies": agencies, "links": links})
            elif sync_type == "presence":
                tab = _get_or_create_tab("Presence", PRESENCE_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                try:
                    heartbeats = json.loads(tab.cell(2, 2).value or "{}")
                except Exception:
                    heartbeats = {}
                json_response(self, 200, {"ok": True, "presence": heartbeats})
            else:
                # Default: scout
                tab = _get_or_create_tab("Scout Sync", SCOUT_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                try:
                    data = json.loads(tab.cell(2, 2).value or "[]")
                except Exception:
                    data = []
                json_response(self, 200, {"ok": True, "scout": data})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_POST(self):
        if not require_auth(self, required_roles=("admin", "partner", "finance")):
            return
        sync_type = self._get_type()
        try:
            body = read_body(self)
            if sync_type == "agency":
                tab = _get_or_create_tab("Agency Sync", AGENCY_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                agencies = body.get("agencies", [])
                links = body.get("links", {})
                tab.update_cell(2, 2, json.dumps(agencies, ensure_ascii=False))
                tab.update_cell(3, 2, json.dumps(links, ensure_ascii=False))
                json_response(self, 200, {"ok": True, "saved": len(agencies)})
            elif sync_type == "presence":
                tab = _get_or_create_tab("Presence", PRESENCE_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                user = body.get("user", "")
                if not user:
                    json_response(self, 400, {"error": "missing 'user'"})
                    return
                # Read current heartbeats, update this user's timestamp
                try:
                    heartbeats = json.loads(tab.cell(2, 2).value or "{}")
                except Exception:
                    heartbeats = {}
                heartbeats[user] = int(time.time())
                tab.update_cell(2, 2, json.dumps(heartbeats))
                json_response(self, 200, {"ok": True, "presence": heartbeats})
            else:
                # Default: scout
                tab = _get_or_create_tab("Scout Sync", SCOUT_TAB_SPEC)
                if tab is None:
                    json_response(self, 500, {"error": "Could not connect"})
                    return
                scout = body.get("scout", [])
                tab.update_cell(2, 2, json.dumps(scout, ensure_ascii=False))
                json_response(self, 200, {"ok": True, "saved": len(scout)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
