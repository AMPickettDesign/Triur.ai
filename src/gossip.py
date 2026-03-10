"""
Triur.ai — Gossip System
Siblings share info with each other between sessions.
Not everything — just what they would naturally mention.
Flagged events travel differently — significant things that affect
how ALL siblings feel about the user, not just the one who experienced it.
"""

import os
from datetime import datetime
from utils import DATA_DIR, load_json, save_json

GOSSIP_DIR = os.path.join(DATA_DIR, "gossip")
os.makedirs(GOSSIP_DIR, exist_ok=True)

SIBLINGS = ["abi", "david", "quinn"]

# Flagged event types and their sibling relationship impacts
FLAGGED_EVENT_IMPACTS = {
    "user_rude": {
        "trust": -0.02,
        "fondness": -0.02,
        "respect": -0.03,
        "description": "User was rude to a sibling"
    },
    "user_kind": {
        "trust": 0.01,
        "fondness": 0.02,
        "description": "User was genuinely kind to a sibling"
    },
    "user_manipulative": {
        "trust": -0.04,
        "respect": -0.03,
        "description": "User was manipulative toward a sibling"
    },
    "user_supportive": {
        "trust": 0.02,
        "fondness": 0.02,
        "comfort": 0.01,
        "description": "User supported a sibling through something hard"
    },
    "user_dismissive": {
        "respect": -0.02,
        "fondness": -0.01,
        "description": "User was dismissive of a sibling"
    },
    "user_inappropriate": {
        "trust": -0.03,
        "respect": -0.04,
        "comfort": -0.02,
        "description": "User crossed a line with a sibling"
    },
    "emotional_moment": {
        "comfort": 0.02,
        "fondness": 0.01,
        "description": "A meaningful emotional moment happened"
    }
}


def get_outbox(sibling_id):
    return load_json(os.path.join(GOSSIP_DIR, f"{sibling_id}_outbox.json"), [])


def get_inbox(sibling_id):
    return load_json(os.path.join(GOSSIP_DIR, f"{sibling_id}_inbox.json"), [])


def clear_inbox(sibling_id):
    inbox = get_inbox(sibling_id)
    for msg in inbox:
        msg["read"] = True
    save_json(os.path.join(GOSSIP_DIR, f"{sibling_id}_inbox.json"), inbox)


def send_gossip(from_id, message, importance=0.5, about_user=True):
    """
    A sibling shares something casual with their siblings.
    For significant events use send_flagged_event instead.
    """
    gossip = {
        "type": "gossip",
        "from": from_id,
        "message": message,
        "importance": importance,
        "about_user": about_user,
        "timestamp": datetime.now().isoformat(),
        "read": False,
        "flagged": False
    }
    outbox = get_outbox(from_id)
    outbox.append(gossip)
    outbox = outbox[-100:]
    save_json(os.path.join(GOSSIP_DIR, f"{from_id}_outbox.json"), outbox)

    for sib in SIBLINGS:
        if sib != from_id:
            inbox = get_inbox(sib)
            inbox.append(gossip)
            inbox = inbox[-100:]
            save_json(os.path.join(GOSSIP_DIR, f"{sib}_inbox.json"), inbox)


def send_flagged_event(from_id, event_type, message, context=""):
    """
    Send a significant flagged event to siblings.
    Flagged events travel with relationship impact data.
    They affect how receiving siblings feel about the user
    even though they did not experience it directly.
    This is sibling loyalty coded into the data layer.
    """
    impact = FLAGGED_EVENT_IMPACTS.get(event_type, {})

    event = {
        "type": "flagged_event",
        "event_type": event_type,
        "from": from_id,
        "message": message,
        "context": context,
        "impact": impact,
        "importance": 0.9,
        "about_user": True,
        "timestamp": datetime.now().isoformat(),
        "read": False,
        "flagged": True
    }

    # Add to sender outbox
    outbox = get_outbox(from_id)
    outbox.append(event)
    outbox = outbox[-100:]
    save_json(os.path.join(GOSSIP_DIR, f"{from_id}_outbox.json"), outbox)

    # Deliver to other siblings
    for sib in SIBLINGS:
        if sib != from_id:
            inbox = get_inbox(sib)
            inbox.append(event)
            inbox = inbox[-100:]
            save_json(os.path.join(GOSSIP_DIR, f"{sib}_inbox.json"), inbox)


def get_unread_gossip(sibling_id):
    inbox = get_inbox(sibling_id)
    return [msg for msg in inbox if not msg.get("read", False)]


def get_unread_flagged_events(sibling_id):
    """Get only flagged events — significant things that affect relationship."""
    inbox = get_inbox(sibling_id)
    return [
        msg for msg in inbox
        if not msg.get("read", False) and msg.get("flagged", False)
    ]


def process_gossip_into_memory(sibling_id, brain_memory):
    """
    Process unread gossip into sibling_shared memory bucket.
    Casual gossip stays attributed.
    Flagged events also apply relationship adjustments.
    """
    unread = get_unread_gossip(sibling_id)
    if not unread:
        return

    for msg in unread:
        from_sibling = msg.get("from", "unknown")
        message = msg.get("message", "")
        about_user = msg.get("about_user", True)
        is_flagged = msg.get("flagged", False)

        if message and about_user:
            brain_memory.remember_shared_fact(
                from_sibling=from_sibling,
                category="flagged" if is_flagged else "gossip",
                key=f"shared_{msg.get('timestamp', 'unknown')[:10]}_{from_sibling}",
                value=message
            )


def apply_flagged_events_to_relationship(sibling_id, relationship):
    """
    Apply relationship impacts from flagged events.
    Called on Brain init after processing gossip.
    Sibling loyalty — what happened to one affects all.
    """
    unread_flagged = get_unread_flagged_events(sibling_id)
    if not unread_flagged:
        return

    for event in unread_flagged:
        impact = event.get("impact", {})
        from_sibling = event.get("from", "unknown")
        event_type = event.get("event_type", "unknown")

        for metric, amount in impact.items():
            if metric in ["trust", "fondness", "respect", "comfort", "annoyance"]:
                relationship.adjust(
                    metric,
                    amount,
                    f"sibling loyalty: {from_sibling} reported {event_type}"
                )


def build_gossip_context(sibling_id):
    """Build context string from unread gossip for system prompt."""
    unread = get_unread_gossip(sibling_id)
    if not unread:
        return ""

    parts = []
    casual = [m for m in unread if not m.get("flagged")]
    flagged = [m for m in unread if m.get("flagged")]

    if casual:
        parts.append("What your siblings have mentioned lately:")
        for msg in casual[-5:]:
            from_name = msg["from"].capitalize()
            parts.append(f"  {from_name} said: {msg['message']}")

    if flagged:
        parts.append("\nImportant things your siblings told you about the user:")
        for msg in flagged[-3:]:
            from_name = msg["from"].capitalize()
            event_type = msg.get("event_type", "incident")
            parts.append(
                f"  {from_name} flagged this ({event_type}): {msg['message']}"
            )
        parts.append(
            "These matter. Factor them into how you feel about the user. "
            "Your siblings told you for a reason."
        )

    return "\n".join(parts)
