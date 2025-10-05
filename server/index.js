const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PORT = process.env.PORT || 3000

// ======================
// 1. เสิร์ฟหน้า client
// ======================
app.use(express.static(path.join(__dirname, "../client")))

// ======================
// 2. Logic ห้องและ socket
// ======================
let rooms = {}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id)

  // สร้างห้องใหม่
  socket.on("createRoom", () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase()
    rooms[code] = { players: [socket.id] }
    socket.join(code)
    console.log(`✅ Room created: ${code}`)
    socket.emit("roomCreated", code)
  })

  // เข้าห้องที่มีอยู่
  socket.on("joinRoom", (code) => {
    console.log(`🟡 ${socket.id} wants to join ${code}`)
    if (rooms[code]) {
      socket.join(code)
      rooms[code].players.push(socket.id)
      socket.emit("joinedRoom", code)
      io.to(code).emit("newPlayer", socket.id)
    } else {
      socket.emit("error", "❌ Room not found!")
    }
  })

    socket.on("move", (data) => {
    // ส่งตำแหน่งไปให้ทุกคนในห้อง (ยกเว้นตัวเอง)
    socket.to(data.room).emit("playerMoved", { id: socket.id, player: data.player })
    })


  // ออกจากเกม
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id)
    for (const code in rooms) {
      rooms[code].players = rooms[code].players.filter((id) => id !== socket.id)
      if (rooms[code].players.length === 0) delete rooms[code]
    }
  })
})

// ======================
// 3. Start Server
// ======================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
// End of server/index.js