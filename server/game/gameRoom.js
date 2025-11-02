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
      // New: per-room gems and thief cooldowns/state
      gems: null,               // [{ id, x, y, difficulty: 'easy'|'hard', time: number, stolenBy: null|uid }]
      thiefCooldowns: new Map(), // uid -> timestamp(ms) when cooldown ends
    };

    // เริ่ม interval ส่ง snapshot ทุก TICK_INTERVAL ms
    gameRooms[code].interval = setInterval(() => tickRoom(code), TICK_INTERVAL);

    // Initialize randomized gems per room game using anchors near Visitor tasks
    const MG_ANCHORS = {
      align:  { x: 4280, y:  550 }, // hidden_switch
      mop:    { x: 1500, y: 3280 }, // Broom
      upload: { x: 4320, y: 7180 }, // computer2
      dodge:  { x: 4980, y: 7500 }, // monitor
      rhythm: { x: 6580, y: 3160 }, // matchine
      switch: { x: 7120, y: 4260 }, // battery
      wires:  { x: 7420, y: 7850 }, // power
      math:   { x: 1512, y: 6132 }, // hackbox
    };
    const keys = Object.keys(MG_ANCHORS);
    // Fisher–Yates shuffle
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const pick = keys.slice(0, 5); // 5 gems per game
    const jitter = () => (Math.random() * 160 - 80); // ±80px
    const friendlyName = (k) => ({ align:'Ruby', mop:'Sapphire', upload:'Emerald', dodge:'Topaz', rhythm:'Amethyst', switch:'Opal', wires:'Garnet', math:'Quartz' }[k] || 'Gem');
    gameRooms[code].gems = pick.map((k, idx) => {
      const a = MG_ANCHORS[k];
      return {
        id: `gem${idx+1}`,
        name: friendlyName(k),
        anchor: k,
        x: Math.max(0, Math.min(8191, a.x + jitter())),
        y: Math.max(0, Math.min(8191, a.y + jitter())),
        difficulty: 'easy',
        time: 30,
        stolenBy: null,
      };
    });
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
