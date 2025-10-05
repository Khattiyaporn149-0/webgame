const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static(path.join(__dirname, "../client")))

// 🔹 เก็บข้อมูลห้องทั้งหมดใน server
// rooms = { ROOMCODE: { players: [socket.id, ...] } }
let rooms = {}

// เมื่อมี client ใหม่เชื่อมต่อเข้ามา
io.on("connection", (socket) => {
  console.log("✅ Player connected:", socket.id)

  // ====== 1️⃣ สร้างห้องใหม่ ======
  socket.on("createRoom", () => {
    const roomCode = generateRoomCode() // สุ่มโค้ดห้อง 4 ตัว
    rooms[roomCode] = { players: [] } // สร้าง object ห้องใหม่
    socket.join(roomCode) // ให้ socket ตัวนี้เข้าห้องนั้นเลย
    rooms[roomCode].players.push(socket.id) // บันทึก player ในห้อง
    socket.emit("roomCreated", roomCode) // ส่งโค้ดห้องกลับให้คนสร้าง
    console.log(`🟢 Room ${roomCode} created by ${socket.id}`)
  })

  // ====== 2️⃣ เข้าร่วมห้องด้วยโค้ด ======
  socket.on("joinRoom", (code) => {
    if (rooms[code]) {
      socket.join(code) // เข้าห้องที่มีอยู่
      rooms[code].players.push(socket.id)
      socket.emit("joinedRoom", code) // แจ้ง client ว่าเข้าห้องสำเร็จ
      io.to(code).emit("newPlayer", socket.id) // แจ้งคนในห้องว่ามีคนใหม่
      console.log(`🟢 ${socket.id} joined room ${code}`)
    } else {
      socket.emit("error", "❌ Room not found!") // แจ้ง error ถ้าโค้ดห้องไม่มีจริง
    }
  })

  // ====== 3️⃣ รับตำแหน่งการเคลื่อนไหวของผู้เล่น ======
  socket.on("move", (data) => {
    // หา “ชื่อห้อง” ที่ socket นี้อยู่
    const room = Object.keys(socket.rooms).find((r) => r !== socket.id)
    // ส่ง event playerMoved เฉพาะในห้องนั้นเท่านั้น
    if (room) io.to(room).emit("playerMoved", { id: socket.id, ...data })
  })

  // ====== 4️⃣ ออกจากเกม / ปิดเบราว์เซอร์ ======
  socket.on("disconnect", () => {
    console.log("❌ Player disconnected:", socket.id)

    // ลบผู้เล่นออกจากห้องทั้งหมดที่เขาอยู่
    for (let [code, room] of Object.entries(rooms)) {
      room.players = room.players.filter((p) => p !== socket.id)
      // ถ้าห้องนั้นไม่มีคนเหลือ → ลบทิ้งเลย
      if (room.players.length === 0) {
        delete rooms[code]
        console.log(`🗑️ Room ${code} removed (empty)`)
      }
    }
  })
})

// 🔹 ฟังก์ชันสุ่มโค้ดห้อง เช่น "ABCD"
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase()
}

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
// End of server/index.js