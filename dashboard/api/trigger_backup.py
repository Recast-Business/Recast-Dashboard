"""GET /api/trigger_backup — start the database backup workflow on GitHub.

WHY THIS EXISTS
    The database backup is a pg_dump, which needs a real Postgres client and
    somewhere to store the output. GitHub Actions is the right home for that:
    it has psql preinstalled, generous runtime, and artifact storage. What it
    can no longer be trusted with is the *scheduling*.

    .github/workflows/supabase-backup.yml has a weekly cron that stopped
    firing. GitHub ties a scheduled workflow to the account that last
    committed it, and that account was removed from the organisation during
    the July 2026 ownership handover, so the schedule silently stopped while
    still reporting itself as "active". No alert is raised because nothing
    fails, the runs simply never start. Neither repository has recorded a
    scheduled run since 16 July 2026, and pushing new commits from an active
    account did not revive them.

    Manual dispatch, however, works perfectly. So Vercel Cron (which belongs
    to the project rather than to a person) calls this endpoint, and this
    endpoint asks GitHub to run the backup. The reliable scheduler drives the
    capable runner.

CONFIGURATION
    GITHUB_BACKUP_TOKEN   A fine-grained personal access token, scoped to
                          ONLY the Recast-Dashboard repository, with the
                          single permission "Actions: Read and write".
                          Nothing else. Create at:
                          github.com/settings/personal-access-tokens
    GITHUB_REPO           Optional. Defaults to Recast-Business/Recast-Dashboard.
    CRON_SECRET           Optional. If set, Vercel sends it as an
                          Authorization header on cron invocations and this
                          endpoint requires it.

    Backups are ~0.1 MB gzipped, so running daily against a 90-day retention
    costs roughly 9 MB of the 500 MB free artifact allowance.
"""
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

from api._shared import heartbeat

WORKFLOW_FILE = "supabase-backup.yml"
DEFAULT_REPO = "Recast-Business/Recast-Dashboard"
DEFAULT_REF = "main"
TIMEOUT_SECONDS = 20

# The backup monitor. Only failures are reported from here; the workflow
# owns the success signal, because only it knows a dump actually exists.
HEARTBEAT_ENV = "HEALTHCHECK_URL_BACKUP"


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
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            _json(self, 401, {"ok": False, "error": "Unauthorized"})
            return

        token = (os.environ.get("GITHUB_BACKUP_TOKEN") or "").strip()
        if not token:
            print("trigger_backup: GITHUB_BACKUP_TOKEN is not set")
            heartbeat(HEARTBEAT_ENV, "fail", "GITHUB_BACKUP_TOKEN is not set")
            _json(self, 500, {
                "ok": False,
                "error": "GITHUB_BACKUP_TOKEN is not set",
                "hint": ("Create a fine-grained PAT scoped to this repository with "
                         "Actions: Read and write, and add it as a Vercel environment "
                         "variable named GITHUB_BACKUP_TOKEN."),
            })
            return

        repo = (os.environ.get("GITHUB_REPO") or DEFAULT_REPO).strip()
        url = f"https://api.github.com/repos/{repo}/actions/workflows/{WORKFLOW_FILE}/dispatches"

        request = urllib.request.Request(
            url,
            data=json.dumps({"ref": DEFAULT_REF}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "recast-dashboard-backup-trigger",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                # GitHub returns 204 No Content when the dispatch is accepted.
                # Deliberately does NOT report "ok" to the monitor. All this
                # proves is that GitHub accepted the request; the backup has
                # not started, let alone succeeded. On 19 August 2026 a run
                # was accepted here and then died without producing a dump,
                # which an "ok" at this point would have reported as healthy.
                # The workflow sends the "ok" itself, once a restorable file
                # exists. If the workflow never runs, no ping arrives at all
                # and the monitor's grace period catches the silence.
                print(f"trigger_backup: dispatched {WORKFLOW_FILE} on {repo} (HTTP {response.status})")
                _json(self, 200, {"ok": True, "dispatched": WORKFLOW_FILE, "repo": repo})
        except urllib.error.HTTPError as e:
            body = e.read(300).decode("utf-8", "replace")
            hint = None
            if e.code in (401, 403):
                hint = "Token is missing, expired, or lacks Actions: Read and write on this repository."
            elif e.code == 404:
                hint = f"Workflow {WORKFLOW_FILE} not found on {repo}, or the token cannot see the repository."
            print(f"trigger_backup FAILED: HTTP {e.code} :: {body}")
            heartbeat(HEARTBEAT_ENV, "fail", f"HTTP {e.code} :: {body}" + (f" -- {hint}" if hint else ""))
            _json(self, 502, {"ok": False, "upstreamStatus": e.code, "body": body, "hint": hint})
        except Exception as e:
            print(f"trigger_backup ERROR: {e}")
            heartbeat(HEARTBEAT_ENV, "fail", f"Dispatch failed: {e}")
            _json(self, 502, {"ok": False, "error": str(e)})
