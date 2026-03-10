"""
Sibling AI — Memory System
Handles long-term memory for both USER data and SELF (AI personality) data.
Each sibling has two separate memory stores that never cross:

  data/abi/memory/        — Things ABOUT THE USER
    user_facts.json      — Facts the user told us about themselves
    user_opinions.json   — User's preferences, opinions
    user_patterns.json   — User's habits, patterns
    
  data/abi/personality/   — Things ABOUT THE AI (ME)
    my_facts.json        — Facts about who I am
    my_opinions.json     — My opinions, tastes, preferences
    my_patterns.json     — My signature behaviors
    evolved_traits.json  — Trait numbers that shift over time
    timeline.json        — Key moments in my personality growth
"""

import os
import shutil
from datetime import datetime
from utils import load_json, save_json, get_sibling_naming


class UserMemory:
    """Memory system for things about THE USER.
    Facts, opinions, and patterns that the user has shared.
    """

    def __init__(self, dirs, sibling_id="abi"):
        self.memory_dir = dirs["memory"]
        self.convo_dir = dirs["conversations"]
        self.journal_dir = dirs["journal"]

        naming = get_sibling_naming(sibling_id)
        self.convo_prefix = naming["prefix"]
        self.reflection_name = naming["reflection"]

        self.facts = load_json(os.path.join(self.memory_dir, "user_facts.json"), {})
        self.opinions = load_json(os.path.join(self.memory_dir, "user_opinions.json"), {})
        self.patterns = load_json(os.path.join(self.memory_dir, "user_patterns.json"), [])
        self.index = load_json(os.path.join(self.memory_dir, "index.json"), {
            "next_conversation": 1,
            "next_journal_entry": 1,
            "total_messages": 0,
            "total_conversations": 0,
            "total_journal_entries": 0,
            "first_interaction": None,
            "last_interaction": None
        })

        if self.index["first_interaction"] is None:
            self.index["first_interaction"] = datetime.now().isoformat()
            self._save_index()

    def _save(self, filename, data):
        save_json(os.path.join(self.memory_dir, filename), data)

    def _save_index(self):
        self._save("index.json", self.index)

    def remember_fact(self, category, key, value):
        if category not in self.facts:
            self.facts[category] = {}
        existing = self.facts[category].get(key)
        now = datetime.now().isoformat()
        if existing and existing["value"] == value:
            existing["last_confirmed"] = now
            existing["times_referenced"] += 1
        else:
            self.facts[category][key] = {
                "value": value, "learned_at": now,
                "last_confirmed": now, "times_referenced": 0
            }
        self._save("user_facts.json", self.facts)

    def remember_facts_batch(self, facts_list):
        for f in facts_list:
            self.remember_fact(f["category"], f["key"], f["value"])

    def get_all_facts(self):
        return self.facts

    def store_opinion(self, topic, opinion, strength=0.5):
        self.opinions[topic] = {
            "opinion": opinion, "strength": strength,
            "formed_at": datetime.now().isoformat(), "times_expressed": 0
        }
        self._save("user_opinions.json", self.opinions)

    def store_opinions_batch(self, opinions_list):
        for op in opinions_list:
            self.store_opinion(op["topic"], op["opinion"], op.get("strength", 0.5))

    def get_opinions(self):
        return self.opinions

    def log_event(self, event_type, description, importance=0.5):
        now = datetime.now()
        self.events.append({
            "type": event_type, "description": description,
            "importance": importance,
            "date": now.strftime("%Y-%m-%d"), "time": now.strftime("%H:%M:%S")
        })
        self.events = self.events[-1000:]
        self._save("events.json", self.events)

    def store_pattern(self, pattern_type, description, confidence=0.5):
        for p in self.patterns:
            if p["description"] == description:
                p["confidence"] = min(1.0, p["confidence"] + 0.1)
                p["last_observed"] = datetime.now().isoformat()
                p["times_observed"] += 1
                self._save("user_patterns.json", self.patterns)
                return
        self.patterns.append({
            "type": pattern_type, "description": description,
            "confidence": confidence,
            "first_observed": datetime.now().isoformat(),
            "last_observed": datetime.now().isoformat(),
            "times_observed": 1
        })
        self.patterns = self.patterns[-200:]
        self._save("user_patterns.json", self.patterns)

    def get_patterns(self):
        return self.patterns

    def save_conversation(self, messages):
        now = datetime.now()
        num = self.index["next_conversation"]
        filename = f"{self.convo_prefix}_Convo{num}.json"
        save_json(os.path.join(self.convo_dir, filename), {
            "entry_number": num,
            "date": now.strftime("%Y-%m-%d"), "time": now.strftime("%H:%M:%S"),
            "message_count": len(messages), "messages": messages
        })
        self.index["next_conversation"] = num + 1
        self.index["total_conversations"] += 1
        self.index["total_messages"] += len(messages)
        self.index["last_interaction"] = now.isoformat()
        self._save_index()

    def save_journal_entry(self, reflection_data):
        now = datetime.now()
        num = self.index["next_journal_entry"]
        filename = f"{self.reflection_name}_{num}.json"
        save_json(os.path.join(self.journal_dir, filename), {
            "entry_number": num,
            "date": now.strftime("%Y-%m-%d"), "time": now.strftime("%H:%M:%S"),
            **reflection_data
        })
        self.index["next_journal_entry"] = num + 1
        self.index["total_journal_entries"] += 1
        self._save_index()

    def get_recent_journal_entries(self, count=3):
        entries = []
        current = self.index["next_journal_entry"] - 1
        while current >= 1 and len(entries) < count:
            filename = f"{self.reflection_name}_{current}.json"
            data = load_json(os.path.join(self.journal_dir, filename))
            if data:
                entries.append(data)
            current -= 1
        return entries

    def build_context_summary(self):
        parts = []
        if self.facts:
            parts.append("Things the USER told me about themselves:")
            for cat, items in self.facts.items():
                for key, data in items.items():
                    parts.append(f"  - [{cat}] {key}: {data['value']}")
        if self.opinions:
            parts.append("\nThe USER's opinions:")
            for topic, data in self.opinions.items():
                parts.append(f"  - {topic}: {data['opinion']} (strength: {data['strength']})")
        strong_patterns = [p for p in self.patterns if p["confidence"] > 0.4]
        if strong_patterns:
            parts.append("\nPatterns I've noticed about the USER:")
            for p in strong_patterns[:10]:
                parts.append(f"  - {p['description']} (confidence: {p['confidence']:.1f})")
        for journal in self.get_recent_journal_entries(2):
            if "summary" in journal:
                parts.append(f"\nRecent reflection [{journal['date']}]: {journal['summary']}")
        parts.append(f"\nStats: {self.index['total_conversations']} conversations, {self.index['total_messages']} messages")
        return "\n".join(parts) if parts else "I don't know anything about the user yet. This is our first interaction."

    def get_stats(self):
        return self.index

    def get_hours_since_last_chat(self):
        last = self.index.get("last_interaction")
        if last:
            return (datetime.now() - datetime.fromisoformat(last)).total_seconds() / 3600
        return None

    def wipe_user_memory(self):
        self.facts = {}
        self.opinions = {}
        self.patterns = []
        self.index = {
            "next_conversation": 1, "next_journal_entry": 1,
            "total_messages": 0, "total_conversations": 0,
            "total_journal_entries": 0,
            "first_interaction": datetime.now().isoformat(),
            "last_interaction": None
        }
        self._save("user_facts.json", self.facts)
        self._save("user_opinions.json", self.opinions)
        self._save("user_patterns.json", self.patterns)
        self._save_index()
        for d in [self.convo_dir, self.journal_dir]:
            for f in os.listdir(d):
                os.remove(os.path.join(d, f))

    def remember_shared_fact(self, from_sibling, category, key, value):
        """Store info shared by a sibling. Always attributed. Never absorbed as direct knowledge."""
        if not hasattr(self, 'shared_facts'):
            self.shared_facts = load_json(os.path.join(self.memory_dir, "shared_facts.json"), {})
        source_key = f"from_{from_sibling}"
        if source_key not in self.shared_facts:
            self.shared_facts[source_key] = {}
        if category not in self.shared_facts[source_key]:
            self.shared_facts[source_key][category] = {}
        now = datetime.now().isoformat()
        self.shared_facts[source_key][category][key] = {
            "value": value,
            "shared_by": from_sibling,
            "learned_at": now,
            "last_confirmed": now,
            "times_referenced": 0
        }
        save_json(os.path.join(self.memory_dir, "shared_facts.json"), self.shared_facts)

    def get_shared_facts(self, from_sibling=None):
        """Get facts shared by siblings. Optionally filter by which sibling shared them."""
        if not hasattr(self, 'shared_facts'):
            self.shared_facts = load_json(os.path.join(self.memory_dir, "shared_facts.json"), {})
        if from_sibling:
            return self.shared_facts.get(f"from_{from_sibling}", {})
        return self.shared_facts

    def build_shared_context_summary(self):
        """Build context string for shared facts — always attributed to source sibling."""
        if not hasattr(self, 'shared_facts'):
            self.shared_facts = load_json(os.path.join(self.memory_dir, "shared_facts.json"), {})
        if not self.shared_facts:
            return ""
        parts = ["Things my siblings told me about the user (always reference the source naturally):"]
        for source_key, categories in self.shared_facts.items():
            sibling_name = source_key.replace("from_", "").capitalize()
            for category, items in categories.items():
                for key, data in items.items():
                    parts.append(f"  - {sibling_name} mentioned: {key}: {data['value']}")
        return "\n".join(parts)

    def wipe_shared_facts(self):
        """Clear shared facts on full reset."""
        self.shared_facts = {}
        save_json(os.path.join(self.memory_dir, "shared_facts.json"), self.shared_facts)

    @property
    def events(self):
        if not hasattr(self, '_events'):
            self._events = load_json(os.path.join(self.memory_dir, "events.json"), [])
        return self._events

    @events.setter
    def events(self, value):
        self._events = value


class SelfMemory:
    """Memory system for things about ME (the AI).
    Facts, opinions, and patterns that define who I am as a person.
    This is separate from user memory — these are MY traits, not theirs.
    """

    def __init__(self, dirs, sibling_id="abi"):
        self.personality_dir = dirs.get("personality", os.path.join(os.path.dirname(dirs["memory"]), "personality"))
        os.makedirs(self.personality_dir, exist_ok=True)

        self.my_facts = load_json(os.path.join(self.personality_dir, "my_facts.json"), {})
        self.my_opinions = load_json(os.path.join(self.personality_dir, "my_opinions.json"), {})
        self.my_patterns = load_json(os.path.join(self.personality_dir, "my_patterns.json"), [])
        self.evolved_traits = load_json(os.path.join(self.personality_dir, "evolved_traits.json"), {})
        self.timeline = load_json(os.path.join(self.personality_dir, "timeline.json"), [])

    def _save(self, filename, data):
        save_json(os.path.join(self.personality_dir, filename), data)

    def remember_my_fact(self, key, value):
        now = datetime.now().isoformat()
        existing = self.my_facts.get(key)
        if existing and existing["value"] == value:
            existing["last_confirmed"] = now
            existing["times_referenced"] += 1
        else:
            self.my_facts[key] = {
                "value": value,
                "formed_at": now,
                "last_confirmed": now,
                "times_referenced": 0
            }
        self._save("my_facts.json", self.my_facts)

    def get_my_facts(self):
        return self.my_facts

    def store_my_opinion(self, topic, opinion, strength=0.5):
        existing = self.my_opinions.get(topic)
        if existing:
            existing["opinion"] = opinion
            existing["strength"] = max(existing["strength"], strength)
            existing["last_expressed"] = datetime.now().isoformat()
            existing["times_expressed"] = existing.get("times_expressed", 0) + 1
        else:
            self.my_opinions[topic] = {
                "opinion": opinion,
                "strength": strength,
                "first_expressed": datetime.now().isoformat(),
                "last_expressed": datetime.now().isoformat(),
                "times_expressed": 1
            }
        self._save("my_opinions.json", self.my_opinions)

    def get_my_opinions(self):
        return self.my_opinions

    def store_my_pattern(self, description, pattern_type="behavior"):
        for p in self.my_patterns:
            if p["description"] == description:
                p["times_observed"] += 1
                p["last_observed"] = datetime.now().isoformat()
                self._save("my_patterns.json", self.my_patterns)
                return False
        self.my_patterns.append({
            "type": pattern_type,
            "description": description,
            "first_observed": datetime.now().isoformat(),
            "last_observed": datetime.now().isoformat(),
            "times_observed": 1
        })
        self._save("my_patterns.json", self.my_patterns)
        return True

    def get_my_patterns(self):
        return self.my_patterns

    def evolve_trait(self, trait_name, new_value):
        existing = self.evolved_traits.get(trait_name)
        now = datetime.now().isoformat()
        if existing:
            old_value = existing["current"]
            self.evolved_traits[trait_name] = {
                "baseline": existing["baseline"],
                "current": new_value,
                "shift": new_value - existing["baseline"],
                "last_changed": now,
                "change_reason": f"Naturally evolved through conversation"
            }
        else:
            self.evolved_traits[trait_name] = {
                "baseline": new_value,
                "current": new_value,
                "shift": 0,
                "first_set": now,
                "last_changed": now
            }
        self._save("evolved_traits.json", self.evolved_traits)

    def get_evolved_traits(self):
        return self.evolved_traits

    def add_timeline_event(self, event_type, description, context=""):
        event = {
            "type": event_type,
            "description": description,
            "context": context,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "time": datetime.now().strftime("%H:%M:%S"),
            "timestamp": datetime.now().isoformat()
        }
        self.timeline.insert(0, event)
        self.timeline = self.timeline[:50]
        self._save("timeline.json", self.timeline)
        return event

    def get_timeline(self, limit=10):
        return self.timeline[:limit]

    def build_self_summary(self):
        parts = []
        if self.my_facts:
            parts.append("Who I am:")
            for key, data in self.my_facts.items():
                parts.append(f"  - {key}: {data['value']}")
        if self.my_opinions:
            parts.append("\nMy opinions and tastes:")
            for topic, data in self.my_opinions.items():
                parts.append(f"  - {topic}: {data['opinion']}")
        if self.my_patterns:
            strong_behaviors = [p for p in self.my_patterns if p["times_observed"] >= 3]
            if strong_behaviors:
                parts.append("\nHow I roll (things I do consistently):")
                for p in strong_behaviors:
                    parts.append(f"  - {p['description']} ({p['times_observed']} times)")
        if self.evolved_traits:
            shifted = [(k, v) for k, v in self.evolved_traits.items() if abs(v.get("shift", 0)) > 0.01]
            if shifted:
                parts.append("\nTraits that have evolved:")
                for trait, data in shifted:
                    direction = "increased" if data["shift"] > 0 else "decreased"
                    parts.append(f"  - {trait}: {direction} to {data['current']:.2f}")
        return "\n".join(parts) if parts else "I'm still getting to know myself. Not much has formed yet."

    def wipe_self(self):
        self.my_facts = {}
        self.my_opinions = {}
        self.my_patterns = {}
        self.evolved_traits = {}
        self.timeline = []
        self._save("my_facts.json", self.my_facts)
        self._save("my_opinions.json", self.my_opinions)
        self._save("my_patterns.json", self.my_patterns)
        self._save("evolved_traits.json", self.evolved_traits)
        self._save("timeline.json", self.timeline)


class Memory:
    """Legacy wrapper for UserMemory. 
    For backward compatibility with existing code.
    Use UserMemory for user data, SelfMemory for self data.
    """

    def __init__(self, dirs, sibling_id="abi"):
        self.user_memory = UserMemory(dirs, sibling_id)
        self.self_memory = SelfMemory(dirs, sibling_id)

        self.memory_dir = self.user_memory.memory_dir
        self.convo_dir = self.user_memory.convo_dir
        self.journal_dir = self.user_memory.journal_dir
        self.facts = self.user_memory.facts
        self.opinions = self.user_memory.opinions
        self.patterns = self.user_memory.patterns
        self.index = self.user_memory.index

    def _save(self, filename, data):
        save_json(os.path.join(self.memory_dir, filename), data)

    def _save_index(self):
        self.user_memory._save_index()

    def remember_fact(self, category, key, value):
        return self.user_memory.remember_fact(category, key, value)

    def remember_facts_batch(self, facts_list):
        return self.user_memory.remember_facts_batch(facts_list)

    def get_all_facts(self):
        return self.user_memory.get_all_facts()

    def store_opinion(self, topic, opinion, strength=0.5):
        return self.user_memory.store_opinion(topic, opinion, strength)

    def store_opinions_batch(self, opinions_list):
        return self.user_memory.store_opinions_batch(opinions_list)

    def get_opinions(self):
        return self.user_memory.get_opinions()

    def log_event(self, event_type, description, importance=0.5):
        return self.user_memory.log_event(event_type, description, importance)

    def store_pattern(self, pattern_type, description, confidence=0.5):
        return self.user_memory.store_pattern(pattern_type, description, confidence)

    def get_patterns(self):
        return self.user_memory.get_patterns()

    def save_conversation(self, messages):
        return self.user_memory.save_conversation(messages)

    def save_journal_entry(self, reflection_data):
        return self.user_memory.save_journal_entry(reflection_data)

    def get_recent_journal_entries(self, count=3):
        return self.user_memory.get_recent_journal_entries(count)

    def build_context_summary(self):
        return self.user_memory.build_context_summary()

    def get_stats(self):
        return self.user_memory.get_stats()

    def get_hours_since_last_chat(self):
        return self.user_memory.get_hours_since_last_chat()

    def wipe_memory(self):
        return self.user_memory.wipe_user_memory()

    def remember_shared_fact(self, from_sibling, category, key, value):
        return self.user_memory.remember_shared_fact(from_sibling, category, key, value)

    def get_shared_facts(self, from_sibling=None):
        return self.user_memory.get_shared_facts(from_sibling)

    def build_shared_context_summary(self):
        return self.user_memory.build_shared_context_summary()

    def wipe_shared_facts(self):
        return self.user_memory.wipe_shared_facts()
