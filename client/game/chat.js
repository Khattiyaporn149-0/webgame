// chat.js — chatbox, bubble, input control (fixed/improved)
import { state } from './core.js';
import { socket } from './multiplayer.js';

let _isTyping = false;
export const isTyping = () => _isTyping;

let lastSentAt = 0;
let lastMsg = '';

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

export function initChat(){
  const input = qs('chat-input');
  const messages = qs('chat-messages');
  const hint = qs('chat-hint');
  if (!input || !messages) return;

  if (hint) hint.textContent = '💬 กด Enter เพื่อเปิดแชท';

  // ใช้ capture = true เพื่อให้ตัวนี้รันก่อน target; และเราจะข้ามเมื่อ event มาจาก input อยู่แล้ว
  const openHandler = (e) => tryOpenChatOnEnter(e, input);
  document.addEventListener('keydown', openHandler, true);

  input.addEventListener('focus', () => {
    _isTyping = true;
    if (hint) hint.textContent = '⌨️ พิมพ์แล้วกด Enter เพื่อส่ง • Esc เพื่อออก';
    // เคลียร์ปุ่มเดินค้าง
    Object.keys(state.keysPressed).forEach(k => state.keysPressed[k] = false);
  });

  input.addEventListener('blur', () => {
    _isTyping = false;
    if (hint) hint.textContent = '💬 กด Enter เพื่อเปิดแชท';
    Object.keys(state.keysPressed).forEach(k => state.keysPressed[k] = false);
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
    socket?.emit('chat:message', { uid: state.uid, name: state.displayName, text });
    addChatMessage(state.displayName, text);
    renderChatBubbleFor({ uid: state.uid, x: state.playerX, y: state.playerY, text });

    input.value = '';
    input.blur();
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

  // ขาเข้า
  socket?.on('chat:message', (data) => {
    addChatMessage(data.name, data.text);
    renderChatBubbleFor(data);
  });
}

function addChatMessage(name, text){
  const messages = document.getElementById('chat-messages');
  if (!messages) return;
  const el = document.createElement('div');
  el.innerHTML = `<strong>${name}:</strong> ${text}`;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderChatBubbleFor(data){
  const isLocal = data.uid === state.uid;
  const baseX = (isLocal ? state.playerX : (data.x ?? state.playerX)) + state.containerX + 64;
  const baseY = (isLocal ? state.playerY : (data.y ?? state.playerY)) + state.containerY - 70;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble show';
  bubble.textContent = data.text;
  bubble.style.left = `${baseX}px`;
  bubble.style.top  = `${baseY}px`;
  document.body.appendChild(bubble);

  setTimeout(()=> {
    bubble.style.opacity = '0';
    bubble.style.transform = 'translate(-50%, -160%)';
  }, 4000);
  setTimeout(()=> bubble.remove(), 5000);
}
