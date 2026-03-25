"""Shared helpers for all Vercel serverless functions."""
import json, os, re, tempfile

# ── Google Sheets Connection ──────────────────────────────────────────────────

SPREADSHEET_ID = "14KV1CnAl7jnYBTjm9THiI4CS8WFNMnfz3ti10e2aI_k"
SHEET_GID = 1375114138

_gspread_sheet = None

def _get_gsheet(force_reconnect=False):
    """Return the authorised gspread Worksheet (cached within invocation)."""
    global _gspread_sheet
    if _gspread_sheet is not None and not force_reconnect:
        return _gspread_sheet
    try:
        import gspread
        creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
        if not creds_json:
            print("[GSheets] No GOOGLE_CREDENTIALS_JSON env var")
            return None
        creds_dict = json.loads(creds_json)
        # Write to temp file for gspread (it expects a file path)
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(creds_dict, tmp)
        tmp.close()
        client = gspread.service_account(filename=tmp.name)
        os.unlink(tmp.name)
        wb = client.open_by_key(SPREADSHEET_ID)
        _gspread_sheet = wb.get_worksheet_by_id(SHEET_GID) if SHEET_GID else wb.get_worksheet(0)
        return _gspread_sheet
    except Exception as e:
        print(f"[GSheets] Connection failed: {e}")
        return None


def gsheet_all_records() -> list:
    """Fetch all rows as list of dicts with deduplicated headers."""
    sh = _get_gsheet()
    if sh is None:
        return []
    try:
        all_values = sh.get_all_values()
    except Exception:
        sh = _get_gsheet(force_reconnect=True)
        if sh is None:
            return []
        all_values = sh.get_all_values()

    if not all_values:
        return []

    raw_headers = all_values[0]
    headers = []
    seen = {}
    for h in raw_headers:
        if h in seen:
            seen[h] += 1
            headers.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 1
            headers.append(h)

    records = []
    for row in all_values[1:]:
        padded = row + [""] * (len(headers) - len(row))
        records.append(dict(zip(headers, padded)))
    return records


def gsheet_update_field(creator_name: str, col_header: str, value) -> int:
    """Find a creator by name and update one cell. Returns rows updated."""
    sh = _get_gsheet()
    if sh is None:
        return 0
    try:
        headers = sh.row_values(1)
        if col_header not in headers:
            return 0
        col_idx = headers.index(col_header) + 1
        name_col_vals = sh.col_values(1)
        for row_idx, cell_val in enumerate(name_col_vals[1:], start=2):
            if str(cell_val).strip() == creator_name:
                sh.update_cell(row_idx, col_idx, value or "")
                return 1
        return 0
    except Exception as e:
        print(f"[GSheets] Update failed: {e}")
        return 0


def gsheet_append_row(values: list) -> bool:
    """Append a new row to the sheet."""
    sh = _get_gsheet()
    if sh is None:
        return False
    try:
        sh.append_row(values, value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        print(f"[GSheets] Append failed: {e}")
        return False


def gsheet_headers() -> list:
    sh = _get_gsheet()
    if sh is None:
        return []
    try:
        return sh.row_values(1)
    except Exception:
        return []


def existing_names_in_gsheet() -> set:
    sh = _get_gsheet()
    if sh is None:
        return set()
    try:
        vals = sh.col_values(1)
        return {str(v).strip().lower() for v in vals[1:] if v}
    except Exception:
        return set()


# ── Country Normalization ─────────────────────────────────────────────────────

COUNTRY_NORMALIZE = {
    "US": "USA", "United States": "USA", "United States of America": "USA",
    "United Kingdom": "UK", "England": "UK", "Lancashire": "UK",
    "Phillipines": "Philippines",
    "Czechia": "Czech Republic",
    "Korea": "South Korea",
    "Suomi": "Finland",
}

# ── Casino Detection ──────────────────────────────────────────────────────────

CASINO_POSITIVE = [
    'casino', 'gambling', 'slot', 'slots', 'gambling-adjacent',
    'stake', 'draftking', 'betmgm', 'bet365', 'bovada', 'rollbit',
    'casino content ok', 'gambling-friendly', 'casino sponsor',
    'casino stream', 'casino deal', 'betting deal', 'gambling deal',
    'full send gambling', 'drakelings', 'casino affiliate',
]

CASINO_HARD_NO = [
    'no casino deals', 'no casino affiliate', 'no casino affiliation',
    'no casino', 'no gambling', 'skin trading only',
]

def get_casino_flag(content_type, notes):
    ct = (content_type or '').lower()
    n = (notes or '').lower()
    if any(s in n for s in CASINO_HARD_NO):
        return 'no'
    if any(s in ct for s in CASINO_POSITIVE):
        return 'yes'
    if any(s in n for s in CASINO_POSITIVE):
        return 'yes'
    return 'unknown'

# ── Content Category Mapping ──────────────────────────────────────────────────

CATEGORY_MAP = {
    "FPS": "FPS / Shooter", "Apex Legends": "FPS / Shooter", "Call of Duty": "FPS / Shooter",
    "CS2": "FPS / Shooter", "Counter-Strike 2": "FPS / Shooter", "Valorant": "FPS / Shooter",
    "VALORANT": "FPS / Shooter", "Warzone": "FPS / Shooter", "R6 Siege": "FPS / Shooter",
    "Overwatch 2": "FPS / Shooter", "Escape from Tarkov": "FPS / Shooter",
    "Garena Free Fire": "FPS / Shooter", "ARC Raiders": "FPS / Shooter",
    "Fortnite": "Battle Royale", "PUBG": "Battle Royale", "PUBG Mobile": "Battle Royale",
    "PUBG MOBILE": "Battle Royale", "PUBG: Battlegrounds": "Battle Royale", "PUBG Esports": "Battle Royale",
    "League of Legends": "MOBA / Strategy", "RTS": "MOBA / Strategy", "Smite": "MOBA / Strategy",
    "Brawlhalla": "MOBA / Strategy", "Hearthstone": "MOBA / Strategy",
    "ARPG": "RPG / Souls-Like", "Action RPGs": "RPG / Souls-Like", "Elden Ring": "RPG / Souls-Like",
    "Dark Souls": "RPG / Souls-Like", "Souls-Like": "RPG / Souls-Like", "Diablo 4": "RPG / Souls-Like",
    "Path of Exile": "RPG / Souls-Like", "Dark & Darker": "RPG / Souls-Like",
    "Destiny 2": "RPG / Souls-Like", "HellDivers": "RPG / Souls-Like",
    "Crimson Desert": "RPG / Souls-Like", "Lost Ark": "RPG / Souls-Like",
    "Roguelike": "RPG / Souls-Like", "Kingdom Come: Deliverance II": "RPG / Souls-Like",
    "Speedrunner": "RPG / Souls-Like",
    "MMO": "MMO / RP", "World of Warcraft": "MMO / RP", "Final Fantasy 14": "MMO / RP",
    "GTA RP": "MMO / RP", "GTA": "MMO / RP", "Grand Theft Auto V": "MMO / RP",
    "GTA V (LC RP)": "MMO / RP", "GTA RP (NoPixel)": "MMO / RP", "No Pixel": "MMO / RP",
    "Respect RP (GTA)": "MMO / RP", "Rust": "MMO / RP",
    "Gacha Games": "Gacha / Anime", "Genshin Impact": "Gacha / Anime",
    "Honkai Star Rail": "Gacha / Anime", "Anime": "Gacha / Anime",
    "Anime Review": "Gacha / Anime", "Dragon Ball Z": "Gacha / Anime",
    "Pokemon": "Gacha / Anime", "Yu-gi-oh": "Gacha / Anime", "TCG": "Gacha / Anime",
    "Minecraft": "Minecraft / Sandbox", "Roblox": "Minecraft / Sandbox",
    "The Isle": "Minecraft / Sandbox", "Survival Gaming": "Minecraft / Sandbox",
    "Sports": "Sports / Esports", "Football": "Sports / Esports", "Basketball": "Sports / Esports",
    "EA Sports FC": "Sports / Esports", "EA Sports FC 26": "Sports / Esports",
    "Kings League": "Sports / Esports", "Esports": "Sports / Esports", "Sports Podcast": "Sports / Esports",
    "Fighting Games": "Fighting Games", "Super Smash Bros. Ultimate": "Fighting Games",
    "Marvel Rivals": "Fighting Games",
    "Just Chatting / Gambling-Adjacent": "Slots / Casino", "Gambling-Adjacent": "Slots / Casino",
    "Just Chatting": "Just Chatting", "Chat Roulette": "Just Chatting",
    "Entertainment": "Just Chatting", "Comedy": "Just Chatting",
    "IRL": "IRL / Lifestyle", "Lifestyle": "IRL / Lifestyle", "Vlogs": "IRL / Lifestyle",
    "Travel": "IRL / Lifestyle", "Traveler": "IRL / Lifestyle", "Extreme": "IRL / Lifestyle",
    "Events": "IRL / Lifestyle", "Family": "IRL / Lifestyle", "Fitness": "IRL / Lifestyle",
    "Mental Health": "IRL / Lifestyle", "Cooking": "IRL / Lifestyle",
    "Podcast Show": "Talk / Podcast", "Commentary": "Talk / Podcast", "Politics": "Talk / Podcast",
    "Political Commentary": "Talk / Podcast", "Finance": "Talk / Podcast", "Crypto": "Talk / Podcast",
    "Lore": "Talk / Podcast", "React": "Talk / Podcast", "TV Reactions": "Talk / Podcast",
    "Dark News": "Talk / Podcast", "Music Reactions": "Talk / Podcast",
    "Science & Technology": "Talk / Podcast", "Trading": "Talk / Podcast",
    "Art": "Creative / Art", "Artist": "Creative / Art", "Cosplay": "Creative / Art",
    "Animation": "Creative / Art", "Music": "Creative / Art", "Singer": "Creative / Art",
    "ASMR": "Creative / Art", "DND": "Creative / Art", "Table Top": "Creative / Art",
    "VTuber": "VTuber",
    "Variety": "Variety / Gaming", "Gaming": "Variety / Gaming",
    "Variety Gaming": "Variety / Gaming", "Gaming Variety": "Variety / Gaming",
}

def get_categories(content_type_raw):
    if not content_type_raw:
        return []
    tags = [t.strip() for t in content_type_raw.replace(";", "/").split("/") if t.strip()]
    cats = set()
    for tag in tags:
        if tag in CATEGORY_MAP:
            cats.add(CATEGORY_MAP[tag])
            continue
        base = tag.split(",")[0].strip()
        if base in CATEGORY_MAP:
            cats.add(CATEGORY_MAP[base])
            continue
        tl = tag.lower()
        if any(x in tl for x in ["fps", "shooter"]): cats.add("FPS / Shooter")
        elif any(x in tl for x in ["mmo", "rpg", "souls"]): cats.add("RPG / Souls-Like")
        elif "variety" in tl or "gaming" in tl: cats.add("Variety / Gaming")
        elif "irl" in tl or "lifestyle" in tl: cats.add("IRL / Lifestyle")
        elif "just chatting" in tl: cats.add("Just Chatting")
        elif "vtuber" in tl: cats.add("VTuber")
        elif "sport" in tl: cats.add("Sports / Esports")
        elif "podcast" in tl or "talk" in tl: cats.add("Talk / Podcast")
        else: cats.add("Variety / Gaming")
    return sorted(cats)


# ── CCV Parsing ───────────────────────────────────────────────────────────────

def parse_ccv(val):
    if val is None:
        return 0
    s = str(val).replace(",", "").replace(" ", "").strip()
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def tier_from_ccv(platform, ccv):
    if platform.lower() == "twitch":
        if ccv >= 10000: return "BIG"
        if ccv >= 3000: return "MID"
        return "SMALL"
    else:
        if ccv >= 50000: return "MEGA"
        if ccv >= 25000: return "ELITE"
        if ccv >= 10000: return "HIGH"
        if ccv >= 3000: return "MID"
        return "LOW"


# ── Process Records ───────────────────────────────────────────────────────────

def process_records(raw_rows: list) -> list:
    """Transform raw Google Sheets rows into the DATA format for the frontend."""
    records = []
    for row in raw_rows:
        platforms = str(row.get("Platforms", "") or "")
        kick_tier = row.get("Tier Size_2") or row.get("Tier Size.1") or row.get("Kick Tier Size") or row.get("Kick Tier")
        twitch_tier = row.get("Tier Size") or row.get("Twitch Tier Size") or row.get("Twitch Tier")
        overall_tier = row.get("Tier")
        t_ccv = parse_ccv(row.get("Twitch CCV"))
        k_ccv = parse_ccv(row.get("Kick CCV"))
        best_ccv = max(k_ccv, t_ccv)

        if overall_tier and str(overall_tier) not in ("nan", "None", ""):
            display_tier = str(overall_tier)
        elif kick_tier and str(kick_tier) not in ("nan", "None", ""):
            tier_map = {"MEGA": "Mega", "ELITE": "Elite", "HIGH": "High", "MID": "Mid", "LOW": "Low"}
            display_tier = tier_map.get(str(kick_tier).upper(), str(kick_tier))
        elif twitch_tier and str(twitch_tier) not in ("nan", "None", ""):
            tier_map = {"MEGA": "Mega", "BIG": "Big", "MID": "Mid", "SMALL": "Small"}
            display_tier = tier_map.get(str(twitch_tier).upper(), str(twitch_tier))
        else:
            if best_ccv >= 50000: display_tier = "Mega"
            elif best_ccv >= 25000: display_tier = "Elite"
            elif best_ccv >= 10000: display_tier = "High"
            elif best_ccv >= 3000: display_tier = "Mid"
            else: display_tier = "Low"

        def safe(val):
            if val is None: return ""
            s = str(val).strip()
            return "" if s in ("nan", "None") else s

        name = safe(row.get("Creator Name"))
        if not name:
            continue

        if not safe(row.get("Twitch Handle")) and not safe(row.get("Kick Handle")) and not safe(row.get("Platforms")):
            continue

        country = safe(row.get("Country", ""))
        country = re.sub(r"[\U0001F1E0-\U0001F1FF]+\s*", "", country).strip()
        country = COUNTRY_NORMALIZE.get(country, country)

        content_type = safe(row.get("Content Type"))
        records.append({
            "name": name,
            "status": safe(row.get("Status")),
            "country": country,
            "platforms": platforms,
            "contentType": content_type,
            "casinoFlag": get_casino_flag(content_type, safe(row.get("Notes"))),
            "contentCategories": get_categories(content_type) + (["Slots / Casino"] if get_casino_flag(content_type, safe(row.get("Notes"))) == "yes" else []),
            "twitchHandle": safe(row.get("Twitch Handle")),
            "twitchCCV": t_ccv,
            "twitchTier": safe(twitch_tier),
            "kickHandle": safe(row.get("Kick Handle")),
            "kickCCV": k_ccv,
            "kickTier": safe(kick_tier),
            "bestCCV": best_ccv,
            "tier": display_tier,
            "twitter": safe(row.get("Twitter Link")),
            "instagram": safe(row.get("Instagram Link")),
            "outreachStatus": safe(row.get("Outreach Status")),
            "notes": safe(row.get("Notes")),
            "dealValue": safe(row.get("Deal Value")),
            "followUpDate": safe(row.get("Follow-Up Date")),
            "campaign": safe(row.get("Campaign")),
            "pipelineNotes": safe(row.get("Pipeline Notes")),
        })

    return records


# ── JSON Response Helper ──────────────────────────────────────────────────────

def json_response(handler, status, data):
    """Send a JSON response from a BaseHTTPRequestHandler."""
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler) -> dict:
    """Read and parse JSON body from request."""
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw)
