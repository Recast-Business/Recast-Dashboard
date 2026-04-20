"""
One-shot roster import: Google Sheet -> Supabase `creators` table.

Usage (from the dashboard/ folder):
    SUPABASE_URL=https://<ref>.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
    python3 scripts/import_roster_from_gsheet.py

Uses the repo's existing google_credentials.json + the same sheet id the
legacy /api/roster reads. Safe to re-run: skips names already in Supabase.
"""
import json
import os
import sys
import time
from pathlib import Path

import gspread
import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
CREDS_PATH = REPO_ROOT / "google_credentials.json"
SPREADSHEET_ID = "14KV1CnAl7jnYBTjm9THiI4CS8WFNMnfz3ti10e2aI_k"
SHEET_GID = 1375114138

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "Missing env. Run as:\n"
        "  SUPABASE_URL=https://<ref>.supabase.co \\\n"
        "  SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \\\n"
        "  python3 scripts/import_roster_from_gsheet.py"
    )
if not CREDS_PATH.exists():
    sys.exit(f"google_credentials.json not found at {CREDS_PATH}")


def safe(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if s in ("", "nan", "None") else s


def fetch_sheet_rows():
    client = gspread.service_account(filename=str(CREDS_PATH))
    wb = client.open_by_key(SPREADSHEET_ID)
    sh = wb.get_worksheet_by_id(SHEET_GID)
    all_values = sh.get_all_values()
    if not all_values:
        return []
    raw_headers = all_values[0]
    headers, seen = [], {}
    for h in raw_headers:
        if h in seen:
            seen[h] += 1
            headers.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 1
            headers.append(h)
    rows = []
    for r in all_values[1:]:
        padded = r + [""] * (len(headers) - len(r))
        rows.append(dict(zip(headers, padded)))
    return rows


def map_row_to_creator(row):
    name = safe(row.get("Creator Name"))
    if not name:
        return None
    twitch = safe(row.get("Twitch Handle"))
    kick = safe(row.get("Kick Handle"))
    if not twitch and not kick and not safe(row.get("Platforms")):
        return None
    return {
        "name": name,
        "twitch_handle": twitch,
        "kick_handle": kick,
        "twitter": safe(row.get("Twitter Link")),
        "instagram": safe(row.get("Instagram Link")),
        "country": safe(row.get("Country")),
        "tier": safe(row.get("Tier")) or safe(row.get("Tier Size")),
        "notes": safe(row.get("Notes")),
        "status": "active",
        "imported_from_excel": True,
    }


def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def fetch_existing_names():
    url = f"{SUPABASE_URL}/rest/v1/creators?select=name"
    h = supabase_headers()
    h["Prefer"] = "count=none"
    r = requests.get(url, headers=h, timeout=30)
    r.raise_for_status()
    return {c["name"].strip().lower() for c in r.json()}


def insert_creators(batch):
    url = f"{SUPABASE_URL}/rest/v1/creators"
    r = requests.post(url, headers=supabase_headers(), data=json.dumps(batch), timeout=60)
    if r.status_code >= 300:
        print(f"[{r.status_code}] {r.text[:300]}")
        r.raise_for_status()


def main():
    print(f"Reading Google Sheet {SPREADSHEET_ID} …")
    rows = fetch_sheet_rows()
    print(f"  {len(rows)} raw rows")

    creators = []
    seen_name, seen_twitch, seen_kick = set(), set(), set()
    for r in rows:
        c = map_row_to_creator(r)
        if not c:
            continue
        name_key = c["name"].strip().lower()
        if name_key in seen_name:
            continue
        tw = (c.get("twitch_handle") or "").strip().lower()
        kk = (c.get("kick_handle") or "").strip().lower()
        if tw and tw in seen_twitch:
            c["twitch_handle"] = None
            tw = ""
        if kk and kk in seen_kick:
            c["kick_handle"] = None
            kk = ""
        seen_name.add(name_key)
        if tw:
            seen_twitch.add(tw)
        if kk:
            seen_kick.add(kk)
        creators.append(c)
    print(f"  {len(creators)} unique creators after mapping")

    print("Fetching existing Supabase creators …")
    existing = fetch_existing_names()
    print(f"  {len(existing)} already present, will skip")

    to_insert = [c for c in creators if c["name"].strip().lower() not in existing]
    print(f"Inserting {len(to_insert)} new creators …")

    batch_size = 100
    for i in range(0, len(to_insert), batch_size):
        chunk = to_insert[i : i + batch_size]
        insert_creators(chunk)
        print(f"  {i + len(chunk)}/{len(to_insert)}")
        time.sleep(0.15)

    print("Done.")


if __name__ == "__main__":
    main()
