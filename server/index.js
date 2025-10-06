// ==========================================
// 1️⃣ IMPORT MODULES
// ==========================================
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")

// ==========================================
// 2️⃣ สร้างแอป Express และ Socket.IO
// ==========================================
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PORT = process.env.PORT || 3000

// ==========================================
// 3️⃣ เสิร์ฟไฟล์ฝั่ง client (HTML, CSS, JS)
// ==========================================
app.use(express.static(path.join(__dirname, "../client")))

// ==========================================
// 4️⃣ ตัวแปรหลัก: เก็บข้อมูลห้องทั้งหมดใน memory
// ==========================================
// โครงสร้าง rooms:
// {
//   "ABCD": {
//     players: ["socketid1", "socketid2"],
//     info: {
//       "socketid1": { ready: true },
//       "socketid2": { ready: false }
//     }
//   }
// }
let rooms = {}

// ==========================================
// 5️⃣ Helper: broadcast รายชื่อห้องทั้งหมด
// ==========================================
function broadcastRooms() {
  const list = Object.keys(rooms).map((code) => ({
    code,
    players: rooms[code].players.length,
  }))
  io.emit("roomList", list)
}

// ==========================================
// 6️⃣ SOCKET.IO EVENTS
// ==========================================
io.on("connection", (socket) => {
  console.log(`🟢 Connected: ${socket.id}`)

  // ------------------------------------------
  // 🧩 CREATE ROOM
  // ------------------------------------------
  socket.on("createRoom", () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase()
    rooms[code] = { players: [socket.id] }
    socket.join(code)
    socket.emit("roomCreated", code)
    console.log(`✅ Room created: ${code}`)
    broadcastRooms()
  })

  // ------------------------------------------
  // 📜 GET ROOM LIST
  // ------------------------------------------
  socket.on("getRooms", () => {
    const roomList = Object.keys(rooms).map((code) => ({
      code,
      players: rooms[code].players.length,
    }))
    socket.emit("roomList", roomList)
  })

  // ------------------------------------------
  // 🚪 JOIN ROOM
  // ------------------------------------------
  socket.on("joinRoom", (code) => {
    console.log(`🟡 ${socket.id} wants to join ${code}`)

    if (rooms[code]) {
      if (rooms[code].players.length >= 8) {
        socket.emit("error", "⚠️ Room is full!")
        return
      }

      socket.join(code)
      rooms[code].players.push(socket.id)
      socket.emit("joinedRoom", code)
      io.to(code).emit("newPlayer", socket.id)
      broadcastRooms()
    } else {
      socket.emit("error", "❌ Room not found!")
    }
  })

  // ------------------------------------------
  // 🕹️ PLAYER MOVE
  // ------------------------------------------
  socket.on("move", (data) => {
    const room = rooms[data.room]
    if (!room || !room.players.includes(socket.id)) return

    socket.to(data.room).emit("playerMoved", {
      id: socket.id,
      player: data.player,
    })
  })

  // ------------------------------------------
  // ✅ PLAYER READY
  // ------------------------------------------
  socket.on("playerReady", ({ room, ready }) => {
    const r = rooms[room]
    if (!r) return

    if (!r.info) r.info = {}
    r.info[socket.id] = { ready }

    const playerList = r.players.map((id) => ({
      name: id.substring(0, 5),
      ready: r.info[id]?.ready || false,
    }))

    io.to(room).emit("updatePlayers", playerList)
    console.log(`🎯 ${socket.id} ready=${ready} in room ${room}`)
  })

  // ------------------------------------------
  // 💬 CHAT MESSAGE
  // ------------------------------------------
  socket.on("chatMessage", (data) => {
    io.to(data.room).emit("chatMessage", {
      sender: socket.id.substring(0, 5),
      text: data.text,
    })
    console.log(`💬 [${data.room}] ${socket.id.substring(0, 5)}: ${data.text}`)
  })

  // ------------------------------------------
  // ❌ DISCONNECT
  // ------------------------------------------
  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`)

    for (const code in rooms) {
      rooms[code].players = rooms[code].players.filter(
        (id) => id !== socket.id
      )

      if (rooms[code].players.length === 0) {
        delete rooms[code]
        console.log(`🗑️ Room deleted: ${code}`)
      }
    }

    broadcastRooms()
  })
})

// ==========================================
// 7️⃣ เริ่มต้นเซิร์ฟเวอร์
// ==========================================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
// ==========================================
// END OF FILE
// ==========================================
