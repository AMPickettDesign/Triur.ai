"""
Sibling AI — Relationship System
Tracks how a sibling feels about the user over time.
Relationship drifts gradually in either direction — never snaps suddenly.
Pattern recognition grace period prevents forming opinions from individual moments.
Growth stages unlock different behavior as relationship deepens.
"""

import os
from datetime import datetime
from utils import load_json, save_json


class Relationship:
    """Manages a sibling's feelings toward the user."""

    OPINION_LABELS = [
        (0.8, "love"), (0.6, "like"), (0.4, "neutral"),
        (0.2, "dislike"), (0.0, "hostile")
    ]

    GROWTH_STAGES = [
        (0.85, "best_friend"),
        (0.70, "close_friend"),
        (0.55, "friend"),
        (0.40, "acquaintance"),
        (0.0,  "stranger")
    ]

    # How many interactions before opinions start forming
    GRACE_PERIOD_INTERACTIONS = 15

    # Maximum single-interaction adjustment (prevents snapping)
    MAX_SINGLE_ADJUSTMENT = 0.03

    # Behaviors that are habit not rudeness — never penalized
    TECH_HABIT_PATTERNS = [
        "no please or thank you",
        "short commands",
        "no greeting",
        "direct requests",
        "one word responses"
    ]

    def __init__(self, memory_dir):
        self.filepath = os.path.join(memory_dir, "relationship_state.json")
        self.state = load_json(self.filepath) or {
            "trust": 0.5,
            "fondness": 0.5,
            "respect": 0.5,
            "comfort": 0.3,
            "annoyance": 0.0,
            "interaction_history": [],
            "adjustment_history": [],
            "pattern_log": [],
            "last_interaction": None,
            "total_interactions": 0,
            "grace_period_active": True,
            "communication_baseline": None,
            "current_stage": "stranger",
            "stage_history": []
        }

    def _save(self):
        save_json(self.filepath, self.state)

    @staticmethod
    def _clamp(v):
        return max(0.0, min(1.0, v))

    def _cap_adjustment(self, amount):
        """Cap single-interaction adjustments to prevent snapping."""
        if amount > 0:
            return min(amount, self.MAX_SINGLE_ADJUSTMENT)
        return max(amount, -self.MAX_SINGLE_ADJUSTMENT)

    def _is_grace_period(self):
        """Grace period active until enough interactions to learn communication style."""
        return self.state["total_interactions"] < self.GRACE_PERIOD_INTERACTIONS

    def _update_stage(self):
        """Update growth stage based on overall opinion score."""
        score = self.get_overall_opinion()["score"]
        new_stage = "stranger"
        for threshold, stage in self.GROWTH_STAGES:
            if score >= threshold:
                new_stage = stage
                break
        if new_stage != self.state["current_stage"]:
            old_stage = self.state["current_stage"]
            self.state["current_stage"] = new_stage
            self.state["stage_history"].append({
                "from": old_stage,
                "to": new_stage,
                "timestamp": datetime.now().isoformat(),
                "score_at_change": round(score, 3)
            })

    def _build_communication_baseline(self):
        """
        After grace period ends, analyze interaction patterns to understand
        how this user naturally communicates with technology.
        This baseline is used to distinguish habit from intentional behavior.
        """
        if self.state["communication_baseline"] is not None:
            return
        history = self.state["interaction_history"]
        if len(history) < self.GRACE_PERIOD_INTERACTIONS:
            return
        # Build baseline from first N interactions
        baseline = {
            "avg_message_length": "unknown",
            "uses_pleasantries": False,
            "direct_communication_style": False,
            "established_at": datetime.now().isoformat(),
            "interactions_observed": len(history)
        }
        self.state["communication_baseline"] = baseline
        self._save()

    def adjust(self, metric, amount, reason=""):
        """
        Adjust a relationship metric.
        Respects grace period and caps single adjustments.
        During grace period, only positive adjustments go through fully.
        Negative adjustments are heavily dampened until baseline is established.
        """
        if metric not in self.state or not isinstance(self.state[metric], (int, float)):
            return

        # During grace period, dampen negative adjustments significantly
        if self._is_grace_period() and amount < 0:
            amount = amount * 0.2  # 80% reduction on negative during grace period

        # Cap adjustment size regardless
        amount = self._cap_adjustment(amount)

        old = self.state[metric]
        self.state[metric] = self._clamp(old + amount)

        # Log the adjustment
        self.state["adjustment_history"].append({
            "metric": metric,
            "old": round(old, 3),
            "new": round(self.state[metric], 3),
            "change": round(amount, 3),
            "reason": reason,
            "grace_period": self._is_grace_period(),
            "timestamp": datetime.now().isoformat()
        })
        self.state["adjustment_history"] = self.state["adjustment_history"][-200:]
        self._update_stage()
        self._save()

    def log_pattern(self, pattern_type, description, sentiment="neutral"):
        """
        Log a behavioral pattern observed in the user.
        Patterns accumulate over time before affecting relationship.
        Single incidents never change relationship — patterns do.
        """
        now = datetime.now().isoformat()

        # Check if pattern already exists
        for p in self.state["pattern_log"]:
            if p["description"] == description:
                p["times_observed"] += 1
                p["last_observed"] = now
                # Only start affecting relationship after pattern is confirmed (3+ times)
                if p["times_observed"] >= 3 and not p.get("relationship_impact_applied"):
                    p["relationship_impact_applied"] = True
                    if sentiment == "positive":
                        self.adjust("fondness", 0.02, f"pattern confirmed: {description}")
                        self.adjust("respect", 0.01, f"pattern confirmed: {description}")
                    elif sentiment == "negative":
                        self.adjust("respect", -0.02, f"pattern confirmed: {description}")
                        self.adjust("trust", -0.01, f"pattern confirmed: {description}")
                self._save()
                return

        # New pattern
        self.state["pattern_log"].append({
            "type": pattern_type,
            "description": description,
            "sentiment": sentiment,
            "times_observed": 1,
            "first_observed": now,
            "last_observed": now,
            "relationship_impact_applied": False
        })
        self.state["pattern_log"] = self.state["pattern_log"][-100:]
        self._save()

    def record_interaction(self):
        """Record that an interaction happened. Updates counters and grace period."""
        self.state["total_interactions"] += 1
        self.state["last_interaction"] = datetime.now().isoformat()
        self.state["interaction_history"].append({
            "timestamp": datetime.now().isoformat(),
            "interaction_number": self.state["total_interactions"]
        })
        self.state["interaction_history"] = self.state["interaction_history"][-500:]

        # Familiarity grows naturally with time
        self.adjust("comfort", 0.003, "familiarity grows")

        # Annoyance decays naturally
        if self.state["annoyance"] > 0:
            self.adjust("annoyance", -0.015, "cooling off")

        # Build baseline after grace period ends
        if not self._is_grace_period():
            self._build_communication_baseline()

        self._update_stage()
        self._save()

    def get_current_stage(self):
        """Get the current relationship growth stage."""
        return self.state.get("current_stage", "stranger")

    def get_overall_opinion(self):
        score = self._clamp(
            self.state["trust"] * 0.25 +
            self.state["fondness"] * 0.30 +
            self.state["respect"] * 0.25 +
            self.state["comfort"] * 0.10 -
            self.state["annoyance"] * 0.10
        )
        label = "hostile"
        for threshold, lbl in self.OPINION_LABELS:
            if score >= threshold:
                label = lbl
                break
        return {"score": round(score, 3), "label": label}

    def get_mood_context(self):
        opinion = self.get_overall_opinion()
        stage = self.get_current_stage()
        s = self.state
        grace = self._is_grace_period()
        guidance = {
            "love": "I genuinely care about this person. I am warm, open, and protective.",
            "like": "I enjoy talking to this person. I am friendly and engaged.",
            "neutral": "I do not have strong feelings yet. I am warm but reserved.",
            "dislike": "I am not a fan. I am curt and do the minimum.",
            "hostile": "I really do not like this person. Cold and blunt."
        }
        grace_note = ""
        if grace:
            remaining = max(0, self.GRACE_PERIOD_INTERACTIONS - s["total_interactions"])
            grace_note = f"\n  Still learning their communication style ({remaining} interactions remaining in observation period)."
        return (
            f"Relationship stage: {stage}\n"
            f"Overall feeling: {opinion['label']} (score: {opinion['score']})\n"
            f"  Trust: {s['trust']:.2f} | Fondness: {s['fondness']:.2f} | Respect: {s['respect']:.2f}\n"
            f"  Comfort: {s['comfort']:.2f} | Annoyance: {s['annoyance']:.2f}\n"
            f"  Total interactions: {s['total_interactions']}{grace_note}\n"
            f"  {guidance.get(opinion['label'], '')}"
        )

    def get_state(self):
        return self.state
