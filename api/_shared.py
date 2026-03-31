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
    tmp_path = None
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
        tmp_path = tmp.name
        client = gspread.service_account(filename=tmp_path)
        wb = client.open_by_key(SPREADSHEET_ID)
        _gspread_sheet = wb.get_worksheet_by_id(SHEET_GID) if SHEET_GID else wb.get_worksheet(0)
        return _gspread_sheet
    except Exception as e:
        print(f"[GSheets] Connection failed: {e}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def gsheet_all_records():
    """Fetch all rows as list of dicts with deduplicated headers.
    Returns None on connection failure, [] on empty sheet."""
    sh = _get_gsheet()
    if sh is None:
        return None
    try:
        all_values = sh.get_all_values()
    except Exception:
        sh = _get_gsheet(force_reconnect=True)
        if sh is None:
            return None
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


ALLOWED_UPDATE_FIELDS = {
    "Outreach Status", "Notes", "Deal Value",
    "Follow-Up Date", "Campaign", "Pipeline Notes",
    "Twitch Handle", "Twitch CCV", "Kick Handle", "Kick CCV",
    "Twitch 30d CCV", "Kick 30d CCV",
    "Platforms", "Country", "Content Type",
    "Twitter Link", "Instagram Link",
    "Bin",
}


def gsheet_update_field(creator_name: str, col_header: str, value) -> int:
    """Find a creator by name and update one cell. Returns rows updated."""
    if col_header not in ALLOWED_UPDATE_FIELDS:
        return 0
    sh = _get_gsheet()
    if sh is None:
        return 0
    try:
        headers = sh.row_values(1)
        if col_header not in headers:
            if col_header in ("Bin", "Twitch 30d CCV", "Kick 30d CCV"):
                # Auto-create column
                new_col = len(headers) + 1
                sh.update_cell(1, new_col, col_header)
                headers.append(col_header)
            else:
                return 0
        col_idx = headers.index(col_header) + 1
        # Find the "Creator Name" column dynamically (don't assume col 1)
        name_col_idx = _find_name_col(sh)
        name_col_vals = sh.col_values(name_col_idx)
        # Normalize the search name
        search_name = creator_name.strip()
        search_lower = search_name.lower()
        # First pass: exact match (after strip)
        for row_idx, cell_val in enumerate(name_col_vals[1:], start=2):
            if str(cell_val).strip() == search_name:
                sh.update_cell(row_idx, col_idx, value if value is not None else "")
                return 1
        # Second pass: case-insensitive fallback
        for row_idx, cell_val in enumerate(name_col_vals[1:], start=2):
            if str(cell_val).strip().lower() == search_lower:
                sh.update_cell(row_idx, col_idx, value if value is not None else "")
                return 1
        print(f"[GSheets] Name not found: '{search_name}' in col {name_col_idx} (searched {len(name_col_vals)-1} rows, first 3: {name_col_vals[1:4]})")
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


def gsheet_append_rows(rows: list) -> bool:
    """Append multiple rows to the sheet in a single batch."""
    sh = _get_gsheet()
    if sh is None:
        return False
    try:
        sh.append_rows(rows, value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        print(f"[GSheets] Batch append failed: {e}")
        return False


def gsheet_headers() -> list:
    sh = _get_gsheet()
    if sh is None:
        return []
    try:
        return sh.row_values(1)
    except Exception:
        return []


def _find_name_col(sh) -> int:
    """Find the 1-based column index for 'Creator Name' (defaults to 1)."""
    try:
        headers = sh.row_values(1)
        for i, h in enumerate(headers):
            if h.strip().lower() in ("creator name", "name"):
                return i + 1
    except Exception:
        pass
    return 1


def existing_names_in_gsheet() -> set:
    sh = _get_gsheet()
    if sh is None:
        return set()
    try:
        name_col = _find_name_col(sh)
        vals = sh.col_values(name_col)
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
    # ── FPS / Shooter ──
    "FPS": "FPS / Shooter", "Shooter": "FPS / Shooter", "FPS / Shooter": "FPS / Shooter",
    "Apex Legends": "FPS / Shooter", "Apex": "FPS / Shooter",
    "Call of Duty": "FPS / Shooter", "CoD": "FPS / Shooter", "COD": "FPS / Shooter",
    "Warzone": "FPS / Shooter", "Modern Warfare": "FPS / Shooter",
    "CS2": "FPS / Shooter", "Counter-Strike 2": "FPS / Shooter", "Counter-Strike": "FPS / Shooter", "CSGO": "FPS / Shooter", "CS:GO": "FPS / Shooter",
    "Valorant": "FPS / Shooter", "VALORANT": "FPS / Shooter",
    "R6 Siege": "FPS / Shooter", "Rainbow Six": "FPS / Shooter", "Rainbow Six Siege": "FPS / Shooter",
    "Overwatch 2": "FPS / Shooter", "Overwatch": "FPS / Shooter",
    "Escape from Tarkov": "FPS / Shooter", "Tarkov": "FPS / Shooter", "EFT": "FPS / Shooter",
    "Garena Free Fire": "FPS / Shooter", "Free Fire": "FPS / Shooter",
    "ARC Raiders": "FPS / Shooter", "Halo": "FPS / Shooter", "Halo Infinite": "FPS / Shooter",
    "XDefiant": "FPS / Shooter", "The Finals": "FPS / Shooter",
    "Deadlock": "FPS / Shooter", "Delta Force": "FPS / Shooter",
    "Hunt: Showdown": "FPS / Shooter", "Battlefield": "FPS / Shooter",

    # ── Battle Royale ──
    "Fortnite": "Battle Royale", "Battle Royale": "Battle Royale", "BR": "Battle Royale",
    "PUBG": "Battle Royale", "PUBG Mobile": "Battle Royale", "PUBG MOBILE": "Battle Royale",
    "PUBG: Battlegrounds": "Battle Royale", "PUBG Esports": "Battle Royale",
    "Apex Legends": "FPS / Shooter",  # Apex is more FPS than BR in streaming context

    # ── MOBA / Strategy ──
    "MOBA": "MOBA / Strategy", "Strategy": "MOBA / Strategy", "MOBA / Strategy": "MOBA / Strategy",
    "League of Legends": "MOBA / Strategy", "LoL": "MOBA / Strategy", "League": "MOBA / Strategy",
    "Dota 2": "MOBA / Strategy", "Dota": "MOBA / Strategy",
    "RTS": "MOBA / Strategy", "Smite": "MOBA / Strategy", "Smite 2": "MOBA / Strategy",
    "Brawlhalla": "MOBA / Strategy", "Hearthstone": "MOBA / Strategy",
    "Teamfight Tactics": "MOBA / Strategy", "TFT": "MOBA / Strategy",
    "Auto Chess": "MOBA / Strategy", "Chess": "MOBA / Strategy",
    "Civilization": "MOBA / Strategy", "Age of Empires": "MOBA / Strategy",
    "StarCraft": "MOBA / Strategy", "Total War": "MOBA / Strategy",

    # ── RPG / Souls-Like ──
    "RPG": "RPG / Souls-Like", "ARPG": "RPG / Souls-Like", "Action RPG": "RPG / Souls-Like",
    "Action RPGs": "RPG / Souls-Like", "RPG / Souls-Like": "RPG / Souls-Like",
    "Elden Ring": "RPG / Souls-Like", "Dark Souls": "RPG / Souls-Like", "Souls-Like": "RPG / Souls-Like", "Soulslike": "RPG / Souls-Like",
    "Diablo 4": "RPG / Souls-Like", "Diablo": "RPG / Souls-Like",
    "Path of Exile": "RPG / Souls-Like", "PoE": "RPG / Souls-Like", "Path of Exile 2": "RPG / Souls-Like",
    "Dark & Darker": "RPG / Souls-Like", "Destiny 2": "RPG / Souls-Like", "Destiny": "RPG / Souls-Like",
    "HellDivers": "RPG / Souls-Like", "Helldivers 2": "RPG / Souls-Like",
    "Crimson Desert": "RPG / Souls-Like", "Lost Ark": "RPG / Souls-Like",
    "Roguelike": "RPG / Souls-Like", "Roguelite": "RPG / Souls-Like",
    "Kingdom Come: Deliverance II": "RPG / Souls-Like", "Kingdom Come": "RPG / Souls-Like",
    "Speedrunner": "RPG / Souls-Like", "Speedrun": "RPG / Souls-Like",
    "Baldur's Gate 3": "RPG / Souls-Like", "Baldurs Gate": "RPG / Souls-Like",
    "The Witcher": "RPG / Souls-Like", "Cyberpunk 2077": "RPG / Souls-Like", "Cyberpunk": "RPG / Souls-Like",
    "Bloodborne": "RPG / Souls-Like", "Sekiro": "RPG / Souls-Like",
    "Monster Hunter": "RPG / Souls-Like", "Monster Hunter Wilds": "RPG / Souls-Like",

    # ── MMO / RP ──
    "MMO": "MMO / RP", "MMORPG": "MMO / RP", "MMO / RP": "MMO / RP", "RP": "MMO / RP",
    "World of Warcraft": "MMO / RP", "WoW": "MMO / RP",
    "Final Fantasy 14": "MMO / RP", "FFXIV": "MMO / RP", "FF14": "MMO / RP", "Final Fantasy XIV": "MMO / RP",
    "GTA RP": "MMO / RP", "GTA": "MMO / RP", "Grand Theft Auto V": "MMO / RP", "GTA V": "MMO / RP",
    "GTA V (LC RP)": "MMO / RP", "GTA RP (NoPixel)": "MMO / RP", "No Pixel": "MMO / RP", "NoPixel": "MMO / RP",
    "Respect RP (GTA)": "MMO / RP", "FiveM": "MMO / RP",
    "Rust": "MMO / RP", "Roleplay": "MMO / RP", "Role Play": "MMO / RP",
    "New World": "MMO / RP", "Elder Scrolls Online": "MMO / RP", "ESO": "MMO / RP",
    "Black Desert Online": "MMO / RP", "BDO": "MMO / RP",
    "Guild Wars 2": "MMO / RP", "Throne and Liberty": "MMO / RP",

    # ── Gacha / Anime ──
    "Gacha": "Gacha / Anime", "Gacha Games": "Gacha / Anime", "Gacha / Anime": "Gacha / Anime",
    "Genshin Impact": "Gacha / Anime", "Genshin": "Gacha / Anime",
    "Honkai Star Rail": "Gacha / Anime", "Honkai": "Gacha / Anime",
    "Anime": "Gacha / Anime", "Anime Review": "Gacha / Anime", "Anime Reactions": "Gacha / Anime",
    "Dragon Ball Z": "Gacha / Anime", "Dragon Ball": "Gacha / Anime", "DBZ": "Gacha / Anime",
    "Pokemon": "Gacha / Anime", "Pokémon": "Gacha / Anime",
    "Yu-gi-oh": "Gacha / Anime", "Yu-Gi-Oh": "Gacha / Anime", "Yugioh": "Gacha / Anime",
    "TCG": "Gacha / Anime", "Trading Card Game": "Gacha / Anime",
    "Naruto": "Gacha / Anime", "One Piece": "Gacha / Anime", "Manga": "Gacha / Anime",
    "Wuthering Waves": "Gacha / Anime", "Zenless Zone Zero": "Gacha / Anime", "ZZZ": "Gacha / Anime",

    # ── Minecraft / Sandbox ──
    "Minecraft": "Minecraft / Sandbox", "MC": "Minecraft / Sandbox", "Minecraft / Sandbox": "Minecraft / Sandbox",
    "Roblox": "Minecraft / Sandbox", "Sandbox": "Minecraft / Sandbox",
    "The Isle": "Minecraft / Sandbox", "Survival Gaming": "Minecraft / Sandbox", "Survival": "Minecraft / Sandbox",
    "Terraria": "Minecraft / Sandbox", "Valheim": "Minecraft / Sandbox",
    "ARK": "Minecraft / Sandbox", "ARK: Survival Evolved": "Minecraft / Sandbox",
    "Palworld": "Minecraft / Sandbox", "Lego": "Minecraft / Sandbox", "LEGO Fortnite": "Minecraft / Sandbox",
    "Stardew Valley": "Minecraft / Sandbox", "Animal Crossing": "Minecraft / Sandbox",

    # ── Sports / Esports ──
    "Sports": "Sports / Esports", "Esports": "Sports / Esports", "Sports / Esports": "Sports / Esports",
    "Football": "Sports / Esports", "Soccer": "Sports / Esports",
    "Basketball": "Sports / Esports", "NBA": "Sports / Esports", "NBA 2K": "Sports / Esports",
    "EA Sports FC": "Sports / Esports", "EA Sports FC 26": "Sports / Esports", "EA FC": "Sports / Esports", "FIFA": "Sports / Esports",
    "Kings League": "Sports / Esports", "Sports Podcast": "Sports / Esports",
    "Madden": "Sports / Esports", "NFL": "Sports / Esports",
    "UFC": "Sports / Esports", "MMA": "Sports / Esports", "Boxing": "Sports / Esports",
    "F1": "Sports / Esports", "Formula 1": "Sports / Esports", "Racing": "Sports / Esports",
    "Golf": "Sports / Esports", "Baseball": "Sports / Esports", "MLB": "Sports / Esports",
    "Hockey": "Sports / Esports", "NHL": "Sports / Esports",
    "Cricket": "Sports / Esports", "Tennis": "Sports / Esports",
    "Pro Wrestling": "Sports / Esports", "WWE": "Sports / Esports",

    # ── Fighting Games ──
    "Fighting Games": "Fighting Games", "Fighting": "Fighting Games", "FGC": "Fighting Games",
    "Super Smash Bros. Ultimate": "Fighting Games", "Smash Bros": "Fighting Games", "Smash": "Fighting Games",
    "Marvel Rivals": "Fighting Games", "Street Fighter": "Fighting Games", "Street Fighter 6": "Fighting Games", "SF6": "Fighting Games",
    "Tekken": "Fighting Games", "Tekken 8": "Fighting Games",
    "Mortal Kombat": "Fighting Games", "MK1": "Fighting Games",
    "Dragon Ball FighterZ": "Fighting Games", "Guilty Gear": "Fighting Games",

    # ── Slots / Casino ──
    "Slots / Casino": "Slots / Casino", "Slots": "Slots / Casino", "Casino": "Slots / Casino",
    "Gambling": "Slots / Casino", "Slots & Casino": "Slots / Casino", "Slots/Casino": "Slots / Casino",
    "Casino Streaming": "Slots / Casino", "Casino Stream": "Slots / Casino",
    "Stake": "Slots / Casino", "Online Gambling": "Slots / Casino",
    "Just Chatting / Gambling-Adjacent": "Slots / Casino", "Gambling-Adjacent": "Slots / Casino",
    "Betting": "Slots / Casino", "Poker": "Slots / Casino", "Blackjack": "Slots / Casino",
    "Roulette": "Slots / Casino", "Sports Betting": "Slots / Casino",
    "DraftKings": "Slots / Casino", "Rollbit": "Slots / Casino",

    # ── Just Chatting ──
    "Just Chatting": "Just Chatting", "Chat": "Just Chatting", "Chatting": "Just Chatting",
    "Chat Roulette": "Just Chatting", "Omegle": "Just Chatting",
    "Entertainment": "Just Chatting", "Comedy": "Just Chatting",
    "Reactions": "Just Chatting", "Drama": "Just Chatting",
    "Social": "Just Chatting", "Talk Show": "Just Chatting",

    # ── IRL / Lifestyle ──
    "IRL": "IRL / Lifestyle", "Lifestyle": "IRL / Lifestyle", "IRL / Lifestyle": "IRL / Lifestyle",
    "Vlogs": "IRL / Lifestyle", "Vlog": "IRL / Lifestyle", "Vlogging": "IRL / Lifestyle",
    "Travel": "IRL / Lifestyle", "Traveler": "IRL / Lifestyle", "Travel Vlog": "IRL / Lifestyle",
    "Extreme": "IRL / Lifestyle", "Extreme Sports": "IRL / Lifestyle",
    "Events": "IRL / Lifestyle", "Family": "IRL / Lifestyle", "Family Content": "IRL / Lifestyle",
    "Fitness": "IRL / Lifestyle", "Gym": "IRL / Lifestyle", "Health": "IRL / Lifestyle",
    "Mental Health": "IRL / Lifestyle", "Cooking": "IRL / Lifestyle", "Food": "IRL / Lifestyle",
    "Fashion": "IRL / Lifestyle", "Beauty": "IRL / Lifestyle",
    "Daily Vlog": "IRL / Lifestyle", "Pranks": "IRL / Lifestyle",
    "Outdoors": "IRL / Lifestyle", "Camping": "IRL / Lifestyle", "Fishing": "IRL / Lifestyle",

    # ── Talk / Podcast ──
    "Talk / Podcast": "Talk / Podcast", "Podcast": "Talk / Podcast", "Podcast Show": "Talk / Podcast",
    "Commentary": "Talk / Podcast", "Politics": "Talk / Podcast", "Political Commentary": "Talk / Podcast",
    "Finance": "Talk / Podcast", "Crypto": "Talk / Podcast", "Cryptocurrency": "Talk / Podcast",
    "Lore": "Talk / Podcast", "React": "Talk / Podcast", "Reaction": "Talk / Podcast",
    "TV Reactions": "Talk / Podcast", "Movie Reactions": "Talk / Podcast",
    "Dark News": "Talk / Podcast", "Music Reactions": "Talk / Podcast",
    "Science & Technology": "Talk / Podcast", "Technology": "Talk / Podcast", "Tech": "Talk / Podcast",
    "Trading": "Talk / Podcast", "Stock Market": "Talk / Podcast",
    "News": "Talk / Podcast", "Current Events": "Talk / Podcast",
    "Debate": "Talk / Podcast", "Interview": "Talk / Podcast",
    "True Crime": "Talk / Podcast", "Conspiracy": "Talk / Podcast",

    # ── Creative / Art ──
    "Creative / Art": "Creative / Art", "Creative": "Creative / Art",
    "Art": "Creative / Art", "Artist": "Creative / Art", "Digital Art": "Creative / Art",
    "Cosplay": "Creative / Art", "Cosplayer": "Creative / Art",
    "Animation": "Creative / Art", "Animator": "Creative / Art",
    "Music": "Creative / Art", "Singer": "Creative / Art", "Musician": "Creative / Art",
    "DJ": "Creative / Art", "Music Production": "Creative / Art", "Beats": "Creative / Art",
    "ASMR": "Creative / Art",
    "DND": "Creative / Art", "D&D": "Creative / Art", "Dungeons & Dragons": "Creative / Art",
    "Table Top": "Creative / Art", "Tabletop": "Creative / Art", "Board Games": "Creative / Art",
    "Writing": "Creative / Art", "Photography": "Creative / Art",
    "3D Modeling": "Creative / Art", "Graphic Design": "Creative / Art",

    # ── VTuber ──
    "VTuber": "VTuber", "Vtuber": "VTuber", "vtuber": "VTuber",
    "Virtual YouTuber": "VTuber", "VTubing": "VTuber",
    "Hololive": "VTuber", "Nijisanji": "VTuber", "VShojo": "VTuber",

    # ── Variety / Gaming ──
    "Variety": "Variety / Gaming", "Gaming": "Variety / Gaming", "Variety / Gaming": "Variety / Gaming",
    "Variety Gaming": "Variety / Gaming", "Gaming Variety": "Variety / Gaming",
    "Variety Streamer": "Variety / Gaming", "Variety Content": "Variety / Gaming",
    "Game": "Variety / Gaming", "Gamer": "Variety / Gaming",
    "Horror": "Variety / Gaming", "Horror Games": "Variety / Gaming",
    "Indie Games": "Variety / Gaming", "Indie": "Variety / Gaming",
    "Retro Gaming": "Variety / Gaming", "Retro": "Variety / Gaming",
    "Co-op": "Variety / Gaming", "Multiplayer": "Variety / Gaming",
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
    """Platform-specific tier thresholds — Kick numbers are much lower than Twitch."""
    if platform.lower() == "kick":
        if ccv >= 10000: return "Mega"
        if ccv >= 3000:  return "Big"
        if ccv >= 500:   return "Mid"
        return "Small"
    else:  # Twitch and others
        if ccv >= 30000: return "Mega"
        if ccv >= 8000:  return "Big"
        if ccv >= 2500:  return "Mid"
        if ccv >= 1000:  return "Small"
        return "Micro"


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
            tier_map = {"MEGA": "Mega", "ELITE": "Big", "HIGH": "Big", "MID": "Mid", "LOW": "Small"}
            display_tier = tier_map.get(str(kick_tier).upper(), str(kick_tier))
        elif twitch_tier and str(twitch_tier) not in ("nan", "None", ""):
            tier_map = {"MEGA": "Mega", "ELITE": "Big", "BIG": "Big", "HIGH": "Big", "MID": "Mid", "LOW": "Small", "SMALL": "Small"}
            display_tier = tier_map.get(str(twitch_tier).upper(), str(twitch_tier))
        else:
            # Use platform-specific thresholds — Kick tops out much lower than Twitch
            primary_platform = "kick" if "kick" in platforms.lower() else "twitch"
            display_tier = tier_from_ccv(primary_platform, best_ccv)

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
        casino_flag = get_casino_flag(content_type, safe(row.get("Notes")))
        records.append({
            "name": name,
            "status": safe(row.get("Status")),
            "country": country,
            "platforms": platforms,
            "contentType": content_type,
            "casinoFlag": casino_flag,
            "contentCategories": get_categories(content_type) + (["Slots / Casino"] if casino_flag == "yes" else []),
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
            "bin": safe(row.get("Bin")).lower() == "yes",
            "twitch30dCCV": parse_ccv(row.get("Twitch 30d CCV")),
            "kick30dCCV": parse_ccv(row.get("Kick 30d CCV")),
        })

    # ── Deduplicate by name (case-insensitive) ──
    seen_names = {}
    deduped = []
    for r in records:
        key = r["name"].strip().lower()
        if key in seen_names:
            # Merge: keep whichever has better CCV, fill in blanks
            existing = seen_names[key]
            if r["bestCCV"] > existing["bestCCV"]:
                existing["bestCCV"] = r["bestCCV"]
                existing["tier"] = r["tier"]
            for field in ("twitchHandle", "twitchCCV", "kickHandle", "kickCCV",
                          "twitter", "instagram", "country", "contentType",
                          "outreachStatus", "notes", "dealValue", "campaign",
                          "pipelineNotes", "followUpDate"):
                if not existing.get(field) and r.get(field):
                    existing[field] = r[field]
            # Merge platforms
            ep = set(p.strip() for p in (existing.get("platforms") or "").split(",") if p.strip())
            rp = set(p.strip() for p in (r.get("platforms") or "").split(",") if p.strip())
            existing["platforms"] = ", ".join(sorted(ep | rp))
            # Merge content categories
            ec = set(existing.get("contentCategories") or [])
            rc = set(r.get("contentCategories") or [])
            existing["contentCategories"] = sorted(ec | rc)
        else:
            seen_names[key] = r
            deduped.append(r)

    return deduped


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
