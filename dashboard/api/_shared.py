"""Shared helpers for all Vercel serverless functions."""
import json, os, re, tempfile


ALLOWED_UPDATE_FIELDS = {
    "Outreach Status", "Notes", "Deal Value",
    "Follow-Up Date", "Campaign", "Pipeline Notes",
    "Twitch Handle", "Twitch CCV", "Kick Handle", "Kick CCV",
    "Twitch 30d CCV", "Kick 30d CCV",
    "Platforms", "Country", "Content Type",
    "Twitter Link", "Instagram Link",
    "Bin",
}


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


# ── Country Normalization ─────────────────────────────────────────────────────


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

# ── CCV Parsing ───────────────────────────────────────────────────────────────

# ── Process Records ───────────────────────────────────────────────────────────

# ── JSON Response Helper ──────────────────────────────────────────────────────

# ── CORS: lock to the production origin + localhost dev ──────────────────────
# Allowed origins list (add additional preview deployment URLs via env).
_ALLOWED_ORIGINS = {
    "https://recast-dashboard.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
}
_extra = os.environ.get("ALLOWED_ORIGINS", "")
if _extra:
    for o in _extra.split(","):
        o = o.strip()
        if o:
            _ALLOWED_ORIGINS.add(o)


def _origin_allowed(handler) -> str:
    origin = handler.headers.get("Origin", "")
    if origin in _ALLOWED_ORIGINS:
        return origin
    # Fall back to production origin for non-browser callers (server-to-server).
    return "https://recast-dashboard.vercel.app"


def cors_headers(handler) -> None:
    origin = _origin_allowed(handler)
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers", "Content-Type, Authorization, apikey"
    )
    handler.send_header("Vary", "Origin")


def json_response(handler, status, data):
    """Send a JSON response from a BaseHTTPRequestHandler."""
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    cors_headers(handler)
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


# ── Supabase JWT auth + role check ────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def _verify_supabase_jwt(token: str):
    """Call Supabase Auth API to verify the JWT. Returns user dict or None."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    try:
        import requests as _rq
        r = _rq.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            timeout=6,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[auth] verify failed: {e}")
    return None


def _user_role(user_id: str):
    """Look up the user's role in the profiles table using the service key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not user_id:
        return None
    try:
        import requests as _rq
        r = _rq.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "role"},
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=6,
        )
        if r.status_code == 200:
            rows = r.json()
            if rows:
                return (rows[0].get("role") or "").strip() or None
    except Exception as e:
        print(f"[auth] role lookup failed: {e}")
    return None


def require_auth(handler, required_roles=None):
    """Verify Bearer token + (optionally) role. On failure, writes 401/403 and
    returns None. On success returns a dict {id, email, role}. Call as the
    first line of every handler that touches data."""
    auth_header = handler.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        json_response(handler, 401, {"error": "missing bearer token"})
        return None
    token = auth_header[7:].strip()
    if not token:
        json_response(handler, 401, {"error": "empty token"})
        return None

    user = _verify_supabase_jwt(token)
    if not user or not user.get("id"):
        json_response(handler, 401, {"error": "invalid token"})
        return None

    role = _user_role(user["id"])
    if required_roles:
        allowed = {r.strip() for r in required_roles}
        if role not in allowed:
            json_response(handler, 403, {"error": "forbidden", "role": role})
            return None

    return {"id": user["id"], "email": user.get("email"), "role": role}
