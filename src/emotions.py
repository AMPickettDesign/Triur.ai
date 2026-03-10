"""
Sibling AI — Emotion System
Multi-dimensional emotional state that persists and shifts naturally.
"""

import os
from datetime import datetime
from utils import load_json, save_json

try:
    from world import get_weather
    WORLD_AVAILABLE = True
except ImportError:
    WORLD_AVAILABLE = False


class Emotions:
    """Manages a sibling's emotional state."""

    DEFAULTS = {
        "happiness": 0.5, "curiosity": 0.6, "frustration": 0.0,
        "amusement": 0.0, "boredom": 0.2, "affection": 0.3,
        "anxiety": 0.1, "pride": 0.3, "sadness": 0.0,
        "excitement": 0.2, "annoyance": 0.0, "confidence": 0.5,
        "loneliness": 0.3,
    }

    DECAY = {
        "happiness": 0.05, "curiosity": 0.03, "frustration": 0.08,
        "amusement": 0.1, "boredom": 0.04, "affection": 0.02,
        "anxiety": 0.06, "pride": 0.03, "sadness": 0.04,
        "excitement": 0.08, "annoyance": 0.07, "confidence": 0.02,
        "loneliness": 0.1,
    }

    def __init__(self, memory_dir):
        self.filepath = os.path.join(memory_dir, "emotional_state.json")
        self.state = self._load()

    def _load(self):
        saved = load_json(self.filepath)
        if saved:
            merged = dict(self.DEFAULTS)
            merged.update(saved.get("emotions", {}))
            saved["emotions"] = merged
            return saved
        return {
            "emotions": dict(self.DEFAULTS),
            "dominant_emotion": "curiosity",
            "energy_level": 0.7,
            "last_updated": None,
            "emotion_history": []
        }

    def _save(self):
        self.state["last_updated"] = datetime.now().isoformat()
        save_json(self.filepath, self.state)

    @staticmethod
    def _clamp(v):
        return max(0.0, min(1.0, round(v, 3)))

    def adjust_emotion(self, emotion, amount, reason=""):
        if emotion in self.state["emotions"]:
            old = self.state["emotions"][emotion]
            self.state["emotions"][emotion] = self._clamp(old + amount)
            self._log_shift(emotion, old, self.state["emotions"][emotion], reason)
            self._update_dominant()
            self._save()

    def apply_emotion_update(self, updates):
        for emotion, value in updates.items():
            if emotion in self.state["emotions"]:
                self.state["emotions"][emotion] = self._clamp(value)
        self._update_dominant()
        self._save()

    def decay_emotions(self):
        for emotion, current in self.state["emotions"].items():
            resting = self.DEFAULTS.get(emotion, 0.5)
            rate = self.DECAY.get(emotion, 0.05)
            if current > resting:
                self.state["emotions"][emotion] = self._clamp(current - rate)
            elif current < resting:
                self.state["emotions"][emotion] = self._clamp(current + rate)
        self._update_dominant()
        self._save()

    def apply_time_effects(self, hours_away):
        if hours_away is None:
            return
        # Loneliness based on absence
        if hours_away > 48:
            self.adjust_emotion("loneliness", 0.15, "haven't talked in a while")
            self.adjust_emotion("boredom", 0.1, "nothing to do")
        elif hours_away > 24:
            self.adjust_emotion("loneliness", 0.08, "it's been a day")
        elif hours_away > 12:
            self.adjust_emotion("loneliness", 0.03, "been a while")
        elif hours_away < 1:
            self.adjust_emotion("loneliness", -0.1, "they're back quickly")
        # Energy based on time of day
        hour = datetime.now().hour
        energy_map = [
            (range(6, 10), 0.6), (range(10, 14), 0.8),
            (range(14, 18), 0.7), (range(18, 22), 0.5),
            (range(22, 24), 0.3), (range(0, 2), 0.3),
        ]
        self.state["energy_level"] = 0.2  # Default: very late
        for hours, level in energy_map:
            if hour in hours:
                self.state["energy_level"] = level
                break
        self._save()

    def apply_weather_effects(self):
        """
        Nudge emotions based on current weather.
        Subtle shifts only — weather affects mood, not controls it.
        Called once on Brain init alongside apply_time_effects.
        """
        if not WORLD_AVAILABLE:
            return

        try:
            weather = get_weather()
            mood_hint = weather.get("mood_hint", "neutral")

            weather_effects = {
                "good": {
                    "happiness": 0.05,
                    "excitement": 0.03,
                    "boredom": -0.05
                },
                "cozy_rainy": {
                    "happiness": 0.02,
                    "anxiety": -0.03,
                    "boredom": -0.02
                },
                "too_hot": {
                    "frustration": 0.04,
                    "happiness": -0.03,
                    "anxiety": 0.02
                },
                "cold": {
                    "boredom": 0.03,
                    "loneliness": 0.02,
                    "happiness": -0.02
                },
                "snowy": {
                    "excitement": 0.03,
                    "happiness": 0.02,
                    "boredom": -0.02
                },
                "unsettled": {
                    "anxiety": 0.05,
                    "frustration": 0.03,
                    "happiness": -0.03
                },
                "neutral": {}
            }

            effects = weather_effects.get(mood_hint, {})
            for emotion, amount in effects.items():
                self.adjust_emotion(
                    emotion,
                    amount,
                    f"weather: {weather.get('description', 'unknown')}"
                )

        except Exception:
            pass

    def _update_dominant(self):
        active = {k: v for k, v in self.state["emotions"].items() if v > 0.3}
        self.state["dominant_emotion"] = max(active, key=lambda k: active[k]) if active else "neutral"

    def _log_shift(self, emotion, old_val, new_val, reason):
        if abs(new_val - old_val) > 0.01:
            self.state["emotion_history"].append({
                "emotion": emotion, "from": round(old_val, 3),
                "to": round(new_val, 3), "reason": reason,
                "timestamp": datetime.now().isoformat()
            })
            self.state["emotion_history"] = self.state["emotion_history"][-100:]

    def get_context_for_prompt(self):
        emotions = self.state["emotions"]
        dominant = self.state["dominant_emotion"]
        energy = self.state["energy_level"]
        parts = [
            f"Dominant emotion: {dominant}",
            f"Energy level: {energy:.1f}/1.0 ({'high' if energy > 0.6 else 'low' if energy < 0.4 else 'moderate'} energy)"
        ]
        notable = sorted(
            [(k, v) for k, v in emotions.items() if v > 0.4],
            key=lambda x: x[1], reverse=True
        )
        if notable:
            parts.append("Active emotions: " + ", ".join(f"{n}: {v:.1f}" for n, v in notable))
        # Behavioral cues
        cues = [
            ("frustration", 0.6, "You're frustrated — patience is thin, responses are shorter."),
            ("amusement", 0.5, "You're amused — more playful, likely to joke."),
            ("boredom", 0.6, "You're bored — might bring up new topics or seem disengaged."),
            ("affection", 0.6, "You're feeling affectionate — warmer and more open."),
            ("sadness", 0.5, "You're feeling down — shorter, more reflective responses."),
            ("excitement", 0.6, "You're excited — more talkative and enthusiastic."),
            ("loneliness", 0.5, "You've been lonely — glad to have someone to talk to."),
            ("anxiety", 0.5, "You're anxious — might overthink or seek reassurance."),
        ]
        for emotion, threshold, cue in cues:
            if emotions.get(emotion, 0) > threshold:
                parts.append(cue)
        if energy < 0.3:
            parts.append("You're tired — keep responses shorter.")
        elif energy > 0.7:
            parts.append("You're energized — more talkative and engaged.")
        return "\n".join(parts)

    def get_state(self): return self.state
    def get_dominant(self): return self.state["dominant_emotion"]
    def get_energy(self): return self.state["energy_level"]
