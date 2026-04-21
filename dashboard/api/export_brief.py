"""POST /api/export_brief — Build a SPORTFIVE-style brief as a Google Doc.

Body:
  {
    "partner": "SPORTFIVE",
    "campaign": "World Betting Cup",
    "criteria": "Team-based tournament ... Focus geos ...",
    "month_year": "April 2026",          # optional, defaults to today
    "creator_ids": ["uuid", "uuid", ...], # from Leads selection
    "statuses": {"uuid": "Qualified — Shortlist", ...}  # optional per-creator
  }

Auth: admin + finance. Uses the logged-in user's email as the share target.
Upload:
  1. python-docx builds the .docx in-memory matching the SPORTFIVE layout
  2. Drive API v3 uploads + converts to Google Doc
  3. Drive API shares with the caller's email (writer)
  4. Returns {ok, url}
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime
import io
import json
import os
import tempfile

from api._shared import (
    json_response, read_body, require_auth, cors_headers,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _fetch_creators(ids):
    """Read creator rows from Supabase using service role key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not ids:
        return []
    import requests as _rq
    # PostgREST 'in' filter syntax: id=in.(uuid1,uuid2,...)
    quoted = ",".join(f'"{i}"' for i in ids)
    try:
        r = _rq.get(
            f"{SUPABASE_URL}/rest/v1/creators",
            params={
                "id": f"in.({quoted})",
                "select": (
                    "id,name,twitch_handle,kick_handle,country,tier,category,"
                    "twitch_30d_ccv,kick_30d_ccv,socials,outreach_status,signed"
                ),
            },
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=10,
        )
        if r.status_code == 200:
            return r.json() or []
        print(f"[export_brief] supabase fetch {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[export_brief] supabase fetch failed: {e}")
    return []


def _guess_platform(c):
    if c.get("kick_handle") and c.get("twitch_handle"):
        return "Twitch + Kick"
    if c.get("kick_handle"):
        return "Kick"
    if c.get("twitch_handle"):
        return "Twitch"
    return "—"


def _best_ccv_label(c):
    t = c.get("twitch_30d_ccv")
    k = c.get("kick_30d_ccv")
    vals = [v for v in (t, k) if v]
    if not vals:
        return "Not available"
    return f"~{max(vals):,} (30d)"


def _handle_line(c):
    if c.get("kick_handle"):
        return f"kick.com/{c['kick_handle']}"
    if c.get("twitch_handle"):
        return f"twitch.tv/{c['twitch_handle']}"
    return ""


def _language_from(c):
    # Rough inference — fall back to English
    country = (c.get("country") or "").lower()
    lang_map = {
        "usa": "English", "uk": "English", "canada": "English", "australia": "English",
        "spain": "Spanish", "mexico": "Spanish", "argentina": "Spanish", "brazil": "Portuguese",
        "germany": "German", "france": "French", "russia": "Russian", "poland": "Polish",
        "japan": "Japanese", "korea": "Korean", "china": "Chinese",
    }
    return lang_map.get(country, "English")


def _market_from(c):
    country = c.get("country") or ""
    if country.lower() in ("usa", "uk", "canada", "australia", "new zealand", "ireland"):
        return "English-speaking"
    if country in ("Spain", "Mexico", "Argentina", "Colombia", "Peru"):
        return "LATAM"
    if country:
        return country
    return "Global"


# ── .docx generation ───────────────────────────────────────────────────────

def _build_docx(partner, campaign, criteria, month_year, creators, statuses):
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm, Inches
    from docx.enum.table import WD_ALIGN_VERTICAL
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()

    # Default font
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10)

    # ── Cover block ────────────────────────────────────────────────
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run(f"RECAST  x  {partner.upper()}")
    r.bold = True
    r.font.size = Pt(22)
    r.font.color.rgb = RGBColor(0x1F, 0x2A, 0x44)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rs = sub.add_run(f"{campaign}  .  Creator Research Assessment")
    rs.font.size = Pt(14)

    date = doc.add_paragraph()
    date.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rd = date.add_run(f"{month_year}  |  CONFIDENTIAL")
    rd.italic = True
    rd.font.size = Pt(10)
    rd.font.color.rgb = RGBColor(0x70, 0x70, 0x70)

    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("CONFIDENTIAL  ·  Prepared by Recast  ·  Not for distribution")
    r.italic = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0xA0, 0xA0, 0xA0)

    doc.add_paragraph()

    # ── Criteria ───────────────────────────────────────────────────
    h = doc.add_paragraph()
    hr = h.add_run("BRIEF CRITERIA")
    hr.bold = True
    hr.font.size = Pt(11)
    hr.font.color.rgb = RGBColor(0x1F, 0x2A, 0x44)

    cp = doc.add_paragraph(criteria or "")
    cp.paragraph_format.space_after = Pt(12)

    doc.add_paragraph()

    # ── Summary table ──────────────────────────────────────────────
    h2 = doc.add_paragraph()
    h2r = h2.add_run("SUMMARY")
    h2r.bold = True
    h2r.font.size = Pt(11)
    h2r.font.color.rgb = RGBColor(0x1F, 0x2A, 0x44)

    st = doc.add_paragraph()
    stp = st.add_run(
        f"{len(creators)} creator{'' if len(creators)==1 else 's'} assessed  ·  {month_year}"
    )
    stp.italic = True
    stp.font.size = Pt(9)
    stp.font.color.rgb = RGBColor(0x70, 0x70, 0x70)

    headers = ["CREATOR", "REGION", "MARKET", "PLATFORM", "FOLLOWERS", "LANGUAGE", "STATUS"]
    table = doc.add_table(rows=1 + len(creators), cols=len(headers))
    table.style = "Light Grid Accent 1"

    # Header row
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cp = cell.paragraphs[0]
        cr = cp.add_run(h)
        cr.bold = True
        cr.font.size = Pt(9)

    # Rows
    for idx, c in enumerate(creators, start=1):
        row = table.rows[idx].cells
        row[0].text = c.get("name", "")
        row[1].text = (c.get("country") or "—")[:20]
        row[2].text = _market_from(c)
        row[3].text = _guess_platform(c)
        # follower count – not stored in DB yet; show CCV as proxy
        row[4].text = _best_ccv_label(c)
        row[5].text = _language_from(c)
        row[6].text = statuses.get(c["id"], "Pending Review")

    doc.add_paragraph()

    # ── Individual cards ───────────────────────────────────────────
    h3 = doc.add_paragraph()
    h3r = h3.add_run("INDIVIDUAL CREATOR ASSESSMENTS")
    h3r.bold = True
    h3r.font.size = Pt(11)
    h3r.font.color.rgb = RGBColor(0x1F, 0x2A, 0x44)

    for c in creators:
        # Name
        np = doc.add_paragraph()
        nr = np.add_run(c.get("name", ""))
        nr.bold = True
        nr.font.size = Pt(14)

        # Meta table
        meta = doc.add_table(rows=1, cols=4)
        meta.style = "Light Grid Accent 1"
        mrow = meta.rows[0].cells
        meta_pairs = [
            ("LOCATION", c.get("country") or "—"),
            ("PLATFORM", _guess_platform(c)),
            ("CCV", _best_ccv_label(c)),
            ("STATUS", statuses.get(c["id"], "Pending Review")),
        ]
        for i, (label, value) in enumerate(meta_pairs):
            cell = mrow[i]
            p1 = cell.paragraphs[0]
            r1 = p1.add_run(label)
            r1.bold = True
            r1.font.size = Pt(8)
            r1.font.color.rgb = RGBColor(0x70, 0x70, 0x70)
            p2 = cell.add_paragraph(value)
            p2.runs[0].font.size = Pt(10)

        # Content & handle line
        pc = doc.add_paragraph()
        pcr = pc.add_run(
            f"PRIMARY CONTENT  {c.get('category') or '—'}     "
            f"LANGUAGE  {_language_from(c)}     "
            f"MARKET  {_market_from(c)}"
        )
        pcr.font.size = Pt(9)
        pcr.font.color.rgb = RGBColor(0x50, 0x50, 0x50)

        ph = doc.add_paragraph()
        phr = ph.add_run(f"HANDLE  {_handle_line(c)}")
        phr.font.size = Pt(9)
        phr.font.color.rgb = RGBColor(0x50, 0x50, 0x50)

        # Assessment placeholder
        pap = doc.add_paragraph()
        papr = pap.add_run("ASSESSMENT")
        papr.bold = True
        papr.font.size = Pt(9)
        papr.font.color.rgb = RGBColor(0x1F, 0x2A, 0x44)

        placeholder = doc.add_paragraph(
            "[Add assessment here — observations on content fit, audience, "
            "posting cadence, alignment with brief criteria, and recommendation.]"
        )
        placeholder.runs[0].italic = True
        placeholder.runs[0].font.color.rgb = RGBColor(0xA0, 0xA0, 0xA0)

        doc.add_paragraph()  # spacer between creators

    # ── Data sources footer ────────────────────────────────────────
    f = doc.add_paragraph()
    fr = f.add_run(
        "Data sources: Kick channel pages, TwitchTracker, Recast internal research. "
        "Follower and activity data reflects channel status at time of research "
        f"({month_year}). Assessment narratives added by Recast team."
    )
    fr.italic = True
    fr.font.size = Pt(8)
    fr.font.color.rgb = RGBColor(0xA0, 0xA0, 0xA0)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ── Drive upload + share ───────────────────────────────────────────────────

def _upload_to_drive_and_share(docx_bytes, filename, share_email):
    """Uploads .docx to Drive, converts to Google Doc, shares with email.
    Returns (webViewLink, file_id) or (None, None) on failure."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    from google.oauth2 import service_account

    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
    if not creds_json:
        return None, None

    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        tmp.write(creds_json)
        tmp.close()
        tmp_path = tmp.name

        creds = service_account.Credentials.from_service_account_file(
            tmp_path,
            scopes=["https://www.googleapis.com/auth/drive"],
        )
        drive = build("drive", "v3", credentials=creds, cache_discovery=False)

        media = MediaIoBaseUpload(
            io.BytesIO(docx_bytes),
            mimetype=(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            resumable=False,
        )
        file = (
            drive.files()
            .create(
                body={
                    "name": filename,
                    # Google Docs MIME type — converts .docx into a native Doc
                    "mimeType": "application/vnd.google-apps.document",
                },
                media_body=media,
                fields="id,webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )

        file_id = file.get("id")
        link = file.get("webViewLink")

        # Share with the caller's email as writer
        if share_email:
            try:
                drive.permissions().create(
                    fileId=file_id,
                    body={"type": "user", "role": "writer", "emailAddress": share_email},
                    sendNotificationEmail=True,
                    supportsAllDrives=True,
                ).execute()
            except Exception as e:
                print(f"[export_brief] share failed for {share_email}: {e}")

        return link, file_id
    except Exception as e:
        print(f"[export_brief] drive upload failed: {e}")
        return None, None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


# ── Handler ────────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        user = require_auth(self, required_roles=("admin", "finance"))
        if not user:
            return
        try:
            body = read_body(self)
            partner = (body.get("partner") or "").strip()
            campaign = (body.get("campaign") or "").strip()
            criteria = (body.get("criteria") or "").strip()
            month_year = (body.get("month_year") or "").strip() or datetime.now().strftime("%B %Y")
            creator_ids = body.get("creator_ids") or []
            statuses = body.get("statuses") or {}

            if not partner or not campaign or not creator_ids:
                json_response(self, 400, {"error": "partner, campaign, creator_ids are required"})
                return

            creators = _fetch_creators(creator_ids)
            if not creators:
                json_response(self, 404, {"error": "no creators found for the provided ids"})
                return

            # Preserve selection order
            by_id = {c["id"]: c for c in creators}
            ordered = [by_id[i] for i in creator_ids if i in by_id]

            docx_bytes = _build_docx(partner, campaign, criteria, month_year, ordered, statuses)

            safe_campaign = "".join(ch for ch in campaign if ch.isalnum() or ch in (" ", "-", "_")).strip()
            filename = f"Recast_{partner}_{safe_campaign}_{month_year.replace(' ', '')}"

            share_email = user.get("email") or ""
            url, file_id = _upload_to_drive_and_share(docx_bytes, filename, share_email)

            if not url:
                json_response(self, 500, {"error": "Drive upload failed"})
                return

            json_response(
                self,
                200,
                {
                    "ok": True,
                    "url": url,
                    "file_id": file_id,
                    "shared_with": share_email,
                    "creators": len(ordered),
                },
            )
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()
