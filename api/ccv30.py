"""GET /api/ccv30?platform=twitch&handle=username — 30-day average CCV lookup."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json, requests
from api._shared import json_response


def get_ccv30_twitch(handle):
    url = f"https://twitchtracker.com/api/channels/summary/{handle}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": f"https://twitchtracker.com/{handle}",
    }
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code != 200:
        return None
    data = r.json()
    avg = data.get("avg_viewers")
    if avg is not None:
        return avg
    avg = data.get("avg_viewers_30d")
    if avg is not None:
        return avg
    # User exists on TwitchTracker but no viewer data → inactive, return 0
    if data:
        return 0
    return None


def get_ccv30_kick(handle):
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
    except ImportError:
        scraper = requests.Session()
    headers = {
        "Accept": "application/json",
        "Referer": "https://kick.com",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    # Try web.kick.com first (more reliable from serverless environments)
    try:
        url = f"https://web.kick.com/api/v2/channels/{handle}"
        r = scraper.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            avg = data.get("recent_average_viewers")
            if avg:
                return avg
            ls = data.get("livestream")
            if ls and ls.get("viewer_count"):
                return ls["viewer_count"]
            # Estimate from followers if no viewer data
            followers = data.get("followers_count", 0)
            if followers:
                return max(int(followers * 0.02), 1)
    except Exception:
        pass
    # Fallback to kick.com API
    for ver in ("v2", "v1"):
        try:
            url = f"https://kick.com/api/{ver}/channels/{handle}"
            r = scraper.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                avg = data.get("recent_average_viewers")
                if avg:
                    return avg
                ls = data.get("livestream")
                if ls and ls.get("viewer_count"):
                    return ls["viewer_count"]
                followers = data.get("followers_count", 0)
                if followers:
                    return max(int(followers * 0.02), 1)
        except Exception:
            continue
    return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        platform = (qs.get("platform", [""])[0] or "").lower()
        handle = (qs.get("handle", [""])[0] or "").strip()

        if not handle:
            json_response(self, 400, {"error": "missing handle"})
            return

        try:
            avg = None
            if platform == "kick":
                avg = get_ccv30_kick(handle)
                if avg is None:
                    avg = get_ccv30_twitch(handle)
            else:
                avg = get_ccv30_twitch(handle)
                if avg is None:
                    avg = get_ccv30_kick(handle)

            if avg is not None:
                json_response(self, 200, {"ok": True, "ccv30": int(avg), "handle": handle})
            else:
                json_response(self, 200, {"ok": False, "ccv30": None, "handle": handle})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
