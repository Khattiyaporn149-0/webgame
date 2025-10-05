# Goose-like Start Menu (Web)

โครงสร้างหน้าเริ่มเกมสไตล์ Goose Goose Duck สำหรับเว็บเกมของคุณ
- HTML/CSS/JS ล้วน ๆ (ไม่มีไลบรารีภายนอก)
- พื้นหลังอนิเมชันเบา ๆ ด้วย Canvas
- ปุ่มหลัก: QUICKPLAY / CUSTOM GAME
- ปุ่มรอง/ไอคอนเหมือนตัวอย่างในสกรีนช็อต
- Settings modal + localStorage persistence

## ใช้ยังไง
เปิด `index.html` ได้เลย หรือวางลงในโปรเจ็กของคุณ แล้วเชื่อมต่อปุ่ม `QUICKPLAY` กับโค้ดเริ่มเกมจริง:
```js
// ใน app.js
window.startGame && window.startGame({ mode: 'quick', /* ... */ });
```

> โปรเจ็กนี้ใช้ทรัพย์สินภาพ/ตัวอักษรแบบ generic ไม่ใช้โลโก้/สินทรัพย์ลิขสิทธิ์ของเกมต้นฉบับ
