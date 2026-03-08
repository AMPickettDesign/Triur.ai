# Triur.ai

Your personal AI companion that actually grows with you.

---

## What is this?

Triur.ai (Gaelic for "three") is an AI that gets to know you over time. It's not just a chatbot you reset every session — it remembers you, learns your preferences, forms opinions about you, and evolves as a person through your conversations.

Think of it like having a digital companion that lives on your PC. It knows your name, your interests, your pets, what you like to talk about. And it actually *cares* (in an AI way) about your interactions.

You can interact with three different AI personalities — each with their own character and way of talking. They're connected, so they gossip about you with each other.

---

## What it can do (currently)

- **Remembers everything** — Tell it about yourself once, it remembers forever
- **Learns your preferences** — It picks up on what you like and don't like
- **Reaches out on its own** — Not just waiting for you to message — it'll check in when you've been quiet
- **Talks to itself** — Multiple AI personalities that share info and have opinions about you
- **Adapts to you** — Its personality shifts slightly based on how you treat it
- **Accessible** — Built-in support for colorblind modes, day/night themes

**Coming soon:** Can access your PC to help with tasks — open apps, search files, run commands, and more.

---

## Prerequisites

Before running, you need:

1. **Python 3.14+** — [python.org](https://www.python.org/)
2. **Node.js 18+** — [nodejs.org](https://nodejs.org/)
3. **Ollama** — [ollama.com](https://ollama.com/)
4. **Ollama model** — Run this command after installing Ollama:
   ```
   ollama pull dolphin-llama3:8b
   ```

---

## Quick Start

1. **Clone or download this repo**
2. **Install Python dependencies:**
   ```
   pip install -r requirements.txt
   ```
3. **Install Node dependencies:**
   ```
   cd app
   npm install
   ```
4. **Run it:**
   ```
   start.bat
   ```

---

## First Run

On first launch, you'll see a setup screen. It asks about you — your name, interests, pets, what you like to talk about, what to avoid. This helps your AI companion get to know the real you from day one.

You can pick which AI personality to chat with, or let it pick for you.

---

## Features

- **Long-term memory** — Tell it things once, it remembers across sessions
- **Adaptive personality** — The AI's personality shifts based on your interactions
- **Self-initiated contact** — It'll message you when you've been quiet
- **Multi-personality system** — Different AI characters with their own quirks
- **Inter-AI communication** — The AIs talk to each other about you
- **Accessibility** — Colorblind modes (Protanopia, Deuteranopia, Tritanopia)
- **Day/night themes** — Auto-switches at 6am/6pm

---

## Troubleshooting

**"Can't connect to brain server"**
- Make sure Ollama is running: `ollama serve`
- Check the model is pulled: `ollama list`

**"Python not found"**
- Install Python from python.org (make sure to add to PATH)

**Electron won't start**
- Make sure you ran `npm install` in the `app` folder

---

## Credits

Built with:
- Electron
- Flask
- Ollama (dolphin-llama3:8b)
- Claude (Anthropic)

---

## Disclaimer

This is experimental software. The AI runs locally on your machine — nothing is sent to external servers. But use your best judgment about what you share.
