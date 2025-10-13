const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../client")));
const PORT = 3000;

// memory
const gameRooms = {};
function ensureGameRoom(code) {
  if (!gameRooms[code]) {
    // players: Map(uid -> playerObj)
    // removeTimers: Map(uid -> timeoutId) used to delay actual removal on disconnect
    gameRooms[code] = { players: new Map(), interval: null, removeTimers: new Map() };
    gameRooms[code].interval = setInterval(() => tickRoom(code), 100);
  }
  return gameRooms[code];
}

function tickRoom(code) {
  const gr = gameRooms[code];
  if (!gr) return;
  const payload = {
    players: Array.from(gr.players.values())
  };
  io.to(code).volatile.emit("snapshot", payload);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ===============================
  // JOIN ROOM
  // ===============================
  socket.on("game:join", (data) => {
    const { room, uid, name, color, char, x, y } = data;
    if (!room || !uid) return;
    const gr = ensureGameRoom(room);
    // If this uid already existed (graceful reconnect), cancel any pending removal and update socketId
    if (gr.removeTimers.has(uid)) {
      clearTimeout(gr.removeTimers.get(uid));
      gr.removeTimers.delete(uid);
    }
    const existing = gr.players.get(uid);
    if (existing) {
      existing.socketId = socket.id;
      existing.name = name || existing.name;
      existing.color = color || existing.color;
      existing.char = char || existing.char;
      existing.x = (typeof x === 'number') ? x : existing.x;
      existing.y = (typeof y === 'number') ? y : existing.y;
    } else {
      gr.players.set(uid, {
        uid, name, color, char, x, y,
        socketId: socket.id,
      });
    }
    socket.join(room);
    console.log(`👋 ${name} joined ${room}`);
    io.to(room).emit("snapshot", { players: Array.from(gr.players.values()) });
  });

  // ===============================
  // MOVE
  // ===============================
  // Receive move deltas from clients. Include optional ts for staleness checks.
  socket.on("player:move", (data) => {
    const { uid, x, y, ts } = data || {};
    if (!uid) return;
    for (const [room, gr] of Object.entries(gameRooms)) {
      if (gr.players.has(uid)) {
        const p = gr.players.get(uid);
        p.x = x; p.y = y; p.lastMoveAt = ts || Date.now();
        // Broadcast a small delta message for immediate client-side application
        io.to(room).volatile.emit("player:movedelta", { uid, x, y, ts: p.lastMoveAt });
        // Also emit the snapshot for clients relying on snapshot
        io.to(room).volatile.emit("snapshot", { players: Array.from(gr.players.values()) });
        return;
      }
    }
  });

  // ===============================
  // CHAT (per-room)
  // ===============================
  socket.on("chat:message", (data = {}) => {
    try {
      const room = data?.room;
      if (!room || typeof data?.text !== 'string' || !data.text.trim()) return;
      const payload = {
        room,
        uid: data?.uid || null,
        name: data?.name || 'Unknown',
        text: String(data.text).slice(0, 500),
        ts: Date.now(),
      };
      io.to(room).emit("chat:message", payload);
    } catch (e) {
      console.warn('chat:message error', e?.message || e);
    }
  });

  // ===============================
// CHAT (ใหม่)
// ===============================
socket.on("chat:message", (data) => {
  if (!data?.text || !data?.uid) return;

  // หาห้องที่ผู้เล่นอยู่
  let room = data.room;
  if (!room) {
    for (const [r, gr] of Object.entries(gameRooms)) {
      if (gr.players.has(data.uid)) {
        room = r;
        break;
      }
    }
  }

  if (room) {
    io.to(room).emit("chat:message", data);
    console.log(`💬 [${room}] ${data.name}: ${data.text}`);
  } else {
    console.warn("⚠️ chat:message ไม่มี room:", data);
  }
});



  // ===============================
  // DISCONNECT
  // ===============================
  socket.on("disconnect", () => {
    // Instead of removing player immediately, schedule removal after a grace period
    const GRACE_MS = 5000;
    for (const [room, gr] of Object.entries(gameRooms)) {
      for (const [uid, p] of gr.players.entries()) {
        if (p.socketId === socket.id) {
          // schedule removal
          if (gr.removeTimers.has(uid)) clearTimeout(gr.removeTimers.get(uid));
          const t = setTimeout(() => {
            try {
              gr.players.delete(uid);
              gr.removeTimers.delete(uid);
              console.log(`🗑️ Player ${uid} removed from room ${room} after disconnect timeout`);
              // broadcast updated snapshot
              io.to(room).emit('snapshot', { players: Array.from(gr.players.values()) });
              if (gr.players.size === 0) {
                clearInterval(gr.interval);
                delete gameRooms[room];
                console.log(`🗑️ Room cleared: ${room}`);
              }
            } catch (e) {}
          }, GRACE_MS);
          gr.removeTimers.set(uid, t);
        }
      }
    }
    console.log("🔴 Disconnected:", socket.id);
  });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
