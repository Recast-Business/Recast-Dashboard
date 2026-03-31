"""POST /api/backfill_ccv30 — Batch-fetch 30-day average CCV for creators with
Twitch/Kick handles but missing 30d CCV. Updates Google Sheet directly.
Body (optional): {"limit": 100}  — max creators to process per call (default 100).
"""
from http.server import BaseHTTPRequestHandler
from api._shared import _get_gsheet, json_response, read_body, tier_from_ccv
from api.ccv30 import get_ccv30_twitch, get_ccv30_kick


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            batch_limit = min(int(body.get("limit") or 100), 200)

            sh = _get_gsheet()
            if sh is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            headers = sh.row_values(1)
            all_values = sh.get_all_values()

            col = {h: i for i, h in enumerate(headers)}
            twitch_handle_idx = col.get("Twitch Handle")
            kick_handle_idx = col.get("Kick Handle")
            twitch_30d_idx = col.get("Twitch 30d CCV")
            kick_30d_idx = col.get("Kick 30d CCV")
            tier_idx = col.get("Tier Size")
            kick_tier_idx = col.get("Tier Size_2") or col.get("Kick Tier Size")

            # Auto-create 30d CCV columns if they don't exist
            if twitch_30d_idx is None:
                twitch_30d_idx = len(headers)
                sh.update_cell(1, twitch_30d_idx + 1, "Twitch 30d CCV")
                headers.append("Twitch 30d CCV")
            if kick_30d_idx is None:
                kick_30d_idx = len(headers)
                sh.update_cell(1, kick_30d_idx + 1, "Kick 30d CCV")
                headers.append("Kick 30d CCV")

            # Find creators needing 30d CCV
            twitch_needs = []  # (row_num, handle)
            kick_needs = []    # (row_num, handle)

            for i, row in enumerate(all_values[1:], start=2):
                if len(twitch_needs) + len(kick_needs) >= batch_limit:
                    break
                # Twitch: has handle, no 30d CCV
                if twitch_handle_idx is not None:
                    th = (row[twitch_handle_idx] if twitch_handle_idx < len(row) else "").strip()
                    tc = (row[twitch_30d_idx] if twitch_30d_idx < len(row) else "").strip()
                    if th and (not tc or tc == "0"):
                        twitch_needs.append((i, th.lower()))
                # Kick: has handle, no 30d CCV
                if kick_handle_idx is not None:
                    kh = (row[kick_handle_idx] if kick_handle_idx < len(row) else "").strip()
                    kc = (row[kick_30d_idx] if kick_30d_idx < len(row) else "").strip()
                    if kh and (not kc or kc == "0"):
                        kick_needs.append((i, kh.lower()))

            # Fetch 30d CCV data
            twitch_results = {}
            kick_results = {}
            updates = []

            for _, handle in twitch_needs:
                if handle in twitch_results:
                    continue
                try:
                    avg = get_ccv30_twitch(handle)
                    if avg is not None:
                        twitch_results[handle] = int(avg)
                except Exception:
                    continue

            for _, handle in kick_needs:
                if handle in kick_results:
                    continue
                try:
                    avg = get_ccv30_kick(handle)
                    if avg is not None:
                        kick_results[handle] = int(avg)
                except Exception:
                    continue

            # Build sheet updates
            for row_num, handle in twitch_needs:
                if handle in twitch_results:
                    ccv = twitch_results[handle]
                    updates.append({"row": row_num, "col": twitch_30d_idx + 1, "val": ccv})
                    # Update tier based on 30d CCV
                    tier = tier_from_ccv("twitch", ccv)
                    if tier_idx is not None:
                        updates.append({"row": row_num, "col": tier_idx + 1, "val": tier})

            for row_num, handle in kick_needs:
                if handle in kick_results:
                    ccv = kick_results[handle]
                    updates.append({"row": row_num, "col": kick_30d_idx + 1, "val": ccv})
                    tier = tier_from_ccv("kick", ccv)
                    if kick_tier_idx is not None:
                        updates.append({"row": row_num, "col": kick_tier_idx + 1, "val": tier})

            # Apply updates
            cells_updated = 0
            for u in updates:
                try:
                    sh.update_cell(u["row"], u["col"], u["val"])
                    cells_updated += 1
                except Exception as e:
                    print(f"[Backfill30d] Failed row {u['row']} col {u['col']}: {e}")

            # Build response with values for frontend cache update
            twitch_values = {h: twitch_results[h] for _, h in twitch_needs if h in twitch_results}
            kick_values = {h: kick_results[h] for _, h in kick_needs if h in kick_results}

            json_response(self, 200, {
                "ok": True,
                "twitch_checked": len(twitch_needs),
                "kick_checked": len(kick_needs),
                "twitch_found": len(twitch_results),
                "kick_found": len(kick_results),
                "cells_updated": cells_updated,
                "twitch_values": twitch_values,
                "kick_values": kick_values,
            })
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
