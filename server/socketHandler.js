// socketHandler.js
// รวม event handlers ของ socket.io
const crypto = require('crypto');

const { gameRooms, ensureGameRoom, tickRoom } = require("./game/gameRoom");
const { GRACE_DISCONNECT_MS } = require("./constants");

// Minimal in-memory role/tasks store to satisfy client sync
// key: `${room}:${uid}` -> { role, waves, currentWave, completedTasks }
const playerTaskState = new Map();
// Room-level role assignment (locked per game start)
// room -> { started: boolean, seed: number, thieves: Set<string>, assignedAt: number }
const roomRoles = new Map();

// Restrict assignments to only these 8 minigames (exclude "mix" and others)
// Keep exactly 8 so client progress total (8) stays consistent
const TASK_POOL = [
  'align',
  'mop',
  'upload',
  'dodge',
  'rhythm',
  'switch',
  'wires',
  'math',
];

// Thief now uses the Gem Heist system instead of 8 tasks
// Keep a minimal fallback list to avoid crashes if referenced, but do not assign to thieves.
const THIEF_TASK_POOL = [];

function sanitizeWaves(waves, role='Visitor'){
  try {
    const pool = role === 'Thief' ? THIEF_TASK_POOL : TASK_POOL;
    const allowed = new Set(pool);
    const flat = (Array.isArray(waves) ? waves.flat() : []).filter(x => typeof x === 'string');
    const filtered = [];
    for (const t of flat){ if (allowed.has(t) && !filtered.includes(t)) filtered.push(t); }
    // ensure exactly 8 by topping up from pool if needed
    for (const t of pool){ if (filtered.length >= 8) break; if (!filtered.includes(t)) filtered.push(t); }
    const eight = filtered.slice(0, 8);
    // partition 3-3-2
    const w1 = eight.slice(0, 3);
    const w2 = eight.slice(3, 6);
    const w3 = eight.slice(6, 8);
    return [w1, w2, w3];
  } catch {
    // fallback to simple split on pool
    const pool = role === 'Thief' ? THIEF_TASK_POOL : TASK_POOL;
    return [pool.slice(0,3), pool.slice(3,6), pool.slice(6,8)];
  }
}

function hashToInt(str){
  let h = 0;
  for (let i=0;i<str.length;i++){ h = ((h<<5)-h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function getRequiredThieves(count){
  // ปรับสมดุล: ให้มีหัวขโมยอย่างน้อย 1 คนเมื่อมีผู้เล่นตั้งแต่ 2 คนขึ้นไป
  if (count >= 6) return 2;
  if (count >= 2) return 1;
  return 0;
}

function assignTasksFor(room, uid){
  const key = `${room}:${uid}`;
  if (playerTaskState.has(key)) return playerTaskState.get(key);

  // Determine role based on room-level assignment if present; otherwise default Visitor pre-start
  const rr = roomRoles.get(room);
  const role = (rr && rr.started && rr.thieves && rr.thieves.has(uid)) ? 'Thief' : 'Visitor';

  // Use different task pool based on role
  if (role === 'Thief'){
    // No waves for Thief (gem system replaces tasks)
    const state = { role, waves: [], currentWave: 0, completedTasks: [] };
    playerTaskState.set(key, state);
    return state;
  }
  const pool = TASK_POOL;
  const shuffled = [...pool].sort(() => (hashToInt(uid+room+Math.random()) % 3) - 1);
  const w1 = shuffled.slice(0, 3);
  const w2 = shuffled.slice(3, 6);
  const w3 = shuffled.slice(6, 8);
  const state = { role, waves: [w1, w2, w3], currentWave: 1, completedTasks: [] };
  playerTaskState.set(key, state);
  return state;
}

// --- Security helpers: sanitize and simple rate limiting ---
function sanitizeString(input, maxLen = 100) {
  if (typeof input !== 'string') return '';
  // Strip angle brackets and control chars, collapse whitespace
  const s = input
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, Math.max(0, maxLen));
}

function sanitizeName(name, maxLen = 40) {
  return sanitizeString(name, maxLen) || 'Unknown';
}

function sanitizeColor(color) {
  if (typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return color;
  return '#ffffff';
}

function sanitizeChar(ch) {
  if (typeof ch !== 'string') return 'mini_brown';
  const v = ch.toLowerCase().replace(/[^a-z0-9_\-\/]/g, '').slice(0, 64);
  return v || 'mini_brown';
}

function sanitizeEquip(eq) {
  if (!eq || typeof eq !== 'object') return {};
  const allowedKeys = ['acc', 'back', 'hat', 'mask', 'suit'];
  const out = {};
  for (const k of allowedKeys) {
    const v = eq[k];
    if (typeof v === 'string') {
      out[k] = v.toLowerCase().replace(/[^a-z0-9_\-\/]/g, '').slice(0, 64);
    }
  }
  return out;
}

// Simple token-bucket rate limiter per-socket per-key
function allowEvent(socket, key, capacity, refillPerSec) {
  try {
    if (!socket.__rl) socket.__rl = {};
    const now = Date.now();
    let b = socket.__rl[key];
    if (!b) {
      b = { tokens: capacity, last: now };
    } else {
      const elapsed = (now - b.last) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.last = now;
    }
    if (b.tokens < 1) {
      socket.__rl[key] = b;
      return false;
    }
    b.tokens -= 1;
    socket.__rl[key] = b;
    return true;
  } catch {
    // On any error, allow (fail-open) to avoid breaking gameplay
    return true;
  }
}

/**
 * registerSocketHandlers(io)
 * @param {Server} io - socket.io server
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    // helper: รีเซ็ตสถานะเกมหลังจบรอบ เพื่อให้รอบใหม่สุ่มหัวขโมยได้ตามจำนวนผู้เล่น
    function resetRoomGameState(room){
      try {
        if (roomRoles.has(room)) roomRoles.delete(room);
        for (const k of Array.from(playerTaskState.keys())) {
          if (k.startsWith(room + ':')) playerTaskState.delete(k);
        }
        const gr = gameRooms[room];
        if (gr && gr.ejectedPlayers && typeof gr.ejectedPlayers.clear === 'function') gr.ejectedPlayers.clear();
        console.log(`♻️ [${room}] Game state reset (roles & tasks cleared)`);
      } catch (e) {
        console.warn('resetRoomGameState failed', e);
      }
    }

    // GAME RESET: clear room state and any task assignments
    socket.on("game:reset", (data = {}) => {
      const room = data?.room;
      if (!room) return;
      try {
        const gr = gameRooms[room];
        if (gr) {
          try { clearInterval(gr.interval); } catch {}
          for (const [, t] of gr.removeTimers.entries()) try { clearTimeout(t); } catch {}
          delete gameRooms[room];
        }
        // clear room role assignments
        if (roomRoles.has(room)) roomRoles.delete(room);
        for (const k of Array.from(playerTaskState.keys())){
          if (k.startsWith(room + ':')) playerTaskState.delete(k);
        }
        io.to(room).emit("snapshot", { room, players: [] });
        console.log(`?? Room reset: ${room}`);
      } catch {}
    });

    // JOIN ROOM
    socket.on("game:join", (data = {}) => {
      const { room, uid } = data || {};
      if (!room || !uid) return;

      // sanitize user-provided fields
      const safeName = sanitizeName(data.name, 40);
      const safeColor = sanitizeColor(data.color);
      const safeChar = sanitizeChar(data.char);
      const safeEquip = sanitizeEquip(data.equip);
      const nx = (typeof data.x === 'number' && Number.isFinite(data.x)) ? data.x : undefined;
      const ny = (typeof data.y === 'number' && Number.isFinite(data.y)) ? data.y : undefined;

      const gr = ensureGameRoom(room);
      gr.io = io; // bind io ให้ tickRoom ใช้ได้

      // เคลียร์ timeout reconnect ถ้ามี
      if (gr.removeTimers.has(uid)) {
        clearTimeout(gr.removeTimers.get(uid));
        gr.removeTimers.delete(uid);
      }

      const existing = gr.players.get(uid);
      if (existing) {
        // อัปเดต player เดิม
        existing.socketId = socket.id;
        existing.name = safeName || existing.name;
        existing.color = safeColor || existing.color;
        existing.char = safeChar || existing.char;
        if (typeof nx === 'number') existing.x = nx;
        if (typeof ny === 'number') existing.y = ny;
        if (data.equip && typeof data.equip === 'object') existing.equip = safeEquip;
        existing.lastMoveAt = Date.now();
      } else {
        // สร้าง player ใหม่
        gr.players.set(uid, {
          uid, 
          name: safeName, 
          color: safeColor, 
          char: safeChar, 
          x: nx, 
          y: ny,
          equip: safeEquip,
          socketId: socket.id,
          room,
          lastMoveAt: Date.now(),
        });
      }

      socket.data.room = room;
      socket.data.uid = uid;
      socket.data.name = safeName;
      socket.data.color = safeColor;
      socket.data.char = safeChar;
      socket.join(room);

      // Ack back to this client and optionally resume known state
      try { socket.emit("game:join:ack", { ok: true, room, uid }); } catch {}
      try {
        const key = `${room}:${uid}`;
        if (playerTaskState.has(key)){
          const st = playerTaskState.get(key);
          const waves = sanitizeWaves(st.waves, st.role);
          socket.emit('state:resume', {
            room,
            uid,
            role: st.role,
            waves,
            currentWave: st.currentWave,
            completedTasks: st.completedTasks,
            x: (typeof x === 'number') ? x : undefined,
            y: (typeof y === 'number') ? y : undefined,
          });
        }
      } catch {}

      // ส่ง snapshot ให้ห้อง
      io.to(room).emit("snapshot", {
        room,
        players: Array.from(gr.players.values()),
      });

      console.log(`👋 ${safeName} joined ${room}`);
    });

    // MOVE PLAYER
    socket.on("player:move", (data = {}) => {
      const room = socket.data.room;
      const uid = socket.data.uid;
      if (!room || !uid) return;

      // rate limit moves to ~30/s per socket
      if (!allowEvent(socket, 'player:move', 30, 30)) return;

      const gr = gameRooms[room];
      if (!gr) return;

      const p = gr.players.get(uid);
      if (!p) return;

      const mx = Number(data.x);
      const my = Number(data.y);
      if (Number.isFinite(mx)) p.x = mx;
      if (Number.isFinite(my)) p.y = my;
      p.lastMoveAt = data.ts || Date.now();
      
      // 👻 บันทึก ghost status
      if (typeof data.isGhost === "boolean") p.isGhost = data.isGhost;

      io.to(room).volatile.emit("player:movedelta", {
        uid, x: p.x, y: p.y, ts: p.lastMoveAt, isGhost: p.isGhost || false
      });

      io.to(room).volatile.emit("snapshot", {
        room, players: Array.from(gr.players.values())
      });
    });

    // Minimal tasks assignment: reply to tasks:request
    socket.on('tasks:request', (data = {}) => {
      const room = data.room || socket.data.room;
      const uid = data.uid || socket.data.uid;
      if (!room || !uid) return;
      // Auto-lock roles if game hasn't started but enough players (3+) request tasks
      try {
        const gr = gameRooms[room];
        const uids = gr ? Array.from(gr.players.keys()) : [];
        const need = getRequiredThieves(uids.length);
        const rr = roomRoles.get(room);
        if (need > 0 && (!rr || !rr.started)) {
          // lock roles now
          const shuffled = uids.slice();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const selected = new Set(shuffled.slice(0, need));
          const now = Date.now();
          roomRoles.set(room, { started: true, seed: now, thieves: selected, assignedAt: now, wave1Sent: true });
          // update any existing states and privately notify roles
          if (gr) {
            for (const [puid, p] of gr.players.entries()) {
              const k = `${room}:${puid}`;
              if (playerTaskState.has(k)) {
                playerTaskState.get(k).role = selected.has(puid) ? 'Thief' : 'Visitor';
              }
              try { io.to(p.socketId).emit('role:update', { room, uid: puid, role: selected.has(puid) ? 'Thief' : 'Visitor' }); } catch {}
            }
          }
          // announce wave 1 to room
          try { io.to(room).emit('wave:unlock', { currentWave: 1, unlockedTasks: [] }); } catch {}
          console.log(`?? auto-start -> roles locked (thieves=${selected.size}) for room ${room}`);
        }
      } catch {}
      const st = assignTasksFor(room, uid);
      try {
        const waves = sanitizeWaves(st.waves, st.role);
        socket.emit('tasks:assigned', {
          room,
          uid,
          role: st.role,
          waves,
          currentWave: st.currentWave,
        });
      } catch {}
    });

    // Accept game:start from host; lock roles and broadcast wave:unlock
    socket.on('game:start', (data = {}) => {
      const room = data.room || socket.data.room;
      if (!room) return;
      try {
        const gr = gameRooms[room];
        const uids = gr ? Array.from(gr.players.keys()) : [];
        const count = uids.length;
        const need = getRequiredThieves(count);

        // Fisher–Yates shuffle using crypto.randomInt for unbiased selection
        const shuffled = uids.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = crypto.randomInt(0, i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const selected = new Set(shuffled.slice(0, Math.max(0, need)));

        const now = Date.now();
        roomRoles.set(room, { started: true, seed: now, thieves: selected, assignedAt: now });

        // Update any pre-created task states to reflect locked roles
        for (const uid of uids) {
          const key = `${room}:${uid}`;
          if (playerTaskState.has(key)) {
            const st = playerTaskState.get(key);
            st.role = selected.has(uid) ? 'Thief' : 'Visitor';
          }
        }

        // Privately notify each player of their role (does not leak to room)
        if (gr) {
          for (const [uid, p] of gr.players.entries()) {
            const role = selected.has(uid) ? 'Thief' : 'Visitor';
            try { io.to(p.socketId).emit('role:update', { room, uid, role }); } catch {}
          }
        }

        // Start wave 1 for everyone
        io.to(room).emit('wave:unlock', { currentWave: 1, unlockedTasks: [] });
        console.log(`?? game:start -> roles locked (thieves=${selected.size}) for room ${room}`);
      } catch {}
    });

    // CHAT
    socket.on("chat:message", (data = {}) => {
      const room = data.room || socket.data.room;
      const uid = socket.data.uid;
      if (!room || !uid) return;
      if (!allowEvent(socket, 'chat:message', 5, 4)) return; // ~4 msgs/sec burst 5

      const now = Date.now();
      const safeText = sanitizeString(data.text || '', 500);
      if (!safeText) return;
      const safeName = sanitizeName(data.name || socket.data.name || 'Unknown', 40);
      // include ghost status so clients can filter ghost messages correctly
      let isGhost = false;
      try {
        const gr = gameRooms[room];
        const p = gr && gr.players ? gr.players.get(uid) : null;
        isGhost = !!(p && p.isGhost) || !!socket.data.isGhost;
      } catch {}

      socket.__msgSeq = socket.__msgSeq || new Map();
      const keySeq = `${room}:${uid}`;
      const nextSeq = (socket.__msgSeq.get(keySeq) || 0) + 1;
      socket.__msgSeq.set(keySeq, nextSeq);

      const id = (typeof data.id === 'string' && data.id.length <= 128)
        ? data.id
        : `${uid}:${now}:${nextSeq}`;

      const payload = { room, uid, name: safeName, text: safeText, ts: now, id, seq: nextSeq, isGhost };
      try { io.to(room).emit('chat:message', payload); } catch {}
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("🔴 Disconnected:", socket.id);
      for (const [room, gr] of Object.entries(gameRooms)) {
        for (const [uid, p] of gr.players.entries()) {
          if (p.socketId === socket.id) {
            if (gr.removeTimers.has(uid)) clearTimeout(gr.removeTimers.get(uid));

            const t = setTimeout(() => {
              try {
                gr.players.delete(uid);
                gr.removeTimers.delete(uid);
                console.log(`🗑️ Player ${uid} removed from room ${room}`);

                io.to(room).emit("snapshot", {
                  room,
                  players: Array.from(gr.players.values()),
                });

                if (gr.players.size === 0) {
                  clearInterval(gr.interval);
                  delete gameRooms[room];
                  console.log(`🗑️ Room cleared: ${room}`);
                }
              } catch (e) {}
            }, GRACE_DISCONNECT_MS);

            gr.removeTimers.set(uid, t);
          }
        }
      }
    });

    // TASK COMPLETE -> update player state and unlock next wave if needed
    socket.on('task:complete', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const uid = data.uid || socket.data.uid;
        const taskNameRaw = data.taskName;
        if (!room || !uid || !taskNameRaw) return;
        const key = `${room}:${uid}`;
        const st = assignTasksFor(room, uid);
        const taskName = String(taskNameRaw).toLowerCase();
        
        // accept only allowed tasks based on role
  const allowedPool = st.role === 'Thief' ? THIEF_TASK_POOL : TASK_POOL;
        if (!allowedPool.includes(taskName)) return;
        
        // add to completed if part of any wave and not already recorded
        const allWaveTasks = st.waves.flat().map(t => String(t).toLowerCase());
        if (!allWaveTasks.includes(taskName)) return;
        if (!st.completedTasks.includes(taskName)) st.completedTasks.push(taskName);

        // Check if current wave is fully completed
        const currentIdx = Math.max(0, Math.min(st.waves.length - 1, (st.currentWave|0) - 1));
        const currentWaveTasks = (st.waves[currentIdx] || []).map(t => String(t).toLowerCase());
        const doneCurrent = currentWaveTasks.every(t => st.completedTasks.includes(t));
        if (doneCurrent) {
          // Advance wave if possible
          if (st.currentWave < st.waves.length) {
            st.currentWave += 1;
            const nextIdx = Math.max(0, Math.min(st.waves.length - 1, st.currentWave - 1));
            const unlockedTasks = st.waves[nextIdx] || [];
            // notify only this player
            try { socket.emit('wave:unlock', { currentWave: st.currentWave, unlockedTasks }); } catch {}
          } else {
            // Already at last wave; optionally could signal completion summary here.
          }
        }

        // 🏆 CHECK VISITOR WIN CONDITION: all ACTIVE visitors (in room and not ejected) completed all 8 tasks
        if (st.role === 'Visitor') {
          const rr = roomRoles.get(room);
          if (rr && rr.started) {
            try {
              const gr = gameRooms[room];
              const ejected = (gr && gr.ejectedPlayers) ? gr.ejectedPlayers : new Set();
              const activeVisitorUids = [];
              if (gr && gr.players instanceof Map) {
                for (const [puid] of gr.players.entries()) {
                  const isVisitor = !(rr.thieves && rr.thieves.has(puid));
                  const notEjected = !ejected.has(puid);
                  if (isVisitor && notEjected) activeVisitorUids.push(puid);
                }
              }

              let completed = 0;
              for (const puid of activeVisitorUids) {
                const pst = assignTasksFor(room, puid);
                if (pst && pst.role !== 'Thief' && Array.isArray(pst.completedTasks) && pst.completedTasks.length >= 8) {
                  completed++;
                }
              }

              console.log(`📋 [${room}] Visitor tasks progress (active): ${completed}/${activeVisitorUids.length}`);
              if (activeVisitorUids.length > 0 && completed === activeVisitorUids.length) {
                console.log(`🎉 [${room}] All active visitors completed their tasks! Visitors win!`);
                setTimeout(() => {
                  io.to(room).emit('game:visitorsWin', { reason: 'all_tasks_complete', message: 'All visitors completed their tasks!' });
                  // เตรียมรอบใหม่: ล้าง roles/task state เล็กน้อยหน่วงเวลาเพื่อให้ client แสดงผล endgame
                  setTimeout(()=>resetRoomGameState(room), 1500);
                }, 1000);
              }
            } catch (err) {
              console.warn('visitor win check failed', err);
            }
          }
        }
      } catch (e) {
        console.warn('task:complete handler failed', e);
      }
    });

    // 📡 Handle snapshot:request - client requests immediate snapshot update
    socket.on('snapshot:request', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        if (!room) return;
        
        const gr = ensureGameRoom(room);
        if (!gr) return;
        
        // Try gr.players first, fallback to socket connections if empty
        let players = Array.from(gr.players?.values() || []);
        
        // If empty, build from socket room connections
        if (!players || players.length === 0) {
          try {
            const roomSockets = io.sockets.adapter.rooms.get(room);
            if (roomSockets && roomSockets.size > 0) {
              players = Array.from(roomSockets)
                .map(sid => {
                  const s = io.sockets.sockets.get(sid);
                  return s?.data ? {
                    uid: s.data.uid,
                    name: s.data.name || `Player_${String(s.data.uid).slice(0,4)}`,
                    x: s.data.x || 0,
                    y: s.data.y || 0,
                    char: s.data.char || 'mini_brown',
                    color: s.data.color || '#ffffff',
                    isGhost: s.data.isGhost || false // 👻 เพิ่ม ghost status
                  } : null;
                })
                .filter(p => p);
              console.log(`📡 Built snapshot from ${players.length} socket connections for ${room}`);
            }
          } catch (e) {
            console.warn('Failed to build from socket room:', e);
          }
        }
        
        // Send immediate snapshot with current players
        const payload = {
          room: room,
          players: players,
        };
        io.to(room).emit("snapshot", payload);
        console.log(`📡 Sent immediate snapshot to room ${room} (${players.length} players)`);
      } catch (e) {
        console.warn('snapshot:request handler failed', e);
      }
    });

    // 🔔 Handle meeting:start - broadcast to ALL players in room
    socket.on('meeting:start', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        if (!room) return;
        
        console.log(`🔔 [${room}] Emergency meeting called by ${socket.data.uid}`);
        
        // Initialize meeting state for this room
        const gr = gameRooms[room];
        if (gr) {
          gr.meetingActive = true;
          gr.meetingVotes = {}; // Reset votes { voterUid: targetUid }
          gr.meetingStartTime = Date.now();
        }
        
        // Broadcast meeting:start to ALL players including caller
        io.to(room).emit('meeting:start', { 
          room: room,
          x: data.x || 4000,
          y: data.y || 4000
        });
        console.log(`📡 [${room}] Broadcasted meeting:start to all players`);
      } catch (e) {
        console.warn('meeting:start handler failed', e);
      }
    });

    // 🗳️ Handle meeting:vote - collect votes and broadcast results
    socket.on('meeting:vote', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const voter = data.voter || socket.data.uid;
        const target = data.target; // uid or 'skip'
        const totalPlayers = data.totalPlayers || 0;
        
        if (!room || !voter || !target) return;
        
        const gr = gameRooms[room];
        if (!gr || !gr.meetingActive) return;
        
        // Record vote
        if (!gr.meetingVotes) gr.meetingVotes = {};
        gr.meetingVotes[voter] = target;
        
        console.log(`🗳️ [${room}] ${voter} voted for ${target}`);
        
        // Calculate vote counts
        const voteCounts = {};
        for (const v in gr.meetingVotes) {
          const t = gr.meetingVotes[v];
          if (t !== 'skip') {
            voteCounts[t] = (voteCounts[t] || 0) + 1;
          }
        }
        
        // Broadcast updated vote counts to all players
        io.to(room).emit('meeting:voteUpdate', { votes: voteCounts });
        console.log(`📊 [${room}] Vote counts:`, voteCounts);
        
        // Check if all players have voted
        const totalVotes = Object.keys(gr.meetingVotes).length;
        if (totalPlayers > 0 && totalVotes >= totalPlayers) {
          console.log(`✅ [${room}] All ${totalPlayers} players have voted! Finalizing meeting...`);
          // Notify all players to finalize immediately
          io.to(room).emit('meeting:allVoted', { votes: voteCounts });
        }
        
      } catch (e) {
        console.warn('meeting:vote handler failed', e);
      }
    });

    // 📊 Handle meeting:end - finalize and cleanup
    socket.on('meeting:end', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        if (!room) return;
        
        const gr = gameRooms[room];
        if (gr) {
          gr.meetingActive = false;
          gr.meetingVotes = {};
        }
        
        console.log(`📊 [${room}] Meeting ended`);
      } catch (e) {
        console.warn('meeting:end handler failed', e);
      }
    });

    // 💬 Handle meeting:chat - sanitized & rate-limited
    socket.on('meeting:chat', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const uid = socket.data.uid;
        if (!room || !uid) return;
        if (!allowEvent(socket, 'meeting:chat', 6, 3)) return; // ~3 msgs/sec burst 6
        const safeName = sanitizeName(data.name || socket.data.name || 'Unknown', 40);
        const safeText = sanitizeString(data.text || '', 300);
        if (!safeText) return;
        const isGhost = !!data.isGhost;
        io.to(room).emit('meeting:chat', { uid, name: safeName, text: safeText, isGhost });
        console.log(`💬 [${room}] Meeting chat from ${safeName}: ${safeText.substring(0,60)}${safeText.length>60?'…':''} (ghost: ${isGhost})`);
      } catch (e) {
        console.warn('meeting:chat handler failed', e);
      }
    });

    // �🚪 Handle meeting:eject - kick player and check win conditions
    socket.on('meeting:eject', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const ejectedUid = data.ejectedUid;
        const ejectedName = data.ejectedName || 'Unknown';
        
        if (!room || !ejectedUid) return;
        
        const gr = gameRooms[room];
        if (!gr) return;
        
        console.log(`🚪 [${room}] Ejecting player: ${ejectedName} (${ejectedUid})`);
        
        // Mark player as dead/ejected
        if (!gr.ejectedPlayers) gr.ejectedPlayers = new Set();
        gr.ejectedPlayers.add(ejectedUid);
        
        // 👻 Mark player as Ghost in gr.players and socket.data
        const player = gr.players.get(ejectedUid);
        if (player) {
          player.isGhost = true;
        }
        
        // Update socket.data for the ejected player
        const roomSockets = io.sockets.adapter.rooms.get(room);
        if (roomSockets) {
          for (const sid of roomSockets) {
            const s = io.sockets.sockets.get(sid);
            if (s?.data?.uid === ejectedUid) {
              s.data.isGhost = true;
              break;
            }
          }
        }
        
        // Get player's role from room roles
        const rr = roomRoles.get(room);
        const wasThief = rr && rr.thieves && rr.thieves.has(ejectedUid);
        
        // Broadcast ejection to all players
        io.to(room).emit('player:ejected', {
          uid: ejectedUid,
          name: ejectedName,
          wasThief: wasThief
        });
        
        // Check win conditions
        if (rr && rr.started && rr.thieves) {
          // Count alive thieves
          let aliveThieves = 0;
          const aliveThiefsList = [];
          for (const thiefUid of rr.thieves) {
            if (!gr.ejectedPlayers.has(thiefUid)) {
              aliveThieves++;
              aliveThiefsList.push(thiefUid);
            }
          }
          
          // Count alive visitors (ใช้ Map.entries() แทน for-in เพื่อความถูกต้อง)
          let aliveVisitors = 0;
          const aliveVisitorsList = [];
          if (gr.players && gr.players instanceof Map) {
            for (const [uid] of gr.players.entries()) {
              // ถ้าไม่ใช่ Thief และไม่ถูก eject = Visitor ที่ยังเล่นอยู่
              if (!rr.thieves.has(uid) && !gr.ejectedPlayers.has(uid)) {
                aliveVisitors++;
                aliveVisitorsList.push(uid);
              }
            }
          }
          
          console.log(`👥 [${room}] After ejection - Alive: ${aliveVisitors} Visitors ${JSON.stringify(aliveVisitorsList)}, ${aliveThieves} Thieves ${JSON.stringify(aliveThiefsList)}`);
          
          // Win condition: All thieves ejected
          if (aliveThieves === 0) {
            console.log(`🎉 [${room}] All thieves ejected! Visitors win!`);
            setTimeout(() => {
              io.to(room).emit('game:visitorsWin', { reason: 'All thieves were ejected!', remainingVisitors: aliveVisitors });
              setTimeout(()=>resetRoomGameState(room), 2500);
            }, 2000);
          }
          // 🎯 Win condition: All visitors ejected → Thieves win!
          else if (aliveVisitors === 0 && aliveThieves > 0) {
            console.log(`💎 [${room}] All visitors ejected! Thieves win!`);
            setTimeout(() => {
              io.to(room).emit('game:thiefWin', { reason: 'All visitors were ejected!', message: 'Thieves eliminated all visitors!' });
              setTimeout(()=>resetRoomGameState(room), 2500);
            }, 2000);
          }
        }
        
      } catch (e) {
        console.warn('meeting:eject handler failed', e);
      }
    });

    // === Gem Heist system ===
    // Expose gem state to a socket
    function emitGemState(toSocket){
      try {
        const room = toSocket?.data?.room;
        if (!room) return;
        const gr = gameRooms[room];
        if (!gr || !Array.isArray(gr.gems)) return;
        const payload = { room, gems: gr.gems };
        toSocket.emit('gem:state', payload);
      } catch {}
    }

    // Send gems upon join resume if possible
    try { emitGemState(socket); } catch {}

    socket.on('gem:get', () => emitGemState(socket));

    // Client reports a failed attempt -> no cooldown, can retry immediately
    socket.on('gem:fail', () => {
      // Do nothing - removed cooldown system
    });

    // Attempt to mark gem stolen after successful lockpick
    socket.on('gem:steal', (data={}) => {
      try {
        const room = socket.data.room; const uid = socket.data.uid;
        const gemId = String(data.gemId||'');
        if (!room || !uid || !gemId) return;
        const rr = roomRoles.get(room);
        const isThief = !!(rr && rr.thieves && rr.thieves.has(uid));
        if (!isThief) return;
        const gr = gameRooms[room]; if (!gr) return;

        // No cooldown - removed cooldown system

        const gem = Array.isArray(gr.gems) ? gr.gems.find(g => g.id === gemId) : null;
        if (!gem || gem.stolenBy) return;
        gem.stolenBy = uid;

        // broadcast updated gem state
        try { io.to(room).emit('gem:state', { room, gems: gr.gems }); } catch {}

        // if all gems stolen -> Thief wins
        const allStolen = gr.gems.every(g => !!g.stolenBy);
        if (allStolen){
          try { io.to(room).emit('game:thiefWin', { room, message: 'All gems stolen!' }); } catch {}
          setTimeout(()=>resetRoomGameState(room), 2000);
        }
      } catch (e) {
        console.warn('gem:steal failed', e);
      }
    });
  });
}

module.exports = registerSocketHandlers;
