"""GET /api/ccv30?platform=twitch&handle=username — 30-day average CCV lookup."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json, re, requests
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


def _get_ccv30_streamcharts(handle, platform="kick"):
    """Scrape 30-day average viewers from StreamCharts HTML page.
    Works for both Kick and Twitch channels. The data is server-side rendered
    in a tooltip: 'Average Viewers ... 30d: 16 669'"""
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "linux", "mobile": False}
        )
    except ImportError:
        scraper = requests.Session()
    url = f"https://streamscharts.com/channels/{handle}"
    if platform == "kick":
        url += "?platform=kick"
    try:
        r = scraper.get(url, headers={
            "Accept": "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }, timeout=15)
        if r.status_code != 200:
            return None
        # Pattern: tooltip contains "Average Viewers" followed by "30d: <number>"
        match = re.search(r"Average\s*Viewers.*?30d:\s*([\d\s,]+)", r.text, re.DOTALL | re.IGNORECASE)
        if match:
            num_str = match.group(1).replace(" ", "").replace(",", "").strip()
            return int(num_str) if num_str.isdigit() else None
        # Fallback: look for the visible avg viewers number (in stats block)
        match = re.search(r"Average\s*Viewers\s*</.*?>([\d\s,]+)<", r.text, re.DOTALL | re.IGNORECASE)
        if match:
            num_str = match.group(1).replace(" ", "").replace(",", "").strip()
            return int(num_str) if num_str.isdigit() else None
    except Exception:
        pass
    return None


def get_ccv30_kick(handle):
    """Kick 30d CCV is not available via any server-side API.
    StreamCharts and Kick both block serverless requests.
    Returns None — Kick 30d CCV must be entered manually via the dashboard.
    Future: StreamCharts API subscription ($9/mo) would enable automated fetching."""
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
