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
- **PC Actions** — Toggle Action Mode to open apps, search files, run commands, and more
- **Animated companions** — Interactive sprite characters that react to your messages with animations
- **Beautiful UI** — Glassmorphism bento box design with customizable themes

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

### Windows
1. **Clone or download this repo**
2. **Run it:**
   ```
   start.bat
   ```

### Mac
1. **Clone or download this repo**
2. **Make the script executable:**
   ```
   chmod +x start.sh
   ```
3. **Run it:**
   ```
   ./start.sh
   ```

The startup script will automatically:
- Check for Python 3.14+ and Ollama
- Start Ollama if not running
- Pull the AI model if needed
- Install Python dependencies
- Launch the app

### Manual Setup (optional)
If you prefer to run things manually:
1. **Install Python dependencies:**
   ```
   pip install -r requirements.txt
   ```
2. **Install Node dependencies:**
   ```
   cd app
   npm install
   ```
3. **Start Ollama:** `ollama serve`
4. **Start the server:** `python src/server.py`
5. **Start the app:** `cd app && npx electron .`

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
- **PC Actions** — Open apps, search files, run commands from within the app
- **Interactive sprites** — Animated chibi characters that react to messages and can be dragged/poked
- **Bento box UI** — Modern glassmorphism design with mood tracking and quick actions

---

## Coming Soon

- **World awareness** — AI stays informed about news, weather, and trending topics
- **Voice chat** — Talk to your companion naturally with voice input/output
- **Memory detail view** — Tap the memory card to see specific facts and opinions
- **Mobile companion** — iOS and Android apps to take your AI with you
- **Tauri migration** — Switch from Electron to Tauri for better performance

---

## Planned Premium Features

These features may become available through optional support/subscriptions:

- **Cloud sync** — Back up your AI's memory and settings across devices
- **Advanced customization** — Deeper personality tweaking and custom prompts
- **Multi-device sync** — Seamless experience across PC and mobile
- **Priority processing** — Faster response times during high server load
- **Custom sprite packs** — Additional character designs and animations
- **Export/import memories** — Full control over your data

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

**Sprite Assets:**
- Fantasy Chibi Characters by [Craftpix.net](https://craftpix.net/)
  - Female Pack: craftpix-net-211148
  - Male Pack: craftpix-net-439247

**Built with:**
- Electron
- Flask
- Ollama (dolphin-llama3:8b)
- Claude (Anthropic)

---

## Disclaimer

This is experimental software. The AI runs locally on your machine — nothing is sent to external servers. But use your best judgment about what you share.
