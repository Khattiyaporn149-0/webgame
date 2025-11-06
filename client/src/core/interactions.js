// interactions.js — missions + world objects + meeting
import { CONST, state, refs } from './core.js';
import { getRole } from './roles.js';
import { openMinigameForObject } from './minigames.js';
import { getCurrentPlayers } from './multiplayer.js';


// --- Endgame trigger (safe, single-file; dynamic import overlay) ---
// เพิ่มใหม่: ระบบจบเกม (เมื่อภารกิจครบ 100%) — 2025-10-13 21:14:26 +07:00
let __endFired = false;
function endGame(detail){
  if (__endFired) return; __endFired = true;
  try {
    // freeze movement softly and pause bgm
    state.isMeetingActive = true;
    Object.keys(state.keysPressed || {}).forEach(k => state.keysPressed[k] = false);
    refs.bgmMusic?.pause();
  } catch {}
  // notify listeners (harmless if none)
  try { window.dispatchEvent(new CustomEvent('game:end', { detail })); } catch {}
  // best-effort show overlay; won't crash if file missing
  try {
    import('./endgame.js')
      .then(m => (m?.showEnd || m?.default || (()=>{}))(detail))
      .catch(()=>{});
  } catch {}
}

export const MISSION_SPOTS_DATA = [
  { id:'mission-guest',   type:'guest',   x:1500, y:7000, width:90, height:90 },
  // เพิ่มใหม่: ย้าย Heist มาไว้ในห้องด้านบน/กลางของแผนที่ (กะตำแหน่งให้เดินทดสอบง่าย) — 2025-10-13 22:15:00 +07:00
  { id:'mission-heist',   type:'heist',   x:4000, y:3000, width:90, height:90 },
  { id:'mission-meeting', type:'meeting', x:4000, y:4000, width:150, height:150 },
  { id:'mission-cctv',    type:'Open_CCTV', x:6000, y:6000, width:90, height:90 },
];

// เพิ่มใหม่: รองรับ override ตำแหน่ง mission spot ผ่าน query (?heist=4000,4000 เป็นต้น)
// 2025-10-13 22:10:00 +07:00 — เพื่อให้ทดสอบได้เร็วโดยไม่ต้องแก้โค้ดซ้ำ
try {
  const qs = new URLSearchParams(location.search);
  const clampXY = (x, y) => ({
    x: Math.max(0, Math.min(CONST.CONTAINER_WIDTH  - 1, x|0)),
    y: Math.max(0, Math.min(CONST.CONTAINER_HEIGHT - 1, y|0)),
  });
  const setPos = (id, x, y) => {
    const spot = MISSION_SPOTS_DATA.find(s => s.id === id);
    if (spot) { spot.x = x; spot.y = y; }
  };
  const parse = (v) => {
    const [sx, sy] = String(v||'').split(',');
    const x = Number(sx), y = Number(sy);
    return (Number.isFinite(x) && Number.isFinite(y)) ? clampXY(x, y) : null;
  };
  const map = [
    ['guest',   'mission-guest'],
    ['heist',   'mission-heist'],
    ['meeting', 'mission-meeting'],
    ['cctv',    'mission-cctv'],
  ];
  for (const [qkey, id] of map) {
    const v = qs.get(qkey);
    if (!v) continue; const p = parse(v); if (!p) continue; setPos(id, p.x, p.y);
  }
} catch {}

function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

function setMissionUI(){
  // ✅ ใช้ระบบภารกิจใหม่ (รองรับทั้ง Visitor และ Thief)
  if (!state.myRole) return;
  
  const completed = state.myCompletedTasks.length;
  const total = 8;
  const pct = Math.round((completed / total) * 100);
  
  if (refs.missionBarFill) {
    refs.missionBarFill.style.width = `${pct}%`;
    // ✅ Thief ใช้สีแดง, Visitor ใช้สีเขียว
    if (state.myRole === 'Thief') {
      refs.missionBarFill.style.background = 'linear-gradient(90deg, #ff0000, #cc0000)';
    } else {
      refs.missionBarFill.style.background = 'linear-gradient(90deg, #4CAF50, #2E7D32)';
    }
  }
  // ✅ ไม่แสดงตัวเลข (จะลบ element ในขั้นถัดไป)
  if (refs.missionText) refs.missionText.textContent = '';
}

export function refreshMissionUI(){
  setMissionUI();
}

// ===============================
// World Task Hints (pulsing markers on assigned tasks)
// ===============================
let _taskHintEls = new Map(); // mg -> HTMLElement
let _taskHintStyleInjected = false;
function ensureTaskHintStyle(){
  if (_taskHintStyleInjected) return; _taskHintStyleInjected = true;
  try {
    const css = `
    @keyframes taskPulse { 0%{ transform: translate(-50%, -100%) scale(0.9); opacity: .8 } 50%{ transform: translate(-50%, -100%) scale(1.1); opacity: 1 } 100%{ transform: translate(-50%, -100%) scale(0.9); opacity: .8 } }
    .task-marker{ position:absolute; width:22px; height:22px; border-radius:50%; background:rgba(255, 221, 0, .9); box-shadow:0 0 10px rgba(255,221,0,.8), 0 0 18px rgba(255,221,0,.6); pointer-events:none; z-index:500; animation: taskPulse 1.2s infinite; border:2px solid #000; }
    .task-marker::after{ content:''; position:absolute; left:50%; top:50%; width:6px; height:6px; background:#000; border-radius:50%; transform:translate(-50%, -50%); }
    .task-marker.thief-marker{ background:rgba(255, 50, 50, .9); box-shadow:0 0 10px rgba(255,50,50,.8), 0 0 18px rgba(255,50,50,.6); border:2px solid #440000; }
    .task-marker.thief-marker::after{ background:#fff; }
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  } catch {}
}

export function updateTaskWorldHints(){
  try {
    // ✅ รองรับทั้ง Visitor และ Thief
    if (!state.myRole || (state.myRole !== 'Visitor' && state.myRole !== 'Thief')) return;
    ensureTaskHintStyle();
    const gc = document.getElementById('game-container');
    if (!gc) return;

    // ต้องมีเฉพาะ task ที่ปลดล็อคและยังไม่เสร็จ
    const need = new Set();
    for (const mg of state.myUnlockedTasks){
      if (state.myCompletedTasks.includes(mg)) continue;
      need.add(mg);
      let el = _taskHintEls.get(mg);
      if (!el){ 
        el = document.createElement('div'); 
        // ✅ Thief ใช้สีแดง, Visitor ใช้สีเหลือง
        el.className = state.myRole === 'Thief' ? 'task-marker thief-marker' : 'task-marker';
        gc.appendChild(el); 
        _taskHintEls.set(mg, el); 
      }
      const obj = INTERACTABLE_OBJECTS.find(o => o.mg === mg);
      if (obj){ 
        const r = normRect(obj); 
        const cx = r.x + r.w/2; 
        const cy = r.y; 
        el.style.left = `${cx}px`; 
        el.style.top = `${cy}px`; 
        el.style.display = 'block'; 
        el.title = `Task: ${mg}`; 
      }
    }

    // ซ่อนของที่ไม่อยู่ใน need อีกแล้ว
    for (const [mg, el] of _taskHintEls.entries()){
      if (!need.has(mg)) { el.style.display = 'none'; }
    }
  } catch (e) { /* noop */ }
}

// ===============================
// Gem Heist (Thief) — client-side markers and HUD
// ===============================
let _gemEls = new Map(); // id -> HTMLElement
let _gemStyleInjected = false;
function ensureGemStyle(){
  if (_gemStyleInjected) return; _gemStyleInjected = true;
  try {
    const css = `
    .gem-marker{ position:absolute; width:60px; height:60px; border-radius:50%; background:transparent; box-shadow:0 0 20px rgba(255,50,50,1), 0 0 35px rgba(255,50,50,.8); pointer-events:none; z-index:500; border:4px solid #ff0000; transform: translate(-50%, -100%); animation: gemPulse 1.2s infinite; }
    .gem-marker::after{ content:'💎'; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:36px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    @keyframes gemPulse{ 0%{ transform: translate(-50%, -100%) scale(1); box-shadow:0 0 20px rgba(255,50,50,1), 0 0 35px rgba(255,50,50,.8); } 50%{ transform: translate(-50%, -100%) scale(1.15); box-shadow:0 0 30px rgba(255,50,50,1), 0 0 50px rgba(255,50,50,1); } 100%{ transform: translate(-50%, -100%) scale(1); box-shadow:0 0 20px rgba(255,50,50,1), 0 0 35px rgba(255,50,50,.8); } }
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  } catch {}
}

export function updateThiefGemHUD(){
  try {
    if (state.myRole !== 'Thief') {
      if (refs.thiefGemHud) refs.thiefGemHud.style.display = 'none';
      if (refs.thiefMissionObjective) refs.thiefMissionObjective.style.display = 'none';
      return;
    }
    const gems = Array.isArray(state.gems) ? state.gems : [];
    const total = gems.length || 5;
    const stolen = gems.filter(g => !!g.stolenBy).length;
    if (refs.thiefGemHud){ refs.thiefGemHud.style.display = 'block'; }
    if (refs.thiefGemText){ refs.thiefGemText.textContent = `${stolen} / ${total}`; }
    if (refs.thiefMissionObjective){ refs.thiefMissionObjective.style.display = 'block'; }
  } catch {}
}

// ✨ Visitor Mission Tracker (แบบ Thief) - แสดงความคืบหน้าภารกิจรวมทั้งทีม
export function updateVisitorMissionHUD(){
  try {
    // Hide visitor HUD if not Visitor
    if (state.myRole !== 'Visitor') {
      const vHud = document.getElementById('visitor-task-progress');
      if (vHud) vHud.style.display = 'none';
      // Hide center objective banner for visitor when not visitor
      const obj = document.getElementById('visitor-mission-objective');
      if (obj) obj.style.display = 'none';
      // Restore/hide mission bar for non-visitor
      const missionBar = document.getElementById('mission-status-container');
      if (missionBar) {
        // Thief should not see mission bar
        missionBar.style.display = (state.myRole === 'Thief') ? 'none' : '';
        // Restore default positioning
        missionBar.style.top = '20px';
        missionBar.style.right = '190px';
        missionBar.style.left = '';
        missionBar.style.transform = '';
      }
      return;
    }

    // Compute progress from assigned waves
    const allTasks = Array.isArray(state.myWaves) ? state.myWaves.flat() : [];
    const done = Array.isArray(state.myCompletedTasks) ? state.myCompletedTasks.length : 0;
    const total = allTasks.length || 8; // fallback 8

    // Update new HUD under minimap
    const hud = document.getElementById('visitor-task-progress');
    const txt = document.getElementById('visitor-task-text');
    if (hud) hud.style.display = 'block';
    if (txt) txt.textContent = `Tasks: ${done} / ${total}`;

    // Show center visitor objective banner
    const obj = document.getElementById('visitor-mission-objective');
    if (obj) obj.style.display = 'block';

    // Move mission progress bar under the visitor objective (centered)
    const missionBar = document.getElementById('mission-status-container');
    if (missionBar) {
      missionBar.style.display = 'block';
      missionBar.style.position = 'fixed';
      missionBar.style.top = '120px';
      missionBar.style.left = '50%';
      missionBar.style.right = 'auto';
      missionBar.style.transform = 'translateX(-50%)';
      missionBar.style.zIndex = '1200';
      missionBar.style.width = '350px';
    }
    
  } catch (e) {
    console.error('updateVisitorMissionHUD failed:', e);
  }
}

export function updateGemMarkers(){
  try {
    if (state.myRole !== 'Thief') { for (const [,el] of _gemEls) el.style.display='none'; return; }
    ensureGemStyle();
    const gc = document.getElementById('game-container'); if (!gc) return;
    const list = Array.isArray(state.gems) && state.gems.length ? state.gems : [
      // Fallback local positions match server defaults
      { id:'gem1', x:4300, y:7100, stolenBy:null },
      { id:'gem2', x:7120, y:4260, stolenBy:null },
      { id:'gem3', x:4980, y:7500, stolenBy:null },
      { id:'gem4', x:3570, y:1500, stolenBy:null },
      { id:'gem5', x:6500, y:5000, stolenBy:null },
    ];
    const need = new Set();
    for (const g of list){
      // Skip gems that have been stolen
      if (g.stolenBy) continue;
      need.add(g.id);
      let el = _gemEls.get(g.id);
      if (!el){ el = document.createElement('div'); el.className='gem-marker'; gc.appendChild(el); _gemEls.set(g.id, el); }
      el.style.left = `${g.x}px`; el.style.top = `${g.y}px`;
      el.style.display = 'block';
      el.title = `Gem: ${g.id}`;
    }
    // Hide gems that are stolen or not in current list
    for (const [id, el] of _gemEls.entries()){
      if (!need.has(id)) el.style.display='none';
    }
    updateThiefGemHUD();
  } catch {}
}

export function checkGemInteractions(){
  try {
    // 👻 Ghost ไม่สามารถขโมยอัญมณีได้
    if (state.isGhost) return;
    
    if (state.myRole !== 'Thief') return;
    const gems = Array.isArray(state.gems) && state.gems.length ? state.gems : [
      { id:'gem1', x:4300, y:7100, difficulty:'easy', time:10, stolenBy:null },
      { id:'gem2', x:7120, y:4260, difficulty:'hard', time:20, stolenBy:null },
      { id:'gem3', x:4980, y:7500, difficulty:'easy', time:10, stolenBy:null },
      { id:'gem4', x:3570, y:1500, difficulty:'easy', time:10, stolenBy:null },
      { id:'gem5', x:6500, y:5000, difficulty:'hard', time:20, stolenBy:null },
    ];
    const pcx = state.playerX + state.playerW/2; const pcy = state.playerY + state.playerH/2;
    let target = null;
    for (const g of gems){
      if (g.stolenBy) continue;
      const d = dist(pcx,pcy,g.x,g.y);
      if (d <= CONST.INTERACTION_RADIUS){ target = g; break; }
    }
    if (!refs.interactionHint) return; // no hint label
    if (!target){ return; }
    // Show hint (no cooldown check anymore)
    refs.interactionHint.textContent = '🔓 กด [T] เพื่อเริ่ม Lockpick';
    refs.interactionHint.style.display = 'block';
    if (!state.keysPressed['KeyT']) return;
    state.keysPressed['KeyT'] = false;

    const key = (target.difficulty === 'hard') ? 'lockpick_hard' : 'lockpick_easy';
    openMiniggameForGem(target, key);
  } catch {}
}

function openMiniggameForGem(gem, key){
  try {
    openMinigameForObject({ id: gem.id, mg: key }, {
      onComplete: () => {
        try {
          if (window.socket && window.socket.connected){
            window.socket.emit('gem:steal', { gemId: gem.id });
          }
        } catch {}
        // optimistic UI: hide marker until server sync
        const el = _gemEls.get(gem.id); if (el) el.style.display='none';
        updateThiefGemHUD();
      },
      onCancel: () => {
        try {
          if (window.socket && window.socket.connected){
            window.socket.emit('gem:fail');
          }
        } catch {}
      }
    });
  } catch {}
}
// Meeting state
let meetingTimer = null;
let meetingTimeLeft = 60;
let myVote = null;
let voteResults = {}; // { uid: count }

export function startMeeting(at = CONST.MEETING_POINT){
  // 👻 Ghost ไม่สามารถเรียกประชุมได้
  if (state.isGhost) {
    log('👻 Ghost ไม่สามารถเรียกประชุมได้');
    return;
  }
  
  if (state.isMeetingActive) return;
  state.isMeetingActive = true;

  // Reset meeting state
  meetingTimeLeft = 60;
  myVote = null;
  voteResults = {};

  // หยุดการเคลื่อนไหวและย้ายผู้เล่นไปจุดกลางประชุม
  state.playerX = at.x; 
  state.playerY = at.y;
  Object.keys(state.keysPressed).forEach(k => state.keysPressed[k] = false);

  // 📡 Notify server of meeting start
  try {
    if (window.socket && !at._broadcast) {
      window.socket.emit('meeting:start', { 
        room: state.gameRoom,
        x: at.x,
        y: at.y
      });
      console.log('📡 [Meeting] Emitted meeting:start to server');
    }
  } catch (e) {
    console.warn('[Meeting] Failed to emit meeting:start:', e);
  }

  // แสดง Modal
  if (!refs.meetingModal) return;
  refs.meetingModal.style.display = 'flex';
  refs.bgmMusic?.pause();

  const grid = document.getElementById('player-vote-grid');
  const timerEl = document.getElementById('meeting-timer');
  const skipBtn = document.getElementById('skip-vote-btn');
  const result = document.getElementById('vote-result');
  
  if (!grid) return;

  grid.innerHTML = '<p style="color:#aaa">🔔 กำลังเรียกทุกคนมาประชุม...</p>';

  // ⏱️ Start countdown timer
  if (timerEl) timerEl.textContent = meetingTimeLeft;
  
  if (meetingTimer) clearInterval(meetingTimer);
  meetingTimer = setInterval(() => {
    meetingTimeLeft--;
    if (timerEl) {
      timerEl.textContent = meetingTimeLeft;
      if (meetingTimeLeft <= 10) {
        timerEl.classList.add('urgent');
      }
    }
    
    if (meetingTimeLeft <= 0) {
      clearInterval(meetingTimer);
      finalizeMeeting();
    }
  }, 1000);

  // Request fresh snapshot from server
  try {
    if (window.socket) {
      window.socket.emit('snapshot:request', { room: state.gameRoom });
      console.log('📡 [Meeting] Requested fresh snapshot');
    }
  } catch (e) {
    console.warn('[Meeting] Failed to request snapshot:', e);
  }

  // Setup skip vote button
  if (skipBtn) {
    skipBtn.disabled = false;
    skipBtn.onclick = () => {
      if (myVote !== null) return; // Already voted
      castVote('skip');
    };
  }

  // Wait for snapshot to arrive, then render players
  setTimeout(() => {
    try {
      let players = getCurrentPlayers();
      console.log(`[Meeting] Rendering ${players?.length || 0} players after snapshot`);
      
      // 👻 กรอง Ghost ออกจากรายชื่อโหวต
      players = players.filter(p => !p.isGhost);
      console.log(`[Meeting] After filtering ghosts: ${players?.length || 0} alive players`);
      
      grid.innerHTML = '';
      
      if (!players || !players.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = '(ไม่มีผู้เล่นในห้อง)';
        emptyMsg.style.color = '#ccc';
        grid.appendChild(emptyMsg);
        return;
      }

      // สร้างการ์ดผู้เล่นแต่ละคน
      players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.player = p.uid;

        const img = document.createElement('img');
        img.src = `../assets/Characters/${p.char}/idle_1.png`;
        img.alt = p.name;
        img.onerror = () => { img.src = '../assets/images/idle_1.png'; };

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = p.name;

        const voteCount = document.createElement('span');
        voteCount.className = 'vote-count';
        voteCount.textContent = '0 votes';

        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.textContent = '🗳️ Vote';
        btn.addEventListener('click', () => {
          if (myVote !== null) return; // Already voted
          castVote(p.uid, p.name);
        });

        card.append(img, name, voteCount, btn);
        grid.appendChild(card);
      });
    } catch (e) {
      console.error('[Meeting] Failed to render players:', e);
      grid.innerHTML = '<p style="color:#f44">(ข้อผิดพลาด)</p>';
    }
  }, 300);
  
  // 💬 Setup Meeting Chat
  setupMeetingChat();
}

function setupMeetingChat() {
  const chatInput = document.getElementById('meeting-chat-input');
  const chatSend = document.getElementById('meeting-chat-send');
  const chatMessages = document.getElementById('meeting-chat-messages');
  
  if (!chatInput || !chatSend || !chatMessages) return;
  
  // Clear previous messages
  chatMessages.innerHTML = '<p style="color:#888;text-align:center;font-size:0.9em;">💬 แชทในการประชุม</p>';
  
  // Send message function
  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Add to local chat immediately
    addMeetingChatMessage(state.displayName || 'You', text, state.isGhost);
    
    // Emit to server
    try {
      if (window.socket) {
        window.socket.emit('meeting:chat', {
          room: state.gameRoom,
          uid: state.uid,
          name: state.displayName,
          text: text,
          isGhost: state.isGhost || false
        });
      }
    } catch (e) {
      console.warn('[Meeting Chat] Failed to emit:', e);
    }
    
    chatInput.value = '';
  };
  
  // Event listeners
  chatSend.onclick = sendMessage;
  chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };
}

function addMeetingChatMessage(name, text, isGhost = false) {
  const chatMessages = document.getElementById('meeting-chat-messages');
  if (!chatMessages) return;
  
  const msg = document.createElement('div');
  msg.className = 'meeting-chat-msg' + (isGhost ? ' ghost' : '');
  msg.innerHTML = `<strong>${isGhost ? '👻 ' : ''}${name}:</strong>${text}`;
  
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function castVote(targetUid, targetName = 'Skip') {
  // 👻 Ghost ไม่สามารถโหวตได้
  if (state.isGhost) {
    log('👻 Ghost ไม่สามารถโหวตได้');
    return;
  }
  
  if (myVote !== null) return; // Already voted
  
  myVote = targetUid;
  
  // Emit vote to server with total player count
  try {
    if (window.socket) {
      let players = getCurrentPlayers();
      // 👻 นับเฉพาะคนที่ไม่ใช่ Ghost
      players = players.filter(p => !p.isGhost);
      const totalPlayers = players ? players.length : 0;
      
      window.socket.emit('meeting:vote', {
        room: state.gameRoom,
        voter: state.uid,
        target: targetUid,
        totalPlayers: totalPlayers
      });
      console.log(`📡 [Meeting] Voted for ${targetName} (${totalPlayers} total players)`);
    }
  } catch (e) {
    console.warn('[Meeting] Failed to emit vote:', e);
  }

  // Update UI
  const result = document.getElementById('vote-result');
  if (result) {
    result.textContent = targetUid === 'skip' ? '✅ คุณข้ามโหวต' : `✅ คุณโหวตให้ ${targetName}`;
  }

  // Highlight voted card
  const grid = document.getElementById('player-vote-grid');
  if (grid) {
    const allCards = grid.querySelectorAll('.player-card');
    allCards.forEach(card => {
      const btn = card.querySelector('.vote-btn');
      if (btn) btn.disabled = true;
      
      if (card.dataset.player === targetUid) {
        card.classList.add('my-vote');
      }
    });
  }

  // Disable skip button
  const skipBtn = document.getElementById('skip-vote-btn');
  if (skipBtn) skipBtn.disabled = true;
}

function updateVoteDisplay(votes) {
  // votes = { uid: count, ... }
  voteResults = votes;
  
  const grid = document.getElementById('player-vote-grid');
  if (!grid) return;

  const allCards = grid.querySelectorAll('.player-card');
  allCards.forEach(card => {
    const uid = card.dataset.player;
    const count = votes[uid] || 0;
    const voteCountEl = card.querySelector('.vote-count');
    if (voteCountEl) {
      voteCountEl.textContent = count === 1 ? '1 vote' : `${count} votes`;
    }
    
    if (count > 0) {
      card.classList.add('voted');
    }
  });
}

function finalizeMeeting() {
  const result = document.getElementById('vote-result');
  
  // Find player with most votes
  let maxVotes = 0;
  let suspectUid = null;
  let tie = false;
  
  for (const uid in voteResults) {
    if (voteResults[uid] > maxVotes) {
      maxVotes = voteResults[uid];
      suspectUid = uid;
      tie = false;
    } else if (voteResults[uid] === maxVotes && maxVotes > 0) {
      tie = true;
    }
  }

  if (result) {
    if (tie || maxVotes === 0) {
      result.textContent = '🤷 ไม่มีใครถูกโหวตออก (เสมอกัน)';
      
      // Close meeting after 3 seconds (no ejection)
      setTimeout(() => {
        endMeeting();
      }, 3000);
    } else {
      const players = getCurrentPlayers();
      const suspect = players.find(p => p.uid === suspectUid);
      const suspectName = suspect?.name || 'Unknown';
      result.textContent = `⚠️ ${suspectName} ถูกโหวตออก! (${maxVotes} votes)`;
      result.style.color = '#ff3333';
      
      // Notify server to eject player
      try {
        if (window.socket) {
          window.socket.emit('meeting:eject', {
            room: state.gameRoom,
            ejectedUid: suspectUid,
            ejectedName: suspectName
          });
          console.log(`🚪 [Meeting] Ejecting ${suspectName}`);
        }
      } catch (e) {
        console.warn('[Meeting] Failed to emit eject:', e);
      }
      
      // Close meeting after 4 seconds (longer to show ejection)
      setTimeout(() => {
        endMeeting();
      }, 4000);
    }
  }
}

export function endMeeting(){
  if (meetingTimer) {
    clearInterval(meetingTimer);
    meetingTimer = null;
  }
  
  state.isMeetingActive = false;
  refs.meetingModal && (refs.meetingModal.style.display = 'none');
  refs.bgmMusic?.play().catch(()=>{});
  
  // Reset meeting state
  myVote = null;
  voteResults = {};
  meetingTimeLeft = 60;
  
  // Clear meeting chat
  const chatMessages = document.getElementById('meeting-chat-messages');
  if (chatMessages) chatMessages.innerHTML = '';
  
  // Remove urgent class from timer
  const timerEl = document.getElementById('meeting-timer');
  if (timerEl) timerEl.classList.remove('urgent');
}

// Listen for vote updates from server
if (typeof window !== 'undefined') {
  window.addEventListener('meeting:voteUpdate', (e) => {
    const { votes } = e.detail || {};
    if (votes) updateVoteDisplay(votes);
  });
  
  // Listen for meeting complete (all voted)
  window.addEventListener('meeting:allVoted', (e) => {
    console.log('✅ [Meeting] All players have voted, finalizing...');
    // Stop timer and finalize immediately
    if (meetingTimer) {
      clearInterval(meetingTimer);
      meetingTimer = null;
    }
    finalizeMeeting();
  });
}

export function checkInteractions(){
  // 👻 Ghost ไม่สามารถโต้ตอบได้
  if (state.isGhost) {
    if (refs.interactionHint) refs.interactionHint.textContent = '';
    return;
  }
  
  const role = getRole(); // 'Visitor' | 'Thief'
  const pcx = state.playerX + state.playerW/2;
  const pcy = state.playerY + state.playerH/2;

  let canInteract = false;

  for (const spot of MISSION_SPOTS_DATA){
    const el = document.getElementById(spot.id);
    if (!el) continue;

    // วาง element ตาม world pos
    el.style.left = `${spot.x}px`;
    el.style.top  = `${spot.y}px`;

    // ซ่อน/แสดงตามบทบาท
    if (spot.type === 'heist' && role !== 'Thief'){ el.style.display = 'none'; continue; }
    el.style.display = 'block';

    const scx = spot.x + spot.width/2, scy = spot.y + spot.height/2;
    const d = dist(pcx,pcy,scx,scy);

    if (d <= CONST.INTERACTION_RADIUS){
      canInteract = true;
      el.style.opacity = 1;
      if (state.keysPressed[CONST.INTERACTION_KEY]){
        state.keysPressed[CONST.INTERACTION_KEY] = false;

        if (spot.type === 'guest' && role === 'Visitor'){
          state.missionProgress = Math.min(CONST.MAX_MISSION_PROGRESS, state.missionProgress + CONST.MISSION_INCREASE_AMOUNT);
          setMissionUI();
          log('🛠️ ซ่อมแซมสำเร็จ (+1%)');
          refs.sfxInteract?.play().catch(()=>{});
        } else if (spot.type === 'heist' && role === 'Thief'){
          // Heist spot no longer auto-wins. Thief must steal 5 gems scattered around the map.
          log('💎 เป้าหมาย: ขโมยอัญมณีให้ครบ 5 ชิ้น!', 'heist');
          try { refs.sfxHeist?.play?.(); } catch {}
        } else if (spot.type === 'meeting'){
          startMeeting(CONST.MEETING_POINT); refs.sfxInteract?.play().catch(()=>{});
        } else if (spot.type === 'Open_CCTV'){
          log('📹 เปิด CCTV'); refs.sfxInteract?.play().catch(()=>{});
        } else {
          log('คุณไม่สามารถโต้ตอบกับวัตถุนี้ได้');
        }
      }
    } else {
      el.style.opacity = 0.6;
    }
  }

  if (refs.interactionHint) refs.interactionHint.style.display = canInteract ? 'block' : 'none';
}

// 1️⃣ ข้อมูล Object ที่โต้ตอบได้ (เพิ่มอันใหม่ได้เรื่อยๆ)
  export const INTERACTABLE_OBJECTS = [
    { id: 'printer', x: 3400, y: 3470, width: 100, height: 110, type: 'printer', active: true},
    { id: 'tree_middle_room', x: 4750, y: 4300, width: -50,height: -100, type: 'tree', active: true },
    { id: 'Telephone', x: 4100, y: 4390, width: -100, height: 200, type: 'Telephone', active: true },
    { id: 'Scrupture1', x: 3570, y: 1500, width: 50, height: -200, type: 'Scrupture', active: true },
    { id: 'tree_upper_room1', x: 3200, y: 500, width: -180,height: 30, type: 'tree', active: true },
    { id: 'hidden_switch', x: 4280, y: 550, width: -50,height: -50, type: 'switch(?)', active: true, mg: 'align' },
    { id: 'Scrupture2', x: 4780, y: 1200, width: -800, height: -400, type: 'Scrupture', active: true },
    { id: 'tree_upper_room2', x: 4440, y: 1160, width: -220,height: -220, type: 'tree', active: true },
    { id: 'Broom', x: 1500, y: 3280, width: -200,height: -200, type: 'broom', active: true, mg: 'mop'},
    { id: 'computer1', x: 3520, y: 7020, width: -350,height: -350, type: 'computer', active: true },
    { id: 'computer2', x: 4320, y: 7180, width: -700,height: -350, type: 'computer', active: true , mg: 'upload'},
    { id: 'computer3', x: 4750, y: 6900, width: -100,height: -400, type: 'computer', active: true },
    { id: 'monitor', x: 4980, y: 7500, width: -2000,height: -400, type: 'monitor', active: true , mg: 'dodge'},
    { id: 'matchine', x: 6580, y: 3160, width: -380,height: -200, type: 'matchine', active: true, mg: 'rhythm' },
    { id: 'battery', x: 7120, y: 4260, width: -600,height: -600, type: 'battery', active: true , mg: 'switch'},
    { id: 'power', x: 7420, y: 7850, width: -200,height: -150, type: 'power', active: true , mg: 'wires'},
    { id: '้hackbox', x: 1512, y: 6132, width: -200, height: -150, type: 'hackbox', active: true , mg: 'math'},
    
    // 🔴 Thief-only objects (สีแดง)
    { id: 'thief_lights', x: 2000, y: 2000, width: 80, height: 80, type: 'sabotage', active: true, mg: 'sabotage_lights', roleRequired: 'Thief' },
    { id: 'thief_comms', x: 5500, y: 2500, width: 80, height: 80, type: 'sabotage', active: true, mg: 'sabotage_comms', roleRequired: 'Thief' },
    { id: 'thief_reactor', x: 6500, y: 5000, width: 80, height: 80, type: 'sabotage', active: true, mg: 'sabotage_reactor', roleRequired: 'Thief' },
    { id: 'thief_oxygen', x: 2500, y: 5500, width: 80, height: 80, type: 'sabotage', active: true, mg: 'sabotage_oxygen', roleRequired: 'Thief' },
    { id: 'thief_vault', x: 5000, y: 1500, width: 80, height: 80, type: 'steal', active: true, mg: 'steal_vault', roleRequired: 'Thief' },
    { id: 'thief_data', x: 1800, y: 7200, width: 80, height: 80, type: 'steal', active: true, mg: 'steal_data', roleRequired: 'Thief' },
    { id: 'thief_artifact', x: 6800, y: 6500, width: 80, height: 80, type: 'steal', active: true, mg: 'steal_artifact', roleRequired: 'Thief' },
    { id: 'thief_security', x: 3800, y: 6000, width: 80, height: 80, type: 'sabotage', active: true, mg: 'disable_security', roleRequired: 'Thief' },
];

function normRect({x,y,width:w,height:h}){
  if (w<0){ x+=w; w=-w; } if (h<0){ y+=h; h=-h; }
  return { x,y,w,h };
}

let telCooldown=false, telRemain=0, telTimer=null, telUsed=0;

// ✅ 8 minigames ที่ใช้ในระบบภารกิจ Visitor
const VALID_MINIGAMES = ["align", "mop", "upload", "dodge", "rhythm", "switch", "wires", "math"];

// ✅ 8 minigames ที่ใช้ในระบบภารกิจ Thief
const THIEF_MINIGAMES = ["sabotage_lights", "sabotage_comms", "sabotage_reactor", "sabotage_oxygen", "steal_vault", "steal_data", "steal_artifact", "disable_security"];

export function checkObjectInteractions(){
  // 👻 Ghost ไม่สามารถทำภารกิจได้
  if (state.isGhost) {
    if (refs.interactionHint) refs.interactionHint.textContent = '';
    return;
  }
  
  const pcx = state.playerX + state.playerW/2;
  const pcy = state.playerY + state.playerH/2;

  let near = null;
  for (const raw of INTERACTABLE_OBJECTS){
    if (!raw.active) continue;
    
    // ✅ เช็คว่า object นี้มีข้อกำหนดบทบาทหรือไม่
    if (raw.roleRequired && raw.roleRequired !== state.myRole) continue;
    
    // ✅ กรองเฉพาะ object ที่มี mg และอยู่ใน pool ที่ถูกต้อง
    if (raw.mg) {
      const isVisitorTask = VALID_MINIGAMES.includes(raw.mg);
      const isThiefTask = THIEF_MINIGAMES.includes(raw.mg);
      
      if (!isVisitorTask && !isThiefTask) continue;
      
      // Visitor tasks
      if (state.myRole === "Visitor" && isVisitorTask) {
        if (!state.myUnlockedTasks.includes(raw.mg)) continue;
        if (state.myCompletedTasks.includes(raw.mg)) continue;
      }
      
      // Thief tasks
      if (state.myRole === "Thief" && isThiefTask) {
        if (!state.myUnlockedTasks.includes(raw.mg)) continue;
        if (state.myCompletedTasks.includes(raw.mg)) continue;
      }
    }
    
    const {x,y,w,h} = normRect(raw);
    const ocx = x+w/2, ocy = y+h/2;
    if (dist(pcx,pcy,ocx,ocy) < CONST.INTERACTION_RADIUS){ near = { ...raw, x,y,w,h }; break; }
  }

  if (!refs.interactionHint) return;
  if (!near){ refs.interactionHint.style.display='none'; return; }
  refs.interactionHint.style.display='block';
  // If this object's minigame is the rhythm game and it's already completed,
  // hide the hint and prevent starting it again.
  try {
    const mgKey = near.mg ? (typeof near.mg === 'string' ? near.mg : (near.mg.key || '')) : '';
    const storageKey = mgKey ? `minigame_completed:${String(mgKey).toLowerCase()}:${near.id}` : null;
    const isRhythmCompleted = storageKey ? (localStorage.getItem(storageKey) === 'true') : false;
    if (mgKey && String(mgKey).toLowerCase() === 'rhythm' && isRhythmCompleted) {
      refs.interactionHint.style.display = 'none';
      return;
    }
  } catch (e) { /* ignore localStorage errors */ }
  if (near.type === 'Telephone'){
    refs.interactionHint.textContent = telCooldown ? `📵 โทรศัพท์กำลังรีเซ็ต (${telRemain}s)` : '📞 กด [E] เพื่อโทรเรียกประชุมฉุกเฉิน';
  } else {
    refs.interactionHint.textContent = near.mg ? '🎮 กด [E] เพื่อเริ่มมินิเกม' : `กด [E] เพื่อโต้ตอบกับ ${near.type}`;
  }

  if (!state.keysPressed[CONST.INTERACTION_KEY]) return;
  state.keysPressed[CONST.INTERACTION_KEY] = false;

  // มินิเกมก่อน ถ้ามี
  if (near.mg){
    // double-check before opening: don't open rhythm minigame again if completed
    try {
      const mgKey = typeof near.mg === 'string' ? near.mg : (near.mg.key || '');
      const storageKey = mgKey ? `minigame_completed:${String(mgKey).toLowerCase()}:${near.id}` : null;
      const isRhythmCompleted = storageKey ? (localStorage.getItem(storageKey) === 'true') : false;
      if (mgKey && String(mgKey).toLowerCase() === 'rhythm' && isRhythmCompleted) {
        // already handled above, but guard here as well
        return;
      }
    } catch (e) { /* ignore */ }
    // If the new minigame system (game.js) is present, delegate to it to avoid double handling
    if (typeof window.handleObjectInteraction === 'function') {
      try { window.handleObjectInteraction(near); } catch(e) { console.warn('handleObjectInteraction failed', e); }
      return;
    }
    // Fallback to legacy opener only if the new system isn't available
    openMinigameForObject(near, {
      onComplete: (obj) => {
        // ✅ ทั้ง Visitor และ Thief ต่างก็มีระบบ progress ของตัวเอง
        if (obj.mg && (state.myRole === "Visitor" || state.myRole === "Thief")) {
          const taskName = obj.mg;
          
          // เช็คว่าทำไปแล้วหรือยัง
          if (!state.myCompletedTasks.includes(taskName)) {
            state.myCompletedTasks.push(taskName);
            try { sessionStorage.setItem('myCompletedTasks', JSON.stringify(state.myCompletedTasks)); } catch {}
            
            // ส่งไป server
            if (window.socket && window.socket.connected) {
              window.socket.emit("task:complete", { taskName });
              console.log(`✅ Task completed: ${taskName}`);
            }
            
            // อัพเดท UI
            setMissionUI();
            try { updateTaskWorldHints?.(); } catch {}
            try { updateVisitorMissionHUD?.(); } catch {} // 📋 อัปเดต Visitor HUD
            
            if (state.myRole === "Visitor") {
              log('✅ Minigame complete! (+progress)');
            } else {
              log('🔴 Sabotage complete!');
            }
          }
        }
        
        obj.active = false;
      }
    });
    return;
  }
  if (near.type === 'Telephone') {
    // ยกเลิกเงื่อนไข "Thief ถูกจับ" เพื่อให้หัวขโมยสามารถเรียกประชุมได้เหมือนผู้เล่นอื่น
    if (state.isMeetingActive){ log('☎️ ประชุมอยู่แล้ว'); return; }
    if (telCooldown){ log(`⏳ รอได้อีก (${telRemain}s)`); return; }
    if (telUsed >= CONST.MAX_TELEPHONE_CALLS){ log('📵 โทรศัพท์ใช้ครบแล้ว'); return; }

    telUsed++; log(`📞 โทรเรียกประชุม (${telUsed}/${CONST.MAX_TELEPHONE_CALLS})`);
    startMeeting(CONST.MEETING_POINT); refs.sfxInteract?.play().catch(()=>{});

    // แจ้ง server broadcast
    try {
      if (window.socket && window.socket.connected) {
        window.socket.emit('meeting:start', {
          room: state.currentRoom,
          x: CONST.MEETING_POINT.x,
          y: CONST.MEETING_POINT.y,
        });
      }
    } catch (err) {
      console.warn('meeting:start emit failed', err);
    }

    telCooldown = true; telRemain = CONST.TELEPHONE_COOLDOWN_MS/1000;
    clearInterval(telTimer);
    telTimer = setInterval(() => {
      telRemain--;
      if (telRemain <= 0){
        clearInterval(telTimer); telCooldown = false; telRemain = 0;
        if (telUsed < CONST.MAX_TELEPHONE_CALLS) log('📞 โทรศัพท์พร้อมใช้งานอีกครั้ง');
      }
      if (refs.interactionHint && near.type === 'Telephone'){
        refs.interactionHint.textContent = telCooldown ? `📵 โทรศัพท์กำลังรีเซ็ต (${telRemain}s)` : '📞 กด [E] เพื่อโทรเรียกประชุมฉุกเฉิน';
      }
    }, 1000);
    return;
  }

  // generic interaction fallback
  log(`✅ โต้ตอบกับ ${near.id}`); refs.sfxInteract?.play().catch(()=>{});
  near.active = false;
}
/* ===== log helper ===== */
function log(text, kind='general'){
  const box = refs.logContainer; if (!box) return;
  const p = document.createElement('p'); p.className = 'log-message'; if (kind==='heist') p.classList.add('heist');
  p.textContent = text; box.insertBefore(p, box.firstChild || null);
  while (box.children.length > 5) box.removeChild(box.lastChild);
  setTimeout(()=>{ p.style.opacity='0'; }, 10000);
  setTimeout(()=>{ p.remove(); }, 11000);
}
