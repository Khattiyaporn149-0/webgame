// ==========================================
// 1. IMPORT MODULES
// ==========================================
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const path = require("path")

// ==========================================
// 2. สร้างแอป Express และ Socket.IO
// ==========================================
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PORT = process.env.PORT || 3000

// ==========================================
// 3. เสิร์ฟไฟล์ฝั่ง client (HTML, CSS, JS)
// ==========================================
// ทุกไฟล์ในโฟลเดอร์ client จะถูกเสิร์ฟอัตโนมัติ
// เช่น client/index.html → http://localhost:3000/index.html
app.use(express.static(path.join(__dirname, "../client")))

// ==========================================
// 4. ตัวแปรหลัก: เก็บข้อมูลห้องทั้งหมดใน memory
// ==========================================
// โครงสร้าง rooms:
// {
//   "ABCD": {
//       players: ["socketid1", "socketid2"]
//   },
//   "XYZ1": {
//       players: ["socketid9"]
//   }
// }
let rooms = {}

// ==========================================
// 5. ฟังก์ชัน helper: broadcast รายชื่อห้องทั้งหมด
// ==========================================
// ทุกครั้งที่สร้างห้อง / ลบห้อง / มีคนออก
// เราจะอัปเดตรายชื่อห้องให้ทุก client ที่เปิด Room List อยู่
function broadcastRooms() {
  const list = Object.keys(rooms).map((code) => ({
    code,
    players: rooms[code].players.length,
  }))
  io.emit("roomList", list)
}

// ==========================================
// 6. EVENT หลักของ Socket.IO
// ==========================================
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id)

  // ------------------------------------------
  // 🧩 สร้างห้องใหม่
  // ------------------------------------------
  socket.on("createRoom", () => {
    // สร้างรหัสห้อง 4 ตัว เช่น AB12
    const code = Math.random().toString(36).substring(2, 6).toUpperCase()

    // เก็บข้อมูลห้องใน memory
    rooms[code] = { players: [socket.id] }

    // ให้ socket นี้เข้าห้อง (room ของ socket.io)
    socket.join(code)

    // แจ้งกลับไปยังผู้สร้างว่าห้องถูกสร้างแล้ว
    socket.emit("roomCreated", code)
    console.log(`✅ Room created: ${code}`)

    // อัปเดตรายการห้องให้ทุก client ที่ดู Room List
    broadcastRooms()
  })

  // ------------------------------------------
  // 📜 ขอรายชื่อห้องทั้งหมด (หน้า Room List)
  // ------------------------------------------
  socket.on("getRooms", () => {
    const roomList = Object.keys(rooms).map((code) => ({
      code,
      players: rooms[code].players.length,
    }))
    socket.emit("roomList", roomList)
  })

  // ------------------------------------------
  // 🚪 เข้าห้องที่มีอยู่แล้ว
  // ------------------------------------------
  socket.on("joinRoom", (code) => {
    console.log(`🟡 ${socket.id} wants to join ${code}`)

    // ตรวจว่าห้องมีอยู่ไหม
    if (rooms[code]) {
      // จำกัดจำนวนผู้เล่นสูงสุด เช่น 8 คน
      if (rooms[code].players.length >= 8) {
        socket.emit("error", "⚠️ Room is full!")
        return
      }

      // เพิ่มผู้เล่นใหม่เข้าห้อง
      socket.join(code)
      rooms[code].players.push(socket.id)

      // ส่ง event บอกผู้เล่นนี้ว่า join สำเร็จ
      socket.emit("joinedRoom", code)

      // แจ้งผู้เล่นคนอื่นในห้องว่ามีคนใหม่เข้ามา
      io.to(code).emit("newPlayer", socket.id)

      // อัปเดตรายการห้องทั้งหมด
      broadcastRooms()
    } else {
      socket.emit("error", "❌ Room not found!")
    }
  })

  // ------------------------------------------
  // 🕹️ รับการเคลื่อนไหวจากผู้เล่นในห้อง
  // ------------------------------------------
  socket.on("move", (data) => {
    // ตรวจสอบว่าอยู่ในห้องจริงไหม
    const room = rooms[data.room]
    if (!room || !room.players.includes(socket.id)) return

    // ส่งตำแหน่งของ player นี้ให้คนอื่นในห้อง
    socket.to(data.room).emit("playerMoved", {
      id: socket.id,
      player: data.player,
    })
  })

  // ------------------------------------------
  // ❌ เมื่อผู้เล่นหลุดออกจากเซิร์ฟเวอร์
  // ------------------------------------------
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id)

    // ลบ socket นี้ออกจากทุกห้องที่อยู่
    for (const code in rooms) {
      rooms[code].players = rooms[code].players.filter((id) => id !== socket.id)

      // ถ้าห้องนี้ไม่มีคนแล้ว → ลบห้องทิ้ง
      if (rooms[code].players.length === 0) {
        delete rooms[code]
        console.log(`🗑️ Room deleted: ${code}`)
      }
    }

    // อัปเดตรายการห้องทั้งหมดให้ทุก client
    broadcastRooms()
  })
})

socket.on("playerReady", ({ room, ready }) => {
  const r = rooms[room];
  if (!r) return;

  // เก็บสถานะ ready ของผู้เล่นใน object (เพิ่ม key “ready”)
  if (!r.info) r.info = {}; // สร้าง dict ไว้เก็บข้อมูลเพิ่ม
  r.info[socket.id] = { ready };

  // รวมรายชื่อพร้อมสถานะ
  const playerList = r.players.map(id => ({
    name: id.substring(0, 5),
    ready: r.info[id]?.ready || false,
  }));

  // broadcast ให้ทุกคนในห้องรู้
  io.to(room).emit("updatePlayers", playerList);
});

socket.on("chatMessage", (data) => {
  io.to(data.room).emit("chatMessage", {
    sender: socket.id.substring(0, 5),
    text: data.text,
  });
});


// ==========================================
// 7. เริ่มต้นเซิร์ฟเวอร์
// ==========================================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
// End of file