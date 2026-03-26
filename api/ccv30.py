"""GET /api/ccv30?platform=twitch&handle=username — 30-day average CCV lookup."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json, requests
from api._shared import json_response


def get_ccv30_twitch(handle):
    url = f"https://twitchtracker.com/api/channels/summary/{handle}"
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code != 200:
        return None
    data = r.json()
    return data.get("avg_viewers") or data.get("avg_viewers_30d")


def get_ccv30_kick(handle):
    try:
        url = f"https://kick.com/api/v2/channels/{handle}"
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            avg = data.get("recent_average_viewers")
            if avg:
                return avg
    except Exception:
        pass
    try:
        url = f"https://kick.com/api/v1/channels/{handle}"
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return data.get("viewer_count") or data.get("recent_average_viewers")
    except Exception:
        pass
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
            if platform == "kick":
                avg = get_ccv30_kick(handle)
            else:
                avg = get_ccv30_twitch(handle)

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
