"""POST /api/backfill_ccv — Fetch CCV for creators with Twitch/Kick handles but missing CCV.
Returns updated counts. Updates the Google Sheet directly.
Body (optional): {"limit": 50, "mode": "current"|"30d"}
  mode "current" (default): fetch live/estimated CCV for missing Twitch CCV / Kick CCV columns
  mode "30d": fetch 30-day avg CCV for missing Twitch 30d CCV / Kick 30d CCV columns
"""
from http.server import BaseHTTPRequestHandler
import requests
from api._shared import _get_gsheet, json_response, read_body, tier_from_ccv

TWITCH_HEADERS = {
    "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    "Content-Type": "application/json",
}


def _twitch_batch_ccv(logins):
    """Fetch CCV for a batch of Twitch logins (up to 35 at a time).
    Uses StreamsMetadata + user query to get live viewer count."""
    if not logins:
        return {}

    results = {}
    # Build a batched GQL query — one user lookup per login
    queries = []
    for login in logins:
        queries.append({
            "query": '{ user(login: "%s") { stream { viewersCount } followers { totalCount } } }' % login.replace('"', '')
        })

    # Send in chunks of 35 (Twitch GQL batch limit)
    for i in range(0, len(queries), 35):
        chunk = queries[i:i+35]
        chunk_logins = logins[i:i+35]
        try:
            r = requests.post("https://gql.twitch.tv/gql",
                              json=chunk, headers=TWITCH_HEADERS, timeout=15)
            if r.status_code != 200:
                continue
            data = r.json()
            for j, item in enumerate(data):
                login = chunk_logins[j]
                user = (item.get("data") or {}).get("user")
                if not user:
                    continue
                stream = user.get("stream")
                followers = (user.get("followers") or {}).get("totalCount", 0)
                if stream and stream.get("viewersCount"):
                    # Creator is live — use actual CCV
                    results[login] = {"ccv": stream["viewersCount"], "source": "live"}
                elif followers:
                    # Offline — estimate CCV as ~2% of followers (rough industry avg)
                    est = max(int(followers * 0.02), 1)
                    results[login] = {"ccv": est, "source": "estimated", "followers": followers}
        except Exception:
            continue

    return results


def _kick_batch_ccv(handles):
    """Fetch CCV for Kick handles via livestream API."""
    if not handles:
        return {}

    results = {}
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
    except ImportError:
        return results

    kick_headers = {
        "Accept": "application/json",
        "Referer": "https://kick.com",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }

    for handle in handles:
        try:
            # Try channel endpoint for follower count
            url = f"https://web.kick.com/api/v2/channels/{handle}"
            r = scraper.get(url, headers=kick_headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                livestream = data.get("livestream")
                followers = data.get("followers_count", 0)
                if livestream and livestream.get("viewer_count"):
                    results[handle] = {"ccv": livestream["viewer_count"], "source": "live"}
                elif followers:
                    est = max(int(followers * 0.02), 1)
                    results[handle] = {"ccv": est, "source": "estimated", "followers": followers}
        except Exception:
            continue

    return results


def _backfill_30d(sh, headers, all_values, batch_limit):
    """Backfill 30-day average CCV using TwitchTracker / Kick API."""
    from api.ccv30 import get_ccv30_twitch, get_ccv30_kick

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

    twitch_needs = []
    kick_needs = []

    for i, row in enumerate(all_values[1:], start=2):
        if len(twitch_needs) + len(kick_needs) >= batch_limit:
            break
        if twitch_handle_idx is not None:
            th = (row[twitch_handle_idx] if twitch_handle_idx < len(row) else "").strip()
            tc = (row[twitch_30d_idx] if twitch_30d_idx < len(row) else "").strip()
            if th and (not tc or tc == "0"):
                twitch_needs.append((i, th.lower()))
        if kick_handle_idx is not None:
            kh = (row[kick_handle_idx] if kick_handle_idx < len(row) else "").strip()
            kc = (row[kick_30d_idx] if kick_30d_idx < len(row) else "").strip()
            if kh and (not kc or kc == "0"):
                kick_needs.append((i, kh.lower()))

    twitch_results = {}
    kick_results = {}

    for _, handle in twitch_needs:
        if handle not in twitch_results:
            try:
                avg = get_ccv30_twitch(handle)
                if avg is not None:
                    twitch_results[handle] = int(avg)
            except Exception:
                continue

    for _, handle in kick_needs:
        if handle not in kick_results:
            try:
                avg = get_ccv30_kick(handle)
                if avg is not None:
                    kick_results[handle] = int(avg)
            except Exception:
                continue

    updates = []
    for row_num, handle in twitch_needs:
        if handle in twitch_results:
            ccv = twitch_results[handle]
            updates.append({"row": row_num, "col": twitch_30d_idx + 1, "val": ccv})
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

    cells_updated = 0
    for u in updates:
        try:
            sh.update_cell(u["row"], u["col"], u["val"])
            cells_updated += 1
        except Exception as e:
            print(f"[Backfill30d] Failed row {u['row']} col {u['col']}: {e}")

    return {
        "ok": True,
        "mode": "30d",
        "twitch_checked": len(twitch_needs),
        "kick_checked": len(kick_needs),
        "twitch_found": len(twitch_results),
        "kick_found": len(kick_results),
        "cells_updated": cells_updated,
        "twitch_values": twitch_results,
        "kick_values": kick_results,
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            batch_limit = min(int(body.get("limit") or 50), 200)
            mode = (body.get("mode") or "current").lower()

            sh = _get_gsheet()
            if sh is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            headers = sh.row_values(1)
            all_values = sh.get_all_values()

            # ── 30-day average CCV mode ──
            if mode == "30d":
                result = _backfill_30d(sh, headers, all_values, batch_limit)
                json_response(self, 200, result)
                return

            # ── Current CCV mode (original behavior) ──
            col = {h: i for i, h in enumerate(headers)}
            name_idx = col.get("Creator Name", 0)
            twitch_handle_idx = col.get("Twitch Handle")
            twitch_ccv_idx = col.get("Twitch CCV")
            kick_handle_idx = col.get("Kick Handle")
            kick_ccv_idx = col.get("Kick CCV")
            tier_idx = col.get("Tier Size")
            kick_tier_idx = col.get("Tier Size_2") or col.get("Kick Tier Size")

            if twitch_handle_idx is None and kick_handle_idx is None:
                json_response(self, 400, {"error": "No Twitch/Kick handle columns found"})
                return

            twitch_needs = []
            kick_needs = []

            for i, row in enumerate(all_values[1:], start=2):
                if len(twitch_needs) + len(kick_needs) >= batch_limit:
                    break
                if twitch_handle_idx is not None and twitch_ccv_idx is not None:
                    th = (row[twitch_handle_idx] if twitch_handle_idx < len(row) else "").strip()
                    tc = (row[twitch_ccv_idx] if twitch_ccv_idx < len(row) else "").strip()
                    if th and (not tc or tc == "0"):
                        twitch_needs.append((i, th.lower()))
                if kick_handle_idx is not None and kick_ccv_idx is not None:
                    kh = (row[kick_handle_idx] if kick_handle_idx < len(row) else "").strip()
                    kc = (row[kick_ccv_idx] if kick_ccv_idx < len(row) else "").strip()
                    if kh and (not kc or kc == "0"):
                        kick_needs.append((i, kh.lower()))

            twitch_logins = [login for _, login in twitch_needs]
            kick_handles = [handle for _, handle in kick_needs]

            twitch_data = _twitch_batch_ccv(twitch_logins)
            kick_data = _kick_batch_ccv(kick_handles)

            updated = 0
            updates = []

            for row_num, login in twitch_needs:
                if login in twitch_data:
                    ccv = twitch_data[login]["ccv"]
                    tier = tier_from_ccv("twitch", ccv)
                    updates.append({"row": row_num, "col": twitch_ccv_idx + 1, "val": ccv})
                    if tier_idx is not None:
                        updates.append({"row": row_num, "col": tier_idx + 1, "val": tier})

            for row_num, handle in kick_needs:
                if handle in kick_data:
                    ccv = kick_data[handle]["ccv"]
                    tier = tier_from_ccv("kick", ccv)
                    updates.append({"row": row_num, "col": kick_ccv_idx + 1, "val": ccv})
                    if kick_tier_idx is not None:
                        updates.append({"row": row_num, "col": kick_tier_idx + 1, "val": tier})

            for u in updates:
                try:
                    sh.update_cell(u["row"], u["col"], u["val"])
                    updated += 1
                except Exception as e:
                    print(f"[Backfill] Failed row {u['row']} col {u['col']}: {e}")

            json_response(self, 200, {
                "ok": True,
                "mode": "current",
                "twitch_checked": len(twitch_needs),
                "kick_checked": len(kick_needs),
                "twitch_found": len(twitch_data),
                "kick_found": len(kick_data),
                "cells_updated": updated,
                "twitch_sample": {k: v for k, v in list(twitch_data.items())[:5]},
                "kick_sample": {k: v for k, v in list(kick_data.items())[:5]},
            })
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
