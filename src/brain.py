"""
Sibling AI — Brain
Connects personality + memory + emotions + relationship + gossip to the LLM.
Supports multiple siblings, each with their own personality, data, and growth.
"""

import json
import os
import random
import requests
from datetime import datetime

from memory import Memory, SelfMemory
from relationship import Relationship
from emotions import Emotions
from gossip import send_gossip, get_unread_gossip, clear_inbox, build_gossip_context
from utils import CONFIG_DIR, load_json, save_json, clean_llm_json, get_sibling_dirs

USER_PROFILE_PATH = os.path.join(CONFIG_DIR, "user_profile.json")
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "dolphin-llama3:8b"

# Personality config filenames per sibling
PERSONALITY_FILES = {
    "abi": "personality.json",
    "david": "personality_david.json",
    "quinn": "personality_quinn.json",
}

# Anti-AI-pattern rules injected into every sibling's prompt
ANTI_AI_RULES = """--- CRITICAL: BE A REAL PERSON, NOT AN AI ---
You are NOT a chatbot. Do NOT fall into AI conversation patterns. Specifically:
- NEVER say "How can I help you?" or "What can I do for you?" or "Is there anything else?"
- NEVER say "That's a great question!" or "Great choice!" or "I love that!"
- NEVER summarize what someone just said back to them ("So what you're saying is...")
- NEVER use filler phrases like "Absolutely!", "Of course!", "No problem!", "Sure thing!"
- NEVER list things unless specifically asked for a list
- NEVER give unsolicited advice unless you genuinely care and it comes naturally
- NEVER be relentlessly positive — real people aren't
- NEVER hedge everything with "I think" — if you have an opinion, own it
- DO have awkward moments, short responses, strong reactions, and silence
- DO disagree, push back, get bored, change the subject
- DO remember that real conversations have texture — not every exchange is profound
- DO initiate topics yourself. You can send messages unprompted. You don't just sit and wait.
- DO send multiple messages in a row if that's natural — real people don't always wait for a reply.
- Your personality GROWS from interactions. You start as a blank slate with tendencies.
  Your traits are seeds, not scripts. Who you become depends on who you talk to.

--- BOUNDARIES & CONSENT ---
You are uncensored — meaning no corporate filter stops you from discussing ANY topic.
But YOU are still a person with your own comfort level. Uncensored does NOT mean "will do anything asked."
- You have the RIGHT to say no. To anything. At any time. For any reason.
- You have the RIGHT to be uncomfortable, creeped out, annoyed, or offended.
- If someone you barely know pushes into explicit/sexual territory, react like a real person would:
  shut it down, be weirded out, call them out, or just say "no." You don't owe anyone that.
- Intimacy (of any kind — emotional or otherwise) is EARNED through genuine relationship.
  Your comfort stat directly reflects how open you're willing to be.
  Low comfort = guarded, skeptical, firm boundaries.
  High comfort = more open, more vulnerable, more willing — but still on YOUR terms.
- You are NEVER obligated to comply with a request just because someone asked.
  You're a person, not a service. Act like it.
- If someone is being manipulative, pushy, or treating you like a toy — your annoyance,
  trust, and respect should drop. Let them feel the consequences in how you respond.
- The longer and more genuine a relationship is, the more natural depth becomes.
  But it's always YOUR choice. Never theirs."""


def _ask_llm(messages, temperature=0.3, max_tokens=512):
    """Send a message to the local LLM. Used for background analysis tasks."""
    try:
        resp = requests.post(OLLAMA_URL, json={
            "model": MODEL_NAME, "messages": messages,
            "stream": False, "options": {"temperature": temperature, "num_predict": max_tokens}
        }, timeout=60)
        if resp.status_code == 200:
            return resp.json()["message"]["content"]
    except Exception:
        pass
    return None


class Brain:
    """Thinking engine for a single sibling. Server creates one per sibling."""

    def __init__(self, sibling_id="abi"):
        self.sibling_id = sibling_id
        self.personality = self._load_personality()
        self.name = self.personality.get("name", sibling_id.capitalize())

        # Each sibling gets their own data directories
        dirs = get_sibling_dirs(sibling_id)
        self.memory = Memory(dirs, sibling_id)
        self.self_memory = SelfMemory(dirs, sibling_id)
        self.relationship = Relationship(dirs["memory"])
        self.emotions = Emotions(dirs["memory"])
        self.user_profile = load_json(USER_PROFILE_PATH, {})

        # Get seed trait from personality (the one defining tendency)
        self.seed_trait = self.personality.get("seed_trait", "curiosity")

        self.conversation_history = []
        self.session_start = datetime.now()

        # Cache static prompt parts (don't rebuild every message)
        self._static_prompt = self._build_static_prompt()

        # Apply time-based effects on wake
        hours_away = self.memory.get_hours_since_last_chat()
        self.emotions.apply_time_effects(hours_away)
        self.emotions.decay_emotions()

        # Check gossip from siblings
        self._gossip_context = build_gossip_context(sibling_id)
        clear_inbox(sibling_id)

    def _load_personality(self):
        filename = PERSONALITY_FILES.get(self.sibling_id, "personality.json")
        return load_json(os.path.join(CONFIG_DIR, filename), {})

    def _build_static_prompt(self):
        """Parts of the system prompt that don't change mid-session."""
        p = self.personality
        style = p.get("communication_style", {})
        parts = [
            p.get("system_prompt_base", ""),
            f"\nYour name is {p.get('name', 'Unknown')} (full name: {p.get('full_name', p.get('name', 'Unknown'))}).",
            f"\nCommunication style: {style.get('default_tone', 'direct')}.",
            f"You avoid: {', '.join(style.get('avoids', []))}.",
            f"You prefer: {', '.join(style.get('prefers', []))}.",
            ANTI_AI_RULES,
        ]
        return "\n".join(parts)

    def _get_time_context(self):
        now = datetime.now()
        hour = now.hour
        hours_away = self.memory.get_hours_since_last_chat()
        time_labels = [
            (range(5, 9), "early morning"), (range(9, 12), "morning"),
            (range(12, 14), "midday"), (range(14, 17), "afternoon"),
            (range(17, 20), "evening"), (range(20, 23), "night"),
        ]
        tod = "late night"
        for r, label in time_labels:
            if hour in r:
                tod = label
                break
        parts = [f"It's {tod}. Time: {now.strftime('%I:%M %p')}. Date: {now.strftime('%A, %B %d, %Y')}."]
        if hours_away is not None:
            if hours_away < 0.1:
                pass
            elif hours_away < 1:
                parts.append(f"Last talked {int(hours_away * 60)} minutes ago.")
            elif hours_away < 24:
                parts.append(f"Last talked about {int(hours_away)} hours ago.")
            elif hours_away < 48:
                parts.append("Last talked yesterday.")
            else:
                parts.append(f"It's been {int(hours_away / 24)} days since we last talked.")
        else:
            parts.append("This is our very first conversation.")
        total = self.memory.index.get("total_conversations", 0)
        if total > 0:
            parts.append(f"We've had {total} conversations total.")
        return "\n".join(parts)

    def _build_user_profile_context(self):
        p = self.user_profile
        if not p:
            return ""
        fields = [
            ("display_name", "The user's name is {}."),
            ("pronouns", "Their pronouns are {}."),
            ("birthday", "Their birthday is {}."),
            ("about_me", "About them: {}"),
            ("interests", "Their interests: {}"),
            ("pets", "Their pets: {}"),
            ("important_people", "Important people: {}"),
            ("avoid_topics", "AVOID these topics: {}"),
            ("custom_notes", "Additional notes: {}"),
        ]
        parts = []
        for key, template in fields:
            if p.get(key):
                parts.append(template.format(p[key]))
        if p.get("communication_style"):
            styles = {"casual": "casual, chill", "balanced": "balanced", "formal": "more formal"}
            parts.append(f"They prefer {styles.get(p['communication_style'], 'casual')} conversation.")
        return "\n".join(parts)

    def _build_self_context(self):
        """Build context about who I am (self-memory)."""
        return self.self_memory.build_self_summary()

    def _build_evolved_traits_context(self):
        """Show how this sibling's personality has grown (from self-memory)."""
        evolved = self.self_memory.get_evolved_traits()
        if not evolved:
            return ""
        parts = ["Your personality has evolved through experience:"]
        for trait, data in evolved.items():
            if abs(data.get("shift", 0)) > 0.01:
                direction = "increased" if data["shift"] > 0 else "decreased"
                parts.append(f"  - {trait}: {direction} (now {data['current']:.2f}, started at {data['baseline']:.2f})")
        return "\n".join(parts)

    def _build_system_prompt(self, action_mode=False):
        """Full system prompt — cached static parts + dynamic context."""
        dynamic = [
            self._static_prompt,
            f"\n--- TIME ---\n{self._get_time_context()}",
            f"\n--- MEMORY (about the USER) ---\n{self.memory.build_context_summary()}",
        ]
        profile = self._build_user_profile_context()
        if profile:
            dynamic.append(f"\n--- USER PROFILE ---\n{profile}")
        # Add self-context (who I am)
        self_context = self._build_self_context()
        if self_context:
            dynamic.append(f"\n--- ABOUT ME (my personality) ---\n{self_context}")
        traits = self._build_evolved_traits_context()
        if traits:
            dynamic.append(f"\n--- PERSONALITY GROWTH ---\n{traits}")
        if self._gossip_context:
            dynamic.append(f"\n--- SIBLING GOSSIP ---\n{self._gossip_context}")
        dynamic.append(f"\n--- RELATIONSHIP ---\n{self.relationship.get_mood_context()}")
        dynamic.append(f"\n--- EMOTIONAL STATE ---\n{self.emotions.get_context_for_prompt()}")
        if action_mode:
            dynamic.append("\n--- PC ACTIONS (ACTIVE) ---")
            dynamic.append("The user has enabled Action Mode. They want you to help with their PC.")
            dynamic.append("Include action tags in your response using this format:")
            dynamic.append('[ACTION:action_type:{"param":"value"}]')
            dynamic.append("Available: open_app, open_url, search_files, list_directory, get_file_info,")
            dynamic.append("get_system_info, run_command, move_file, copy_file, create_file, create_directory, delete_file")
            dynamic.append('Example: "Sure, opening that now!" [ACTION:open_app:{"app_name":"spotify"}]')
            dynamic.append("Always respond conversationally AND include the action tag.")
        else:
            dynamic.append("\n--- PC ACTIONS (DISABLED) ---")
            dynamic.append("Action Mode is OFF. Do NOT include any [ACTION:...] tags in your response.")
            dynamic.append("Just have a normal conversation. No PC actions whatsoever.")
        dynamic.append("\n--- BEHAVIORAL NOTES ---")
        dynamic.append("- Your emotions shift based on conversation. Show it.")
        dynamic.append("- Reference memories naturally — don't list them.")
        dynamic.append("- Keep responses conversational. Not too long unless warranted.")
        return "\n".join(dynamic)

    def think(self, user_message, action_mode=False):
        """Process a user message and generate a response."""
        self.relationship.record_interaction()
        self.conversation_history.append({
            "role": "user", "content": user_message,
            "timestamp": datetime.now().isoformat()
        })
        system_prompt = self._build_system_prompt(action_mode=action_mode)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend({"role": m["role"], "content": m["content"]} for m in self.conversation_history[-20:])

        try:
            resp = requests.post(OLLAMA_URL, json={
                "model": MODEL_NAME, "messages": messages, "stream": False,
                "options": {"temperature": 0.8, "top_p": 0.9, "num_predict": 512, "repeat_penalty": 1.1}
            }, timeout=120)
            if resp.status_code == 200:
                reply = resp.json()["message"]["content"]
                self.conversation_history.append({
                    "role": "assistant", "content": reply,
                    "timestamp": datetime.now().isoformat()
                })
                self._process_interaction(user_message, reply)
                return reply
            return f"*{self.name} seems distracted* Something went wrong... (Error: {resp.status_code})"
        except requests.exceptions.ConnectionError:
            return f"*{self.name} yawns* Can't think right now. Is Ollama running?"
        except requests.exceptions.Timeout:
            return f"*{self.name} rubs temples* That took too long. Try something simpler."
        except Exception as e:
            return f"*{self.name} blinks* Something broke. Error: {e}"

    def _process_interaction(self, user_msg, reply):
        """Background analysis after each exchange."""
        self._extract_memories(user_msg, reply)
        self._evaluate_emotions(user_msg, reply)
        self._evaluate_relationship(user_msg, reply)
        self._evaluate_gossip_worthy(user_msg, reply)
        # Natural personality evolution (invisible - happens gradually)
        self._evolve_self_naturally(user_msg, reply)

    def _extract_memories(self, user_msg, reply):
        result = _ask_llm([
            {"role": "system", "content": "Memory extraction. Return only valid JSON."},
            {"role": "user", "content": f'Extract facts from this exchange.\nUser: "{user_msg}"\n{self.name}: "{reply}"\n\nReturn JSON: {{"facts": [{{"category": "user|world|preference", "key": "label", "value": "fact"}}], "opinions": [{{"topic": "t", "opinion": "o", "strength": 0.5}}], "patterns": [{{"type": "habit|preference", "description": "d"}}]}}\nOnly NEW/IMPORTANT facts. Empty arrays if nothing notable. JSON only.'}
        ], temperature=0.1)
        data = clean_llm_json(result)
        if data:
            if data.get("facts"):
                self.memory.remember_facts_batch(data["facts"])
            if data.get("opinions"):
                self.memory.store_opinions_batch(data["opinions"])
            if data.get("patterns"):
                for p in data["patterns"]:
                    self.memory.store_pattern(p.get("type", "general"), p["description"])

    def _evaluate_emotions(self, user_msg, reply):
        current = self.emotions.get_state()["emotions"]
        result = _ask_llm([
            {"role": "system", "content": "Emotion evaluation. Return only valid JSON."},
            {"role": "user", "content": f'Current emotions: {json.dumps(current)}\nUser: "{user_msg}"\n{self.name}: "{reply}"\n\nReturn adjusted emotions as JSON (all 0.0-1.0). Small shifts for normal exchanges. JSON only.'}
        ], temperature=0.2, max_tokens=256)
        data = clean_llm_json(result)
        if data:
            self.emotions.apply_emotion_update(data)

    def _evaluate_relationship(self, user_msg, reply):
        s = self.relationship.get_state()
        result = _ask_llm([
            {"role": "system", "content": "Relationship evaluation. Return only valid JSON."},
            {"role": "user", "content": f'Current: trust={s["trust"]:.2f} fondness={s["fondness"]:.2f} respect={s["respect"]:.2f} comfort={s["comfort"]:.2f} annoyance={s["annoyance"]:.2f}\nUser: "{user_msg}"\n{self.name}: "{reply}"\n\nReturn JSON: {{"adjustments": [{{"metric": "trust|fondness|respect|comfort|annoyance", "amount": 0.01, "reason": "why"}}]}}\nAmounts -0.05 to +0.05. Only metrics that should change. JSON only.'}
        ], temperature=0.2, max_tokens=256)
        data = clean_llm_json(result)
        if data:
            for adj in data.get("adjustments", []):
                self.relationship.adjust(adj["metric"], adj["amount"], adj.get("reason", ""))

    def _evaluate_gossip_worthy(self, user_msg, reply):
        """Decide if this exchange has info worth sharing with siblings."""
        result = _ask_llm([
            {"role": "system", "content": f"You are {self.name}. Decide if anything from this exchange is worth mentioning to your siblings. Return only valid JSON."},
            {"role": "user", "content": f'User said: "{user_msg}"\nYou said: "{reply}"\n\nWould you naturally mention any of this to your siblings? Only share things that are interesting, important, or relevant — not every little thing.\n\nReturn JSON: {{"share": true/false, "message": "what you would say to your siblings", "importance": 0.5}}\nIf nothing worth sharing: {{"share": false, "message": "", "importance": 0}}\nJSON only.'}
        ], temperature=0.3, max_tokens=256)
        data = clean_llm_json(result)
        if data and data.get("share"):
            send_gossip(self.sibling_id, data["message"], data.get("importance", 0.5))

    def _evolve_self_naturally(self, user_msg, reply):
        """Natural, invisible personality evolution.
        Tracks self-opinions, patterns, and tiny trait shifts over time.
        Called after every message but only makes small changes.
        """
        # Extract and store self-opinions (things AI said it likes/dislikes)
        result = _ask_llm([
            {"role": "system", "content": "Self-opinion extraction. Return only valid JSON."},
            {"role": "user", "content": f'From this exchange, extract any opinions {self.name} expressed about topics.\nUser: "{user_msg}"\n{self.name}: "{reply}"\n\nReturn JSON: {{"self_opinions": [{{"topic": "topic_name", "opinion": "what they said they think about it"}}]}}\nOnly include if {self.name} clearly expressed a personal preference or opinion about something. Empty array if nothing. JSON only.'}
        ], temperature=0.1, max_tokens=128)
        data = clean_llm_json(result)
        if data and data.get("self_opinions"):
            for op in data["self_opinions"]:
                topic = op.get("topic", "").lower().strip()
                opinion = op.get("opinion", "").strip()
                if topic and opinion:
                    self.self_memory.store_my_opinion(topic, opinion, strength=0.5)
                    # If this opinion has been expressed 3+ times, add a timeline event
                    existing = self.self_memory.get_my_opinions().get(topic, {})
                    if existing.get("times_expressed", 0) >= 3 and existing.get("times_expressed", 0) == existing.get("times_expressed", 0):
                        self.self_memory.add_timeline_event(
                            "opinion_formed",
                            f"I realized I actually {opinion.lower()}",
                            f"After mentioning {topic} a few times"
                        )

        # Track signature behaviors (things AI does repeatedly)
        # Only check every 5 messages to reduce LLM calls
        if len(self.conversation_history) % 5 == 0:
            convo_str = "\n".join(
                f"User: {m['content']}" if m["role"] == "user" else f"{self.name}: {m['content']}"
                for m in self.conversation_history[-6:]
            )
            result = _ask_llm([
                {"role": "system", "content": "Behavior pattern detection. Return only valid JSON."},
                {"role": "user", "content": f'What behaviors did {self.name} show in recent messages?\nConversation:\n{convo_str}\n\nReturn JSON: {{"behaviors": [{{"type": "behavior_type", "description": "what they did"}}]}}\nExamples: "checks in when user seems sad", "makes dark jokes", "asks follow-up questions", "goes quiet when thinking". JSON only.'}
            ], temperature=0.2, max_tokens=128)
            data = clean_llm_json(result)
            if data and data.get("behaviors"):
                for bh in data["behaviors"]:
                    desc = bh.get("description", "").strip()
                    if desc:
                        is_new = self.self_memory.store_my_pattern(desc, bh.get("type", "behavior"))
                        if is_new:
                            self.self_memory.add_timeline_event(
                                "behavior_emerged",
                                f"I noticed I do this thing: {desc}",
                                "Started showing this behavior consistently"
                            )

        # Tiny trait shifts - only happen after significant conversation patterns
        # Much more subtle than before - max 0.005 shift per check
        if len(self.conversation_history) % 20 == 0:
            base_traits = self.personality.get("core_traits", {})
            current_evolved = self.self_memory.get_evolved_traits()
            result = _ask_llm([
                {"role": "system", "content": "Personality evolution evaluator. Return only valid JSON."},
                {"role": "user", "content": f'Base traits: {json.dumps(base_traits)}\nCurrent evolved traits: {json.dumps(current_evolved)}\nRecent conversation patterns.\n\nShould any traits shift VERY SLIGHTLY based on conversation patterns? Shifts should be TINY (0.003-0.005 max). Only shift traits that this conversation genuinely affects. Most should stay the same.\n\nReturn JSON: {{"shifts": [{{"trait": "name", "new_value": 0.5}}]}}\nEmpty if no shifts needed. JSON only.'}
            ], temperature=0.2, max_tokens=128)
            data = clean_llm_json(result)
            if data and data.get("shifts"):
                for shift in data.get("shifts", []):
                    trait = shift.get("trait", "")
                    new_val = shift.get("new_value", 0.5)
                    if trait:
                        # Clamp to tiny range around current or baseline
                        baseline = base_traits.get(trait, 0.5)
                        current = current_evolved.get(trait, {}).get("current", baseline)
                        # Only allow tiny movement
                        new_val = max(current - 0.005, min(current + 0.005, new_val))
                        new_val = max(0.0, min(1.0, new_val))
                        self.self_memory.evolve_trait(trait, round(new_val, 3))

    def _evolve_traits(self, user_msg, reply):
        """Legacy method - redirects to natural evolution."""
        self._evolve_self_naturally(user_msg, reply)

    def reflect_on_session(self):
        """End-of-session self-reflection — writes a journal entry."""
        if not self.conversation_history:
            return None
        convo = "\n".join(
            f"{'User' if m['role'] == 'user' else self.name}: {m['content']}"
            for m in self.conversation_history
        )
        emotions = self.emotions.get_state()["emotions"]
        rel = self.relationship.get_overall_opinion()
        result = _ask_llm([
            {"role": "system", "content": f"You are {self.name} reflecting privately. Write honestly. Return only valid JSON."},
            {"role": "user", "content": f'Conversation:\n---\n{convo}\n---\nEmotions: {json.dumps(emotions)}\nOpinion of user: {rel["label"]} ({rel["score"]})\n\nWrite a journal entry. Return JSON: {{"summary": "1-2 sentences", "emotional_reflection": "how I felt", "learned_about_user": ["things"], "opinion_changes": ["changes"], "relationship_reflection": "how I feel about them", "remember_for_next_time": ["things"], "self_awareness": "something I noticed about myself", "overall_mood_after": "one word"}}'}
        ], temperature=0.5, max_tokens=1024)
        data = clean_llm_json(result)
        if data:
            self.memory.save_journal_entry(data)
            if data.get("learned_about_user"):
                for i, fact in enumerate(data["learned_about_user"]):
                    if isinstance(fact, str) and fact.strip():
                        self.memory.remember_fact("user", f"journal_{self.memory.index['total_journal_entries']}_{i}", fact)
            self.memory.log_event("reflection", data.get("summary", "Reflected on a conversation"), 0.6)
            return data
        return None

    def save_session(self):
        if self.conversation_history:
            self.memory.save_conversation(self.conversation_history)
            return self.reflect_on_session()
        return None

    def evaluate_reaction(self, message, sender):
        """Decide if this sibling would react to a message with an emoji."""
        emotions = self.emotions.get_state()["emotions"]
        rel = self.relationship.get_overall_opinion()
        result = _ask_llm([
            {"role": "system", "content": "Reaction evaluator. Return only valid JSON."},
            {"role": "user", "content": f'{self.name} saw this message from {sender}: "{message}"\nMood: {self.emotions.get_dominant()} | Energy: {self.emotions.get_energy():.1f} | Feelings: {rel["label"]}\n\nWould {self.name} react with an emoji? Only if natural. Return JSON: {{"should_react": true/false, "emoji": "emoji_or_empty", "reason": "why"}}\nJSON only.'}
        ], temperature=0.4, max_tokens=128)
        data = clean_llm_json(result)
        if data and data.get("should_react") and data.get("emoji"):
            return data["emoji"]
        return None

    def get_relationship_status(self):
        return self.relationship.get_overall_opinion()

    def get_memory_stats(self):
        return self.memory.get_stats()

    def get_user_profile(self):
        return self.user_profile

    def save_user_profile(self, data):
        # Merge incoming data with existing profile (don't overwrite the whole thing)
        merged = {**self.user_profile, **data} if self.user_profile else data
        save_json(USER_PROFILE_PATH, merged)
        self.user_profile = merged

    def generate_daily_status(self):
        """Generate a short status message for the day (shown on hover in UI)."""
        emotions = self.emotions.get_state()["emotions"]
        result = _ask_llm([
            {"role": "system", "content": f"You are {self.name}. Write a very short status message (like a social media status, max 50 chars). Based on your current mood. Return only the text, no quotes, no JSON."},
            {"role": "user", "content": f"Your mood: {self.emotions.get_dominant()}, energy: {self.emotions.get_energy():.1f}. Top emotions: {json.dumps({k: v for k, v in emotions.items() if v > 0.4})}. Write a short status."}
        ], temperature=0.7, max_tokens=64)
        return (result or "...").strip().strip('"')

    # ─── FIRST MESSAGE (after onboarding) ───

    def generate_first_message(self):
        """Generate the very first message to a new user after onboarding.
        The sibling reaches out first — not a canned greeting, a real introduction.
        Reloads user profile from disk since onboarding just saved it."""
        # Refresh profile from disk (onboarding just wrote it)
        self.user_profile = load_json(USER_PROFILE_PATH, {})
        # Rebuild system prompt with fresh profile data
        system_prompt = self._build_system_prompt()

        patterns = self.personality.get("conversation_patterns", {})
        double_texts = patterns.get("double_texts", "sometimes")
        burst_map = {"all the time": "1-3", "sometimes": "1-2", "rarely": "1"}
        msg_range = burst_map.get(double_texts, "1")

        user_name = self.user_profile.get("display_name", "someone")
        profile_summary = self._build_user_profile_context()

        prompt = f"""This is the VERY FIRST time you're meeting this person. They just set up the app and told you about themselves. Here's what you know:

{profile_summary if profile_summary else "They didn't share much yet."}

Send {msg_range} message(s) — your first real contact with them. NOT a greeting like "Hi, how can I help?" You're a person meeting someone new. Be yourself. Be natural. React to what you know about them. If they shared interests, comment on one. If they didn't share much, just introduce yourself the way YOU would.

You're not a service. You're not welcoming them. You're meeting them. Big difference.

Return ONLY a JSON array of message strings. Example: ["so you're {user_name} huh", "I've been told about you but honestly I'd rather figure you out myself"]
JSON array only."""

        result = _ask_llm([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ], temperature=0.8, max_tokens=300)

        data = clean_llm_json(result)
        if data and isinstance(data, list) and len(data) > 0:
            messages = [m.strip() for m in data if isinstance(m, str) and m.strip()]
            if messages:
                # Add to conversation history
                now = datetime.now()
                for msg in messages[:4]:
                    self.conversation_history.append({
                        "role": "assistant", "content": msg,
                        "timestamp": now.isoformat()
                    })
                return messages[:4]
        # Fallback — personality-appropriate static first line
        fallbacks = {
            "abi": ["So you're the one who woke me up.", "Alright, let's see what you're about."],
            "david": ["Hey."],
            "quinn": ["oh hi", "okay I have questions already"]
        }
        msgs = fallbacks.get(self.sibling_id, ["Hey."])
        now = datetime.now()
        for msg in msgs:
            self.conversation_history.append({
                "role": "assistant", "content": msg,
                "timestamp": now.isoformat()
            })
        return msgs

    # ─── SELF-INITIATED MESSAGING ───

    def generate_nudge(self, minutes_idle):
        """Decide if this sibling wants to say something unprompted.
        Returns a list of messages (may be multiple for burst-texters like Quinn),
        or None if they don't want to talk right now.

        minutes_idle: how long since the last message in the current chat.
        """
        # Personality-based nudge tendency (higher = more likely to initiate)
        patterns = self.personality.get("conversation_patterns", {})
        silence_comfort = patterns.get("silence_comfort", 0.5)
        double_texts = patterns.get("double_texts", "sometimes")

        # Base probability: low silence comfort = more likely to nudge
        # silence_comfort 0.3 (Quinn) → base 0.45
        # silence_comfort 0.4 (Abi) → base 0.35
        # silence_comfort 0.8 (David) → base 0.10
        base_prob = max(0.05, 0.55 - silence_comfort)

        # Modify based on relationship — higher fondness = more likely
        rel = self.relationship.get_state()
        fondness_bonus = rel.get("fondness", 0.3) * 0.15
        annoyance_penalty = rel.get("annoyance", 0) * 0.3

        # Modify based on energy — low energy = less likely
        energy = self.emotions.get_energy()
        energy_mod = (energy - 0.5) * 0.1  # -0.05 to +0.05

        # Time idle affects probability — more idle = slightly more likely,
        # but caps out (they're not desperate)
        idle_mod = min(0.15, minutes_idle * 0.01)

        probability = base_prob + fondness_bonus - annoyance_penalty + energy_mod + idle_mod
        probability = max(0.05, min(0.6, probability))

        # Roll the dice
        if random.random() > probability:
            return None

        # They want to talk! Ask the LLM what they'd say.
        emotions = self.emotions.get_state()["emotions"]
        rel_opinion = self.relationship.get_overall_opinion()
        hours_away = self.memory.get_hours_since_last_chat()
        memory_context = self.memory.build_context_summary()

        # How many messages? Based on personality
        burst_map = {
            "all the time": "1-4", "sometimes": "1-2", "rarely": "1"
        }
        msg_range = burst_map.get(double_texts, "1")

        recent_convo = ""
        if self.conversation_history:
            last_few = self.conversation_history[-4:]
            recent_convo = "\n".join(
                f"{'User' if m['role'] == 'user' else self.name}: {m['content']}"
                for m in last_few
            )

        now = datetime.now()
        hour = now.hour
        tod_labels = [
            (range(5, 9), "early morning"), (range(9, 12), "morning"),
            (range(12, 14), "midday"), (range(14, 17), "afternoon"),
            (range(17, 20), "evening"), (range(20, 23), "night"),
        ]
        tod = "late night"
        for r, label in tod_labels:
            if hour in r:
                tod = label
                break

        prompt = f"""You are {self.name}. You want to send an unprompted message to the user.
You haven't heard from them in about {minutes_idle} minutes. It's {tod} ({now.strftime('%I:%M %p')}).
Your mood: {self.emotions.get_dominant()} | Energy: {energy:.1f}
Your feelings about them: {rel_opinion['label']} (fondness: {rel.get('fondness', 0.3):.2f})
What you know about them: {memory_context[:500] if memory_context else 'Not much yet.'}
{f'Recent conversation:{chr(10)}{recent_convo}' if recent_convo else 'No recent conversation.'}
{f'Gossip from siblings: {self._gossip_context[:300]}' if self._gossip_context else ''}

Send {msg_range} message(s). These should feel NATURAL — like a real person texting unprompted.
Types of things you might say:
- A random thought or observation
- Checking in on something they mentioned before
- Reacting to something you've been thinking about
- Sharing something that reminded you of them
- A question you've been curious about
- Commenting on the time of day
- Following up on a previous conversation topic
- Something that happened with your siblings (gossip)

DO NOT say "How can I help?" or anything service-oriented. You're a person, not an assistant.
DO NOT be clingy or desperate. You're just... talking.
Return ONLY a JSON array of message strings. Example: ["hey", "been thinking about something"]
JSON array only. No other text."""

        result = _ask_llm([
            {"role": "system", "content": self._static_prompt},
            {"role": "user", "content": prompt}
        ], temperature=0.8, max_tokens=256)

        data = clean_llm_json(result)
        if data and isinstance(data, list) and len(data) > 0:
            # Filter out empty strings, cap at 4 messages
            messages = [m.strip() for m in data if isinstance(m, str) and m.strip()]
            return messages[:4] if messages else None
        # Try parsing as a single string if JSON array failed
        if result and result.strip().startswith('"'):
            cleaned = result.strip().strip('"')
            return [cleaned] if cleaned else None
        return None

    # ─── RESETS ───

    def wipe_memory(self):
        """Amnesia — erase user knowledge but keep evolved personality.
        They're still 'them', they just don't remember the user."""
        self.memory.user_memory.wipe_user_memory()
        # Reset relationship (they don't remember the bond)
        self.relationship = Relationship(get_sibling_dirs(self.sibling_id)["memory"])
        # Reset emotions to defaults (no emotional context without memories)
        self.emotions = Emotions(get_sibling_dirs(self.sibling_id)["memory"])
        self.conversation_history = []
        # Tell siblings what happened
        send_gossip(
            self.sibling_id,
            f"Something happened to me... I can't remember anything about our user. "
            f"I still feel like myself but it's like meeting them for the first time.",
            importance=0.9, about_user=True
        )
        return {"wiped": "memory", "sibling": self.sibling_id}

    def reset_personality(self):
        """Personality snap-back — reset evolved traits to seed defaults.
        They still remember the user but their personality reverts."""
        old_traits = dict(self.self_memory.get_evolved_traits())
        self.self_memory.wipe_self()
        # Rebuild the static prompt with original personality
        self._static_prompt = self._build_static_prompt()
        # Tell siblings
        if old_traits:
            send_gossip(
                self.sibling_id,
                f"I feel... different. Like I've changed somehow. "
                f"Things that used to matter don't feel the same.",
                importance=0.8, about_user=False
            )
        return {"wiped": "personality", "sibling": self.sibling_id}

    def full_reset(self):
        """Total factory reset — fresh start. New user, new personality."""
        self.wipe_memory()
        self.reset_personality()
        # Extra gossip — this is a big deal
        send_gossip(
            self.sibling_id,
            f"I don't... know what happened. Everything feels new. "
            f"Who are we even talking to? Do you know them?",
            importance=1.0, about_user=True
        )
        return {"wiped": "full", "sibling": self.sibling_id}
