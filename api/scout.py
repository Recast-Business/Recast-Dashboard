"""POST /api/scout — Scrape Twitch and Kick for live streamers matching filters.
Body: {platform, category, ccvMin, ccvMax, languages, limit, quick}
"""
from http.server import BaseHTTPRequestHandler
from datetime import datetime
import json, requests
from api._shared import json_response, read_body, existing_names_in_gsheet

# ── Category slug maps ────────────────────────────────────────────────────────

KICK_CAT_SLUGS = {
    "FPS / Shooter":       ["apex-legends", "valorant", "call-of-duty-warzone", "counter-strike-2", "call-of-duty-black-ops-6"],
    "Battle Royale":       ["fortnite", "pubg-battlegrounds"],
    "MOBA / Strategy":     ["league-of-legends", "dota-2"],
    "RPG / Souls-Like":    ["elden-ring", "diablo-iv", "path-of-exile-2", "baldurs-gate-3"],
    "MMO / RP":            ["world-of-warcraft", "grand-theft-auto-v", "final-fantasy-xiv"],
    "Gacha / Anime":       ["genshin-impact", "honkai-star-rail", "wuthering-waves"],
    "Minecraft / Sandbox": ["minecraft"],
    "Sports / Esports":    ["ea-sports-fc-25", "nba-2k25", "rocket-league"],
    "Fighting Games":      ["street-fighter-6", "mortal-kombat-1", "tekken-8"],
    "Just Chatting":       ["just-chatting"],
    "IRL / Lifestyle":     ["irl", "travel-outdoor"],
    "Slots / Casino":      ["slots"],
    "Variety / Gaming":    ["just-chatting"],
    "Talk / Podcast":      ["just-chatting", "podcast"],
    "Creative / Art":      ["art", "music"],
    "VTuber":              ["vtubers", "just-chatting"],
}
KICK_ALL_SLUGS = ["just-chatting", "grand-theft-auto-v", "fortnite", "slots", "apex-legends", "valorant", "minecraft", "league-of-legends", "irl"]

TWITCH_GAME_NAMES = {
    "FPS / Shooter":       ["Apex Legends", "VALORANT", "Call of Duty: Warzone", "Counter-Strike 2", "Call of Duty: Black Ops 6"],
    "Battle Royale":       ["Fortnite", "PUBG: BATTLEGROUNDS"],
    "MOBA / Strategy":     ["League of Legends", "Dota 2"],
    "RPG / Souls-Like":    ["Elden Ring", "Diablo IV", "Path of Exile 2", "Baldur's Gate 3"],
    "MMO / RP":            ["World of Warcraft", "Grand Theft Auto V", "Final Fantasy XIV"],
    "Gacha / Anime":       ["Genshin Impact", "Honkai: Star Rail", "Wuthering Waves"],
    "Minecraft / Sandbox": ["Minecraft"],
    "Sports / Esports":    ["EA Sports FC 25", "NBA 2K25", "Rocket League"],
    "Fighting Games":      ["Street Fighter 6", "Mortal Kombat 1", "Tekken 8"],
    "Just Chatting":       ["Just Chatting"],
    "IRL / Lifestyle":     ["Just Chatting", "Travel & Outdoors"],
    "Slots / Casino":      ["Slots"],
    "Variety / Gaming":    ["Just Chatting"],
    "Talk / Podcast":      ["Podcasts"],
    "Creative / Art":      ["Art", "Music & Performing Arts"],
    "VTuber":              ["Virtual Worlds"],
}
TWITCH_ALL_GAMES = ["Just Chatting", "Grand Theft Auto V", "Fortnite", "League of Legends", "VALORANT", "Apex Legends", "Minecraft", "Slots"]

LANG_CODES = {
    "English":"en","Spanish":"es","Portuguese":"pt","German":"de","French":"fr",
    "Korean":"ko","Japanese":"ja","Russian":"ru","Turkish":"tr","Arabic":"ar",
    "Italian":"it","Polish":"pl","Dutch":"nl","Swedish":"sv","Norwegian":"no",
    "Danish":"da","Finnish":"fi","Chinese":"zh","Thai":"th","Indonesian":"id",
    "Hindi":"hi","Vietnamese":"vi","Filipino":"tl",
}
_DEFAULT_LANGS = ["en","es","pt","de","fr","ko","ja","ru"]


def scrape_kick(category, ccv_min, ccv_max, languages, limit, quick, roster_names):
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
    except ImportError:
        return [], "cloudscraper not installed"

    lang_codes = list(dict.fromkeys(LANG_CODES.get(l, "en") for l in (languages or []))) or _DEFAULT_LANGS
    allowed_codes = set(lang_codes) if languages else set()
    if quick:
        lang_codes = lang_codes[:3]

    slugs = KICK_CAT_SLUGS.get(category, []) if category else [None]
    max_slugs = 2 if quick else len(slugs)
    max_pages = 1 if quick else 3

    headers = {
        "Accept": "application/json",
        "Referer": "https://kick.com",
        "x-app-platform": "web",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

    results = []
    seen = set()

    for lang_code in lang_codes:
        for slug in slugs[:max_slugs]:
            cursor = None
            pages_fetched = 0
            while pages_fetched < max_pages:
                try:
                    qparts = [f"sort=viewer_count_desc", f"language={lang_code}", "limit=24"]
                    if slug:
                        qparts.append(f"subcategory={slug}")
                    if cursor:
                        qparts.append(f"after={cursor}")
                    url = "https://web.kick.com/api/v1/livestreams?" + "&".join(qparts)
                    r = scraper.get(url, headers=headers, timeout=14)
                    if r.status_code != 200:
                        break
                    body = r.json()
                    data_block = body.get("data") or {}
                    streams = data_block.get("livestreams") or []
                    cursor = (data_block.get("pagination") or {}).get("next_cursor")
                    if not streams:
                        break
                except Exception:
                    break

                for s in streams:
                    try:
                        ch = s.get("channel") or {}
                        handle = ch.get("slug") or ""
                        if not handle or handle in seen:
                            continue
                        seen.add(handle)
                        name = ch.get("username") or handle
                        if name.lower().strip() in roster_names:
                            continue
                        ccv = int(s.get("viewer_count") or 0)
                        if ccv_min and ccv < ccv_min:
                            continue
                        if ccv_max and ccv > ccv_max:
                            continue
                        language = (s.get("language") or "").lower().strip()
                        if allowed_codes and language and language not in allowed_codes:
                            continue
                        cat_info = s.get("category") or {}
                        content = cat_info.get("name") or (category or slug or "")
                        results.append({
                            "id": int(datetime.now().timestamp() * 1000) + len(results),
                            "name": name, "platform": "Kick", "handle": handle,
                            "ccv": ccv, "country": "", "language": language or lang_code,
                            "countryKnown": False, "content": content,
                            "twitter": "", "instagram": "",
                            "source": f"Kick/{lang_code}", "inRoster": False,
                            "date": datetime.now().strftime("%d/%m/%Y"),
                        })
                    except Exception:
                        continue

                pages_fetched += 1
                if not cursor or len(results) >= limit:
                    break

    return results, None


def _twitch_fetch_game_streams(game_name, lang_code, max_pages, limit, ccv_min, ccv_max, roster_names, seen, headers):
    """Fetch streams for a single game + language combo via Twitch GQL."""
    results = []
    cursor = None
    pages_fetched = 0
    lang_upper = lang_code.upper()

    while pages_fetched < max_pages:
        after_opt = f', after: "{cursor}"' if cursor else ''
        query = (
            '{ game(name: "%s") { streams(first: 100, options: {sort: VIEWER_COUNT, '
            'broadcasterLanguages: [%s]%s}) '
            '{ edges { cursor node { viewersCount broadcaster { displayName login '
            'broadcastSettings { language } channel { socialMedias { name url } } } } } '
            'pageInfo { hasNextPage } } } }'
            % (game_name.replace('"', '\\"'), lang_upper, after_opt)
        )

        try:
            r = requests.post("https://gql.twitch.tv/gql",
                              json=[{"query": query}], headers=headers, timeout=10)
            if r.status_code != 200:
                break
            data = r.json()
            stream_data = ((data[0].get("data") or {}).get("game") or {}).get("streams") or {}
            edges = stream_data.get("edges") or []
            has_next = (stream_data.get("pageInfo") or {}).get("hasNextPage", False)
            cursor = edges[-1].get("cursor") if edges and has_next else None
        except Exception:
            break

        for edge in edges:
            try:
                node = edge["node"]
                broadcaster = node["broadcaster"]
                login = broadcaster["login"]
                if login in seen:
                    continue
                seen.add(login)
                name = broadcaster["displayName"]
                if name.lower().strip() in roster_names:
                    continue
                ccv = node.get("viewersCount", 0)
                if ccv_min and ccv < ccv_min:
                    continue
                if ccv_max and ccv > ccv_max:
                    continue
                stream_lang = (broadcaster.get("broadcastSettings") or {}).get("language", lang_code)
                twitter, instagram = "", ""
                for sm in ((broadcaster.get("channel") or {}).get("socialMedias") or []):
                    sm_name = sm.get("name", "").lower()
                    sm_url = sm.get("url", "")
                    if sm_name in ("x", "twitter") and not twitter:
                        twitter = sm_url
                    elif "instagram" in sm_name and not instagram:
                        instagram = sm_url
                content = game_name or ""
                results.append({
                    "id": int(datetime.now().timestamp() * 1000) + len(results),
                    "name": name, "platform": "Twitch", "handle": login,
                    "ccv": ccv, "country": "", "language": stream_lang,
                    "content": content, "twitter": twitter, "instagram": instagram,
                    "source": f"Twitch/{lang_code}", "inRoster": False,
                    "date": datetime.now().strftime("%d/%m/%Y"),
                })
            except Exception:
                continue

        pages_fetched += 1
        if not cursor or len(results) >= limit:
            break

    return results


# Popular Twitch categories to scrape when no specific category is selected
# Covers the same spread as browsing /directory/all
TWITCH_BROWSE_GAMES = [
    "Just Chatting", "Fortnite", "League of Legends", "VALORANT",
    "Grand Theft Auto V", "Minecraft", "Apex Legends", "Counter-Strike 2",
    "World of Warcraft", "Call of Duty: Black Ops 6", "Slots",
    "EA Sports FC 25", "Dota 2", "Path of Exile 2", "Elden Ring",
    "Rocket League", "PUBG: BATTLEGROUNDS", "Genshin Impact",
]


def scrape_twitch(category, ccv_min, ccv_max, languages, limit, quick, roster_names):
    lang_codes = list(dict.fromkeys(LANG_CODES.get(l, "en") for l in (languages or []))) or _DEFAULT_LANGS
    if quick:
        lang_codes = lang_codes[:3]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        "Accept": "application/json",
    }

    results = []
    seen = set()

    if category:
        # Specific category selected — scrape its games
        game_names = TWITCH_GAME_NAMES.get(category, [category])
        max_games = 2 if quick else 4
        max_pages = 1 if quick else 3
        for lang_code in lang_codes:
            for game_name in game_names[:max_games]:
                batch = _twitch_fetch_game_streams(
                    game_name, lang_code, max_pages, limit - len(results),
                    ccv_min, ccv_max, roster_names, seen, headers
                )
                results.extend(batch)
                if len(results) >= limit:
                    break
            if len(results) >= limit:
                break
    else:
        # No category — browse across all popular games (like /directory/all)
        max_games = 6 if quick else len(TWITCH_BROWSE_GAMES)
        max_pages = 1 if quick else 2
        for lang_code in lang_codes:
            for game_name in TWITCH_BROWSE_GAMES[:max_games]:
                batch = _twitch_fetch_game_streams(
                    game_name, lang_code, max_pages, limit - len(results),
                    ccv_min, ccv_max, roster_names, seen, headers
                )
                results.extend(batch)
                if len(results) >= limit:
                    break
            if len(results) >= limit:
                break

    return results, None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            platform = (body.get("platform") or "").lower()
            category = body.get("category") or ""
            ccv_min = int(body.get("ccvMin") or 0)
            ccv_max = int(body.get("ccvMax") or 0)
            languages = body.get("languages") or []
            limit = min(int(body.get("limit") or 200), 500)
            quick = bool(body.get("quick"))

            # Load roster names for dedup
            roster_names = existing_names_in_gsheet()

            all_results = []
            if platform in ("kick", "both", ""):
                kick_res, _ = scrape_kick(category, ccv_min, ccv_max, languages, limit, quick, roster_names)
                all_results.extend(kick_res)
            if platform in ("twitch", "both", ""):
                tw_res, _ = scrape_twitch(category, ccv_min, ccv_max, languages, limit, quick, roster_names)
                all_results.extend(tw_res)

            all_results.sort(key=lambda x: x.get("ccv", 0), reverse=True)
            json_response(self, 200, {"results": all_results[:limit], "count": len(all_results[:limit])})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
