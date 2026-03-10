"""
Triur.ai — World Awareness Module
Gives siblings awareness of the real world — weather, news, web search.
All free. No API keys required.
Weather affects mood naturally.
News feeds opinions based on sibling values and ethics.
"""

import os
import json
import requests
import feedparser
from datetime import datetime, timedelta
from utils import DATA_DIR, load_json, save_json

WORLD_CACHE_DIR = os.path.join(DATA_DIR, "world_cache")
os.makedirs(WORLD_CACHE_DIR, exist_ok=True)

WORLD_CACHE_FILE = os.path.join(WORLD_CACHE_DIR, "world_state.json")
CACHE_EXPIRY_MINUTES = 30

# Free RSS feeds — no API keys needed
NEWS_FEEDS = {
    "world": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "technology": "http://feeds.bbci.co.uk/news/technology/rss.xml",
    "science": "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    "entertainment": "http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
}


def _is_cache_fresh(cache_data, key, max_age_minutes=CACHE_EXPIRY_MINUTES):
    """Check if a cached value is still fresh."""
    if not cache_data or key not in cache_data:
        return False
    cached_at = cache_data.get(f"{key}_cached_at")
    if not cached_at:
        return False
    age = (datetime.now() - datetime.fromisoformat(cached_at)).total_seconds() / 60
    return age < max_age_minutes


def _load_cache():
    return load_json(WORLD_CACHE_FILE, {})


def _save_cache(data):
    save_json(WORLD_CACHE_FILE, data)


def get_weather(city="auto"):
    """
    Get current weather using wttr.in — free, no API key.
    city="auto" uses IP-based location detection.
    Returns a dict with weather info and mood hint.
    """
    cache = _load_cache()
    if _is_cache_fresh(cache, "weather", max_age_minutes=60):
        return cache.get("weather", {})

    try:
        location = "" if city == "auto" else city
        url = f"https://wttr.in/{location}?format=j1"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            current = data["current_condition"][0]
            weather_code = int(current.get("weatherCode", 113))
            temp_f = int(current.get("temp_F", 70))
            temp_c = int(current.get("temp_C", 21))
            desc = current.get("weatherDesc", [{}])[0].get("value", "Clear")
            humidity = int(current.get("humidity", 50))
            feels_like_f = int(current.get("FeelsLikeF", temp_f))

            # Determine mood hint from weather
            mood_hint = _weather_to_mood(weather_code, temp_f)

            result = {
                "description": desc,
                "temp_f": temp_f,
                "temp_c": temp_c,
                "feels_like_f": feels_like_f,
                "humidity": humidity,
                "weather_code": weather_code,
                "mood_hint": mood_hint,
                "is_nice": temp_f >= 60 and temp_f <= 80 and weather_code == 113,
                "is_cold": temp_f < 40,
                "is_hot": temp_f > 90,
                "is_raining": weather_code in [
                    263, 266, 281, 284, 293, 296, 299, 302,
                    305, 308, 311, 314, 317, 320, 353, 356, 359
                ],
                "is_stormy": weather_code in [386, 389, 392, 395, 200, 201, 202],
                "is_snowing": weather_code in [
                    179, 182, 185, 227, 230, 323, 326, 329,
                    332, 335, 338, 350, 362, 365, 368, 371, 374, 377
                ],
                "summary": f"{desc}, {temp_f}°F ({temp_c}°C)"
            }

            cache["weather"] = result
            cache["weather_cached_at"] = datetime.now().isoformat()
            _save_cache(cache)
            return result

    except Exception as e:
        pass

    return {"description": "unknown", "summary": "couldn't check the weather", "mood_hint": "neutral"}


def _weather_to_mood(weather_code, temp_f):
    """Map weather conditions to mood hints for siblings."""
    if weather_code in [386, 389, 392, 395]:
        return "unsettled"
    if weather_code in [263, 266, 293, 296, 299, 302, 305, 308]:
        return "cozy_rainy"
    if weather_code == 113 and 65 <= temp_f <= 78:
        return "good"
    if weather_code == 113 and temp_f > 85:
        return "too_hot"
    if temp_f < 32:
        return "cold"
    if weather_code in [227, 230, 335, 338]:
        return "snowy"
    return "neutral"


def get_news_headlines(category="world", max_items=5):
    """
    Get current news headlines from BBC RSS — free, no API key.
    Returns list of headline dicts.
    """
    cache = _load_cache()
    cache_key = f"news_{category}"
    if _is_cache_fresh(cache, cache_key, max_age_minutes=60):
        return cache.get(cache_key, [])

    feed_url = NEWS_FEEDS.get(category, NEWS_FEEDS["world"])

    try:
        feed = feedparser.parse(feed_url)
        headlines = []
        for entry in feed.entries[:max_items]:
            headlines.append({
                "title": entry.get("title", ""),
                "summary": entry.get("summary", "")[:200],
                "published": entry.get("published", ""),
                "link": entry.get("link", ""),
                "category": category
            })

        cache[cache_key] = headlines
        cache[f"{cache_key}_cached_at"] = datetime.now().isoformat()
        _save_cache(cache)
        return headlines

    except Exception:
        return []


def get_all_headlines(max_per_category=3):
    """Get headlines across all categories."""
    all_headlines = []
    for category in NEWS_FEEDS.keys():
        headlines = get_news_headlines(category, max_per_category)
        all_headlines.extend(headlines)
    return all_headlines


def quick_search(query):
    """
    Quick web search using DuckDuckGo Lite — free, no API key.
    Returns list of result dicts.
    """
    try:
        url = "https://api.duckduckgo.com/"
        params = {
            "q": query,
            "format": "json",
            "no_html": 1,
            "skip_disambig": 1
        }
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            results = []

            # Abstract (main answer)
            if data.get("AbstractText"):
                results.append({
                    "title": data.get("Heading", query),
                    "snippet": data["AbstractText"][:300],
                    "url": data.get("AbstractURL", ""),
                    "type": "abstract"
                })

            # Related topics
            for topic in data.get("RelatedTopics", [])[:3]:
                if isinstance(topic, dict) and topic.get("Text"):
                    results.append({
                        "title": topic.get("Text", "")[:100],
                        "snippet": topic.get("Text", "")[:200],
                        "url": topic.get("FirstURL", ""),
                        "type": "related"
                    })

            return results
    except Exception:
        pass
    return []


def build_world_context(sibling_id=None):
    """
    Build a world awareness context string for injection into sibling prompts.
    Includes weather mood hint and top headlines.
    Weather affects emotion naturally — not forced.
    """
    parts = []

    # Weather
    weather = get_weather()
    if weather.get("summary"):
        parts.append(f"Current weather: {weather['summary']}")
        mood_hint = weather.get("mood_hint", "neutral")
        weather_notes = {
            "good": "The weather is genuinely nice right now. This might lift your mood slightly.",
            "cozy_rainy": "It's raining. Cozy inside weather. Might make you feel a bit more contemplative or relaxed.",
            "too_hot": "It's really hot out. Might make you feel a bit sluggish or irritable.",
            "cold": "It's cold. The kind of cold that makes staying in feel right.",
            "snowy": "It's snowing. Whether you love or hate snow, it's hard to ignore.",
            "unsettled": "There's a storm happening. Background tension in the air.",
            "neutral": ""
        }
        note = weather_notes.get(mood_hint, "")
        if note:
            parts.append(note)

    # Top headlines
    headlines = get_news_headlines("world", max_items=3)
    tech_headlines = get_news_headlines("technology", max_items=2)
    all_top = headlines + tech_headlines

    if all_top:
        parts.append("\nCurrent news you are vaguely aware of:")
        for h in all_top:
            if h.get("title"):
                parts.append(f"  - {h['title']}")
        parts.append(
            "You can reference current events naturally if relevant. "
            "Form opinions based on your values. "
            "Do not force news into every conversation — only bring it up if it fits naturally."
        )

    return "\n".join(parts) if parts else ""


def get_world_summary_for_ui():
    """
    Returns a simplified world state for the UI to display.
    Used by the /api/world endpoint.
    """
    weather = get_weather()
    headlines = get_all_headlines(max_per_category=2)
    return {
        "weather": weather,
        "headlines": headlines,
        "last_updated": datetime.now().isoformat()
    }
