// gameRoom.js
// จัดการสถานะห้องเกมและผู้เล่น

const { TICK_INTERVAL } = require("../constants");

// เก็บห้องเกมทั้งหมดในหน่วยความจำ
const gameRooms = {};

/**
 * สร้างห้องใหม่หรือตรวจสอบห้องที่มีอยู่
 * @param {string} code - room code
 * @returns object ห้องเกม
 */
function ensureGameRoom(code) {
  if (!gameRooms[code]) {
    gameRooms[code] = {
      players: new Map(),       // uid -> player object
      removeTimers: new Map(),  // uid -> timeoutId
      interval: null,           // snapshot ticker
    };

    // เริ่ม interval ส่ง snapshot ทุก TICK_INTERVAL ms
    gameRooms[code].interval = setInterval(() => tickRoom(code), TICK_INTERVAL);
  }
  return gameRooms[code];
}

/**
 * ส่ง snapshot ของห้องให้ client ทุกคน
 * @param {string} code - room code
 */
function tickRoom(code) {
  const gr = gameRooms[code];
  if (!gr) return;

  const payload = {
    room: code,
    players: Array.from(gr.players.values()),
  };

  // ใช้ io ที่ bind ภายนอกผ่าน socketHandler.js
  if (gr.io) {
    gr.io.to(code).volatile.emit("snapshot", payload);
  }
}

module.exports = { gameRooms, ensureGameRoom, tickRoom };
