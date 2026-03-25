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
from api._shared import gsheet_update_field, json_response, read_body

FIELD_MAP = {
    "outreach_status": "Outreach Status",
    "notes": "Notes",
    "deal_value": "Deal Value",
    "follow_up_date": "Follow-Up Date",
    "campaign": "Campaign",
    "pipeline_notes": "Pipeline Notes",
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            name = (body.get("name") or "").strip()
            field = (body.get("field") or "").strip()
            value = body.get("value", "")

            if not name:
                json_response(self, 400, {"error": "missing 'name'"})
                return

            col_header = FIELD_MAP.get(field, field)
            updated = gsheet_update_field(name, col_header, value)
            json_response(self, 200, {"ok": True, "updated": updated})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
