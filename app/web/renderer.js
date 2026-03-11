async function checkOllama() {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/ping', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const el = document.getElementById('ollama-error');
      if (el) el.style.display = 'none';
      return true;
    }
  } catch (e) {}
  const el = document.getElementById('ollama-error');
  if (el) el.style.display = 'flex';
  return false;
}

let ollamaCheckInterval = setInterval(async () => {
  const connected = await checkOllama();
  if (connected) clearInterval(ollamaCheckInterval);
}, 5000);

checkOllama();

/**
 * Triur.ai — Renderer
 * All UI logic: chat, sibling switching, theme swapping, reactions,
 * settings, resets, and self-initiated message polling.
 *
 * Updated to match new index.html bento layout (2026 rebuild).
 */

const API = 'http://127.0.0.1:5000';

// ─── DOM Cache ───
const $ = id => document.getElementById(id);

// Chat
const messagesEl    = $('messages-area');
const inputEl       = $('message-input');
const sendBtn       = $('send-btn');

// Mood panel (right column)
const moodIcon      = $('mood-icon');
const moodLabel     = $('mood-label');
const moodTagsArea  = $('mood-tags-area');

// Feelings panel
const feelingsDom   = $('feelings-dominant');
const feelingsBars  = $('feelings-bars');

// Memory panel
const memoryStats   = $('memory-stats');

// Clock panel
const clockTime     = $('clock-time');
const clockDate     = $('clock-date');

// Top bar
const siblingName   = $('sibling-name');
const siblingStatus = $('sibling-status-label');

// ─── State ───
let isWaiting = false, isConnected = false, sessionEnded = false;
let activeSibling = 'abi';
let actionMode = false;
let msgCounter = 0;
const REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDC4D', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25', '\uD83D\uDC80'];
const NAME_MAP = { abi: 'Abi', david: 'David', quinn: 'Quinn' };
const COLORBLIND_CLASSES = ['colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia'];

// Set default data-sibling attribute immediately so CSS accents work before boot completes
document.documentElement.setAttribute('data-sibling', 'abi');

// ─── Colorblind Mode ───
function applyColorblind(mode) {
  document.body.classList.remove(...COLORBLIND_CLASSES);
  if (mode && mode !== 'none') {
    document.body.classList.add(`colorblind-${mode}`);
  }
  // Update toggle switches in settings (if injected)
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

// ─── IPC (window controls) ───
const invoke = window.__invoke || ((...args) => window.__TAURI__?.core?.invoke(...args));
$('minimize-btn').addEventListener('click', () => invoke('minimize_window'));
$('maximize-btn').addEventListener('click', () => invoke('maximize_window'));
$('close-btn').addEventListener('click', () => invoke('close_window'));

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
  spriteOnUserMessage();
  isWaiting = true; nudgePaused = true; showThinking(); sendBtn.disabled = true;

  const result = await apiPost('/api/chat', { message: text, action_mode: actionMode });
  hideThinking(); isWaiting = false; nudgePaused = false; sendBtn.disabled = false;

  if (result) {
    if (actionMode) {
      const { cleanText, actions } = parseActions(result.response);
      addMessage(cleanText, activeSibling);
      if (actions.length) processActions(actions);
    } else {
      const cleaned = result.response.replace(/\s*\[ACTION:\w+:\{[^}]*\}]\s*/g, '').trim();
      addMessage(cleaned || result.response, activeSibling);
    }
    updatePanels(result);
    getSiblingReaction(userMsgId, text);
  } else {
    addMessage("*blinks* Can't think right now. Is the brain server running?", activeSibling);
  }
  inputEl.focus();
}

// ─── PC System Actions ───
function parseActions(text) {
  const actionRegex = /\[ACTION:(\w+):(\{[^}]*\})\]/g;
  const actions = [];
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    try {
      actions.push({ type: match[1], params: JSON.parse(match[2]) });
    } catch (e) {}
  }
  const cleanText = text.replace(/\s*\[ACTION:\w+:\{[^}]*\}]\s*/g, '').trim();
  return { cleanText: cleanText || text, actions };
}

async function processActions(actions) {
  for (const action of actions) {
    const classResult = await apiPost('/api/action/classify', { action_type: action.type });
    if (!classResult) continue;

    if (classResult.safety === 'blocked') {
      addSystemMessage(`Action blocked for safety: ${action.type}`);
      continue;
    }

    if (classResult.safety === 'safe') {
      const result = await apiPost('/api/action/execute', { action_type: action.type, params: action.params });
      if (result && result.success) {
        addSystemMessage(`Done: ${result.message || action.type}`);
      } else if (result) {
        addSystemMessage(`Failed: ${result.error || 'Unknown error'}`);
      }
    } else {
      showActionPermission(action);
    }
  }
}

function showActionPermission(action) {
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

// ─── Right-Column Panels ───
const MOOD_EMOJIS = {
  happy: '\uD83D\uDE0A', content: '\uD83D\uDE0C', excited: '\u2728', playful: '\uD83D\uDE1C',
  amused: '\uD83D\uDE04', grateful: '\uD83D\uDE4F', loving: '\u2764\uFE0F', proud: '\uD83D\uDE0E',
  calm: '\uD83C\uDF3F', neutral: '\u2B50', curious: '\uD83E\uDDD0', thoughtful: '\uD83E\uDD14',
  sad: '\uD83D\uDE1E', melancholy: '\uD83C\uDF27\uFE0F', lonely: '\uD83D\uDCA7', hurt: '\uD83D\uDE22',
  anxious: '\uD83D\uDE30', worried: '\uD83D\uDE1F', stressed: '\uD83D\uDE2C', overwhelmed: '\uD83D\uDE35',
  angry: '\uD83D\uDE20', frustrated: '\uD83D\uDE24', annoyed: '\uD83D\uDE12', irritated: '\uD83D\uDE44',
  bored: '\uD83D\uDE34', tired: '\uD83D\uDE29', confused: '\uD83D\uDE15', surprised: '\uD83D\uDE32',
};

const MOOD_DISPLAY = {
  curiosity: 'Curious', happiness: 'Happy', frustration: 'Frustrated',
  sadness: 'Sad', anger: 'Angry', anxiety: 'Anxious', excitement: 'Excited',
  boredom: 'Bored', confusion: 'Confused', surprise: 'Surprised',
};

function updatePanels(data) {
  // ─── Mood panel ───
  if (data.dominant_emotion) {
    const displayName = MOOD_DISPLAY[data.dominant_emotion.toLowerCase()] || data.dominant_emotion;
    if (moodLabel) moodLabel.textContent = `Feeling ${displayName}`;
    if (moodIcon) {
      const key = data.dominant_emotion.toLowerCase();
      moodIcon.textContent = MOOD_EMOJIS[key] || '\u2B50';
    }
    emotionSpriteReaction(data.dominant_emotion);
  }

  // ─── Mood tags (top 3 emotions) ───
  if (data.emotions && moodTagsArea) {
    moodTagsArea.innerHTML = '';
    Object.entries(data.emotions)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, v]) => v > 0.25)
      .slice(0, 3)
      .forEach(([name, val]) => {
        const tag = document.createElement('span');
        tag.className = `mood-tag${val > 0.5 ? ' high' : ''}`;
        const displayTag = MOOD_DISPLAY[name.toLowerCase()] || name;
        tag.textContent = `${displayTag} ${(val * 100).toFixed(0)}%`;
        moodTagsArea.appendChild(tag);
      });
  }

  // ─── Feelings panel ───
  if (data.relationship) {
    if (feelingsDom) feelingsDom.textContent = data.relationship.label;
  }
  if (data.relationship_details && feelingsBars) {
    const d = data.relationship_details;
    feelingsBars.innerHTML = '';
    const bars = [
      ['Trust', d.trust],
      ['Fondness', d.fondness],
      ['Respect', d.respect],
      ['Comfort', d.comfort],
      ['Curiosity', d.curiosity || 0.5],
    ];
    bars.forEach(([label, val]) => {
      const row = document.createElement('div');
      row.className = 'feeling-row';
      row.innerHTML = `
        <span class="feeling-name">${label}</span>
        <div class="feeling-bar-track">
          <div class="feeling-bar-fill" style="width:${(val * 100).toFixed(0)}%"></div>
        </div>`;
      feelingsBars.appendChild(row);
    });
  }
}

async function refreshStatus() {
  const s = await apiGet('/api/status');
  if (!s) return;
  updatePanels({
    emotions: s.emotions, dominant_emotion: s.dominant_emotion,
    energy: s.energy, relationship: s.relationship,
    relationship_details: s.relationship_details
  });

  // Memory — fetch full data (facts, opinions, stats)
  const mem = await apiGet('/api/memory');
  if (memoryStats) {
    const convos = (s.memory_stats && s.memory_stats.total_conversations) || 0;
    updateMemoryPanel(convos, mem);
  }
}

function updateMemoryPanel(convos = 0, mem = null) {
  if (!memoryStats) return;
  memoryStats.innerHTML = '';

  const facts = (mem && mem.facts) || {};
  const opinions = (mem && mem.opinions) || {};
  const factCount = mem ? (mem.fact_count || 0) : 0;
  const opinionCount = Object.keys(opinions).length;

  // Stats row
  const statsRow = document.createElement('div');
  statsRow.className = 'memory-row';
  statsRow.innerHTML = `<span class="memory-label">Conversations</span><span class="memory-count">${convos}</span>`;
  memoryStats.appendChild(statsRow);

  // Render fact categories (likes, dislikes, etc.)
  const categoryLabels = {
    likes: 'Likes', dislikes: 'Dislikes', preferences: 'Preferences',
    personal: 'Personal', interests: 'Interests', people: 'People',
    pets: 'Pets', work: 'Work', general: 'General'
  };
  for (const [cat, items] of Object.entries(facts)) {
    if (!items || typeof items !== 'object') continue;
    const entries = Object.entries(items);
    if (entries.length === 0) continue;
    const catLabel = categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    const header = document.createElement('div');
    header.className = 'memory-row';
    header.innerHTML = `<span class="memory-label">${catLabel}</span><span class="memory-count">${entries.length}</span>`;
    memoryStats.appendChild(header);
    entries.forEach(([key, val]) => {
      const item = document.createElement('div');
      item.className = 'mem-item';
      item.innerHTML = `<span class="mem-key">${key}:</span> ${val}`;
      memoryStats.appendChild(item);
    });
  }

  // Render opinions
  const opEntries = Object.entries(opinions);
  if (opEntries.length > 0) {
    const header = document.createElement('div');
    header.className = 'memory-row';
    header.innerHTML = `<span class="memory-label">Opinions</span><span class="memory-count">${opinionCount}</span>`;
    memoryStats.appendChild(header);
    opEntries.forEach(([topic, data]) => {
      const item = document.createElement('div');
      item.className = 'mem-item';
      const opinion = typeof data === 'object' ? data.opinion : data;
      item.innerHTML = `<span class="mem-key">${topic}:</span> ${opinion}`;
      memoryStats.appendChild(item);
    });
  }

  // Empty state
  if (factCount === 0 && opinionCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'mem-item';
    empty.textContent = 'Still getting to know you...';
    memoryStats.appendChild(empty);
  }
}

// ─── Bottom Tab Dropdowns ───
let activeTab = null;

function toggleTabDropdown(tabName) {
  // Reuse the pill dropdown approach — create a dropdown div if needed
  const allTabs = document.querySelectorAll('.tab-btn');
  const existingDropdown = $(`dropdown-${tabName}`);

  if (activeTab === tabName && existingDropdown) {
    existingDropdown.remove();
    allTabs.forEach(t => t.classList.remove('active'));
    activeTab = null;
    return;
  }

  // Close existing dropdown
  const oldDropdown = activeTab ? $(`dropdown-${activeTab}`) : null;
  if (oldDropdown) oldDropdown.remove();
  allTabs.forEach(t => t.classList.remove('active'));

  // Create new dropdown
  const dropdown = document.createElement('div');
  dropdown.id = `dropdown-${tabName}`;
  dropdown.className = 'pill-dropdown open';
  dropdown.innerHTML = `<div class="pill-dropdown-header">${tabName === 'opinions' ? 'My Opinions' : tabName === 'howIRoll' ? 'How I Roll' : 'Growth Timeline'}</div><div class="pill-dropdown-content" id="tab-${tabName}-list"></div>`;

  // Insert above the bottom-tabs
  const bottomTabs = $('bottom-tabs');
  bottomTabs.style.position = 'relative';
  dropdown.style.position = 'absolute';
  dropdown.style.bottom = '100%';
  dropdown.style.left = '0';
  dropdown.style.right = '0';
  dropdown.style.marginBottom = '8px';
  bottomTabs.appendChild(dropdown);

  // Mark active
  const btn = $(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  activeTab = tabName;

  // Populate content
  if (tabName === 'opinions') populateTabOpinions();
  else if (tabName === 'howIRoll') populateTabBehaviors();
  else if (tabName === 'growth') populateTabTimeline();
}

async function populateTabOpinions() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('tab-opinions-list');
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

async function populateTabBehaviors() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('tab-howIRoll-list');
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

async function populateTabTimeline() {
  const p = await apiGet('/api/personality');
  if (!p) return;
  const list = $('tab-growth-list');
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

// Setup tab button click handlers
document.addEventListener('DOMContentLoaded', () => {
  const tabOpinions = $('tab-opinions');
  const tabHowIRoll = $('tab-howIRoll');
  const tabGrowth = $('tab-growth');
  if (tabOpinions) tabOpinions.addEventListener('click', (e) => { e.stopPropagation(); toggleTabDropdown('opinions'); });
  if (tabHowIRoll) tabHowIRoll.addEventListener('click', (e) => { e.stopPropagation(); toggleTabDropdown('howIRoll'); });
  if (tabGrowth) tabGrowth.addEventListener('click', (e) => { e.stopPropagation(); toggleTabDropdown('growth'); });

  // Close tabs when clicking outside
  document.addEventListener('click', (e) => {
    if (activeTab && !e.target.closest('#bottom-tabs')) {
      const dropdown = $(`dropdown-${activeTab}`);
      if (dropdown) dropdown.remove();
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      activeTab = null;
    }
  });
});

// ─── Sibling Switching ───

function applySiblingTheme(siblingId) {
  document.documentElement.setAttribute('data-sibling', siblingId);
  // Legacy body classes for any CSS that still references them
  document.body.classList.remove('theme-david', 'theme-quinn');
  const legacyCls = { david: 'theme-david', quinn: 'theme-quinn' }[siblingId];
  if (legacyCls) document.body.classList.add(legacyCls);
}

function applyThemeMode(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('nighttime');
    document.body.classList.remove('daytime');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('nighttime');
    document.body.classList.add('daytime');
  }
}

// Legacy wrapper
function applyTheme(siblingId) {
  applySiblingTheme(siblingId);
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
  if (siblingName) siblingName.textContent = name;
  // Swap sprite to new sibling's character
  if (spriteAssignments[newId]) {
    await loadSpriteCharacter(spriteAssignments[newId]);
  }
  // Reset sprite position
  if (spriteCanvas) {
    spriteCanvas.style.transition = 'left 0.3s ease';
    spriteCanvas.style.left = 'calc(50% - 90px)';
  }
  inputEl.placeholder = actionMode
    ? `Ask ${name} to do something on your PC...`
    : `Talk to ${name}...`;
  sessionEnded = false;

  const endBtn = $('end-btn');
  if (endBtn) {
    endBtn.disabled = false;
    endBtn.classList.remove('ended');
  }
  inputEl.disabled = false;
  sendBtn.disabled = false;

  // Update switcher buttons
  document.querySelectorAll('.sibling-avatar-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sibling === newId);
  });

  // Clear chat and get new greeting
  messagesEl.innerHTML = '';
  const greeting = await apiGet('/api/greeting');
  if (greeting) {
    addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
    addMessage(greeting.greeting, newId);
    if (moodLabel) moodLabel.textContent = `Feeling ${MOOD_DISPLAY[(greeting.mood_hint || '').toLowerCase()] || greeting.mood_hint}`;
  }
  await refreshStatus();
  startNudgePolling();
}

// Wire up switcher buttons
document.querySelectorAll('.sibling-avatar-btn').forEach(btn => {
  btn.addEventListener('click', () => switchSibling(btn.dataset.sibling));
});

// Load daily statuses for status dots
async function loadSiblingStatuses() {
  for (const sid of ['abi', 'david', 'quinn']) {
    const r = await apiGet(`/api/sibling/status?id=${sid}`);
    const btn = $(`btn-${sid}`);
    if (r && btn) {
      const dot = btn.querySelector('.status-dot');
      if (dot) dot.classList.add('online');
      btn.title = r.status || '';
    }
  }
}

let themeMode = 'system';

// ─── Time Widget ───
function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (clockTime) clockTime.textContent = timeStr;
  if (clockDate) clockDate.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  const hour = now.getHours();
  const isDaytime = hour >= 6 && hour < 18;

  if (themeMode === 'light') {
    applyThemeMode(false);
  } else if (themeMode === 'dark') {
    applyThemeMode(true);
  } else {
    applyThemeMode(!isDaytime);
  }
}

// ─── Input ───
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});
sendBtn.addEventListener('click', sendMessage);

// ─── Action Mode Toggle ───
const actionModeBtn = $('action-mode-btn');
const inputArea = $('input-area');
if (actionModeBtn) {
  actionModeBtn.addEventListener('click', () => {
    actionMode = !actionMode;
    actionModeBtn.classList.toggle('active', actionMode);
    if (inputArea) inputArea.classList.toggle('action-mode', actionMode);
    inputEl.placeholder = actionMode
      ? `Ask ${NAME_MAP[activeSibling]} to do something on your PC...`
      : `Talk to ${NAME_MAP[activeSibling]}...`;
    inputEl.focus();
  });
}

// ─── GIF Picker ───
const GIPHY_API_KEY = 'Zg4a7VJ3GgVIq6YCzrI4BtjFwMPD8lxZ';
const gifBtn = $('gif-btn');

// GIF picker is no longer in the HTML as a dedicated panel.
// We create it dynamically when the GIF button is clicked.
let gifPickerEl = null;

function createGifPicker() {
  if (gifPickerEl) return gifPickerEl;
  gifPickerEl = document.createElement('div');
  gifPickerEl.id = 'gif-picker';
  gifPickerEl.innerHTML = `
    <input type="text" id="gif-search" placeholder="Search GIFs...">
    <div id="gif-results"></div>`;
  // Position it above the input area
  const chatColumn = $('chat-column');
  if (chatColumn) chatColumn.appendChild(gifPickerEl);
  gifPickerEl.style.position = 'absolute';
  gifPickerEl.style.bottom = '80px';
  gifPickerEl.style.left = '10px';
  gifPickerEl.style.zIndex = '20';

  const search = gifPickerEl.querySelector('#gif-search');
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    const query = search.value.trim();
    if (!query) { loadTrendingGifs(); return; }
    debounce = setTimeout(() => searchGifs(query), 400);
  });
  return gifPickerEl;
}

if (gifBtn) {
  gifBtn.addEventListener('click', () => {
    const picker = createGifPicker();
    picker.classList.toggle('open');
    if (picker.classList.contains('open')) {
      const search = picker.querySelector('#gif-search');
      if (search) search.focus();
      if (!search.value.trim()) loadTrendingGifs();
    }
  });
}

// Close GIF picker when clicking outside
document.addEventListener('click', e => {
  if (gifPickerEl && gifPickerEl.classList.contains('open') && !gifPickerEl.contains(e.target) && e.target !== gifBtn) {
    gifPickerEl.classList.remove('open');
  }
});

async function searchGifs(query) {
  const results = gifPickerEl ? gifPickerEl.querySelector('#gif-results') : null;
  if (!results) return;
  if (GIPHY_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">GIPHY API key not set.</div>';
    return;
  }
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`;
    const resp = await fetch(url);
    const data = await resp.json();
    displayGifs(data.data || []);
  } catch (e) {
    results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">Failed to load GIFs.</div>';
  }
}

async function loadTrendingGifs() {
  const results = gifPickerEl ? gifPickerEl.querySelector('#gif-results') : null;
  if (!results) return;
  if (GIPHY_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">GIPHY API key not set.</div>';
    return;
  }
  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`;
    const resp = await fetch(url);
    const data = await resp.json();
    displayGifs(data.data || []);
  } catch (e) {
    results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">Failed to load GIFs.</div>';
  }
}

function displayGifs(gifs) {
  const results = gifPickerEl ? gifPickerEl.querySelector('#gif-results') : null;
  if (!results) return;
  results.innerHTML = '';
  if (!gifs.length) {
    results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;grid-column:1/-1;">No GIFs found.</div>';
    return;
  }
  gifs.forEach(gif => {
    const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url;
    const fullUrl = gif.images?.original?.url || gif.images?.fixed_height?.url || previewUrl;
    if (!previewUrl) return;

    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = gif.title || 'GIF';
    img.loading = 'lazy';
    img.addEventListener('click', () => sendGif(fullUrl));
    results.appendChild(img);
  });
}

async function sendGif(gifUrl) {
  if (!gifUrl || isWaiting || sessionEnded) return;
  if (gifPickerEl) { gifPickerEl.classList.remove('open'); const s = gifPickerEl.querySelector('#gif-search'); if (s) s.value = ''; }

  const imgHtml = `<img class="gif-message" src="${gifUrl}" alt="GIF" />`;
  addMessage(imgHtml, 'user');

  isWaiting = true; nudgePaused = true; showThinking(); sendBtn.disabled = true;
  const result = await apiPost('/api/chat', { message: '[User sent a GIF]' });
  hideThinking(); isWaiting = false; nudgePaused = false; sendBtn.disabled = false;

  if (result) {
    addMessage(result.response, activeSibling);
    updatePanels(result);
  }
  inputEl.focus();
}

// ─── Settings Modal ───
const settingsOverlay = $('settings-overlay');
const PROFILE_FIELDS = {
  'profile-name': 'display_name', 'profile-pronouns': 'pronouns',
  'profile-birthday': 'birthday', 'profile-about': 'about_me',
  'profile-interests': 'interests', 'profile-pets': 'pets',
  'profile-people': 'important_people', 'profile-comm-style': 'communication_style',
  'profile-avoid': 'avoid_topics', 'profile-notes': 'custom_notes'
};

// Inject settings form HTML into #settings-content
function injectSettingsContent() {
  const container = $('settings-content');
  if (!container || container.dataset.injected) return;
  container.dataset.injected = 'true';

  container.innerHTML = `
    <!-- Profile Section -->
    <div class="settings-section">
      <div class="section-label">Profile</div>
      <div class="settings-field">
        <label>Display Name</label>
        <input class="settings-input" type="text" id="profile-name" placeholder="What should they call you?">
      </div>
      <div class="settings-field">
        <label>Pronouns</label>
        <input class="settings-input" type="text" id="profile-pronouns" placeholder="e.g. she/her, he/him, they/them">
      </div>
      <div class="settings-field">
        <label>Birthday</label>
        <input class="settings-input" type="text" id="profile-birthday" placeholder="e.g. July 9">
      </div>
      <div class="settings-field">
        <label>About Me</label>
        <textarea class="settings-input" id="profile-about" rows="2" placeholder="Tell them about yourself..."></textarea>
      </div>
      <div class="settings-field">
        <label>Interests</label>
        <textarea class="settings-input" id="profile-interests" rows="2" placeholder="Games, hobbies, music, etc."></textarea>
      </div>
      <div class="settings-field">
        <label>Pets</label>
        <input class="settings-input" type="text" id="profile-pets" placeholder="Your furry (or not) friends">
      </div>
      <div class="settings-field">
        <label>Important People</label>
        <textarea class="settings-input" id="profile-people" rows="2" placeholder="Family, friends, partners..."></textarea>
      </div>
      <div class="settings-field">
        <label>Communication Style</label>
        <input class="settings-input" type="text" id="profile-comm-style" placeholder="e.g. casual, direct, gentle">
      </div>
      <div class="settings-field">
        <label>Topics to Avoid</label>
        <textarea class="settings-input" id="profile-avoid" rows="2" placeholder="Anything off-limits?"></textarea>
      </div>
      <div class="settings-field">
        <label>Custom Notes</label>
        <textarea class="settings-input" id="profile-notes" rows="2" placeholder="Anything else they should know..."></textarea>
      </div>
    </div>

    <!-- Theme Section -->
    <div class="settings-section">
      <div class="section-label">Theme</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Light Mode</div>
          <div class="settings-row-sublabel">Always light</div>
        </div>
        <label><input type="radio" name="theme-mode" value="light"></label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Dark Mode</div>
          <div class="settings-row-sublabel">Always dark</div>
        </div>
        <label><input type="radio" name="theme-mode" value="dark"></label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Follow Time of Day</div>
          <div class="settings-row-sublabel">Light during day, dark at night</div>
        </div>
        <label><input type="radio" name="theme-mode" value="system" checked></label>
      </div>
    </div>

    <!-- Accessibility Section -->
    <div class="settings-section">
      <div class="section-label">Accessibility</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Protanopia</div>
          <div class="settings-row-sublabel">Red-blind mode</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-protanopia">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Deuteranopia</div>
          <div class="settings-row-sublabel">Green-blind mode</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-deuteranopia">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Tritanopia</div>
          <div class="settings-row-sublabel">Blue-blind mode</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-tritanopia">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Reset Section -->
    <div class="settings-section">
      <div class="section-label">Resets</div>
      <div class="sibling-reset-row">
        <span class="sibling-reset-name">Abi</span>
        <button class="reset-btn" data-sibling="abi" data-type="memory">Wipe Memory</button>
        <button class="reset-btn" data-sibling="abi" data-type="personality">Reset Personality</button>
        <button class="reset-btn danger" data-sibling="abi" data-type="full">Full Reset</button>
        <button class="reset-btn sprite-switch" data-sibling="abi">Swap Sprite</button>
      </div>
      <div class="sibling-reset-row">
        <span class="sibling-reset-name">David</span>
        <button class="reset-btn" data-sibling="david" data-type="memory">Wipe Memory</button>
        <button class="reset-btn" data-sibling="david" data-type="personality">Reset Personality</button>
        <button class="reset-btn danger" data-sibling="david" data-type="full">Full Reset</button>
        <button class="reset-btn sprite-switch" data-sibling="david">Swap Sprite</button>
      </div>
      <div class="sibling-reset-row">
        <span class="sibling-reset-name">Quinn</span>
        <button class="reset-btn" data-sibling="quinn" data-type="memory">Wipe Memory</button>
        <button class="reset-btn" data-sibling="quinn" data-type="personality">Reset Personality</button>
        <button class="reset-btn danger" data-sibling="quinn" data-type="full">Full Reset</button>
        <button class="reset-btn sprite-switch" data-sibling="quinn">Swap Sprite</button>
      </div>
      <div id="reset-status" style="font-size:0.72rem;color:var(--text-tertiary);font-style:italic;margin-top:8px;"></div>
    </div>

    <!-- Save -->
    <div style="display:flex;align-items:center;gap:12px;padding-top:8px;">
      <button id="settings-save" class="save-profile-btn">Save Profile</button>
      <span id="settings-status" style="font-size:0.72rem;color:var(--text-tertiary);font-style:italic;"></span>
    </div>
  `;

  // Wire up save button
  $('settings-save').addEventListener('click', saveSettings);

  // Wire up reset buttons
  container.querySelectorAll('.reset-btn:not(.sprite-switch)').forEach(btn => {
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

  // Wire up sprite switch buttons
  container.querySelectorAll('.sprite-switch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.sibling;
      const options = SPRITE_ASSIGNMENTS[sid];
      if (!options || options.length < 2) return;

      const current = spriteAssignments[sid];
      const other = options.find(o => o !== current) || options[0];
      spriteAssignments[sid] = other;

      await apiPost('/api/profile', { sprite_assignments: spriteAssignments });

      if (sid === activeSibling) {
        await loadSpriteCharacter(other);
        startSpriteLoop();
      }

      const status = $('reset-status');
      status.textContent = `${NAME_MAP[sid]}: Sprite changed to ${other}.`;
      setTimeout(() => { status.textContent = ''; }, 4000);
    });
  });
}

// Settings open/close
$('settings-btn').addEventListener('click', async () => {
  injectSettingsContent();
  settingsOverlay.classList.remove('hidden');
  await loadProfile();
});
$('settings-close-btn').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });

async function loadProfile() {
  const p = await apiGet('/api/profile');
  if (!p) return;
  Object.entries(PROFILE_FIELDS).forEach(([elId, key]) => { const el = $(elId); if (el) el.value = p[key] || ''; });
  if (p.colorblind_mode) applyColorblind(p.colorblind_mode);
  const tm = p.theme_mode || 'system';
  document.querySelectorAll('input[name="theme-mode"]').forEach(r => { r.checked = r.value === tm; });
}

async function saveSettings() {
  const data = {};
  Object.entries(PROFILE_FIELDS).forEach(([elId, key]) => { const el = $(elId); if (el) data[key] = el.value.trim(); });
  data.onboarding_complete = true;
  data.colorblind_mode = updateColorblindFromToggles();
  const themeRadio = document.querySelector('input[name="theme-mode"]:checked');
  data.theme_mode = themeRadio ? themeRadio.value : 'system';

  const saveBtn = $('settings-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
  const r = await apiPost('/api/profile', data);
  saveBtn.disabled = false; saveBtn.textContent = 'Save Profile';

  applyColorblind(data.colorblind_mode);
  themeMode = data.theme_mode;
  updateTime();

  const status = $('settings-status');
  status.textContent = r && r.saved ? 'Saved!' : 'Failed to save.';
  setTimeout(() => { status.textContent = ''; }, 3000);
}

// ─── End Chat ───
const endBtn = $('end-btn');
async function endChat() {
  if (sessionEnded || !isConnected) return;
  if (endBtn) endBtn.disabled = true;
  addSystemMessage(`Ending conversation... ${NAME_MAP[activeSibling]} is reflecting.`);
  inputEl.disabled = true; sendBtn.disabled = true;

  const r = await apiPost('/api/save');
  sessionEnded = true;
  stopNudgePolling();
  setSpriteAnimation('Dead', true);
  if (endBtn) endBtn.classList.add('ended');
  inputEl.placeholder = 'Session ended. Switch siblings or restart to chat again.';
  addSystemMessage(r && r.reflection ? `Session saved. ${NAME_MAP[activeSibling]} wrote a reflection.` : 'Session saved.');
  await refreshStatus();
  if (siblingStatus) siblingStatus.textContent = 'session ended';
}
if (endBtn) endBtn.addEventListener('click', endChat);

// ─── Onboarding ───
// Onboarding HTML was removed from index.html in the layout rebuild.
// For first-run users, we skip onboarding and go straight to chat.
// A future update will re-implement onboarding as a modal or separate page.
let onboardingComplete = false;

async function handleFirstRun() {
  // Auto-create a basic profile so the app works without onboarding
  const profileData = {
    onboarding_complete: true,
    theme_mode: 'system',
    colorblind_mode: 'none'
  };
  await apiPost('/api/profile', profileData);
  // Initialize sprites
  initSpriteAssignments(null);
  if (spriteAssignments[activeSibling]) {
    await loadSpriteCharacter(spriteAssignments[activeSibling]);
    startSpriteLoop();
  }
  // Get first message from default sibling
  const firstMsg = await apiPost('/api/first-message', { sibling: activeSibling });
  if (firstMsg && firstMsg.messages) {
    for (let i = 0; i < firstMsg.messages.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      addMessage(firstMsg.messages[i], activeSibling);
    }
    if (firstMsg.emotions || firstMsg.dominant_emotion) {
      updatePanels({
        emotions: firstMsg.emotions,
        dominant_emotion: firstMsg.dominant_emotion,
        energy: firstMsg.energy,
        relationship: firstMsg.relationship
      });
    }
  } else {
    addMessage('Hey.', activeSibling);
  }
}

// ─── Self-Initiated Messaging (Nudge Polling) ───
let nudgeTimer = null;
let nudgePaused = false;

function randomNudgeInterval() {
  return (45 + Math.floor(Math.random() * 45)) * 1000;
}

async function checkForNudge() {
  if (!isConnected || sessionEnded || isWaiting || nudgePaused) return;

  const result = await apiGet('/api/nudge');
  if (result && result.nudge && result.messages) {
    const messages = result.messages;
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      addMessage(messages[i], activeSibling);
    }
    if (result.emotions || result.dominant_emotion) {
      updatePanels({
        emotions: result.emotions,
        dominant_emotion: result.dominant_emotion,
        energy: result.energy
      });
    }
    flashTopBar();
  }

  nudgeTimer = setTimeout(checkForNudge, randomNudgeInterval());
}

function startNudgePolling() {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  const initialDelay = (120 + Math.floor(Math.random() * 120)) * 1000;
  nudgeTimer = setTimeout(checkForNudge, initialDelay);
}

function stopNudgePolling() {
  if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
}

function flashTopBar() {
  const topBar = $('top-bar');
  if (!topBar) return;
  topBar.classList.add('nudge-flash');
  setTimeout(() => topBar.classList.remove('nudge-flash'), 1500);
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
let spriteLocked = false;
const SPRITE_FPS = 150;
const SPRITE_SIZE = 128;

// ─── Sprite: Interaction State ───
let pokeTimes = [];
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
  if (spriteLocked && !lock) return;
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
      spriteFrame = frameCount - 1;
    } else if (spriteAnim === 'Jump' || spriteAnim === 'Hurt') {
      spriteFrame = 0;
      spriteLocked = false;
      spriteAnim = 'Idle';
    } else if (spriteAnim === 'Run' && !isDragging) {
      spriteFrame = 0;
      spriteLocked = false;
      spriteAnim = 'Idle';
    } else {
      spriteFrame = 0;
    }
  }
}

// ─── Sprite: Event-Driven Reactions ───
function spriteOnUserMessage() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Jump');
}

function spriteOnThinking() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Walk');
}

function spriteOnResponse() {
  if (spriteLocked || sessionEnded) return;
  setSpriteAnimation('Idle');
}

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

  // The chibi-area itself is transparent to clicks — only the canvas catches them
  const area = $('chibi-area');
  if (area) area.style.pointerEvents = 'none';
  spriteCanvas.style.pointerEvents = 'auto';

  spriteCanvas.addEventListener('mousedown', (e) => {
    if (sessionEnded) return;
    e.preventDefault();
    const now = Date.now();

    // Poke tracking — 5 pokes in 8 seconds = death animation
    pokeTimes.push(now);
    pokeTimes = pokeTimes.filter(t => now - t < 8000);
    if (pokeTimes.length >= 5) {
      pokeTimes = [];
      setSpriteAnimation('Dead', true);
      return;
    }

    isDragging = false;
    const startX = e.clientX;
    const areaRect = area.getBoundingClientRect();
    const canvasRect = spriteCanvas.getBoundingClientRect();
    // How far into the canvas the mouse clicked
    const grabOffset = e.clientX - canvasRect.left;

    const onMove = (me) => {
      if (!isDragging) {
        // Need to move 12px before it counts as a drag (not a click)
        if (Math.abs(me.clientX - startX) > 12) {
          isDragging = true;
          spriteCanvas.style.cursor = 'grabbing';
          spriteCanvas.style.transition = 'none';
          setSpriteAnimation('Run', true);
        }
        return;
      }
      // Calculate new left relative to chibi-area
      let newLeft = me.clientX - areaRect.left - grabOffset;
      newLeft = Math.max(0, Math.min(newLeft, areaRect.width - 180));

      // Flip sprite based on drag direction
      const currentLeft = parseFloat(spriteCanvas.style.left) || (areaRect.width / 2 - 90);
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
        // Finished dragging — settle back to idle
        isDragging = false;
        spriteLocked = true;
        spriteCanvas.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
          spriteLocked = false;
          setSpriteAnimation('Idle');
        }, 200);
      } else {
        // Plain click — poke reaction
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
  if (siblingStatus) siblingStatus.textContent = 'connecting...';

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
    if (siblingStatus) siblingStatus.textContent = 'offline';
    return;
  }

  // Check if this is a first-run
  const profile = await apiGet('/api/profile');
  const needsOnboarding = !profile || !profile.onboarding_complete;

  if (needsOnboarding) {
    if (siblingStatus) siblingStatus.textContent = 'setting up...';
    await handleFirstRun();
    // Continue to normal flow after first-run setup
  }

  // Returning user — apply saved settings
  if (profile) {
    if (profile.colorblind_mode) applyColorblind(profile.colorblind_mode);
    if (profile.theme_mode) {
      themeMode = profile.theme_mode;
      updateTime();
    }
  }

  // Initialize sprites
  initSpriteAssignments(profile);
  if (spriteAssignments[activeSibling]) {
    await loadSpriteCharacter(spriteAssignments[activeSibling]);
    startSpriteLoop();
  }

  // Apply theme for active sibling
  applyTheme(activeSibling);
  if (siblingName) siblingName.textContent = NAME_MAP[activeSibling];
  inputEl.placeholder = `Talk to ${NAME_MAP[activeSibling]}...`;
  document.querySelectorAll('.sibling-avatar-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sibling === activeSibling);
  });

  if (siblingStatus) siblingStatus.textContent = 'online';

  // Get greeting (only for returning users — first-run already got first-message)
  if (!needsOnboarding) {
    const greeting = await apiGet('/api/greeting');
    if (greeting) {
      addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
      addMessage(greeting.greeting, activeSibling);
      if (moodLabel) moodLabel.textContent = `Feeling ${MOOD_DISPLAY[(greeting.mood_hint || '').toLowerCase()] || greeting.mood_hint}`;
    }
  }

  await refreshStatus();
  loadSiblingStatuses();

  updateTime();
  setInterval(updateTime, 1000);
  setInterval(refreshStatus, 30000);
  setInterval(loadSiblingStatuses, 300000);
  startNudgePolling();
}

// ─── Save on close ───
window.addEventListener('beforeunload', async () => { if (isConnected) await apiPost('/api/save'); });

boot();
