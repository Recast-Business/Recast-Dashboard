"""POST /api/export_brief — Create a new Google Sheet in the same Drive folder as the roster.
Body: {"rows": [...], "briefName": "optional campaign name"}
Creates a standalone spreadsheet shared with the team, in the same Drive folder.
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime
import json, os, tempfile
from api._shared import (
    json_response, read_body, SPREADSHEET_ID, require_auth, cors_headers,
)

SHARE_EMAILS = [
    "partners@shadowoperator.ai",
    "harry@maudegroup.co.uk",
]


def _create_brief_sheet(rows, brief_name=""):
    """Create a new Google Sheets file in the same Drive folder as the roster."""
    import gspread
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
    if not creds_json:
        return None, "No credentials configured"
    creds_dict = json.loads(creds_json)
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    tmp_path = tmp.name
    try:
        json.dump(creds_dict, tmp)
        tmp.close()
        client = gspread.service_account(filename=tmp_path)

        # Find the parent folder of the roster spreadsheet
        folder_id = None
        try:
            resp = client.http_client.request(
                "get",
                f"https://www.googleapis.com/drive/v3/files/{SPREADSHEET_ID}",
                params={"fields": "parents", "supportsAllDrives": "true"}
            )
            parents = resp.json().get("parents", [])
            folder_id = parents[0] if parents else None
        except Exception as e:
            print(f"[Brief] Could not find roster folder: {e}")

        # Create new spreadsheet (in same folder if found)
        date_str = datetime.now().strftime("%d %b %Y %H:%M")
        title = f"Brief Matches — {brief_name or 'Export'} — {date_str}"
        spreadsheet = client.create(title, folder_id=folder_id)

        # Write data
        ws = spreadsheet.sheet1
        ws.update_title("Matches")

        headers = ["Match %", "Name", "Platform", "Tier", "CCV", "Country",
                    "Content", "Outreach Status"]
        all_rows = [headers]
        for r in rows:
            all_rows.append([
                r.get("matchScore", 0),
                r.get("name", ""),
                r.get("platforms", ""),
                r.get("tier", ""),
                r.get("ccv", 0),
                r.get("country", ""),
                r.get("content", ""),
                r.get("outreachStatus", ""),
            ])

        ws.update(range_name="A1", values=all_rows)

        # Bold header
        try:
            ws.format("A1:H1", {"textFormat": {"bold": True}})
        except Exception:
            pass

        # Share with team
        for email in SHARE_EMAILS:
            try:
                spreadsheet.share(email, perm_type="user", role="writer", notify=False)
            except Exception as e:
                print(f"[Brief] Could not share with {email}: {e}")

        return spreadsheet.url, None
    except Exception as e:
        return None, str(e)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not require_auth(self, required_roles=("admin", "partner", "finance")):
            return
        try:
            body = read_body(self)
            rows = body.get("rows") or []
            brief_name = body.get("briefName") or ""

            if not rows:
                json_response(self, 400, {"error": "no rows provided"})
                return

            url, error = _create_brief_sheet(rows, brief_name)
            if error:
                json_response(self, 500, {"error": error})
                return

            json_response(self, 200, {"ok": True, "count": len(rows), "url": url})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
