"""POST /api/scrape_socials — Fetch Twitter/Instagram for a list of creators.
Body: {"creators": [{"platform": "Twitch", "handle": "hasanabi"}, ...]}
Returns: {"results": {"hasanabi": {"twitter": "...", "instagram": "..."}, ...}}
"""
from http.server import BaseHTTPRequestHandler
import json, requests
from api._shared import json_response, read_body

TWITCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    "Accept": "application/json",
}


def _fetch_twitch_socials(handles):
    """Fetch socials for Twitch users — one request per user (non-array format bypasses integrity check)."""
    results = {}
    for h in handles:
        try:
            safe_h = h.replace('"', '\\"')
            query = (
                '{ user(login: "%s") { displayName login '
                'channel { socialMedias { name url } } } }' % safe_h
            )
            # IMPORTANT: send as plain object, NOT wrapped in array — array triggers integrity check
            r = requests.post("https://gql.twitch.tv/gql",
                              json={"query": query}, headers=TWITCH_HEADERS, timeout=8)
            if r.status_code != 200:
                continue
            resp = r.json()
            user = (resp.get("data") or {}).get("user") or {}
            socials = (user.get("channel") or {}).get("socialMedias") or []
            twitter = ""
            instagram = ""
            for sm in socials:
                name = sm.get("name", "").lower()
                url = sm.get("url", "")
                if name in ("twitter", "x") and not twitter:
                    twitter = url
                elif "instagram" in name and not instagram:
                    instagram = url
            if twitter or instagram:
                results[h.lower()] = {"twitter": twitter, "instagram": instagram}
        except Exception as e:
            print(f"[SocScrape] Twitch {h}: {e}")
    return results


def _fetch_kick_socials(handles):
    """Fetch socials for Kick users via individual channel lookups."""
    results = {}
    kick_debug = []
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
    except ImportError:
        return results, ["cloudscraper not installed"]

    headers = {
        "Accept": "application/json",
        "Referer": "https://kick.com",
        "x-app-platform": "web",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

    for handle in handles[:15]:  # Cap to stay within timeout
        try:
            # Try v1 web API (same as scout uses)
            url = f"https://web.kick.com/api/v1/channels/{handle}"
            r = scraper.get(url, headers=headers, timeout=8)
            if r.status_code != 200:
                kick_debug.append(f"{handle}: status {r.status_code}")
                continue
            data = r.json()
            twitter = ""
            instagram = ""

            # Search ALL string values for twitter/instagram URLs
            def _search(obj, depth=0):
                nonlocal twitter, instagram
                if depth > 4:
                    return
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        kl = k.lower()
                        if isinstance(v, str):
                            vl = v.lower()
                            if not twitter and ("twitter" in kl or "twitter.com" in vl or "x.com" in vl):
                                twitter = v
                            if not instagram and ("instagram" in kl or "instagram.com" in vl):
                                instagram = v
                        elif isinstance(v, (dict, list)):
                            _search(v, depth + 1)
                elif isinstance(obj, list):
                    for item in obj:
                        _search(item, depth + 1)

            _search(data)

            if twitter or instagram:
                results[handle.lower()] = {"twitter": twitter, "instagram": instagram}
                kick_debug.append(f"{handle}: found tw={bool(twitter)} ig={bool(instagram)}")
            else:
                # Log top-level keys for debugging
                kick_debug.append(f"{handle}: no socials found, keys={sorted(data.keys())[:15]}")
        except Exception as e:
            kick_debug.append(f"{handle}: error {e}")
            continue
    return results, kick_debug


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            creators = body.get("creators") or []
            if not creators:
                json_response(self, 400, {"error": "no creators provided"})
                return

            twitch_handles = [c["handle"] for c in creators
                              if c.get("platform", "").lower() == "twitch" and c.get("handle")]
            kick_handles = [c["handle"] for c in creators
                            if c.get("platform", "").lower() == "kick" and c.get("handle")]

            results = {}
            debug = []
            if twitch_handles:
                try:
                    tw_res = _fetch_twitch_socials(twitch_handles)
                    results.update(tw_res)
                    debug.append(f"twitch: {len(twitch_handles)} handles, {len(tw_res)} found")
                except Exception as e:
                    debug.append(f"twitch error: {e}")
            if kick_handles:
                try:
                    ki_res, ki_debug = _fetch_kick_socials(kick_handles)
                    results.update(ki_res)
                    debug.append(f"kick: {len(kick_handles)} handles, {len(ki_res)} found")
                    debug.extend(ki_debug)
                except Exception as e:
                    debug.append(f"kick error: {e}")

            json_response(self, 200, {
                "ok": True,
                "results": results,
                "found": len(results),
                "total": len(twitch_handles) + len(kick_handles),
                "debug": debug,
            })
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
