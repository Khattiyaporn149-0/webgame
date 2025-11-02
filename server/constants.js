// constants.js
// เก็บค่าคงที่ของ server

module.exports = {
  PORT: 3000,             // พอร์ต server
  TICK_INTERVAL: 100,     // ms interval สำหรับ snapshot heartbeat
  GRACE_DISCONNECT_MS: 5000, // เวลารอผู้เล่น reconnect ก่อนลบ
};
