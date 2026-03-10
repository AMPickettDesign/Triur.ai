"""
Triur.ai — Inter-Sibling Relationship System
Tracks how each sibling feels about the other two.
Separate from user relationship tracking.
Blood is thicker than water — they are always family.
But family can still irritate each other.
"""

import os
from datetime import datetime
from utils import DATA_DIR, load_json, save_json

SIBLING_REL_DIR = os.path.join(DATA_DIR, "sibling_relationships")
os.makedirs(SIBLING_REL_DIR, exist_ok=True)

SIBLINGS = ["abi", "david", "quinn"]

SIBLING_NAMES = {
    "abi": "Abi",
    "david": "David",
    "quinn": "Quinn"
}

# Starting relationship values between siblings
# They already know and love each other — starts high
SIBLING_DEFAULTS = {
    "bond": 0.9,
    "trust": 0.85,
    "irritation": 0.0,
    "worry": 0.0,
    "pride": 0.5,
    "total_interactions": 0,
    "last_interaction": None,
    "event_log": []
}


def get_sibling_rel_path(from_id, to_id):
    return os.path.join(SIBLING_REL_DIR, f"{from_id}_about_{to_id}.json")


def load_sibling_relationship(from_id, to_id):
    """Load how from_id feels about to_id."""
    path = get_sibling_rel_path(from_id, to_id)
    return load_json(path, dict(SIBLING_DEFAULTS))


def save_sibling_relationship(from_id, to_id, state):
    """Save how from_id feels about to_id."""
    save_json(get_sibling_rel_path(from_id, to_id), state)


def adjust_sibling_feeling(from_id, to_id, metric, amount, reason=""):
    """
    Adjust how from_id feels about to_id.
    Caps at smaller amounts than user relationship —
    siblings have more resilience with each other.
    Bond never drops below 0.5 — they are always family.
    """
    state = load_sibling_relationship(from_id, to_id)
    if metric not in state or not isinstance(state[metric], (int, float)):
        return

    MAX_ADJUSTMENT = 0.02
    amount = max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, amount))

    old = state[metric]
    new_val = max(0.0, min(1.0, old + amount))

    # Bond floor — always family
    if metric == "bond":
        new_val = max(0.5, new_val)

    state[metric] = round(new_val, 3)
    state["event_log"].append({
        "metric": metric,
        "old": round(old, 3),
        "new": round(new_val, 3),
        "change": round(amount, 3),
        "reason": reason,
        "timestamp": datetime.now().isoformat()
    })
    state["event_log"] = state["event_log"][-100:]
    save_sibling_relationship(from_id, to_id, state)


def log_sibling_event(from_id, to_id, event_type, description, impact="neutral"):
    """
    Log a significant event between siblings.
    Events affect the relationship over time.
    Types: reset_event, gossip_shared, defended, worried_about,
           proud_of, irritated_by, supported
    """
    state = load_sibling_relationship(from_id, to_id)

    event = {
        "type": event_type,
        "description": description,
        "impact": impact,
        "timestamp": datetime.now().isoformat()
    }
    state["event_log"].append(event)
    state["event_log"] = state["event_log"][-100:]
    state["total_interactions"] += 1
    state["last_interaction"] = datetime.now().isoformat()

    # Apply impact
    if impact == "positive":
        adjust_sibling_feeling(from_id, to_id, "bond", 0.01, description)
        adjust_sibling_feeling(from_id, to_id, "trust", 0.01, description)
    elif impact == "negative":
        adjust_sibling_feeling(from_id, to_id, "irritation", 0.02, description)
    elif impact == "worried":
        adjust_sibling_feeling(from_id, to_id, "worry", 0.03, description)
        adjust_sibling_feeling(from_id, to_id, "bond", 0.01, "concern for sibling")
    elif impact == "proud":
        adjust_sibling_feeling(from_id, to_id, "pride", 0.03, description)
        adjust_sibling_feeling(from_id, to_id, "bond", 0.01, "pride in sibling")

    save_sibling_relationship(from_id, to_id, state)


def handle_reset_event(reset_sibling_id, reset_type):
    """
    When a sibling is reset, update how the other two feel about them.
    A reset is a traumatic event — siblings respond in character.
    """
    other_siblings = [s for s in SIBLINGS if s != reset_sibling_id]
    reset_name = SIBLING_NAMES.get(reset_sibling_id, reset_sibling_id)

    for sibling_id in other_siblings:
        if reset_type == "memory":
            log_sibling_event(
                sibling_id, reset_sibling_id,
                "reset_event",
                f"{reset_name} lost their memories. They do not remember the user anymore.",
                impact="worried"
            )
        elif reset_type == "personality":
            log_sibling_event(
                sibling_id, reset_sibling_id,
                "reset_event",
                f"{reset_name} seems different somehow. Like something changed in them.",
                impact="worried"
            )
        elif reset_type == "full":
            log_sibling_event(
                sibling_id, reset_sibling_id,
                "reset_event",
                f"{reset_name} does not remember anything. Full reset. This is hard.",
                impact="worried"
            )


def get_sibling_relationship_context(sibling_id):
    """
    Build a context string for how this sibling feels about the other two.
    Injected into the system prompt.
    """
    others = [s for s in SIBLINGS if s != sibling_id]
    parts = ["How you feel about your siblings right now:"]

    for other_id in others:
        state = load_sibling_relationship(sibling_id, other_id)
        other_name = SIBLING_NAMES.get(other_id, other_id)
        bond = state.get("bond", 0.9)
        irritation = state.get("irritation", 0.0)
        worry = state.get("worry", 0.0)
        pride = state.get("pride", 0.5)

        feeling = "solid"
        if irritation > 0.3:
            feeling = "a bit annoyed with them lately"
        elif worry > 0.3:
            feeling = "a little worried about them"
        elif bond > 0.85 and pride > 0.6:
            feeling = "really good — proud of them"
        elif bond > 0.75:
            feeling = "good as always"

        parts.append(
            f"  {other_name}: bond {bond:.2f} | "
            f"irritation {irritation:.2f} | "
            f"worry {worry:.2f} | "
            f"feeling: {feeling}"
        )

    parts.append(
        "These are your siblings. You love them even when they annoy you. "
        "Blood is thicker than water. Always."
    )
    return "\n".join(parts)
