/**
 * Sibling AI — Renderer
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
const memConvos = $('mem-convos'), memFacts = $('mem-facts'), memJournals = $('mem-journals');
const timeDisplay = $('time-display'), dateDisplay = $('date-display');
const titlebarName = $('titlebar-name'), titlebarStatus = $('titlebar-status');
const avatarMood = $('avatar-mood-indicator'), avatarLabel = $('avatar-label');

// ─── State ───
let isWaiting = false, isConnected = false, sessionEnded = false;
let activeSibling = 'abi';
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

// ─── Sidebar Toggle ───
const sidebarEl = $('sidebar');
const sidebarBtn = $('btn-sidebar');
if (sidebarBtn) {
  sidebarBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('open');
  });
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

async function getAbiReaction(msgId, text) {
  const r = await apiPost('/api/react', { message: text, sender: 'user' });
  if (r && r.emoji) toggleReaction(msgId, r.emoji, activeSibling);
}

function showThinking() {
  const t = document.createElement('div');
  t.className = 'thinking'; t.id = 'thinking-indicator';
  t.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  messagesEl.appendChild(t);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideThinking() { const t = $('thinking-indicator'); if (t) t.remove(); }

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isWaiting || sessionEnded) return;
  const userMsgId = addMessage(text, 'user');
  inputEl.value = ''; inputEl.style.height = 'auto';
  isWaiting = true; nudgePaused = true; showThinking(); sendBtn.disabled = true;

  const result = await apiPost('/api/chat', { message: text });
  hideThinking(); isWaiting = false; nudgePaused = false; sendBtn.disabled = false;

  if (result) {
    addMessage(result.response, activeSibling);
    updateSidebar(result);
    getAbiReaction(userMsgId, text);
  } else {
    addMessage("*blinks* Can't think right now. Is the brain server running?", activeSibling);
  }
  inputEl.focus();
}

// ─── Sidebar ───
function updateSidebar(data) {
  if (data.dominant_emotion) {
    moodDominant.textContent = data.dominant_emotion;
    moodText.textContent = `Feeling ${data.dominant_emotion}`;
  }
  if (data.energy !== undefined) energyFill.style.width = `${data.energy * 100}%`;
  if (data.emotions) {
    moodEmotions.innerHTML = '';
    Object.entries(data.emotions)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, v]) => v > 0.25)
      .slice(0, 6)
      .forEach(([name, val]) => {
        const tag = document.createElement('span');
        tag.className = `emotion-tag${val > 0.5 ? ' high' : ''}`;
        tag.textContent = `${name} ${(val * 100).toFixed(0)}%`;
        moodEmotions.appendChild(tag);
      });
  }
  if (data.relationship) {
    relOpinion.textContent = data.relationship.label;
    const colors = { love: '#FFB7C5', like: '#A2AE9D', neutral: '#F0B8B8', dislike: '#C75F71', hostile: '#913F4D' };
    avatarMood.style.background = colors[data.relationship.label] || colors.neutral;
  }
  if (data.relationship_details) {
    const d = data.relationship_details;
    const setBar = (sel, val) => { const el = document.querySelector(sel); if (el) el.style.width = `${val * 100}%`; };
    setBar('.rel-trust', d.trust); setBar('.rel-fondness', d.fondness);
    setBar('.rel-respect', d.respect); setBar('.rel-comfort', d.comfort);
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
    memConvos.textContent = s.memory_stats.total_conversations || 0;
    memJournals.textContent = s.memory_stats.total_journal_entries || 0;
  }
  // Get fact count from memory endpoint
  const mem = await apiGet('/api/memory');
  if (mem) memFacts.textContent = mem.fact_count || 0;
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
  inputEl.placeholder = `Talk to ${name}...`;
  sessionEnded = false;
  $('end-chat-btn').disabled = false;
  $('end-chat-btn').textContent = 'End Chat';
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
    addMessage(greeting.greeting, newId);
    moodText.textContent = `Feeling ${greeting.mood_hint}`;
    addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
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

// ─── Time Widget ───
function updateTime() {
  const now = new Date();
  timeDisplay.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dateDisplay.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const hour = now.getHours();
  if (hour >= 6 && hour < 18) {
    document.body.classList.add('daytime');
    document.body.classList.remove('nighttime');
  } else {
    document.body.classList.add('nighttime');
    document.body.classList.remove('daytime');
  }
}

// ─── Input ───
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; });
sendBtn.addEventListener('click', sendMessage);

// GIF button
const gifBtn = $('gif-btn');
if (gifBtn) {
  gifBtn.addEventListener('click', () => {
    const picker = $('gif-picker');
    if (picker) { picker.classList.toggle('open'); if (picker.classList.contains('open')) $('gif-search').focus(); }
  });
}
document.addEventListener('click', e => {
  const picker = $('gif-picker');
  if (picker && picker.classList.contains('open') && !picker.contains(e.target) && e.target !== gifBtn) picker.classList.remove('open');
});

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
}

$('settings-save').addEventListener('click', async () => {
  const data = {};
  Object.entries(PROFILE_FIELDS).forEach(([elId, key]) => { const el = $(elId); if (el) data[key] = el.value.trim(); });
  data.onboarding_complete = true; // preserve onboarding flag
  // Get colorblind mode from toggles instead of dropdown
  data.colorblind_mode = updateColorblindFromToggles();
  $('settings-save').disabled = true; $('settings-save').textContent = 'Saving...';
  const r = await apiPost('/api/profile', data);
  $('settings-save').disabled = false; $('settings-save').textContent = 'Save Profile';
  // Apply colorblind mode immediately
  applyColorblind(data.colorblind_mode);
  const status = $('settings-status');
  status.textContent = r && r.saved ? 'Saved!' : 'Failed to save.';
  setTimeout(() => { status.textContent = ''; }, 3000);
});

// ─── Reset Buttons ───
document.querySelectorAll('.reset-btn').forEach(btn => {
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

// ─── End Chat ───
const endChatBtn = $('end-chat-btn');
async function endChat() {
  if (sessionEnded || !isConnected) return;
  endChatBtn.disabled = true; endChatBtn.textContent = 'Saving...';
  addSystemMessage(`Ending conversation... ${NAME_MAP[activeSibling]} is reflecting.`);
  inputEl.disabled = true; sendBtn.disabled = true;

  const r = await apiPost('/api/save');
  sessionEnded = true;
  stopNudgePolling();
  endChatBtn.textContent = 'Session Ended';
  endChatBtn.classList.add('ended');
  inputEl.placeholder = 'Session ended. Switch siblings or restart to chat again.';
  addSystemMessage(r && r.reflection ? `Session saved. ${NAME_MAP[activeSibling]} wrote a reflection.` : 'Session saved.');
  await refreshStatus();
  await loadMemoryData();
  titlebarStatus.textContent = 'session ended';
}
endChatBtn.addEventListener('click', endChat);

// ─── Memory Dropdown ───
const memToggle = $('memory-toggle-btn'), memDropdown = $('memory-dropdown');
memToggle.addEventListener('click', async () => {
  const open = memDropdown.classList.toggle('open');
  memToggle.innerHTML = open ? 'View Memories &#9652;' : 'View Memories &#9662;';
  if (open) await loadMemoryData();
});
document.querySelectorAll('.mem-section-header').forEach(h => {
  h.addEventListener('click', () => {
    const content = $(`mem-${h.dataset.section}-list`);
    const open = content.classList.toggle('open');
    h.classList.toggle('expanded', open);
    h.innerHTML = h.innerHTML.replace(/[\u25B8\u25BE]/, open ? '\u25BE' : '\u25B8');
  });
});

async function loadMemoryData() {
  const mem = await apiGet('/api/memory');
  if (!mem) return;

  const factsList = $('mem-facts-list');
  factsList.innerHTML = '';
  let hasFacts = false;
  if (mem.facts) {
    Object.entries(mem.facts).forEach(([cat, items]) => {
      if (items && typeof items === 'object') {
        Object.entries(items).forEach(([key, val]) => {
          hasFacts = true;
          const d = document.createElement('div'); d.className = 'mem-item';
          d.innerHTML = `<span class="mem-key">${key}:</span> ${val.value || val}`;
          factsList.appendChild(d);
        });
      }
    });
  }
  if (!hasFacts) factsList.innerHTML = '<div class="mem-empty">No facts stored yet.</div>';

  const opList = $('mem-opinions-list');
  opList.innerHTML = '';
  if (mem.opinions && Object.keys(mem.opinions).length) {
    Object.entries(mem.opinions).forEach(([topic, data]) => {
      const d = document.createElement('div'); d.className = 'mem-item';
      d.innerHTML = `<span class="mem-key">${topic}:</span> ${typeof data === 'object' && data.opinion ? data.opinion : data}`;
      opList.appendChild(d);
    });
  } else opList.innerHTML = '<div class="mem-empty">No opinions formed yet.</div>';

  $('mem-patterns-list').innerHTML = '<div class="mem-empty">Patterns are tracked internally.</div>';
}

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

// Wire up sibling card selection (step 6)
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
    addMessage(greeting.greeting, activeSibling);
    moodText.textContent = `Feeling ${greeting.mood_hint}`;
    addSystemMessage(`Conversation #${greeting.conversation_number} | ${greeting.time_of_day}`);
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
