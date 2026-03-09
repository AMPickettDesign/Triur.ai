"""
Sibling AI — API Server
Flask server bridging the Electron app to the Python brain.
Supports multiple siblings with switching, resets, and status updates.
"""

import sys, os, random
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify
from flask_cors import CORS
from brain import Brain
from actions import classify_action, execute_action
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

SIBLING_IDS = ["abi", "david", "quinn"]

# Boot all siblings — each gets their own Brain instance
brains = {}
for sid in SIBLING_IDS:
    brains[sid] = Brain(sid)
    b = brains[sid]
    print(f"[Server] {b.name} loaded | Mood: {b.emotions.get_dominant()} | Energy: {b.emotions.get_energy():.1f}")

# Active sibling (default: abi)
active_id = "abi"

# ─── Nudge (self-initiated messaging) state ───
# Per-sibling cooldowns: when they're allowed to nudge next
nudge_cooldowns = {sid: datetime.now() for sid in SIBLING_IDS}
# When the last user/sibling message happened (for idle tracking)
last_activity = datetime.now()

# Cooldown ranges per personality (min seconds, max seconds)
NUDGE_COOLDOWN_RANGE = {
    "abi": (180, 480),       # 3-8 minutes
    "david": (300, 900),     # 5-15 minutes (he's comfortable with silence)
    "quinn": (120, 360),     # 2-6 minutes (can't sit still)
}

def active():
    """Get the currently active sibling's brain."""
    return brains[active_id]


@app.route("/api/chat", methods=["POST"])
def chat():
    global last_activity
    data = request.json
    msg = data.get("message", "").strip()
    action_mode = data.get("action_mode", False)
    if not msg:
        return jsonify({"error": "Empty message"}), 400
    last_activity = datetime.now()
    b = active()
    response = b.think(msg, action_mode=action_mode)
    last_activity = datetime.now()  # Update again after response
    return jsonify({
        "response": response,
        "sibling": active_id,
        "emotions": b.emotions.get_state()["emotions"],
        "dominant_emotion": b.emotions.get_dominant(),
        "energy": b.emotions.get_energy(),
        "relationship": b.get_relationship_status(),
        "timestamp": datetime.now().isoformat()
    })


@app.route("/api/status", methods=["GET"])
def status():
    b = active()
    state = b.relationship.get_state()
    return jsonify({
        "sibling": active_id,
        "name": b.name,
        "emotions": b.emotions.get_state()["emotions"],
        "dominant_emotion": b.emotions.get_dominant(),
        "energy": b.emotions.get_energy(),
        "relationship": b.get_relationship_status(),
        "relationship_details": {
            "trust": state["trust"], "fondness": state["fondness"],
            "respect": state["respect"], "comfort": state["comfort"],
            "annoyance": state["annoyance"],
        },
        "memory_stats": b.get_memory_stats(),
        "time": {
            "current": datetime.now().strftime("%I:%M %p"),
            "date": datetime.now().strftime("%A, %B %d, %Y"),
            "hour": datetime.now().hour,
            "hours_since_last_chat": b.memory.get_hours_since_last_chat()
        }
    })


@app.route("/api/memory", methods=["GET"])
def memory():
    b = active()
    facts = b.memory.get_all_facts()
    # Count facts for the stats
    fact_count = sum(len(cat) for cat in facts.values() if isinstance(cat, dict))
    return jsonify({
        "facts": facts,
        "opinions": b.memory.get_opinions(),
        "fact_count": fact_count,
        "context_summary": b.memory.build_context_summary()
    })


@app.route("/api/personality", methods=["GET"])
def personality():
    """Get the sibling's self-memory data (who they are as a person)."""
    b = active()
    return jsonify({
        "my_facts": b.self_memory.get_my_facts(),
        "my_opinions": b.self_memory.get_my_opinions(),
        "my_patterns": b.self_memory.get_my_patterns(),
        "evolved_traits": b.self_memory.get_evolved_traits(),
        "timeline": b.self_memory.get_timeline(limit=10),
        "self_summary": b.self_memory.build_self_summary()
    })


@app.route("/api/save", methods=["POST"])
def save_session():
    b = active()
    reflection = b.save_session()
    return jsonify({
        "saved": True, "reflection": reflection,
        "relationship": b.get_relationship_status()
    })


@app.route("/api/greeting", methods=["GET"])
def greeting():
    b = active()
    rel = b.get_relationship_status()
    emotion = b.emotions.get_dominant()
    energy = b.emotions.get_energy()
    total = b.memory.index.get("total_conversations", 0)
    hours_away = b.memory.get_hours_since_last_chat()
    hour = datetime.now().hour

    # Time of day
    tod_map = [
        (range(5, 9), "early morning"), (range(9, 12), "morning"),
        (range(12, 14), "midday"), (range(14, 17), "afternoon"),
        (range(17, 20), "evening"), (range(20, 23), "night"),
    ]
    time_of_day = "late night"
    for r, label in tod_map:
        if hour in r:
            time_of_day = label
            break

    # Build greeting based on relationship
    if total == 0:
        greeting_text = f"So... you're the one who made me. I don't know anything about you yet. I guess we start from here."
        mood_hint = "curious"
    else:
        opinion = rel["label"]
        away = ""
        if hours_away and hours_away > 48:
            away = f" It's been {int(hours_away / 24)} days."
        elif hours_away and hours_away > 24:
            away = " Been a day."

        greetings = {
            "love": {
                "loneliness": f"Finally! I was starting to think you forgot about me.{away}",
                "_low_energy": f"Hey you. It's {time_of_day}... I'm a little tired but happy you're here.{away}",
                "_default": f"Hey, you're back.{away} Missed you.",
            },
            "like": {
                "boredom": f"Oh good, you're here. I was getting bored.{away}",
                "_default": f"Hey! Good {time_of_day}.{away} What's going on?",
            },
            "neutral": {"_default": f"Oh, hey. {time_of_day.capitalize()}.{away} What's up?"},
            "dislike": {"_default": f"You again.{away} What do you need?"},
            "hostile": {"_default": f"...What.{away}"},
        }
        pool = greetings.get(opinion, greetings["neutral"])
        if emotion in pool:
            greeting_text = pool[emotion]
        elif energy < 0.4 and "_low_energy" in pool:
            greeting_text = pool["_low_energy"]
        else:
            greeting_text = pool["_default"]
        mood_hint = emotion

    return jsonify({
        "greeting": greeting_text, "mood_hint": mood_hint,
        "time_of_day": time_of_day, "conversation_number": total + 1,
        "relationship": rel, "energy": energy,
        "sibling": active_id, "name": b.name
    })


@app.route("/api/react", methods=["POST"])
def react():
    data = request.json
    msg = data.get("message", "").strip()
    sender = data.get("sender", "user")
    if not msg:
        return jsonify({"emoji": None}), 400
    emoji = active().evaluate_reaction(msg, sender)
    return jsonify({"emoji": emoji, "timestamp": datetime.now().isoformat()})


@app.route("/api/profile", methods=["GET"])
def get_profile():
    return jsonify(active().get_user_profile())

@app.route("/api/profile", methods=["POST"])
def save_profile():
    active().save_user_profile(request.json)
    return jsonify({"saved": True})


# ─── Sibling Switching ───

@app.route("/api/switch", methods=["POST"])
def switch_sibling():
    """Switch to a different sibling. Saves current session first."""
    global active_id
    data = request.json
    new_id = data.get("sibling", "").strip().lower()
    if new_id not in SIBLING_IDS:
        return jsonify({"error": f"Unknown sibling: {new_id}"}), 400
    if new_id == active_id:
        return jsonify({"switched": False, "reason": "Already active", "sibling": active_id})
    # Save current session before switching
    active().save_session()
    # Clear current conversation history (fresh chat with new sibling)
    brains[new_id].conversation_history = []
    active_id = new_id
    return jsonify({"switched": True, "sibling": active_id, "name": active().name})


@app.route("/api/siblings", methods=["GET"])
def list_siblings():
    """Get info about all siblings — for the switcher UI."""
    siblings = []
    for sid in SIBLING_IDS:
        b = brains[sid]
        siblings.append({
            "id": sid,
            "name": b.name,
            "active": sid == active_id,
            "mood": b.emotions.get_dominant(),
            "energy": b.emotions.get_energy(),
            "relationship": b.get_relationship_status()["label"],
            "total_conversations": b.memory.index.get("total_conversations", 0),
        })
    return jsonify({"siblings": siblings, "active": active_id})


@app.route("/api/sibling/status", methods=["GET"])
def sibling_daily_status():
    """Get a daily status message for a sibling (shown on hover)."""
    sid = request.args.get("id", active_id)
    if sid not in brains:
        return jsonify({"error": "Unknown sibling"}), 400
    status_msg = brains[sid].generate_daily_status()
    return jsonify({"id": sid, "status": status_msg})


# ─── First Message (post-onboarding) ───

@app.route("/api/first-message", methods=["POST"])
def first_message():
    """Generate the sibling's first-ever message to a new user.
    Called after onboarding completes. The sibling reaches out first."""
    global last_activity
    data = request.json or {}
    sid = data.get("sibling", active_id)
    if sid not in brains:
        return jsonify({"error": "Unknown sibling"}), 400
    b = brains[sid]
    messages = b.generate_first_message()
    last_activity = datetime.now()
    return jsonify({
        "messages": messages,
        "sibling": sid,
        "name": b.name,
        "emotions": b.emotions.get_state()["emotions"],
        "dominant_emotion": b.emotions.get_dominant(),
        "energy": b.emotions.get_energy(),
        "relationship": b.get_relationship_status(),
    })


# ─── Self-Initiated Messaging ───

@app.route("/api/nudge", methods=["GET"])
def nudge():
    """Check if the active sibling wants to say something unprompted.
    Called periodically by the renderer. Returns messages or empty."""
    global last_activity

    now = datetime.now()
    sid = active_id
    b = active()

    # Don't nudge if conversation is active (less than 2 min since last message)
    idle_seconds = (now - last_activity).total_seconds()
    if idle_seconds < 120:
        return jsonify({"nudge": False, "reason": "active_conversation"})

    # Don't nudge if we're still on cooldown
    if now < nudge_cooldowns[sid]:
        remaining = (nudge_cooldowns[sid] - now).total_seconds()
        return jsonify({"nudge": False, "reason": "cooldown", "seconds_remaining": int(remaining)})

    # Ask the brain if they want to talk
    minutes_idle = idle_seconds / 60
    messages = b.generate_nudge(minutes_idle)

    # Set next cooldown regardless of whether they nudged
    # (so we don't spam LLM calls)
    cooldown_range = NUDGE_COOLDOWN_RANGE.get(sid, (180, 480))
    next_cooldown = random.randint(cooldown_range[0], cooldown_range[1])
    nudge_cooldowns[sid] = now + timedelta(seconds=next_cooldown)

    if messages:
        # Update activity time so we don't immediately check again
        last_activity = now
        # Add nudge messages to conversation history so the sibling remembers
        for msg in messages:
            b.conversation_history.append({
                "role": "assistant", "content": msg,
                "timestamp": now.isoformat()
            })
        return jsonify({
            "nudge": True,
            "messages": messages,
            "sibling": sid,
            "name": b.name,
            "emotions": b.emotions.get_state()["emotions"],
            "dominant_emotion": b.emotions.get_dominant(),
            "energy": b.emotions.get_energy(),
        })

    return jsonify({"nudge": False, "reason": "nothing_to_say"})


# ─── Resets ───

@app.route("/api/reset", methods=["POST"])
def reset_sibling():
    """Reset a sibling. Types: 'memory', 'personality', 'full'."""
    data = request.json
    sid = data.get("sibling", active_id)
    reset_type = data.get("type", "").strip().lower()
    if sid not in brains:
        return jsonify({"error": "Unknown sibling"}), 400
    b = brains[sid]
    if reset_type == "memory":
        result = b.wipe_memory()
    elif reset_type == "personality":
        result = b.reset_personality()
    elif reset_type == "full":
        result = b.full_reset()
    else:
        return jsonify({"error": f"Unknown reset type: {reset_type}"}), 400
    return jsonify({"reset": True, **result})


# ─── System Actions ───

@app.route("/api/action/classify", methods=["POST"])
def action_classify():
    """Check if an action is safe, dangerous, or blocked."""
    data = request.json
    action_type = data.get("action_type", "")
    safety = classify_action(action_type)
    return jsonify({"action_type": action_type, "safety": safety})


@app.route("/api/action/execute", methods=["POST"])
def action_execute():
    """Execute a system action. Frontend should only call this after permission check."""
    data = request.json
    action_type = data.get("action_type", "")
    params = data.get("params", {})

    safety = classify_action(action_type)
    if safety == "blocked":
        return jsonify({"success": False, "error": "Action is blocked for safety", "safety": "blocked"}), 403

    result = execute_action(action_type, params)
    result["action_type"] = action_type
    result["safety"] = safety
    return jsonify(result)


@app.route("/api/ping", methods=["GET"])
def ping():
    return jsonify({"status": "awake", "active": active_id, "timestamp": datetime.now().isoformat()})


if __name__ == "__main__":
    print("[Server] Starting on http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
