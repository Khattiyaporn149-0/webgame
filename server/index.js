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
const io = new Server(server, {
  transports: ["websocket"], // reduce handshake/upgrade latency
  perMessageDeflate: false,   // lower CPU/latency for high-frequency frames
})
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
// 4.1️⃣ Game state for Socket.IO movement
// ==========================================
// gameRooms: { [roomCode]: { players: Map<uid, Player>, interval: NodeJS.Timer } }
// Player: { uid, name, color, x, y, vx, vy, socketId?, lastSeq, bot?: boolean, aiNext?: number }
const gameRooms = {}

function ensureGameRoom(code) {
  if (gameRooms[code]) return gameRooms[code]
  const gr = {
    players: new Map(), // uid -> { uid,name,color,x,y,vx,vy,socketId,lastSeq }
    interval: null,
    state: {
      phase: 'round',
      roles: new Map(), // uid -> 'impostor' | 'crew'
      alive: new Set(),
      dead: new Set(),
      bodies: [], // { x,y,uid }
      emergencyCalls: new Map(), // uid -> remaining
      meeting: null, // { votes: Map<uid, target|'skip'>, startedAt, durationMs }
    },
  }
  // simple authoritative loop @ 20Hz
  gr.interval = setInterval(() => tickRoom(code, gr), 33) // ~30Hz
  gameRooms[code] = gr
  return gr
}

function removeGameRoom(code) {
  const gr = gameRooms[code]
  if (!gr) return
  clearInterval(gr.interval)
  delete gameRooms[code]
}

function tickRoom(code, gr) {
  const dt = 1 / 30 // 33ms
  const speed = 220 // px/s
  const now = Date.now()
  // simple bot AI: change direction every 0.8–1.6s
  gr.players.forEach((p) => {
    if (!p.bot) return
    if (!p.aiNext || p.aiNext < now) {
      const dir = Math.random() * Math.PI * 2
      p.vx = Math.cos(dir)
      p.vy = Math.sin(dir)
      p.aiNext = now + 800 + Math.random() * 800
    }
  })
  // integrate
  gr.players.forEach((p) => {
    const len = Math.hypot(p.vx || 0, p.vy || 0) || 1
    const nx = p.x + (len ? (p.vx / len) * speed * dt : 0)
    const ny = p.y + (len ? (p.vy / len) * speed * dt : 0)
    // clamp to canvas 800x600 (match client default)
    p.x = Math.max(20, Math.min(800 - 20, nx))
    p.y = Math.max(20, Math.min(600 - 20, ny))
  })

  // snapshot to clients (volatile, okay to drop frames)
  const payload = {
    t: Date.now(),
    players: Array.from(gr.players.values()).map((p) => ({
      uid: p.uid,
      name: p.name,
      color: p.color,
      x: Math.round(p.x),
      y: Math.round(p.y),
      alive: !gr.state.dead.has(p.uid),
    })),
  }
  io.to(code).volatile.emit('snapshot', payload)
}

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
  // 🎮 GAME MOVEMENT (Socket.IO)
  // ------------------------------------------
  socket.on('game:join', (data) => {
    const { room, uid, name, color, x, y } = data || {}
    if (!room || !uid) return
    socket.join(room)
    const gr = ensureGameRoom(room)
    gr.players.set(uid, {
      uid,
      name: name || uid.substring(0, 5),
      color: color || '#4ECDC4',
      x: typeof x === 'number' ? x : 400,
      y: typeof y === 'number' ? y : 300,
      vx: 0,
      vy: 0,
      socketId: socket.id,
      lastSeq: 0,
    })
    // default alive and emergency if not set
    if (!gr.state.alive.has(uid) && !gr.state.dead.has(uid)) gr.state.alive.add(uid)
    if (!gr.state.emergencyCalls.has(uid)) gr.state.emergencyCalls.set(uid, 1)

    // send immediate snapshot to the new client to reduce perceived delay
    const payload = {
      t: Date.now(),
      players: Array.from(gr.players.values()).map((p) => ({
        uid: p.uid,
        name: p.name,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        alive: !gr.state.dead.has(p.uid),
      })),
    }
    socket.emit('snapshot', payload)
    // also send current phase
    socket.emit('phase', { phase: gr.state.phase })
  })

  socket.on('input', (data) => {
    // data: { seq, t, ax, ay }
    // find player room by membership
    const roomsJoined = [...socket.rooms].filter((r) => r !== socket.id)
    if (roomsJoined.length === 0) return
    const room = roomsJoined[0]
    const gr = gameRooms[room]
    if (!gr) return

    // find player by socket.id
    let playerEntry
    for (const p of gr.players.values()) {
      if (p.socketId === socket.id) { playerEntry = p; break }
    }
    if (!playerEntry) return

    const ax = Math.max(-1, Math.min(1, Number(data?.ax) || 0))
    const ay = Math.max(-1, Math.min(1, Number(data?.ay) || 0))
    playerEntry.vx = ax
    playerEntry.vy = ay
    playerEntry.lastSeq = Number(data?.seq) || playerEntry.lastSeq
  })

  // ------------------------------------------
  // 🧪 Dev helpers (for solo testing)
  // ------------------------------------------
  socket.on('dev:addBot', (data) => {
    const room = (data && data.room) || [...socket.rooms].find((r) => r !== socket.id)
    if (!room) return
    const gr = ensureGameRoom(room)
    const uid = 'bot_' + Math.random().toString(36).slice(2, 8)
    const name = 'Bot ' + uid.slice(-4).toUpperCase()
    gr.players.set(uid, {
      uid,
      name,
      color: '#98D8C8',
      x: 400 + Math.random()*100 - 50,
      y: 300 + Math.random()*100 - 50,
      vx: 0,
      vy: 0,
      lastSeq: 0,
      bot: true,
      aiNext: 0,
    })
    gr.state.alive.add(uid)
  })

  socket.on('dev:forceRole', (data) => {
    const role = (data?.role === 'impostor') ? 'impostor' : 'crew'
    const roomsJoined = [...socket.rooms].filter((r) => r !== socket.id)
    if (roomsJoined.length === 0) return
    const room = roomsJoined[0]
    const gr = ensureGameRoom(room)
    let actor
    for (const p of gr.players.values()) { if (p.socketId === socket.id) { actor = p; break } }
    if (!actor) return
    gr.state.roles.set(actor.uid, role)
    io.to(actor.socketId).emit('role', { role })
  })

  socket.on('dev:spawnBody', () => {
    const roomsJoined = [...socket.rooms].filter((r) => r !== socket.id)
    if (roomsJoined.length === 0) return
    const room = roomsJoined[0]
    const gr = ensureGameRoom(room)
    let actor
    for (const p of gr.players.values()) { if (p.socketId === socket.id) { actor = p; break } }
    if (!actor) return
    gr.state.bodies.push({ x: actor.x, y: actor.y, uid: 'dummy' })
  })

  // Gameplay: start & events
  socket.on('game:start', (data) => {
    const room = (data && data.room) || [...socket.rooms].find((r) => r !== socket.id)
    if (!room) return
    const gr = ensureGameRoom(room)
    // ensure at least 2 players for testing
    let uids = Array.from(gr.players.keys())
    if (uids.length < 2) {
      const need = 2 - uids.length
      for (let i = 0; i < need; i++) {
        const uid = 'bot_' + Math.random().toString(36).slice(2, 8)
        const name = 'Bot ' + uid.slice(-4).toUpperCase()
        gr.players.set(uid, {
          uid,
          name,
          color: '#98D8C8',
          x: 400 + Math.random()*100 - 50,
          y: 300 + Math.random()*100 - 50,
          vx: 0,
          vy: 0,
          lastSeq: 0,
          bot: true,
          aiNext: 0,
        })
        gr.state.alive.add(uid)
      }
      uids = Array.from(gr.players.keys())
    }
    // assign roles (1 impostor for now)
    if (uids.length === 0) return
    gr.state.roles = new Map()
    gr.state.alive = new Set(uids)
    gr.state.dead = new Set()
    gr.state.bodies = []
    gr.state.phase = 'round'
    // pick one impostor
    const imp = uids[Math.floor(Math.random() * uids.length)]
    uids.forEach((u) => gr.state.roles.set(u, u === imp ? 'impostor' : 'crew'))
    // notify roles privately
    gr.players.forEach((p) => {
      io.to(p.socketId).emit('role', { role: gr.state.roles.get(p.uid) })
    })
    io.to(room).emit('phase', { phase: 'round' })
  })

  socket.on('game:event', (data) => {
    const type = data?.type
    const roomsJoined = [...socket.rooms].filter((r) => r !== socket.id)
    if (roomsJoined.length === 0) return
    const room = roomsJoined[0]
    const gr = gameRooms[room]
    if (!gr) return

    // helper find player by socket
    let actor
    for (const p of gr.players.values()) { if (p.socketId === socket.id) { actor = p; break } }
    if (!actor) return

    const role = gr.state.roles.get(actor.uid) || 'crew'
    const isAlive = gr.state.alive.has(actor.uid)
    if (!isAlive) return

    const endIfWin = () => {
      const aliveImps = [...gr.state.alive].filter(u => gr.state.roles.get(u) === 'impostor').length
      const aliveCrew = [...gr.state.alive].filter(u => gr.state.roles.get(u) !== 'impostor').length
      if (aliveImps === 0) {
        gr.state.phase = 'ended'
        io.to(room).emit('phase', { phase: 'ended', winner: 'Crewmates' })
        return true
      }
      if (aliveImps >= aliveCrew) {
        gr.state.phase = 'ended'
        io.to(room).emit('phase', { phase: 'ended', winner: 'Impostors' })
        return true
      }
      return false
    }

    if (type === 'kill' && gr.state.phase === 'round') {
      if (role !== 'impostor') return
      // find nearest alive crew within radius
      const radius = 60
      let best = null
      gr.players.forEach((q) => {
        if (q.uid === actor.uid) return
        if (!gr.state.alive.has(q.uid)) return
        if (gr.state.roles.get(q.uid) === 'impostor') return
        const d = Math.hypot(q.x - actor.x, q.y - actor.y)
        if (d <= radius && (!best || d < best.d)) best = { q, d }
      })
      if (!best) return
      gr.state.alive.delete(best.q.uid)
      gr.state.dead.add(best.q.uid)
      gr.state.bodies.push({ x: best.q.x, y: best.q.y, uid: best.q.uid })
      io.to(room).emit('event:kill', { victim: best.q.uid, victimName: best.q.name })
      if (endIfWin()) return
    }

    if (type === 'report' && gr.state.phase === 'round') {
      // must be near a body
      const radius = 80
      const body = gr.state.bodies.find((b) => Math.hypot((actor.x - b.x), (actor.y - b.y)) <= radius)
      if (!body) return
      // start meeting
      gr.state.phase = 'meeting'
      const candidates = [...gr.state.alive].map((u) => ({ uid: u, name: gr.players.get(u)?.name || u }))
      gr.state.meeting = { votes: new Map(), startedAt: Date.now(), durationMs: 30000 }
      gr.state.bodies = [] // clear reported bodies
      io.to(room).emit('meeting:start', { candidates, reason: 'Body reported' })
    }

    if (type === 'callMeeting' && gr.state.phase === 'round') {
      const left = gr.state.emergencyCalls.get(actor.uid) || 0
      if (left <= 0) return
      gr.state.emergencyCalls.set(actor.uid, left - 1)
      gr.state.phase = 'meeting'
      const candidates = [...gr.state.alive].map((u) => ({ uid: u, name: gr.players.get(u)?.name || u }))
      gr.state.meeting = { votes: new Map(), startedAt: Date.now(), durationMs: 30000 }
      io.to(room).emit('meeting:start', { candidates, reason: 'Emergency meeting' })
    }

    if (type === 'vote' && gr.state.phase === 'meeting') {
      const target = data?.target // uid or 'skip'
      if (!target) return
      gr.state.meeting?.votes.set(actor.uid, target)
      // if all alive voted or timer expired -> resolve
      const allAlive = gr.state.alive.size
      const voted = gr.state.meeting?.votes.size || 0
      const timeup = (Date.now() - gr.state.meeting.startedAt) >= gr.state.meeting.durationMs
      if (voted >= allAlive || timeup) {
        // tally
        const tally = {}
        for (const v of gr.state.meeting.votes.values()) {
          tally[v] = (tally[v] || 0) + 1
        }
        // find top excluding 'skip' precedence rules
        let top = null; let topCount = 0
        for (const [k, c] of Object.entries(tally)) {
          if (k === 'skip') continue
          if (c > topCount) { top = k; topCount = c }
          else if (c === topCount) { top = null } // tie -> no ejection
        }
        let ejected = null
        if (top) {
          ejected = top
          gr.state.alive.delete(ejected)
          gr.state.dead.add(ejected)
        }
        io.to(room).emit('meeting:result', { ejected, ejectedName: ejected ? (gr.players.get(ejected)?.name || ejected) : null })
        if (endIfWin()) return
        gr.state.meeting = null
        gr.state.phase = 'round'
        io.to(room).emit('phase', { phase: 'round' })
      }
    }
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

    // remove from gameRooms as well
    for (const [code, gr] of Object.entries(gameRooms)) {
      for (const [uid, p] of gr.players.entries()) {
        if (p.socketId === socket.id) {
          gr.players.delete(uid)
        }
      }
      if (gr.players.size === 0) {
        removeGameRoom(code)
        console.log(`🗑️ Game room loop stopped: ${code}`)
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
