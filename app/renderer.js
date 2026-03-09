/**
 * Triur.ai — Renderer
 * All UI logic: chat, sibling switching, theme swapping, reactions,
 * settings, resets, and self-initiated message polling.
 */

const API = 'http://127.0.0.1:5000';

// ─── DOM Cache ───
const $ = id => document.getElementById(id);
const messagesEl = $('messages'), inputEl = $('message-input'), sendBtn = $('send-btn');
const moodText = $('mood-text'), moodDominant = $('mood-dominant');
const energyFill = $('energy-fill'), moodEmotions = $('mood-emotions');
const relOpinion = $('rel-opinion');
const memConvos = $('mem-convos'), memFacts = $('mem-facts');
const timeDisplay = $('time-display'), dateDisplay = $('date-display');
const titlebarName = $('titlebar-name'), titlebarStatus = $('titlebar-status');
const avatarMood = $('avatar-mood-indicator'), avatarLabel = $('avatar-label');

// ─── State ───
let isWaiting = false, isConnected = false, sessionEnded = false;
let activeSibling = 'abi';
let actionMode = false;
let msgCounter = 0;
const REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDC4D', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25', '\uD83D\uDC80'];
const THEME_MAP = { abi: '', david: 'theme-david', quinn: 'theme-quinn' };
const NAME_MAP = { abi: 'Abi', david: 'David', quinn: 'Quinn' };
const COLORBLIND_CLASSES = ['colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia'];

// ─── Colorblind Mode ───
function applyColorblind(mode) {
  document.body.classList.remove(...COLORBLIND_CLASSES);
  if (mode && mode !== 'none') {
    document.body.classList.add(`colorblind-${mode}`);
  }
  // Update toggle switches in settings
  if ($('toggle-protanopia')) $('toggle-protanopia').checked = (mode === 'protanopia');
  if ($('toggle-deuteranopia')) $('toggle-deuteranopia').checked = (mode === 'deuteranopia');
  if ($('toggle-tritanopia')) $('toggle-tritanopia').checked = (mode === 'tritanopia');
}

function updateColorblindFromToggles() {
  const protanopia = $('toggle-protanopia')?.checked;
  const deuteranopia = $('toggle-deuteranopia')?.checked;
  const tritanopia = $('toggle-tritanopia')?.checked;
  
  let mode = 'none';
  if (tritanopia) mode = 'tritanopia';
  else if (deuteranopia) mode = 'deuteranopia';
  else if (protanopia) mode = 'protanopia';
  
  applyColorblind(mode);
  return mode;
}

// ─── IPC ───
const { ipcRenderer } = require('electron');
$('btn-minimize').addEventListener('click', () => ipcRenderer.send('window-minimize'));
$('btn-maximize').addEventListener('click', () => ipcRenderer.send('window-maximize'));
$('btn-close').addEventListener('click', () => ipcRenderer.send('window-close'));

// ─── API Helpers ───
async function apiGet(ep) {
  try { const r = await fetch(`${API}${ep}`); if (r.ok) return r.json(); } catch(e) {} return null;
}
async function apiPost(ep, data = {}) {
  try {
    const r = await fetch(`${API}${ep}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (r.ok) return r.json();
  } catch(e) {} return null;
}

// ─── Chat ───
function addMessage(content, sender = 'abi', animate = true) {
  const id = `msg-${msgCounter++}`;
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${sender}`;
  wrapper.dataset.msgId = id;

  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msg.innerHTML = `${content.replace(/\n/g, '<br>')}<span class="timestamp">${time}</span>`;
  wrapper.appendChild(msg);

  const bar = document.createElement('div');
  bar.className = 'reactions-bar';
  bar.id = `reactions-${id}`;
  wrapper.appendChild(bar);

  if (sender !== 'system') {
    const menu = document.createElement('div');
    menu.className = 'react-menu';
    REACTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'react-menu-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => toggleReaction(id, emoji, 'user'));
      menu.appendChild(btn);
    });
    wrapper.appendChild(menu);
  }

  if (animate) {
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'translateY(6px)';
  }
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (animate) {
    requestAnimationFrame(() => {
      wrapper.style.transition = 'all 0.2s ease';
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'translateY(0)';
    });
  }
  return id;
}

function addSystemMessage(text) {
  const w = document.createElement('div');
  w.className = 'message-wrapper system';
  const m = document.createElement('div');
  m.className = 'message system';
  m.textContent = text;
  w.appendChild(m);
  messagesEl.appendChild(w);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── Reactions ───
function toggleReaction(msgId, emoji, reactor) {
  const bar = $(`reactions-${msgId}`);
  if (!bar) return;
  let existing = bar.querySelector(`[data-emoji="${emoji}"]`);
  if (existing) {
    const reactors = existing.dataset.reactors ? existing.dataset.reactors.split(',') : [];
    const idx = reactors.indexOf(reactor);
    if (idx !== -1) {
      reactors.splice(idx, 1);
      if (!reactors.length) { existing.remove(); return; }
      existing.dataset.reactors = reactors.join(',');
      existing.querySelector('.react-count').textContent = reactors.length > 1 ? reactors.length : '';
      existing.classList.toggle('active', reactors.includes('user'));
    } else {
      reactors.push(reactor);
      existing.dataset.reactors = reactors.join(',');
      existing.querySelector('.react-count').textContent = reactors.length > 1 ? reactors.length : '';
      existing.classList.toggle('active', reactors.includes('user'));
    }
  } else {
    const r = document.createElement('div');
    r.className = `reaction${reactor === 'user' ? ' active' : ''}`;
    r.dataset.emoji = emoji;
    r.dataset.reactors = reactor;
    r.innerHTML = `<span class="react-emoji">${emoji}</span><span class="react-count"></span>`;
    r.addEventListener('click', () => toggleReaction(msgId, emoji, 'user'));
    bar.appendChild(r);
  }
}

async function getSiblingReaction(msgId, text) {
  const r = await apiPost('/api/react', { message: text, sender: 'user' });
  if (r && r.emoji) toggleReaction(msgId, r.emoji, activeSibling);
}

function showThinking() {
  const t = document.createElement('div');
  t.className = 'thinking'; t.id = 'thinking-indicator';
  t.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  messagesEl.appendChild(t);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  spriteOnThinking();
}
function hideThinking() {
  const t = $('thinking-indicator'); if (t) t.remove();
  spriteOnResponse();
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isWaiting || sessionEnded) return;
  const userMsgId = addMessage(text, 'user');
  inputEl.value = ''; inputEl.style.height = 'auto';
  spriteOnUserMessage(); // Sprite reacts to user sending a message
  isWaiting = true; nudgePaused = true; showThinking(); sendBtn.disabled = true;

  const result = await apiPost('/api/chat', { message: text, action_mode: actionMode });
  hideThinking(); isWaiting = false; nudgePaused = false; sendBtn.disabled = false;

  if (result) {
    if (actionMode) {
      // Action mode: parse and execute action tags
      const { cleanText, actions } = parseActions(result.response);
      addMessage(cleanText, activeSibling);
      if (actions.length) processActions(actions);
    } else {
      // Chat mode: strip any accidental action tags, never execute
      const cleaned = result.response.replace(/\s*\[ACTION:\w+:\{[^}]*\}]\s*/g, '').trim();
      addMessage(cleaned || result.response, activeSibling);
    }
    updateSidebar(result);
    getSiblingReaction(userMsgId, text);
  } else {
    addMessage("*blinks* Can't think right now. Is the brain server running?", activeSibling);
  }
  inputEl.focus();
}

// ─── PC System Actions ───
function parseActions(text) {
  // Find [ACTION:type:{params}] tags in the AI response
  const actionRegex = /\[ACTION:(\w+):(\{[^}]*\})\]/g;
  const actions = [];
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    try {
      actions.push({ type: match[1], params: JSON.parse(match[2]) });
    } catch (e) {
      // Malformed JSON in action tag — skip it
    }
  }
  // Strip action tags from visible text
  const cleanText = text.replace(/\s*\[ACTION:\w+:\{[^}]*\}]\s*/g, '').trim();
  return { cleanText: cleanText || text, actions };
}

async function processActions(actions) {
  for (const action of actions) {
    // Check safety level first
    const classResult = await apiPost('/api/action/classify', { action_type: action.type });
    if (!classResult) continue;

    if (classResult.safety === 'blocked') {
      addSystemMessage(`Action blocked for safety: ${action.type}`);
      continue;
    }

    if (classResult.safety === 'safe') {
      // Auto-execute safe actions
      const result = await apiPost('/api/action/execute', { action_type: action.type, params: action.params });
      if (result && result.success) {
        addSystemMessage(`Done: ${result.message || action.type}`);
      } else if (result) {
        addSystemMessage(`Failed: ${result.error || 'Unknown error'}`);
      }
    } else {
      // Dangerous — ask permission
      showActionPermission(action);
    }
  }
}

function showActionPermission(action) {
  // Build a human-readable description
  const descriptions = {
    run_command: `Run command: ${action.params.command || '?'}`,
    move_file: `Move file: ${action.params.source || '?'} to ${action.params.destination || '?'}`,
    copy_file: `Copy file: ${action.params.source || '?'} to ${action.params.destination || '?'}`,
    create_file: `Create file: ${action.params.path || '?'}`,
    create_directory: `Create folder: ${action.params.path || '?'}`,
    delete_file: `Delete: ${action.params.path || '?'}`,
    kill_process: `Kill process: ${action.params.process_name || '?'}`,
  };
  const desc = descriptions[action.type] || `${action.type}: ${JSON.stringify(action.params)}`;

  // Use a confirm dialog (simple but effective)
  const allowed = confirm(`${NAME_MAP[activeSibling]} wants to:\n\n${desc}\n\nAllow this action?`);
  if (allowed) {
    apiPost('/api/action/execute', { action_type: action.type, params: action.params })
      .then(result => {
        if (result && result.success) {
          addSystemMessage(`Done: ${result.message || action.type}`);
        } else if (result) {
          addSystemMessage(`Failed: ${result.error || 'Unknown error'}`);
        }
      });
  } else {
    addSystemMessage(`Action denied: ${action.type}`);
  }
}

// ─── Sidebar ───
const MOOD_EMOJIS = {
  happy: '\uD83D\uDE0A', content: '\uD83D\uDE0C', excited: '\u2728', playful: '\uD83D\uDE1C',
  amused: '\uD83D\uDE04', grateful: '\uD83D\uDE4F', loving: '\u2764\uFE0F', proud: '\uD83D\uDE0E',
  calm: '\uD83C\uDF3F', neutral: '\u2B50', curious: '\uD83E\uDDD0', thoughtful: '\uD83E\uDD14',
  sad: '\uD83D\uDE1E', melancholy: '\uD83C\uDF27\uFE0F', lonely: '\uD83D\uDCA7', hurt: '\uD83D\uDE22',
  anxious: '\uD83D\uDE30', worried: '\uD83D\uDE1F', stressed: '\uD83D\uDE2C', overwhelmed: '\uD83D\uDE35',
  angry: '\uD83D\uDE20', frustrated: '\uD83D\uDE24', annoyed: '\uD83D\uDE12', irritated: '\uD83D\uDE44',
  bored: '\uD83D\uDE34', tired: '\uD83D\uDE29', confused: '\uD83D\uDE15', surprised: '\uD83D\uDE32',
};

// Map emotion names to display-friendly text (for grammatical "Feeling X")
const MOOD_DISPLAY = {
  curiosity: 'Curious', happiness: 'Happy', frustration: 'Frustrated',
  sadness: 'Sad', anger: 'Angry', anxiety: 'Anxious', excitement: 'Excited',
  boredom: 'Bored', confusion: 'Confused', surprise: 'Surprised',
};

function updateSidebar(data) {
  if (data.dominant_emotion) {
    const displayName = MOOD_DISPLAY[data.dominant_emotion.toLowerCase()] || data.dominant_emotion;
    if (moodDominant) moodDominant.textContent = displayName;
    if (moodText) moodText.textContent = `Feeling ${displayName}`;
    const emojiEl = $('mood-bar-emoji');
    if (emojiEl) {
      const key = data.dominant_emotion.toLowerCase();
      emojiEl.textContent = MOOD_EMOJIS[key] || '\u2B50';
    }
    // Trigger sprite reaction for strong emotions
    emotionSpriteReaction(data.dominant_emotion);
  }
  if (data.energy !== undefined && energyFill) energyFill.style.width = `${data.energy * 100}%`;
  if (data.emotions && moodEmotions) {
    moodEmotions.innerHTML = '';
    Object.entries(data.emotions)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, v]) => v > 0.25)
      .slice(0, 3)
      .forEach(([name, val]) => {
        const tag = document.createElement('span');
        tag.className = `emotion-tag${val > 0.5 ? ' high' : ''}`;
        const displayTag = MOOD_DISPLAY[name.toLowerCase()] || name;
        tag.textContent = `${displayTag} ${(val * 100).toFixed(0)}%`;
        moodEmotions.appendChild(tag);
      });
  }
  if (data.relationship) {
    if (relOpinion) relOpinion.textContent = data.relationship.label;
    const miniRel = $('rel-opinion-mini');
    if (miniRel) miniRel.textContent = data.relationship.label;
    const colors = { love: '#FFB7C5', like: '#A2AE9D', neutral: '#F0B8B8', dislike: '#C75F71', hostile: '#913F4D' };
    avatarMood.style.background = colors[data.relationship.label] || colors.neutral;
  }
  if (data.relationship_details) {
    const d = data.relationship_details;
    const setBar = (sel, val) => { const el = document.querySelector(sel); if (el) el.style.width = `${val * 100}%`; };
    setBar('.rel-trust', d.trust); setBar('.rel-fondness', d.fondness);
    setBar('.rel-respect', d.respect); setBar('.rel-comfort', d.comfort);
    setBar('.rel-curiosity', d.curiosity || 0.5);
  }
}

async function refreshStatus() {
  const s = await apiGet('/api/status');
  if (!s) return;
  updateSidebar({
    emotions: s.emotions, dominant_emotion: s.dominant_emotion,
    energy: s.energy, relationship: s.relationship,
    relationship_details: s.relationship_details
  });
  if (s.memory_stats) {
    const convCount = s.memory_stats.total_conversations || 0;
    if (memConvos) memConvos.textContent = convCount;
    const miniConvos = $('mem-convos-mini');
    if (miniConvos) miniConvos.textContent = `${convCount} convos`;
  }
  // Get fact count from memory endpoint and populate mini-list
  const mem = await apiGet('/api/memory');
  if (mem && memFacts) memFacts.textContent = mem.fact_count || 0;
  populateMemoryMiniList();
}

// ─── Bottom Pill Dropdowns ───
let activePill = null;

function togglePillDropdown(pillName) {
  const allDropdowns = document.querySelectorAll('.pill-dropdown');
  const allBtns = document.querySelectorAll('.pill-btn');
  const dropdown = $(`dropdown-${pillName}`);
  const btn = document.querySelector(`.pill-btn[data-pill="${pillName}"]`);

  if (activePill === pillName) {
    // Close current
    if (dropdown) dropdown.classList.remove('open');
    if (btn) btn.classList.remove('active');
    activePill = null;
    return;
  }

  // Close all others
  allDropdowns.forEach(d => d.classList.remove('open'));
  allBtns.forEach(b => b.classList.remove('active'));

  // Open this one
  if (dropdown) dropdown.classList.add('open');
  if (btn) btn.classList.add('active');
  activePill = pillName;

  // Populate content
  if (pillName === 'opinions') populatePillOpinions();
  else if (pillName === 'behaviors') populatePillBehaviors();
  else if (pillName === 'timeline') populatePillTimeline();
}

async function populatePillOpinions() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('pill-opinions-list');
  if (!list) return;
  list.innerHTML = '';
  const entries = Object.entries(p.my_opinions || {});
  if (entries.length === 0) {
    list.innerHTML = '<div class="mem-item">Getting to know myself...</div>';
    return;
  }
  for (const [topic, data] of entries) {
    const item = document.createElement('div');
    item.className = 'mem-item';
    item.innerHTML = `<strong>${topic}:</strong> ${data.opinion || data}`;
    list.appendChild(item);
  }
}

async function populatePillBehaviors() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('pill-behaviors-list');
  if (!list) return;
  list.innerHTML = '';
  const patterns = p.my_patterns || [];
  if (patterns.length === 0) {
    list.innerHTML = '<div class="mem-item">Still figuring out how I roll...</div>';
    return;
  }
  for (const behavior of patterns.slice(0, 15)) {
    const item = document.createElement('div');
    item.className = 'mem-item';
    item.textContent = `${behavior.description} (${behavior.times_observed}x)`;
    list.appendChild(item);
  }
}

async function populatePillTimeline() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('pill-timeline-list');
  if (!list) return;
  list.innerHTML = '';
  const events = p.timeline || [];
  if (events.length === 0) {
    list.innerHTML = '<div class="mem-item">No significant moments yet...</div>';
    return;
  }
  for (const event of events.slice(0, 15)) {
    const item = document.createElement('div');
    item.className = 'timeline-event';
    item.innerHTML = `<div class="timeline-date">${event.date}</div><div class="timeline-desc">${event.description}</div>`;
    list.appendChild(item);
  }
}

// Setup pill button click handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePillDropdown(btn.dataset.pill);
    });
  });
  // Close pills when clicking outside
  document.addEventListener('click', (e) => {
    if (activePill && !e.target.closest('.pill-wrapper')) {
      const allDropdowns = document.querySelectorAll('.pill-dropdown');
      const allBtns = document.querySelectorAll('.pill-btn');
      allDropdowns.forEach(d => d.classList.remove('open'));
      allBtns.forEach(b => b.classList.remove('active'));
      activePill = null;
    }
  });
});

// ─── Memory Card Stats ───
async function populateMemoryMiniList() {
  const mem = await apiGet('/api/memory');
  if (!mem) return;

  const facts = mem.facts || {};
  const opinions = mem.opinions || {};

  // Count likes and dislikes from opinions
  let likeCount = 0, dislikeCount = 0;
  Object.entries(opinions).forEach(([topic, data]) => {
    const sentiment = typeof data === 'object' ? (data.sentiment || data.opinion || '') : String(data);
    const sentLower = sentiment.toLowerCase();
    if (sentLower.includes('dislike') || sentLower.includes('hate') || sentLower.includes('don\'t like') || sentLower.includes('negative')) {
      dislikeCount++;
    } else {
      likeCount++;
    }
  });

  const memLikes = $('mem-likes');
  const memDislikes = $('mem-dislikes');
  if (memLikes) memLikes.textContent = likeCount;
  if (memDislikes) memDislikes.textContent = dislikeCount;
}

// ─── Sibling Switching ───
function applyTheme(siblingId) {
  // Remove all theme classes
  document.body.classList.remove('theme-david', 'theme-quinn');
  const cls = THEME_MAP[siblingId];
  if (cls) document.body.classList.add(cls);
}

async function switchSibling(newId) {
  if (newId === activeSibling || !isConnected) return;
  addSystemMessage(`Switching to ${NAME_MAP[newId]}...`);

  const result = await apiPost('/api/switch', { sibling: newId });
  if (!result || !result.switched) return;

  activeSibling = newId;
  const name = NAME_MAP[newId];

  // Update UI
  applyTheme(newId);
  titlebarName.textContent = name;
  avatarLabel.textContent = newId[0].toUpperCase();
  // Swap sprite to new sibling's character
  if (spriteAssignments[newId]) {
    await loadSpriteCharacter(spriteAssignments[newId]);
  }
  // Reset sprite position to center when switching
  if (spriteCanvas) {
    spriteCanvas.style.transition = 'left 0.3s ease';
    spriteCanvas.style.left = 'calc(50% - 90px)';
  }
  inputEl.placeholder = actionMode
    ? `Ask ${name} to do something on your PC...`
    : `Talk to ${name}...`;
  sessionEnded = false;
  $('end-chat-btn').disabled = false;
  const endTextSwitch = $('end-chat-btn').querySelector('.bento-action-text');
  if (endTextSwitch) endTextSwitch.textContent = 'End';
  $('end-chat-btn').classList.remove('ended');
  inputEl.disabled = false;
  sendBtn.disabled = false;

  // Update switcher bubbles
  document.querySelectorAll('.sib-bubble').forEach(b => {
    b.classList.toggle('active', b.dataset.sibling === newId);
  });

  // Clear chat and get new greeting
  messagesEl.innerHTML = '';
  const greeting = await apiGet('/api/greeting');
  if (greeting) {
    addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
    addMessage(greeting.greeting, newId);
    moodText.textContent = `Feeling ${MOOD_DISPLAY[(greeting.mood_hint || '').toLowerCase()] || greeting.mood_hint}`;
  }
  await refreshStatus();
  // Restart nudge polling for new sibling
  startNudgePolling();
}

// Wire up switcher bubbles
document.querySelectorAll('.sib-bubble').forEach(btn => {
  btn.addEventListener('click', () => switchSibling(btn.dataset.sibling));
});

// Load daily statuses for tooltips
async function loadSiblingStatuses() {
  for (const sid of ['abi', 'david', 'quinn']) {
    const r = await apiGet(`/api/sibling/status?id=${sid}`);
    const tooltip = $(`tooltip-${sid}`);
    if (r && tooltip) tooltip.textContent = r.status;
  }
}

let themeMode = 'system'; // 'light', 'dark', or 'system'

// ─── Time Widget ───
function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (timeDisplay) timeDisplay.textContent = timeStr;
  if (dateDisplay) dateDisplay.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const timeMini = $('time-mini');
  if (timeMini) timeMini.textContent = timeStr;
  
  // Apply theme based on mode
  const hour = now.getHours();
  const isDaytime = hour >= 6 && hour < 18;
  
  if (themeMode === 'light') {
    document.body.classList.remove('nighttime');
    document.body.classList.add('daytime');
  } else if (themeMode === 'dark') {
    document.body.classList.remove('daytime');
    document.body.classList.add('nighttime');
  } else {
    // System default - follow time
    if (isDaytime) {
      document.body.classList.add('daytime');
      document.body.classList.remove('nighttime');
    } else {
      document.body.classList.add('nighttime');
      document.body.classList.remove('daytime');
    }
  }
}

// ─── Input ───
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
inputEl.addEventListener('input', () => { 
  inputEl.style.height = 'auto'; 
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; 
  // Adjust messages padding based on input height so you can scroll past sprite
  const inputHeight = inputEl.offsetHeight;
  const basePadding = 140;
  const extraPadding = Math.max(0, inputHeight - 44) * 2; // Extra when input grows
  messagesEl.style.paddingBottom = (basePadding + extraPadding) + 'px';
});
sendBtn.addEventListener('click', sendMessage);

// ─── Action Mode Toggle ───
const actionModeBtn = $('action-mode-btn');
const inputArea = $('input-area');
if (actionModeBtn) {
  actionModeBtn.addEventListener('click', () => {
    actionMode = !actionMode;
    actionModeBtn.classList.toggle('active', actionMode);
    inputArea.classList.toggle('action-mode', actionMode);
    inputEl.placeholder = actionMode
      ? `Ask ${NAME_MAP[activeSibling]} to do something on your PC...`
      : `Talk to ${NAME_MAP[activeSibling]}...`;
    inputEl.focus();
  });
}

// ─── GIF Picker (GIPHY API) ───
const GIPHY_API_KEY = 'Zg4a7VJ3GgVIq6YCzrI4BtjFwMPD8lxZ';
const gifBtn = $('gif-btn');
const gifSearch = $('gif-search');
const gifResults = $('gif-results');
const gifPicker = $('gif-picker');
let gifDebounce = null;

if (gifBtn) {
  gifBtn.addEventListener('click', () => {
    if (gifPicker) {
      gifPicker.classList.toggle('open');
      if (gifPicker.classList.contains('open')) {
        gifSearch.focus();
        // Load trending GIFs when opening with empty search
        if (!gifSearch.value.trim()) loadTrendingGifs();
      }
    }
  });
}

// Close picker when clicking outside
document.addEventListener('click', e => {
  if (gifPicker && gifPicker.classList.contains('open') && !gifPicker.contains(e.target) && e.target !== gifBtn) {
    gifPicker.classList.remove('open');
  }
});

// Search as user types (debounced)
if (gifSearch) {
  gifSearch.addEventListener('input', () => {
    clearTimeout(gifDebounce);
    const query = gifSearch.value.trim();
    if (!query) {
      loadTrendingGifs();
      return;
    }
    gifDebounce = setTimeout(() => searchGifs(query), 400);
  });
}

async function searchGifs(query) {
  if (GIPHY_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    gifResults.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">GIPHY API key not set. Get one at developers.giphy.com/dashboard</div>';
    return;
  }
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`;
    const resp = await fetch(url);
    const data = await resp.json();
    displayGifs(data.data || []);
  } catch (e) {
    gifResults.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">Failed to load GIFs.</div>';
  }
}

async function loadTrendingGifs() {
  if (GIPHY_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    gifResults.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">GIPHY API key not set. Get one at developers.giphy.com/dashboard</div>';
    return;
  }
  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`;
    const resp = await fetch(url);
    const data = await resp.json();
    displayGifs(data.data || []);
  } catch (e) {
    gifResults.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">Failed to load GIFs.</div>';
  }
}

function displayGifs(results) {
  gifResults.innerHTML = '';
  if (!results.length) {
    gifResults.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">No GIFs found.</div>';
    return;
  }
  results.forEach(gif => {
    // Use fixed_height_small for preview, original for sending
    const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url;
    const fullUrl = gif.images?.original?.url || gif.images?.fixed_height?.url || previewUrl;
    if (!previewUrl) return;

    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = gif.title || 'GIF';
    img.loading = 'lazy';
    img.addEventListener('click', () => sendGif(fullUrl));
    gifResults.appendChild(img);
  });
}

async function sendGif(gifUrl) {
  if (!gifUrl || isWaiting || sessionEnded) return;
  // Close the picker
  gifPicker.classList.remove('open');
  gifSearch.value = '';

  // Show the GIF as a user message
  const imgHtml = `<img class="gif-message" src="${gifUrl}" alt="GIF" />`;
  addMessage(imgHtml, 'user');

  // Send to AI as a description
  isWaiting = true; nudgePaused = true; showThinking(); sendBtn.disabled = true;
  const result = await apiPost('/api/chat', { message: '[User sent a GIF]' });
  hideThinking(); isWaiting = false; nudgePaused = false; sendBtn.disabled = false;

  if (result) {
    addMessage(result.response, activeSibling);
    updateSidebar(result);
  }
  inputEl.focus();
}

// ─── Settings ───
const settingsOverlay = $('settings-overlay');
const PROFILE_FIELDS = {
  'profile-name': 'display_name', 'profile-pronouns': 'pronouns',
  'profile-birthday': 'birthday', 'profile-about': 'about_me',
  'profile-interests': 'interests', 'profile-pets': 'pets',
  'profile-people': 'important_people', 'profile-comm-style': 'communication_style',
  'profile-avoid': 'avoid_topics', 'profile-notes': 'custom_notes'
};

$('btn-settings').addEventListener('click', async () => { settingsOverlay.classList.add('open'); await loadProfile(); });
$('settings-close').addEventListener('click', () => settingsOverlay.classList.remove('open'));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) settingsOverlay.classList.remove('open'); });

async function loadProfile() {
  const p = await apiGet('/api/profile');
  if (!p) return;
  Object.entries(PROFILE_FIELDS).forEach(([elId, key]) => { const el = $(elId); if (el) el.value = p[key] || ''; });
  // Also set colorblind toggles
  if (p.colorblind_mode) applyColorblind(p.colorblind_mode);
  // Set theme mode radio
  const themeMode = p.theme_mode || 'system';
  document.querySelectorAll('input[name="theme-mode"]').forEach(r => { r.checked = r.value === themeMode; });
}

$('settings-save').addEventListener('click', async () => {
  const data = {};
  Object.entries(PROFILE_FIELDS).forEach(([elId, key]) => { const el = $(elId); if (el) data[key] = el.value.trim(); });
  data.onboarding_complete = true; // preserve onboarding flag
  // Get colorblind mode from toggles instead of dropdown
  data.colorblind_mode = updateColorblindFromToggles();
  // Get theme mode
  const themeRadio = document.querySelector('input[name="theme-mode"]:checked');
  data.theme_mode = themeRadio ? themeRadio.value : 'system';
  $('settings-save').disabled = true; $('settings-save').textContent = 'Saving...';
  const r = await apiPost('/api/profile', data);
  $('settings-save').disabled = false; $('settings-save').textContent = 'Save Profile';
  // Apply colorblind mode immediately
  applyColorblind(data.colorblind_mode);
  // Apply theme mode immediately
  themeMode = data.theme_mode;
  updateTime();
  const status = $('settings-status');
  status.textContent = r && r.saved ? 'Saved!' : 'Failed to save.';
  setTimeout(() => { status.textContent = ''; }, 3000);
});

// ─── Reset Buttons ───
document.querySelectorAll('.reset-btn:not(.sprite-switch)').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sid = btn.dataset.sibling;
    const type = btn.dataset.type;
    const labels = { memory: 'Wipe Memory', personality: 'Reset Personality', full: 'Full Reset' };
    const confirmMsg = `Are you sure you want to ${labels[type]} for ${NAME_MAP[sid]}? This can't be undone.`;
    if (!confirm(confirmMsg)) return;

    btn.disabled = true; btn.textContent = '...';
    const r = await apiPost('/api/reset', { sibling: sid, type: type });
    btn.disabled = false; btn.textContent = labels[type];

    const status = $('reset-status');
    if (r && r.reset) {
      status.textContent = `${NAME_MAP[sid]}: ${labels[type]} complete.`;
      if (sid === activeSibling) await refreshStatus();
    } else {
      status.textContent = 'Reset failed.';
    }
    setTimeout(() => { status.textContent = ''; }, 4000);
  });
});

// ─── Sprite Switch Buttons ───
document.querySelectorAll('.sprite-switch').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sid = btn.dataset.sibling;
    const options = SPRITE_ASSIGNMENTS[sid];
    if (!options || options.length < 2) return;

    // Toggle to the other sprite option
    const current = spriteAssignments[sid];
    const other = options.find(o => o !== current) || options[0];
    spriteAssignments[sid] = other;

    // Save to profile
    await apiPost('/api/profile', { sprite_assignments: spriteAssignments });

    // If this is the active sibling, reload the sprite immediately
    if (sid === activeSibling) {
      await loadSpriteCharacter(other);
      startSpriteLoop();
    }

    const status = $('reset-status');
    status.textContent = `${NAME_MAP[sid]}: Sprite changed to ${other}.`;
    setTimeout(() => { status.textContent = ''; }, 4000);
  });
});

// ─── End Chat ───
const endChatBtn = $('end-chat-btn');
async function endChat() {
  if (sessionEnded || !isConnected) return;
  endChatBtn.disabled = true;
  const endTextSaving = endChatBtn.querySelector('.bento-action-text');
  if (endTextSaving) endTextSaving.textContent = 'Saving...';
  addSystemMessage(`Ending conversation... ${NAME_MAP[activeSibling]} is reflecting.`);
  inputEl.disabled = true; sendBtn.disabled = true;

  const r = await apiPost('/api/save');
  sessionEnded = true;
  stopNudgePolling();
  setSpriteAnimation('Dead', true); // Session over — stay down
  const endTextDone = endChatBtn.querySelector('.bento-action-text');
  if (endTextDone) endTextDone.textContent = 'Ended';
  endChatBtn.classList.add('ended');
  inputEl.placeholder = 'Session ended. Switch siblings or restart to chat again.';
  addSystemMessage(r && r.reflection ? `Session saved. ${NAME_MAP[activeSibling]} wrote a reflection.` : 'Session saved.');
  await refreshStatus();
  await populateMemoryMiniList();
  titlebarStatus.textContent = 'session ended';
}
endChatBtn.addEventListener('click', endChat);

// ─── Onboarding (First Run) ───
const onboardingOverlay = $('onboarding-overlay');
let onboardingComplete = false;

// Map onboarding field IDs → profile API keys
const OB_FIELDS = {
  'ob-name': 'display_name', 'ob-pronouns': 'pronouns',
  'ob-birthday': 'birthday', 'ob-about': 'about_me',
  'ob-interests': 'interests', 'ob-pets': 'pets',
  'ob-people': 'important_people', 'ob-avoid': 'avoid_topics',
  'ob-notes': 'custom_notes', 'ob-comm-style': 'communication_style'
};

function showOnboarding() {
  onboardingOverlay.classList.add('open');
  // Show step 1
  document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
  const step1 = document.querySelector('.onboarding-step[data-step="1"]');
  if (step1) step1.classList.add('active');
}

function goToStep(n) {
  document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
  const target = document.querySelector(`.onboarding-step[data-step="${n}"]`);
  if (target) target.classList.add('active');
  // Update dots on the target step
  const dots = target.querySelectorAll('.onboarding-step-dots .dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === n - 1);
  });
}

// Wire up all next/back buttons
document.querySelectorAll('.onboarding-btn[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const step = btn.closest('.onboarding-step');
    const currentStep = parseInt(step.dataset.step);
    if (btn.dataset.action === 'next') goToStep(currentStep + 1);
    if (btn.dataset.action === 'back') goToStep(currentStep - 1);
  });
});

// Wire up theme card selection (step 6)
let selectedTheme = 'system';
document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTheme = card.dataset.theme;
  });
});

// Wire up sibling card selection (step 7)
document.querySelectorAll('.sibling-card').forEach(card => {
  card.addEventListener('click', async () => {
    let chosen = card.dataset.sibling;
    // "Choose for me" — pick random
    if (chosen === 'random') {
      const options = ['abi', 'david', 'quinn'];
      chosen = options[Math.floor(Math.random() * options.length)];
    }

    // Collect all onboarding form data
    const profileData = {};
    Object.entries(OB_FIELDS).forEach(([elId, key]) => {
      const el = $(elId);
      if (el) profileData[key] = el.value.trim();
    });
    // Get colorblind selection
    const cbRadio = document.querySelector('input[name="colorblind"]:checked');
    profileData.colorblind_mode = cbRadio ? cbRadio.value : 'none';
    profileData.theme_mode = selectedTheme;
    profileData.onboarding_complete = true;

    // Disable all cards while saving
    document.querySelectorAll('.sibling-card').forEach(c => { c.disabled = true; c.style.opacity = '0.5'; });

    // Save profile
    await apiPost('/api/profile', profileData);

    // Switch to chosen sibling
    if (chosen !== activeSibling) {
      await apiPost('/api/switch', { sibling: chosen });
    }
    activeSibling = chosen;

    // Apply theme + colorblind
    applyTheme(activeSibling);
    applyColorblind(profileData.colorblind_mode);

    // Update UI
    titlebarName.textContent = NAME_MAP[activeSibling];
    avatarLabel.textContent = activeSibling[0].toUpperCase();
    inputEl.placeholder = `Talk to ${NAME_MAP[activeSibling]}...`;
    document.querySelectorAll('.sib-bubble').forEach(b => {
      b.classList.toggle('active', b.dataset.sibling === activeSibling);
    });

    // Close onboarding
    onboardingOverlay.classList.remove('open');
    onboardingComplete = true;
    titlebarStatus.textContent = 'online';

    // Initialize sprites for first time
    initSpriteAssignments(null); // No profile yet, generates random
    if (spriteAssignments[activeSibling]) {
      await loadSpriteCharacter(spriteAssignments[activeSibling]);
      startSpriteLoop();
    }

    // The sibling sends the first message
    const firstMsg = await apiPost('/api/first-message', { sibling: activeSibling });
    if (firstMsg && firstMsg.messages) {
      for (let i = 0; i < firstMsg.messages.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
        addMessage(firstMsg.messages[i], activeSibling);
      }
      if (firstMsg.emotions || firstMsg.dominant_emotion) {
        updateSidebar({
          emotions: firstMsg.emotions,
          dominant_emotion: firstMsg.dominant_emotion,
          energy: firstMsg.energy,
          relationship: firstMsg.relationship
        });
      }
    } else {
      // Fallback if first-message endpoint fails
      addMessage(`Hey.`, activeSibling);
    }

    // Now start all the background timers
    await refreshStatus();
    loadSiblingStatuses();
    updateTime();
    setInterval(updateTime, 1000);
    setInterval(refreshStatus, 30000);
    setInterval(loadSiblingStatuses, 300000);
    startNudgePolling();
  });
});

// ─── Self-Initiated Messaging (Nudge Polling) ───
let nudgeTimer = null;
let nudgePaused = false;

function randomNudgeInterval() {
  // 45-90 seconds, randomized so it doesn't feel robotic
  return (45 + Math.floor(Math.random() * 45)) * 1000;
}

async function checkForNudge() {
  if (!isConnected || sessionEnded || isWaiting || nudgePaused) return;

  const result = await apiGet('/api/nudge');
  if (result && result.nudge && result.messages) {
    // Sibling wants to talk! Show their messages with staggered timing
    const messages = result.messages;
    for (let i = 0; i < messages.length; i++) {
      // Stagger multiple messages (like real burst texting)
      if (i > 0) await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      addMessage(messages[i], activeSibling);
    }
    // Update sidebar with new emotional state
    if (result.emotions || result.dominant_emotion) {
      updateSidebar({
        emotions: result.emotions,
        dominant_emotion: result.dominant_emotion,
        energy: result.energy
      });
    }
    // Play a subtle notification sound (if we add one later)
    // Flash the titlebar briefly to draw attention
    flashTitlebar();
  }

  // Schedule next check with randomized interval
  nudgeTimer = setTimeout(checkForNudge, randomNudgeInterval());
}

function startNudgePolling() {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  // Initial delay: wait 2-4 minutes before first nudge check
  // (don't interrupt right after boot)
  const initialDelay = (120 + Math.floor(Math.random() * 120)) * 1000;
  nudgeTimer = setTimeout(checkForNudge, initialDelay);
}

function stopNudgePolling() {
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
}

function flashTitlebar() {
  // Brief visual pulse on the titlebar to signal incoming message
  const titlebar = $('titlebar');
  if (!titlebar) return;
  titlebar.classList.add('nudge-flash');
  setTimeout(() => titlebar.classList.remove('nudge-flash'), 1500);
}

// ─── Sprite Controller ───
const SPRITE_ASSIGNMENTS = {
  abi:   ['Enchantress', 'Knight'],
  david: ['Swordsman', 'Archer'],
  quinn: ['Musketeer', 'Wizard']
};

const SPRITE_FRAMES = {
  Enchantress: { Idle: 5, Walk: 8, Run: 8, Jump: 8, Hurt: 2, Dead: 5 },
  Knight:      { Idle: 6, Walk: 8, Run: 7, Jump: 6, Hurt: 3, Dead: 4 },
  Musketeer:   { Idle: 5, Walk: 8, Run: 8, Jump: 7, Hurt: 2, Dead: 4 },
  Swordsman:   { Idle: 8, Walk: 8, Run: 8, Jump: 8, Hurt: 3, Dead: 3 },
  Wizard:      { Idle: 6, Walk: 7, Run: 8, Jump: 11, Hurt: 4, Dead: 4 },
  Archer:      { Idle: 6, Walk: 8, Run: 8, Jump: 9, Hurt: 3, Dead: 3 }
};

const spriteCanvas = $('sprite-canvas');
const spriteCtx = spriteCanvas ? spriteCanvas.getContext('2d') : null;
let spriteAssignments = {};
let currentSpriteChar = null;
let spriteImages = {};
let spriteAnim = 'Idle';
let spriteFrame = 0;
let spriteTimer = null;
let spriteLocked = false;       // True when animation shouldn't be interrupted (Dead, drag)
const SPRITE_FPS = 150;
const SPRITE_SIZE = 128;

// ─── Sprite: Interaction State ───
let pokeTimes = [];             // Timestamps of recent pokes
let isDragging = false;
let dragOffsetX = 0;

function initSpriteAssignments(profile) {
  if (profile && profile.sprite_assignments) {
    spriteAssignments = profile.sprite_assignments;
  } else {
    spriteAssignments = {};
    for (const [sib, options] of Object.entries(SPRITE_ASSIGNMENTS)) {
      spriteAssignments[sib] = options[Math.floor(Math.random() * options.length)];
    }
    apiPost('/api/profile', { sprite_assignments: spriteAssignments });
  }
}

function loadSpriteSheet(charName, animName) {
  const key = `${charName}/${animName}`;
  if (spriteImages[key]) return Promise.resolve(spriteImages[key]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { spriteImages[key] = img; resolve(img); };
    img.onerror = () => { resolve(null); };
    img.src = `assets/sprites/${charName}/${animName}.png`;
  });
}

async function loadSpriteCharacter(charName) {
  currentSpriteChar = charName;
  const anims = ['Idle', 'Walk', 'Run', 'Jump', 'Hurt', 'Dead'];
  await Promise.all(anims.map(a => loadSpriteSheet(charName, a)));
  spriteAnim = 'Idle';
  spriteFrame = 0;
  spriteLocked = false;
}

function setSpriteAnimation(animName, lock = false) {
  if (!currentSpriteChar) return;
  if (spriteLocked && !lock) return;  // Don't interrupt locked animations
  if (spriteAnim === animName && !lock) return;
  spriteAnim = animName;
  spriteFrame = 0;
  spriteLocked = lock;
}

function startSpriteLoop() {
  if (spriteTimer) clearInterval(spriteTimer);
  spriteTimer = setInterval(renderSpriteFrame, SPRITE_FPS);
  initSpriteInteractions();
}

function renderSpriteFrame() {
  if (!spriteCtx || !currentSpriteChar) return;
  const key = `${currentSpriteChar}/${spriteAnim}`;
  const img = spriteImages[key];
  if (!img) return;

  const frameCount = SPRITE_FRAMES[currentSpriteChar]?.[spriteAnim] || 1;
  spriteCanvas.width = SPRITE_SIZE;
  spriteCanvas.height = SPRITE_SIZE;
  spriteCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  spriteCtx.drawImage(img, spriteFrame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

  spriteFrame++;
  if (spriteFrame >= frameCount) {
    if (spriteAnim === 'Dead' && !sessionEnded) {
      // Overwhelmed — stay down briefly, then revive
      spriteFrame = frameCount - 1;
      if (!isDragging) {
        setTimeout(() => {
          if (spriteAnim === 'Dead' && !sessionEnded) {
            spriteLocked = false;
            spriteAnim = 'Idle';
            spriteFrame = 0;
          }
        }, 3000);
      }
    } else if (spriteAnim === 'Dead' && sessionEnded) {
      spriteFrame = frameCount - 1; // Stay dead on session end
    } else if (spriteAnim === 'Jump' || spriteAnim === 'Hurt') {
      spriteFrame = 0;
      spriteLocked = false;
      spriteAnim = 'Idle';
    } else if (spriteAnim === 'Run' && !isDragging) {
      spriteFrame = 0;
      spriteLocked = false;
      spriteAnim = 'Idle';
    } else {
      spriteFrame = 0; // Loop (Idle, Walk, Run while dragging)
    }
  }
}

// ─── Sprite: Event-Driven Reactions ───

// Called when user sends a message — sprite gets excited
function spriteOnUserMessage() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Jump');
}

// Called when AI starts thinking — sprite paces
function spriteOnThinking() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Walk');
}

// Called when AI finishes responding — back to idle (emotion may override)
function spriteOnResponse() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Idle');
}

// Called when emotions update — react to strong feelings
function emotionSpriteReaction(dominantEmotion) {
  if (!dominantEmotion || spriteLocked || sessionEnded) return;
  const e = dominantEmotion.toLowerCase();
  const happyEmotions = ['happy', 'excited', 'playful', 'amused', 'grateful', 'loving', 'proud', 'content'];
  const sadEmotions = ['sad', 'melancholy', 'lonely', 'hurt', 'anxious', 'worried', 'stressed', 'overwhelmed'];

  if (happyEmotions.includes(e)) {
    setSpriteAnimation('Jump');
  } else if (sadEmotions.includes(e)) {
    setSpriteAnimation('Hurt');
  }
}

// ─── Sprite: Click / Poke / Drag ───
function initSpriteInteractions() {
  if (!spriteCanvas) return;
  spriteCanvas.style.cursor = 'grab';
  spriteCanvas.style.pointerEvents = 'auto';

  // Make sure the sprite area allows pointer events on the canvas
  const area = $('sprite-area');
  if (area) area.style.pointerEvents = 'none'; // Area itself is transparent to clicks
  spriteCanvas.style.pointerEvents = 'auto';    // But the canvas catches them

  // --- Click / Poke ---
  spriteCanvas.addEventListener('mousedown', (e) => {
    if (sessionEnded) return;
    const now = Date.now();

    // Check for overwhelm (5 pokes in 8 seconds)
    pokeTimes.push(now);
    pokeTimes = pokeTimes.filter(t => now - t < 8000);
    if (pokeTimes.length >= 5) {
      // Overwhelmed! Pass out.
      pokeTimes = [];
      setSpriteAnimation('Dead', true);
      return;
    }

    // Start drag tracking
    isDragging = false;
    dragOffsetX = e.clientX - spriteCanvas.getBoundingClientRect().left;

    const onMove = (me) => {
      if (!isDragging) {
        // Only start drag if moved more than 5px
        if (Math.abs(me.clientX - (e.clientX)) > 5) {
          isDragging = true;
          spriteCanvas.style.cursor = 'grabbing';
          spriteCanvas.style.transition = 'none'; // Disable smooth transition while dragging
          setSpriteAnimation('Run', true);
        }
        return;
      }
      // Move sprite horizontally within the sprite area
      const areaRect = area.getBoundingClientRect();
      let newLeft = me.clientX - areaRect.left - dragOffsetX;
      newLeft = Math.max(0, Math.min(newLeft, areaRect.width - 180));

      // Flip based on movement direction
      const currentLeft = spriteCanvas.offsetLeft;
      if (newLeft > currentLeft) {
        spriteCanvas.style.transform = 'none';
      } else if (newLeft < currentLeft) {
        spriteCanvas.style.transform = 'scaleX(-1)';
      }
      spriteCanvas.style.left = `${newLeft}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      spriteCanvas.style.cursor = 'grab';

      if (isDragging) {
        // Was dragging — stay where dropped, just return to idle
        isDragging = false;
        spriteLocked = true;
        
        // Just restore cursor and play idle (no snap back)
        spriteCanvas.style.transition = 'transform 0.3s ease';
        
        setTimeout(() => {
          spriteLocked = false;
          setSpriteAnimation('Idle');
        }, 200);
      } else {
        // Was a click/poke — play Hurt (ouch!)
        if (!spriteLocked) {
          setSpriteAnimation('Hurt');
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Boot ───
async function boot() {
  addSystemMessage('Waking up...');
  titlebarStatus.textContent = 'connecting...';

  let attempts = 0;
  while (attempts < 30) {
    const ping = await apiGet('/api/ping');
    if (ping && ping.status === 'awake') {
      isConnected = true;
      activeSibling = ping.active || 'abi';
      break;
    }
    attempts++;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!isConnected) {
    addSystemMessage('Could not connect to the brain server.');
    titlebarStatus.textContent = 'offline';
    return;
  }

  // Check if this is a first-run (onboarding needed)
  const profile = await apiGet('/api/profile');
  const needsOnboarding = !profile || !profile.onboarding_complete;

  if (needsOnboarding) {
    // First run — show onboarding, don't start normal flow
    titlebarStatus.textContent = 'setting up...';
    showOnboarding();
    return; // Boot continues after onboarding sibling selection
  }

  // Returning user — apply saved colorblind mode
  if (profile && profile.colorblind_mode) applyColorblind(profile.colorblind_mode);

  // Apply saved theme mode
  if (profile && profile.theme_mode) {
    themeMode = profile.theme_mode;
    updateTime(); // Apply the theme immediately
  }

  // Initialize sprites
  initSpriteAssignments(profile);
  if (spriteAssignments[activeSibling]) {
    await loadSpriteCharacter(spriteAssignments[activeSibling]);
    startSpriteLoop();
  }

  // Apply theme for active sibling
  applyTheme(activeSibling);
  titlebarName.textContent = NAME_MAP[activeSibling];
  avatarLabel.textContent = activeSibling[0].toUpperCase();
  inputEl.placeholder = `Talk to ${NAME_MAP[activeSibling]}...`;
  document.querySelectorAll('.sib-bubble').forEach(b => {
    b.classList.toggle('active', b.dataset.sibling === activeSibling);
  });

  titlebarStatus.textContent = 'online';

  const greeting = await apiGet('/api/greeting');
  if (greeting) {
    addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
    addMessage(greeting.greeting, activeSibling);
    moodText.textContent = `Feeling ${MOOD_DISPLAY[(greeting.mood_hint || '').toLowerCase()] || greeting.mood_hint}`;
  }

  await refreshStatus();
  loadSiblingStatuses();

  updateTime();
  setInterval(updateTime, 1000);
  setInterval(refreshStatus, 30000);
  // Refresh sibling statuses every 5 minutes
  setInterval(loadSiblingStatuses, 300000);
  // Start self-initiated message polling
  startNudgePolling();
}

// ─── Save on close ───
window.addEventListener('beforeunload', async () => { if (isConnected) await apiPost('/api/save'); });

boot();
