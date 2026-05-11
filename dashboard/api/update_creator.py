"""POST /api/update_creator — Update a field for a creator in Google Sheets.
Body: {"name": "Creator Name", "field": "Outreach Status", "value": "Outreached"}

Supported fields and their Google Sheets column headers:
  outreach_status -> "Outreach Status"
  notes           -> "Notes"
  deal_value      -> "Deal Value"
  follow_up_date  -> "Follow-Up Date"
  campaign        -> "Campaign"
  pipeline_notes  -> "Pipeline Notes"
"""
from http.server import BaseHTTPRequestHandler
from api._shared import (
    gsheet_update_field, json_response, read_body, require_auth, cors_headers,
)

FIELD_MAP = {
    "outreach_status": "Outreach Status",
    "notes": "Notes",
    "deal_value": "Deal Value",
    "follow_up_date": "Follow-Up Date",
    "campaign": "Campaign",
    "pipeline_notes": "Pipeline Notes",
    "twitch_handle": "Twitch Handle",
    "twitch_ccv": "Twitch CCV",
    "kick_handle": "Kick Handle",
    "kick_ccv": "Kick CCV",
    "platforms": "Platforms",
    "country": "Country",
    "content_type": "Content Type",
    "twitter": "Twitter Link",
    "instagram": "Instagram Link",
    "bin": "Bin",
    "twitch_30d_ccv": "Twitch 30d CCV",
    "kick_30d_ccv": "Kick 30d CCV",
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not require_auth(self, required_roles=("admin", "finance", "partner")):
            return
        try:
            body = read_body(self)
            name = (body.get("name") or "").strip()
            field = (body.get("field") or "").strip()
            value = body.get("value", "")

            if not name:
                json_response(self, 400, {"error": "missing 'name'"})
                return

            col_header = FIELD_MAP.get(field, field)
            if col_header not in FIELD_MAP.values() and field not in FIELD_MAP:
                json_response(self, 400, {"error": f"unknown field '{field}'"})
                return
            updated = gsheet_update_field(name, col_header, value)
            if not updated:
                print(f"[UpdateCreator] No match for name='{name}' field='{col_header}' value='{value}'")
            json_response(self, 200, {"ok": True, "updated": updated})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
