# 🔒 Security Testing Suite

ชุดทดสอบความปลอดภัยสำหรับ web game - จำลองการโจมตีจริงเพื่อทดสอบระบบป้องกัน

## 📋 รายการทดสอบ

### 1. XSS (Cross-Site Scripting) - `attack-xss.js`
ทดสอบการแทรก HTML/JavaScript ผ่าน:
- ชื่อผู้เล่น (Player name)
- ข้อความแชท (Chat messages)
- Character path (Path traversal)

**Payloads ที่ใช้:**
- `<script>alert("XSS")</script>`
- `<img src=x onerror=alert("XSS")>`
- `<svg onload=alert("XSS")>`
- Path traversal attempts: `../../../etc/passwd`

### 2. Privilege Escalation - `attack-privilege-escalation.js`
ทดสอบการเข้าถึงข้อมูลที่ไม่ได้รับอนุญาต:
- แก้ไขข้อมูลผู้เล่นคนอื่น
- ปลอม UID ในข้อความแชท
- ควบคุมตัวละครของคนอื่น

### 3. DoS (Denial of Service) - `attack-dos.js`
ทดสอบการสแปมและ rate limiting:
- Chat message spam (100 messages)
- Movement spam (200 moves)
- Connection spam (50 connections)
- Oversized payload (10KB message)

### 4. Firebase Rules - `attack-firebase-rules.js`
ทดสอบกฎฐานข้อมูล:
- เขียนข้อมูลห้องโดยไม่ใช่ host
- แก้ไขแชทของคนอื่น
- ฟิลด์ที่ไม่อนุญาต
- Regex bypass
- Timestamp manipulation

### 5. Data Injection - `attack-data-injection.js`
ทดสอบการส่งข้อมูลผิดรูปแบบ:
- Type confusion (ส่ง object แทน string)
- SQL/NoSQL injection strings
- Buffer overflow attempts
- Unicode/encoding attacks
- Prototype pollution

## 🚀 วิธีใช้

### ติดตั้ง dependencies
```bash
cd security-tests
npm install
```

### รัน server ก่อน
```bash
cd ../server
npm start
# Server จะรันที่ http://localhost:3000
```

### รันทดสอบแต่ละชุด
```bash
# ทดสอบ XSS
npm run test:xss

# ทดสอบ Privilege Escalation
npm run test:privilege

# ทดสอบ DoS/Rate Limiting
npm run test:dos

# ทดสอบ Data Injection
npm run test:injection

# รันทดสอบทั้งหมด
npm run test:all
```

## 📊 การอ่านผลลัพธ์

- ✓ **Safe/Protected** - ระบบป้องกันทำงานถูกต้อง
- ⚠️ **Warning** - มีความเสี่ยงระดับกลาง ควรปรับปรุง
- ❌ **VULNERABLE** - พบช่องโหว่! ต้องแก้ไขทันที

## 🔍 ผลการทดสอบที่คาดหวัง

### XSS Protection
- ชื่อและข้อความต้องถูก sanitize (ตัด `<` `>`)
- Character path จำกัดเฉพาะตัวอักษรที่อนุญาต
- ไม่มี script execution ในหน้าเว็บ

### Privilege Escalation
- ไม่สามารถแก้ไขข้อมูลผู้เล่นคนอื่น
- Chat UID ต้องถูก enforce จาก socket.data
- Move ต้องใช้ UID จาก socket session

### Rate Limiting
- Chat: ~4 messages/second (burst 5)
- Move: ~30 moves/second
- ข้อความที่เกิน limit ต้องถูก drop

### Data Validation
- Type checking ทำงาน (reject non-string/non-number)
- ความยาวจำกัด (name ≤40, chat ≤500)
- Control characters ถูกลบออก
- Prototype pollution ถูกบล็อก

## ⚠️ คำเตือน

- **อย่ารันสคริปต์เหล่านี้กับ production server!**
- ใช้เฉพาะสำหรับทดสอบในสภาพแวดล้อม development
- บางทดสอบอาจทำให้ server ช้าชั่วคราว
- Firebase rules test ต้องใช้ Firebase Emulator

## 🛠️ การพัฒนาต่อ

ถ้าต้องการเพิ่มทดสอบ:
1. สร้างไฟล์ `attack-<name>.js`
2. ใช้ socket.io-client เชื่อม server
3. ส่ง payloads และตรวจสอบผลลัพธ์
4. เพิ่ม script ใน package.json

## 📝 License

Internal testing tool - ห้ามใช้โจมตีระบบที่ไม่ได้รับอนุญาต
