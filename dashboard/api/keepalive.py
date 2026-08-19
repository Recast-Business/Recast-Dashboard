"""GET /api/keepalive — keep the Supabase project awake.

WHY THIS EXISTS
    Supabase free-tier projects pause after roughly 7 days without database
    activity. A paused project stops answering, which takes the whole
    dashboard down. This endpoint performs one tiny read so the project never
    crosses that threshold. It is invoked on a schedule by Vercel Cron; see
    the "crons" block in vercel.json.

WHY NOT THE GITHUB ACTIONS WORKFLOW
    .github/workflows/supabase-keepalive.yml was doing this job and stopped.
    GitHub ties a scheduled workflow to the account that last committed it,
    and that account was removed from the organisation during the July 2026
    ownership handover, so the schedule silently stopped firing while still
    reporting itself as "active". No alert is raised in that situation
    because nothing fails, the runs simply never start. The last scheduled
    run was 16 July 2026. Vercel Cron belongs to the project rather than to a
    person, so it does not have that failure mode.

CONFIGURATION
    Reads two environment variables that the project already sets for the
    frontend build. The VITE_ prefix only affects what Vite inlines into the
    browser bundle; the values are still readable here at runtime, so no new
    secrets are required.

        VITE_SUPABASE_URL        https://<project-ref>.supabase.co
        VITE_SUPABASE_ANON_KEY   the anon/public key (never service_role)

    Optional: set a CRON_SECRET environment variable and Vercel will send it
    as an Authorization header on cron invocations, which this endpoint then
    requires. Left unset the endpoint is open, which is acceptable because
    the only thing it can do is perform the read it exists to perform.

VERIFYING
    Manual:  curl -i https://<dashboard-domain>/api/keepalive   -> expect 200
    Real:    Vercel dashboard > project > Logs, and look for an invocation
             nobody triggered by hand. A successful manual call proves the
             endpoint works, NOT that the schedule is firing. That distinction
             is exactly what hid the previous outages.
"""
import json
import os
import re
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

from api._shared import heartbeat

# Read one row from a table that certainly exists. Row-level security hides
# the rows from the anon key, so a healthy response is 200 with an empty
# list. The request still counts as database activity, which is the point.
TABLE = "profiles"
TIMEOUT_SECONDS = 20

# The monitor that alerts if this job stops running. See _shared.heartbeat.
HEARTBEAT_ENV = "HEALTHCHECK_URL_KEEPALIVE"


def _json(handler, status, payload):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 1. Optional shared-secret check, enforced only when CRON_SECRET is
        #    set so the default configuration cannot break by omission.
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret:
            if self.headers.get("Authorization") != f"Bearer {cron_secret}":
                _json(self, 401, {"ok": False, "error": "Unauthorized"})
                return

        raw_url = (os.environ.get("VITE_SUPABASE_URL") or "").strip()
        anon_key = (os.environ.get("VITE_SUPABASE_ANON_KEY") or "").strip()

        missing = [
            name for name, value in
            (("VITE_SUPABASE_URL", raw_url), ("VITE_SUPABASE_ANON_KEY", anon_key))
            if not value
        ]
        if missing:
            print(f"keepalive: missing env var(s): {', '.join(missing)}")
            heartbeat(HEARTBEAT_ENV, "fail", f"Missing env var(s): {', '.join(missing)}")
            _json(self, 500, {"ok": False, "error": f"Missing env var(s): {', '.join(missing)}"})
            return

        # 2. Normalise to the origin. A pasted value carrying a trailing
        #    slash, a path, or stray whitespace otherwise produces an opaque
        #    PGRST125 "Invalid path specified in request URL".
        match = re.match(r"https?://[A-Za-z0-9.-]+(?::\d+)?", raw_url)
        if not match:
            print(f"keepalive: VITE_SUPABASE_URL is not a URL: {raw_url}")
            heartbeat(HEARTBEAT_ENV, "fail", f"VITE_SUPABASE_URL is not a URL: {raw_url}")
            _json(self, 500, {"ok": False, "error": "VITE_SUPABASE_URL is not a valid URL"})
            return
        origin = match.group(0)

        endpoint = f"{origin}/rest/v1/{TABLE}?select=id&limit=1"
        request = urllib.request.Request(
            endpoint,
            headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                response.read(300)
                print(f"keepalive OK: HTTP {response.status} from {origin}")
                heartbeat(HEARTBEAT_ENV, "ok", f"HTTP {response.status} from {origin}")
                _json(self, 200, {"ok": True, "pinged": origin})
        except urllib.error.HTTPError as e:
            body = e.read(300).decode("utf-8", "replace")
            print(f"keepalive FAILED: HTTP {e.code} from {origin} :: {body}")
            heartbeat(HEARTBEAT_ENV, "fail", f"HTTP {e.code} from {origin} :: {body}")
            _json(self, 502, {"ok": False, "upstreamStatus": e.code, "body": body})
        except Exception as e:
            # A DNS failure against a *.supabase.co host almost always means
            # the project is paused, which is the exact condition this
            # endpoint exists to prevent.
            message = str(e)
            hint = None
            if "Name or service not known" in message or "nodename nor servname" in message:
                hint = ("Host does not resolve. The Supabase project is most likely "
                        "paused; restore it from the Supabase dashboard.")
            print(f"keepalive ERROR reaching {origin}: {message}" + (f" -- {hint}" if hint else ""))
            heartbeat(HEARTBEAT_ENV, "fail", f"Cannot reach {origin}: {message}" + (f" -- {hint}" if hint else ""))
            _json(self, 502, {"ok": False, "target": origin, "error": message, "hint": hint})
