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
// Typing indicator helpers
const typingBubbles = new Map(); // uid -> typing bubble DOM
let _typingLastWrite = 0;        // throttle writes to DB
let _typingExpiryTimer = null;   // local auto-off timer
const TYPING_DEBOUNCE_MS = 300;
const TYPING_EXPIRE_MS = 1800;
const TYPING_MAX_LEN = 60;

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
                  const id = `${m.uid}:${m.key || m.ts}`;
                  if (renderedMessageIds.has(id)) return;
                  try {
                    renderChatBubbleFor({ uid: m.uid, text: m.text, x: m.x, y: m.y, color: m.color });
                    renderedMessageIds.add(id);
                  } catch (e) {}
                });
        }
        lastMaxTs = newMax;
        initialLoaded = true;

        // Show typing bubbles ("...") for players with recent typing flag
        try {
          const now = Date.now();
          for (const [uidK, p] of Object.entries(players)){
            const typing = p && p.typing;
            const active = typing && typing.on && (now - (typing.ts || 0) < TYPING_EXPIRE_MS);
            if (active) showTypingBubble(uidK, p?.color || null, String(typing.text || ''));
            else hideTypingBubble(uidK);
          }
        } catch {}
      });
    })();
  } catch {}
  const input = qs('chat-input');
  const messages = qs('chat-messages');
  const hint = qs('chat-hint');
  if (!input || !messages) return;

  if (hint) hint.textContent = '💬 กด Enter เพื่อเปิดแชท';

  // ใช้ capture = true เพื่อให้ตัวนี้รันก่อน target; และเราจะข้ามเมื่อ event มาจาก input อยู่แล้ว
  const openHandler = (e) => tryOpenChatOnEnter(e, input);
  document.addEventListener('keydown', openHandler, true);

  // Broadcast typing state while user is entering text
  input.addEventListener('input', () => {
    const raw = input.value || '';
    const text = raw.slice(0, TYPING_MAX_LEN);
    const hasText = Boolean(text.trim().length > 0);
    try {
      setTyping(hasText, text);
      // Optimistically show our own typing bubble for responsiveness
      if (_state?.uid) showTypingBubble(_state.uid, null, text);
    } catch {}
  });
  input.addEventListener('focus', () => { try { setTyping(true); } catch {} });
  input.addEventListener('blur',  () => { try { setTyping(false); } catch {} });

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
    if (now - lastSentAt < 250) return;
    lastSentAt = now;

    lastMsg = text;
    const payload = {
      uid: _state?.uid, 
      name: _state?.displayName, 
      text,
      room: _state?.currentRoom || 'lobby01',
      ts: Date.now(),
    };

    // บันทึกลง Firebase (source of truth) แยกเป็นต่อผู้เล่นในห้อง
    try {
      (async () => {
        const fb = await import('../services/firebase.js');
        const { rtdb, ref, push } = fb;
        const newRef = await push(ref(rtdb, `lobbies/${payload.room}/players/${payload.uid}/chat`), payload);
        // mark as rendered by id to avoid onValue rendering the same bubble again
        try { const msgKey = newRef?.key || null; if (msgKey) renderedMessageIds.add(`${payload.uid}:${msgKey}`); } catch {}
      })();
    } catch {}

    // Show immediately for responsiveness
    addChatMessage(_state?.displayName || 'You', text, null);
    // Mark a short-lived placeholder id so we don't double render if onValue fires fast
    try {
      renderChatBubbleFor({ uid: _state?.uid, x: _state?.playerX, y: _state?.playerY, text, color: null });
    } catch (e) {}

    input.value = '';
    input.blur();
    try { setTyping(false, ''); hideTypingBubble(_state?.uid); } catch {}
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

const activeBubbles = new Map(); // uid -> array of bubble DOM elements
const MAX_BUBBLES_PER_PLAYER = 5;
const BUBBLE_TTL_MS = 10000; // keep bubbles longer for visible stacking
const BUBBLE_Y_SPACING = 22;

function renderChatBubbleFor(data) {
  // Avoid rendering the same message twice (if we have a message id/key)
  const idKey = `${data.uid}:${data.key || data.ts || 'no-key'}`;
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
  stack.push(bubble);

  // จำกัดจำนวนฟองสูงสุด (กันรก)
  if (stack.length > MAX_BUBBLES_PER_PLAYER) {
    const old = stack.shift();
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
    const offsetY = index * BUBBLE_Y_SPACING;

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
function showTypingBubble(uid, color, text){
  try {
    let el = typingBubbles.get(uid);
    if (!el){
      el = document.createElement('div');
      el.className = 'chat-bubble show';
      el.textContent = (text && String(text).length) ? String(text).slice(0, TYPING_MAX_LEN) : '...';
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
        } catch {}
        el._raf = requestAnimationFrame(update);
      };
      el._raf = requestAnimationFrame(update);
    }
    // update content and color on subsequent calls
    el.textContent = (text && String(text).length) ? String(text).slice(0, TYPING_MAX_LEN) : '...';
    if (color) el.style.color = color;
    el.style.opacity = '1';
  } catch {}
}

function hideTypingBubble(uid){
  const el = typingBubbles.get(uid);
  if (!el) return;
  try { cancelAnimationFrame(el._raf); } catch {}
  el.remove();
  typingBubbles.delete(uid);
}

function setTyping(on, text){
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
      if (on && typeof text === 'string') payload.text = text.slice(0, TYPING_MAX_LEN);
      await update(ref(rtdb, `lobbies/${room}/players/${uid}`), { typing: payload });
    })();
  } catch {}
  if (_typingExpiryTimer) clearTimeout(_typingExpiryTimer);
  if (on) _typingExpiryTimer = setTimeout(() => setTyping(false, ''), TYPING_EXPIRE_MS);
}




