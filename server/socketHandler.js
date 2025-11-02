// socketHandler.js
// รวม event handlers ของ socket.io

const { gameRooms, ensureGameRoom, tickRoom } = require("./game/gameRoom");
const { GRACE_DISCONNECT_MS } = require("./constants");

/**
 * registerSocketHandlers(io)
 * @param {Server} io - socket.io server
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    // JOIN ROOM
    socket.on("game:join", (data = {}) => {
      const { room, uid, name, color, char, x, y } = data;
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

      socket.data.room = room;
      socket.data.uid = uid;
      socket.join(room);

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

    // CHAT
    socket.on("chat:message", (data = {}) => {
      if (!data?.text || !data?.uid) return;
      const room = data.room || socket.data.room;
      if (!room) return;

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
  });
}

module.exports = registerSocketHandlers;
