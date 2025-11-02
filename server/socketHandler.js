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

// Thief tasks (sabotage minigames) - 8 tasks total
const THIEF_TASK_POOL = [
  'sabotage_lights',
  'sabotage_comms',
  'sabotage_reactor',
  'sabotage_oxygen',
  'steal_vault',
  'steal_data',
  'steal_artifact',
  'disable_security',
];

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
  if (count >= 6 && count <= 8) return 2;
  if (count >= 3 && count <= 5) return 1;
  return 0;
}

function assignTasksFor(room, uid){
  const key = `${room}:${uid}`;
  if (playerTaskState.has(key)) return playerTaskState.get(key);

  // Determine role based on room-level assignment if present; otherwise default Visitor pre-start
  const rr = roomRoles.get(room);
  const role = (rr && rr.started && rr.thieves && rr.thieves.has(uid)) ? 'Thief' : 'Visitor';

  // Use different task pool based on role
  const pool = role === 'Thief' ? THIEF_TASK_POOL : TASK_POOL;
  const shuffled = [...pool].sort(() => (hashToInt(uid+room+Math.random()) % 3) - 1);
  const w1 = shuffled.slice(0, 3);
  const w2 = shuffled.slice(3, 6);
  const w3 = shuffled.slice(6, 8);
  const state = { role, waves: [w1, w2, w3], currentWave: 1, completedTasks: [] };
  playerTaskState.set(key, state);
  return state;
}

/**
 * registerSocketHandlers(io)
 * @param {Server} io - socket.io server
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

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
      const { room, uid, name, color, char, x, y, equip } = data;
      if (!room || !uid) return;

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
        existing.name = name || existing.name;
        existing.color = color || existing.color;
        existing.char = char || existing.char;
        existing.x = (typeof x === "number") ? x : existing.x;
        existing.y = (typeof y === "number") ? y : existing.y;
        if (equip && typeof equip === 'object') existing.equip = equip;
        existing.lastMoveAt = Date.now();
      } else {
        // สร้าง player ใหม่
        gr.players.set(uid, {
          uid, 
          name, 
          color, 
          char, 
          x, 
          y,
          equip: (equip && typeof equip === 'object') ? equip : {},
          socketId: socket.id,
          room,
          lastMoveAt: Date.now(),
        });
      }

      socket.data.room = room;
      socket.data.uid = uid;
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

      console.log(`👋 ${name} joined ${room}`);
    });

    // MOVE PLAYER
    socket.on("player:move", (data = {}) => {
      const room = socket.data.room;
      const uid = socket.data.uid;
      if (!room || !uid) return;

      const gr = gameRooms[room];
      if (!gr) return;

      const p = gr.players.get(uid);
      if (!p) return;

      if (typeof data.x === "number") p.x = data.x;
      if (typeof data.y === "number") p.y = data.y;
      p.lastMoveAt = data.ts || Date.now();

      io.to(room).volatile.emit("player:movedelta", {
        uid, x: p.x, y: p.y, ts: p.lastMoveAt
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
      if (!data?.text || !data?.uid) return;
      const room = data.room || socket.data.room;
      if (!room) return;

      const now = Date.now();
      const safeText = String(data.text).slice(0, 500);
      socket.__msgSeq = socket.__msgSeq || new Map();
      const keySeq = `${room}:${data.uid}`;
      const nextSeq = (socket.__msgSeq.get(keySeq) || 0) + 1;
      socket.__msgSeq.set(keySeq, nextSeq);

      const id = (typeof data.id === "string" && data.id.length <= 128)
        ? data.id
        : `${data.uid}:${now}:${nextSeq}`;

      const payload = {
        room,
        uid: data.uid,
        name: data.name || "Unknown",
        text: safeText,
        ts: now,
        id,
        seq: nextSeq,
      };
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
                    color: s.data.color || '#ffffff'
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

    // 🗳 Handle vote:cast - player casts a vote
    socket.on('vote:cast', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const votedFor = data.votedFor;
        const votedForName = data.votedForName || 'Unknown';
        console.log(`🗳 [${room}] Player voted for ${votedForName}`);
        // Broadcast vote to all players in room
        io.to(room).emit('vote:update', { votedForName });
      } catch (e) {
        console.warn('vote:cast handler failed', e);
      }
    });

    // 📊 Handle vote:complete - voting ended, show elimination result
    socket.on('vote:complete', (data = {}) => {
      try {
        const room = data.room || socket.data.room;
        const eliminated = data.eliminated;
        const eliminatedName = data.eliminatedName || 'Unknown';
        const voteCount = data.voteCount || 0;
        
        console.log(`📊 [${room}] Vote complete: ${eliminatedName} eliminated with ${voteCount} votes`);
        
        // Get eliminated player's role from playerTaskState
        const playerKey = `${room}:${eliminated}`;
        const playerState = playerTaskState.get(playerKey);
        const elimRole = playerState?.role || 'Unknown';
        
        console.log(`📊 [${room}] Eliminated player role: ${elimRole}`);
        
        // Check win condition: if Visitor eliminated, Thief wins!
        if (elimRole === 'Visitor') {
          console.log(`🎉 [${room}] THIEF WINS! Visitor ${eliminatedName} was eliminated!`);
          // Tell all players in room
          io.to(room).emit('game:thiefWins', {
            reason: 'visitor_eliminated',
            eliminatedName: eliminatedName,
            message: `${eliminatedName} (Visitor) ถูก eliminate! หัวขโมยชนะ!`
          });
        } else if (elimRole === 'Thief') {
          console.log(`🎉 [${room}] VISITORS WIN! Thief ${eliminatedName} was eliminated!`);
          // Tell all players in room
          io.to(room).emit('game:visitorsWin', {
            reason: 'thief_eliminated',
            eliminatedName: eliminatedName,
            message: `${eliminatedName} (Thief) ถูก eliminate! ผู้เยี่ยมชมชนะ!`
          });
        }
      } catch (e) {
        console.warn('vote:complete handler failed', e);
      }
    });
  });
}

module.exports = registerSocketHandlers;

