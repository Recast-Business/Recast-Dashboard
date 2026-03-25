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
    """Batch-fetch socials for up to 35 Twitch users in one GQL call."""
    results = {}
    for chunk_start in range(0, len(handles), 35):
        chunk = handles[chunk_start:chunk_start + 35]
        aliases = []
        for i, h in enumerate(chunk):
            safe_h = h.replace('"', '\\"')
            aliases.append(
                f'u{i}: user(login: "{safe_h}") {{ displayName login '
                f'channel {{ socialMedias {{ name url }} }} }}'
            )
        query = "{ " + " ".join(aliases) + " }"
        r = requests.post("https://gql.twitch.tv/gql",
                          json=[{"query": query}], headers=TWITCH_HEADERS, timeout=12)
        if r.status_code != 200:
            raise Exception(f"Twitch GQL status {r.status_code}: {r.text[:200]}")
        resp = r.json()
        if isinstance(resp, list):
            data = resp[0].get("data") or {}
            errors = resp[0].get("errors")
        else:
            data = resp.get("data") or {}
            errors = resp.get("errors")
        if errors:
            raise Exception(f"GQL errors: {errors}")
        for i, h in enumerate(chunk):
            user = data.get(f"u{i}") or {}
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
    return results


def _fetch_kick_socials(handles):
    """Fetch socials for Kick users via individual channel lookups."""
    results = {}
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
    except ImportError:
        print("[SocScrape] cloudscraper not installed")
        return results

    headers = {
        "Accept": "application/json",
        "Referer": "https://kick.com",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

    for handle in handles[:20]:  # Cap at 20 to stay within timeout
        try:
            url = f"https://kick.com/api/v2/channels/{handle}"
            r = scraper.get(url, headers=headers, timeout=8)
            if r.status_code != 200:
                continue
            data = r.json()
            twitter = ""
            instagram = ""
            # Kick stores socials in different places
            for sm in (data.get("socials") or []):
                name = (sm.get("type") or sm.get("name") or "").lower()
                url_val = sm.get("url") or sm.get("value") or ""
                if "twitter" in name or "x.com" in url_val:
                    twitter = url_val
                elif "instagram" in name:
                    instagram = url_val
            # Also check top-level fields
            if not twitter:
                twitter = data.get("twitter") or ""
            if not instagram:
                instagram = data.get("instagram") or ""
            if twitter or instagram:
                results[handle.lower()] = {"twitter": twitter, "instagram": instagram}
        except Exception as e:
            print(f"[SocScrape] Kick {handle}: {e}")
            continue
    return results


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
                    ki_res = _fetch_kick_socials(kick_handles)
                    results.update(ki_res)
                    debug.append(f"kick: {len(kick_handles)} handles, {len(ki_res)} found")
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
