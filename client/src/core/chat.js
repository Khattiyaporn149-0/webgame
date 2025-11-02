// chat.js — chatbox, bubble, input control (fixed/improved)
// NOTE: หลีกเลี่ยง circular import กับ core.js โดยรับ state ผ่าน initChat()

// ดึงรหัสห้องจาก URL หรือ localStorage
const params = new URLSearchParams(window.location.search);
const roomCode =
  params.get("code") ||
  (JSON.parse(localStorage.getItem("currentRoom") || "{}").code) ||
  "lobby01";

// state ที่จะถูกฉีดเข้ามาจาก core.js เพื่อเลี่ยง TDZ
let _state = null;

let _isTyping = false;
export const isTyping = () => _isTyping;

let lastSentAt = 0;
let lastMsg = '';
const renderedMessageIds = new Set(); // tracks `${uid}:${msgKey}` already rendered as bubble
function makeMsgId(uid, key, ts, explicitId){
  if (explicitId && typeof explicitId === 'string') return explicitId;
  if (key) return `${uid}:${key}`;
  return `${uid}:${ts || ''}`;
}
// Typing indicator helpers
const typingBubbles = new Map(); // uid -> typing bubble DOM
let _typingLastWrite = 0;        // throttle writes to DB
let _typingExpiryTimer = null;   // local auto-off timer
const TYPING_DEBOUNCE_MS = 600; // reduce RTDB spam while typing
const TYPING_EXPIRE_MS = 1800;
const TYPING_MAX_LEN = 60;
// Send throttling
const SEND_MIN_INTERVAL_MS = 300;   // min interval between sends (lower to reduce perceived delay)
const SAME_TEXT_SUPPRESS_MS = 1200; // suppress identical text re-sends quickly
const _lastTextSentAt = new Map();  // text -> ts

function qs(id){ return document.getElementById(id); }

// เปิดแชทด้วย Enter (เฉพาะตอนที่ event ไม่ได้มาจาก input/textarea/contenteditable)
function tryOpenChatOnEnter(e, input){
  if (e.key !== 'Enter') return;
  const t = e.target;
  // ถ้ามาจาก input/textarea หรือ contenteditable ไม่ต้องทำอะไร
  if (t === input || t?.isContentEditable || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
  e.preventDefault();
  input.focus();
}

export function initChat(stateRef){
  // ผูก state จาก core.js เมื่อถูกเรียกใช้งาน
  _state = stateRef || _state;
  if (_state) {
    _state.currentRoom = roomCode;
  }
  // ติดตามแชทแบบเรียลไทม์จาก Firebase แยกเป็นผู้เล่นในห้อง: lobbies/<room>/players/<uid>/chat
  let initialLoaded = false;
  let lastMaxTs = 0;
  try {
    (async () => {
      const fb = await import('../services/firebase.js');
      const { rtdb, ref, onValue } = fb;
      const playersRef = ref(rtdb, `lobbies/${_state?.currentRoom || roomCode}/players`);
      onValue(playersRef, (snap) => {
        const players = snap.exists() ? snap.val() : {};
        // รวมข้อความจากทุก players/<uid>/chat
        const arr = [];
        for (const [uidK, p] of Object.entries(players)){
          const chat = (p && p.chat) ? p.chat : {};
          for (const [key, m] of Object.entries(chat)){
            if (!m || !m.text) continue;
              arr.push({
                key,
                uid: m.uid || uidK,
                name: m.name || (p && p.name) || 'Unknown',
                text: m.text,
                ts: m.ts || 0,
                x: m.x, y: m.y,
                color: (p && p.color) ? p.color : (m.color || null),
                id: makeMsgId(m.uid || uidK, key, m.ts || 0, m.id)
              });
          }
        }
        arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
        const recent = arr.slice(-100);

        // แสดงในกล่องข้อความ
        const messages = document.getElementById('chat-messages');
        if (messages){
          messages.innerHTML = '';
          // render list without duplicates (use uid:key)
          const seenList = new Set();
          recent.forEach(m => {
            const id = `${m.uid}:${m.key || m.ts}`;
            if (seenList.has(id)) return;
            seenList.add(id);
            addChatMessage(m.name || 'Unknown', m.text || '', m.color || null);
          });
        }
        // Bubble เฉพาะข้อความใหม่หลังโหลดครั้งแรก
        const newMax = recent.reduce((mx, m) => Math.max(mx, m.ts || 0), lastMaxTs);
        if (initialLoaded){
          recent.filter(m => (m.ts || 0) > lastMaxTs)
                .forEach(m => {
                  const id = m.id || makeMsgId(m.uid, m.key, m.ts);
                  if (renderedMessageIds.has(id)) return;
                  try {
                    enqueueBubble({ uid: m.uid, text: m.text, x: m.x, y: m.y, color: m.color, ts: m.ts });
                    renderedMessageIds.add(id);
                  } catch (e) {}
                });
        }
        // Backfill last 20 unseen to cover timing gaps
        if (initialLoaded){
          try {
            recent.slice(-20).forEach(m => {
              const id = m.id || makeMsgId(m.uid, m.key, m.ts);
              if (renderedMessageIds.has(id)) return;
              enqueueBubble({ uid: m.uid, text: m.text, x: m.x, y: m.y, color: m.color, ts: m.ts });
              renderedMessageIds.add(id);
            });
          } catch (e) {}
        }
        lastMaxTs = newMax;
        initialLoaded = true;

        // Show typing bubbles ("...") for players with recent typing flag
        try {
          const now = Date.now();
          for (const [uidK, p] of Object.entries(players)){
            const typing = p && p.typing;
            const active = typing && typing.on && (now - (typing.ts || 0) < TYPING_EXPIRE_MS);
            if (active) showTypingBubble(uidK, (p && p.color) ? p.color : null);
            else hideTypingBubble(uidK);
          }
          // no chat-box typing indicator; we only show head bubbles
        } catch (e) {}
      });
    })();
  } catch (e) {}
  const input = qs('chat-input');
  const messages = qs('chat-messages');
  const hint = qs('chat-hint');
  if (!input || !messages) return;

  if (hint) hint.textContent = '💬 กด Enter เพื่อเปิดแชท';

  // ใช้ capture = true เพื่อให้ตัวนี้รันก่อน target; และเราจะข้ามเมื่อ event มาจาก input อยู่แล้ว
  const openHandler = (e) => tryOpenChatOnEnter(e, input);
  document.addEventListener('keydown', openHandler, true);
  

  // Low-latency socket echo so other players instantly see chat bubbles
  (function ensureSocketChatBinding(){
    function bind(sock){
      if (!sock || sock._chatBound) return false;
      try {
        sock.on('chat:message', (msg={}) => {
          try {
            if (!msg || !msg.text) return;
            const room = _state?.currentRoom || roomCode;
            if (msg.room && msg.room !== room) return;
            // Ignore our own echo; we already rendered locally
            if (_state && msg.uid === _state.uid) return;
            const id = msg.id || `${msg.uid}:${msg.ts || ''}`;
            if (renderedMessageIds.has(id)) return; // avoid duplicates with Firebase onValue
            addChatMessage(msg.name || 'Unknown', String(msg.text), msg.color || null);
            try { if (msg.uid) hideTypingBubble(msg.uid); } catch (e) {}
            // Render immediately for remote messages to minimize visible delay
            try { renderChatBubbleFor({ uid: msg.uid, text: String(msg.text), color: msg.color || null, ts: msg.ts, id: msg.id }); } catch (e) {}
            // nothing to do in chat box; indicator only on head bubble
          } catch (e) {}
        });
        sock._chatBound = true;
        return true;
      } catch (e) { return false; }
    }
    try { if (bind(window.socket)) return; } catch (e) {}
    const iv = setInterval(() => {
      try { if (bind(window.socket)) clearInterval(iv); } catch (e) {}
    }, 500);
  })();

  // Broadcast typing state while user is entering text
  input.addEventListener('input', () => {
    const raw = input.value || '';
    const text = raw.slice(0, TYPING_MAX_LEN);
    const hasText = Boolean(text.trim().length > 0);
    try {
      setTyping(hasText);
      // Optimistically show our own typing bubble for responsiveness
      if (_state?.uid) showTypingBubble(_state.uid, (_state?.playerColor || null));
    } catch (e) {}
  });
  input.addEventListener('focus', () => { try { setTyping(true); } catch (e) {} });
  input.addEventListener('blur',  () => { try { setTyping(false); } catch (e) {} });

  input.addEventListener('focus', () => {
    _isTyping = true;
    if (hint) hint.textContent = '⌨️ พิมพ์แล้วกด Enter เพื่อส่ง • Esc เพื่อออก';
    // เคลียร์ปุ่มเดินค้าง
    if (_state) Object.keys(_state.keysPressed).forEach(k => _state.keysPressed[k] = false);
  });

  input.addEventListener('blur', () => {
    _isTyping = false;
    if (hint) hint.textContent = '💬 กด Enter เพื่อเปิดแชท';
    if (_state) Object.keys(_state.keysPressed).forEach(k => _state.keysPressed[k] = false);
  });

  // ส่งด้วย Enter / ออกด้วย Esc
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();     // กันไม่ให้ document โฟกัสกลับ
      input.blur();
      return;
    }
    if (e.key !== 'Enter') return;

    e.preventDefault();
    e.stopPropagation();       // กันไม่ให้ document โฟกัสกลับ

    const text = input.value.trim();
    // ว่าง → ออกจากแชท
    if (!text) { input.blur(); return; }

    // กันส่งรัวๆ
    const now = performance.now();
    if (now - lastSentAt < SEND_MIN_INTERVAL_MS) return;
    const prevSame = _lastTextSentAt.get(text) || 0;
    if (now - prevSame < SAME_TEXT_SUPPRESS_MS) return;
    _lastTextSentAt.set(text, now);
    lastSentAt = now;

    lastMsg = text;
    const payload = {
      uid: _state?.uid, 
      name: _state?.displayName, 
      text,
      room: _state?.currentRoom || 'lobby01',
      ts: Date.now(),
    };
    try { payload.id = `${payload.uid}:${payload.ts}:${Math.random().toString(36).slice(2,6)}`; } catch (e) {}

    // บันทึกลง Firebase (source of truth) แยกเป็นต่อผู้เล่นในห้อง
    try {
      (async () => {
        const fb = await import('../services/firebase.js');
        const { rtdb, ref, push } = fb;
        const newRef = await push(ref(rtdb, `lobbies/${payload.room}/players/${payload.uid}/chat`), payload);
        // mark as rendered by id to avoid onValue rendering the same bubble again
        try {
          const id = payload.id || `${payload.uid}:${newRef?.key || payload.ts}`;
          renderedMessageIds.add(id);
        } catch (e) {}
      })();
    } catch (e) {}

    // Also emit via socket for peers to see immediately
    try { if (window.socket?.emit) window.socket.emit('chat:message', payload); } catch (e) {}

    // Show immediately for responsiveness
    addChatMessage(_state?.displayName || 'You', text, null);
    // Hide typing and render our own bubble with same id as server echo
    try { hideTypingBubble(_state?.uid); } catch (e) {}
    try { renderChatBubbleFor({ uid: _state?.uid, x: _state?.playerX, y: _state?.playerY, text, color: null, ts: payload.ts, id: payload.id }); } catch (e) {}

    input.value = '';
    input.blur();
    try { setTyping(false); hideTypingBubble(_state?.uid); } catch (e) {}
  });

  // ลูกศรขึ้น = recall ข้อความล่าสุด (ถ้าช่องว่าง)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && !input.value) {
      e.preventDefault();
      input.value = lastMsg || '';
      // ย้าย caret ไปท้ายสุด
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    }
  });

  // ไม่ต้องฟังผ่าน socket สำหรับแชทอีกต่อไป (ใช้ Firebase onValue แทน)
}

function addChatMessage(name, text, color){
  const messages = document.getElementById('chat-messages');
  if (!messages) return;
  const el = document.createElement('div');
  el.innerHTML = `<strong>${name}:</strong> ${text}`;
  if (color) el.style.color = color;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

import { getRemotePlayerWorldXY } from './multiplayer.js';

// Queue new bubbles per user and render via rAF to avoid burst/reflow
const pendingBubbles = new Map(); // uid -> Array<data>
let _bubbleRaf = 0;
function enqueueBubble(data){
  try {
    const uid = data?.uid;
    if (!uid) return;
    const arr = pendingBubbles.get(uid) || [];
    arr.push(data);
    pendingBubbles.set(uid, arr);
    if (!_bubbleRaf) _bubbleRaf = requestAnimationFrame(drainBubbleQueues);
  } catch (e) {}
}
function drainBubbleQueues(){
  _bubbleRaf = 0;
  let more = false;
  try {
    for (const [uid, arr] of pendingBubbles.entries()){
      if (!arr || !arr.length) continue;
      // sort by ts to keep stable order
      arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
      const next = arr.shift();
      try { renderChatBubbleFor(next); } catch (e) {}
      if (arr.length) more = true;
      pendingBubbles.set(uid, arr);
    }
  } catch (e) {}
  if (more) _bubbleRaf = requestAnimationFrame(drainBubbleQueues);
}

const activeBubbles = new Map(); // uid -> array of bubble DOM elements
const MAX_BUBBLES_PER_PLAYER = 5;
const BUBBLE_TTL_MS = 10000; // keep bubbles longer for visible stacking
const BUBBLE_Y_SPACING = 22;

function renderChatBubbleFor(data) {
  // Avoid rendering the same message twice (if we have a message id/key)
  const idKey = data.id || `${data.uid}:${data.key || data.ts || 'no-key'}`;
  if (renderedMessageIds.has(idKey)) return;
  renderedMessageIds.add(idKey);
  const isLocal = _state ? (data.uid === _state.uid) : false;
  let worldX = data.x;
  let worldY = data.y;

  // ถ้าเป็น remote player → เอาค่า position ล่าสุดจาก multiplayer
  if (!isLocal) {
    const pos = getRemotePlayerWorldXY(data.uid);
    if (pos) {
      worldX = pos.x;
      worldY = pos.y;
    }
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble show';
  bubble.textContent = data.text;

  // ✅ เก็บ stack ของแต่ละผู้เล่น
  if (!activeBubbles.has(data.uid)) activeBubbles.set(data.uid, []);
  const stack = activeBubbles.get(data.uid);
  // newest bubble should be at the bottom ⇒ keep it at index 0
  stack.unshift(bubble);

  // จำกัดจำนวนฟองสูงสุด (กันรก)
  if (stack.length > MAX_BUBBLES_PER_PLAYER) {
    // remove the oldest (now at the end)
    const old = stack.pop();
    if (old?._raf) cancelAnimationFrame(old._raf);
    old.remove();
  }

  document.body.appendChild(bubble);

  // ✅ ฟังก์ชันอัปเดตตำแหน่ง
  function updatePos() {
    // world pos ล่าสุด
    if (isLocal && _state) {
      worldX = _state.playerX;
      worldY = _state.playerY;
    } else {
      const pos = getRemotePlayerWorldXY(data.uid);
      if (pos) { worldX = pos.x; worldY = pos.y; }
    }

    const cx = Number(_state?.containerX) || 0;
    const cy = Number(_state?.containerY) || 0;
    const halfW = (_state?.playerW ?? 128) / 2;
    const baseX = worldX + cx + halfW;
    const baseY = worldY + cy - 20;

    const index = stack.indexOf(bubble);
    const typingBelow = typingBubbles && typingBubbles.has && typingBubbles.has(data.uid) ? 1 : 0;
    const offsetY = (index + typingBelow) * BUBBLE_Y_SPACING;

    bubble.style.left = `${baseX}px`;
    bubble.style.top = `${baseY - offsetY}px`;

    bubble._raf = requestAnimationFrame(updatePos);
  }

  updatePos(); // ✅ เริ่ม loop ทันที

  // ✅ fade out + ลบออกจาก stack
  setTimeout(() => {
    bubble.style.opacity = '0';
    bubble.style.transform = 'translate(-50%, -140%)';
    setTimeout(() => {
      cancelAnimationFrame(bubble._raf);
      bubble.remove();
      const i = stack.indexOf(bubble);
      if (i >= 0) stack.splice(i, 1);
    }, 400);
  }, BUBBLE_TTL_MS);
}

// --- Typing indicator helpers ---
function showTypingBubble(uid, color){
  try {
    let el = typingBubbles.get(uid);
    if (!el){
      el = document.createElement('div');
      el.className = 'chat-bubble show';
      el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
      if (color) el.style.color = color;
      document.body.appendChild(el);
      typingBubbles.set(uid, el);
      const update = () => {
        try {
          let worldX = 0, worldY = 0;
          const isLocal = _state && uid === _state.uid;
          if (isLocal) { worldX = _state.playerX; worldY = _state.playerY; }
          else {
            const pos = getRemotePlayerWorldXY(uid);
            if (pos) { worldX = pos.x; worldY = pos.y; }
          }
          const cx = Number(_state?.containerX) || 0;
          const cy = Number(_state?.containerY) || 0;
          const halfW = (_state?.playerW ?? 128) / 2;
          el.style.left = `${worldX + cx + halfW}px`;
          el.style.top = `${worldY + cy - 24}px`;
        } catch (e) {}
        el._raf = requestAnimationFrame(update);
      };
      el._raf = requestAnimationFrame(update);
    }
    // update content and color on subsequent calls
    el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    if (color) el.style.color = color;
    el.style.opacity = '1';
  } catch (e) {}
}

function hideTypingBubble(uid){
  const el = typingBubbles.get(uid);
  if (!el) return;
  try { cancelAnimationFrame(el._raf); } catch (e) {}
  el.remove();
  typingBubbles.delete(uid);
}

function setTyping(on){
  const now = Date.now();
  if (on && (now - _typingLastWrite) < TYPING_DEBOUNCE_MS) return;
  _typingLastWrite = now;
  try {
    (async () => {
      const fb = await import('../services/firebase.js');
      const { rtdb, ref, update } = fb;
      const uid = _state?.uid;
      const room = _state?.currentRoom || roomCode;
      if (!uid || !room) return;
      const payload = { on: !!on, ts: now };
            await update(ref(rtdb, `lobbies/${room}/players/${uid}`), { typing: payload });
    })();
  } catch (e) {}
  if (_typingExpiryTimer) clearTimeout(_typingExpiryTimer);
  if (on) _typingExpiryTimer = setTimeout(() => setTyping(false), TYPING_EXPIRE_MS);
}










