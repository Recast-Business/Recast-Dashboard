"""POST /api/export_to_roster — Add scouted creators to the Google Sheet roster.
Body: {"creators": [{name, platform, handle, ccv, country, content, twitter, instagram, language}, ...]}
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime
from api._shared import (
    json_response, read_body, tier_from_ccv,
    existing_names_in_gsheet, gsheet_headers, gsheet_append_row,
    require_auth, cors_headers,
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not require_auth(self, required_roles=("admin", "partner", "finance")):
            return
        try:
            body = read_body(self)
            creators = body.get("creators") or []
            if not creators:
                json_response(self, 400, {"error": "no creators provided"})
                return

            existing = existing_names_in_gsheet()
            headers = gsheet_headers()
            if not headers:
                json_response(self, 500, {"error": "Could not read Google Sheets headers"})
                return

            # Build column index map
            col_map = {h: i for i, h in enumerate(headers)}

            added, skipped = 0, 0
            for c in creators:
                name = (c.get("name") or "").strip()
                platform = (c.get("platform") or "").strip()
                handle = (c.get("handle") or "").strip()
                try:
                    ccv = max(0, int(float(c.get("ccv") or 0)))
                except (ValueError, TypeError):
                    ccv = 0
                country = (c.get("country") or "").strip()
                content = (c.get("content") or "").strip()
                twitter = (c.get("twitter") or "").strip()
                instagram = (c.get("instagram") or "").strip()
                language = (c.get("language") or "").strip()

                if not name and not handle:
                    skipped += 1
                    continue

                check_keys = {k for k in (name.lower(), handle.lower()) if k}
                if check_keys & existing:
                    skipped += 1
                    continue

                tier_val = tier_from_ccv(platform, ccv)

                # Build row aligned to headers
                row = [""] * len(headers)

                def set_col(header, value):
                    if header in col_map:
                        row[col_map[header]] = value

                set_col("Creator Name", name)
                set_col("Status", "Prospect")
                set_col("Country", country or language)
                set_col("Platforms", platform)
                set_col("Content Type", content)

                if platform.lower() == "twitch":
                    set_col("Twitch Handle", handle)
                    set_col("Twitch CCV", ccv)
                    set_col("Tier Size", tier_val)
                elif platform.lower() == "kick":
                    set_col("Kick Handle", handle)
                    set_col("Kick CCV", ccv)
                    set_col("Tier Size_2", tier_val)

                set_col("Twitter Link", twitter)
                set_col("Instagram Link", instagram)
                set_col("Outreach Status", "Not Contacted")
                set_col("Notes", f"Added via Scout {datetime.now().strftime('%d/%m/%Y')}")

                if gsheet_append_row(row):
                    added += 1
                    existing.add(name.lower())
                else:
                    skipped += 1

            json_response(self, 200, {"ok": True, "added": added, "skipped": skipped})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
