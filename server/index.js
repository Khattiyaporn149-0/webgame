const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../client")));
const PORT = 3000;

// ===============================
// In-memory room state
// ===============================
const gameRooms = {};
function ensureGameRoom(code) {
  if (!gameRooms[code]) {
    gameRooms[code] = {
      players: new Map(),        // uid -> { uid, name, color, char, x, y, ... }
      removeTimers: new Map(),   // uid -> timeoutId (for graceful disconnect)
      interval: null,            // snapshot ticker
    };

    // ส่ง snapshot ให้ทั้งห้องเป็นระยะ (heartbeat)
    gameRooms[code].interval = setInterval(() => tickRoom(code), 100);
  }
  return gameRooms[code];
}

function tickRoom(code) {
  const gr = gameRooms[code];
  if (!gr) return;

  const payload = {
    room: code,
    players: Array.from(gr.players.values()),
  };
  io.to(code).volatile.emit("snapshot", payload);
}

// ===============================
// Socket.io
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // JOIN ROOM
  socket.on("game:join", (data = {}) => {
    const { room, uid, name, color, char, x, y } = data;
    if (!room || !uid) return;

    const gr = ensureGameRoom(room);

    // ถ้าเคยตั้ง timer ลบทิ้งเพราะ reconnect แล้ว
    if (gr.removeTimers.has(uid)) {
      clearTimeout(gr.removeTimers.get(uid));
      gr.removeTimers.delete(uid);
    }

    const existing = gr.players.get(uid);
    if (existing) {
      // อัปเดต player ที่มีอยู่
      existing.socketId = socket.id;
      existing.name  = name  || existing.name;
      existing.color = color || existing.color;
      existing.char  = char  || existing.char;
      existing.x = (typeof x === "number") ? x : existing.x;
      existing.y = (typeof y === "number") ? y : existing.y;
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
        socketId: socket.id,
        room,
        lastMoveAt: Date.now(),
      });
    }

    // bind player identity กับ socket ตัวนี้
    socket.data.room = room;
    socket.data.uid  = uid;

    socket.join(room);
    console.log(`👋 ${name} joined ${room}`);

    io.to(room).emit("snapshot", {
      room,
      players: Array.from(gr.players.values()),
    });
  });

  // MOVE (อัปเดตตำแหน่งผู้เล่นคนนั้น แล้ว broadcast)
  socket.on("player:move", (data = {}) => {
    const room = socket.data.room;
    const uid  = socket.data.uid;
    if (!room || !uid) return;

    const gr = gameRooms[room];
    if (!gr) return;

    const p = gr.players.get(uid);
    if (!p) return;

    // ใช้ค่าจาก data.x / data.y ถ้ามาเป็นตัวเลข
    if (typeof data.x === "number") p.x = data.x;
    if (typeof data.y === "number") p.y = data.y;
    p.lastMoveAt = data.ts || Date.now();

    // ยิง delta เล็ก ๆ (optional: clientอาจไม่ใช้ก็ได้)
    io.to(room).volatile.emit("player:movedelta", {
      uid,
      x: p.x,
      y: p.y,
      ts: p.lastMoveAt,
    });

    // ยิง snapshot ใหม่ทันที (ทันใจกว่าแค่รอ tickRoom)
    io.to(room).volatile.emit("snapshot", {
      room,
      players: Array.from(gr.players.values()),
    });
  });

  // CHAT (เลือกเก็บตัวเดียวพอ)
  socket.on("chat:message", (data = {}) => {
    // รูปแบบ data ที่ client ส่งควรมี { text, uid, name, room? }
    if (!data?.text || !data?.uid) return;

    // ถ้า client ไม่ส่ง room มาก็ใช้ socket.data.room
    const room = data.room || socket.data.room;
    if (!room) {
      console.warn("⚠️ chat:message ไม่มี room:", data);
      return;
    }

    const payload = {
      room,
      uid: data.uid,
      name: data.name || "Unknown",
      text: String(data.text).slice(0, 500),
      ts: Date.now(),
    };

    io.to(room).emit("chat:message", payload);
    console.log(`💬 [${room}] ${payload.name}: ${payload.text}`);
  });

  // DISCONNECT (grace 5s ก่อนลบออกจากห้อง)
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    const GRACE_MS = 5000;

    for (const [room, gr] of Object.entries(gameRooms)) {
      for (const [uid, p] of gr.players.entries()) {
        if (p.socketId === socket.id) {
          if (gr.removeTimers.has(uid)) clearTimeout(gr.removeTimers.get(uid));

          const t = setTimeout(() => {
            try {
              gr.players.delete(uid);
              gr.removeTimers.delete(uid);
              console.log(`🗑️ Player ${uid} removed from room ${room} after disconnect timeout`);

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
          }, GRACE_MS);

          gr.removeTimers.set(uid, t);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
