/**
 * XSS Attack Test Script
 * พยายามแทรก HTML/JavaScript ผ่านชื่อห้อง, ชื่อผู้เล่น, และข้อความแชท
 */

const io = require('socket.io-client');

// XSS payloads ที่นิยม
const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert("XSS")>',
  '<svg onload=alert("XSS")>',
  'javascript:alert("XSS")',
  '<iframe src="javascript:alert(\'XSS\')">',
  '<body onload=alert("XSS")>',
  '"><script>alert(String.fromCharCode(88,83,83))</script>',
  '<img src="x" onerror="eval(atob(\'YWxlcnQoJ1hTUycp\'))">',
  '<input onfocus=alert("XSS") autofocus>',
  '<select onfocus=alert("XSS") autofocus>',
];

console.log('🔴 Starting XSS Attack Tests...\n');

// Test 1: ทดสอบ XSS ในชื่อผู้เล่น
async function testPlayerNameXSS() {
  console.log('Test 1: XSS in Player Name');
  console.log('=' .repeat(50));
  
  for (const payload of XSS_PAYLOADS) {
    const socket = io('http://localhost:3000', {
      transports: ['websocket'],
      autoConnect: false
    });

    await new Promise((resolve) => {
      socket.connect();
      
      socket.on('connect', () => {
        console.log(`Testing payload: ${payload.substring(0, 40)}...`);
        
        socket.emit('game:join', {
          room: 'test-xss-room',
          uid: 'attacker-' + Date.now(),
          name: payload, // พยายามแทรก XSS
          color: '#ff0000',
          char: 'mini_brown',
          x: 100,
          y: 100
        });

        // ดูว่าเซิร์ฟเวอร์ตอบกลับอย่างไร
        socket.on('game:join:ack', (data) => {
          console.log('✓ Server accepted (payload sanitized):', data);
        });

        socket.on('snapshot', (data) => {
          const player = data.players.find(p => p.name === payload);
          if (player) {
            console.log('❌ VULNERABLE: Raw payload in snapshot!', player.name);
          } else {
            console.log('✓ Safe: Payload was sanitized');
          }
        });

        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 500);
      });
    });
  }
  console.log('\n');
}

// Test 2: ทดสอบ XSS ในข้อความแชท
async function testChatXSS() {
  console.log('Test 2: XSS in Chat Messages');
  console.log('=' .repeat(50));
  
  const socket = io('http://localhost:3000', {
    transports: ['websocket']
  });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      const uid = 'attacker-chat-' + Date.now();
      
      // เข้าร่วมห้องก่อน
      socket.emit('game:join', {
        room: 'test-chat-xss',
        uid: uid,
        name: 'ChatAttacker',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        // ทดสอบแต่ละ payload
        XSS_PAYLOADS.forEach((payload, index) => {
          setTimeout(() => {
            console.log(`Testing chat payload ${index + 1}:`, payload.substring(0, 40));
            
            socket.emit('chat:message', {
              room: 'test-chat-xss',
              uid: uid,
              name: 'ChatAttacker',
              text: payload,
              id: `msg-${Date.now()}-${index}`
            });
          }, index * 100);
        });

        // ฟังข้อความที่กลับมา
        socket.on('chat:message', (data) => {
          if (XSS_PAYLOADS.includes(data.text)) {
            console.log('❌ VULNERABLE: Raw XSS payload in chat!');
          } else {
            console.log('✓ Safe: Chat message sanitized ->', data.text.substring(0, 50));
          }
        });

        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 2000);
      }, 500);
    });
  });
  
  console.log('\n');
}

// Test 3: ทดสอบ character path injection
async function testCharPathInjection() {
  console.log('Test 3: Character Path Injection');
  console.log('=' .repeat(50));
  
  const maliciousChars = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/shadow',
    'C:\\Windows\\System32\\',
    'mini_brown/../../../evil',
    'mini_brown\\..\\..\\..\\evil',
  ];

  for (const charPath of maliciousChars) {
    const socket = io('http://localhost:3000', {
      transports: ['websocket'],
      autoConnect: false
    });

    await new Promise((resolve) => {
      socket.connect();
      
      socket.on('connect', () => {
        console.log(`Testing char path: ${charPath}`);
        
        socket.emit('game:join', {
          room: 'test-path-injection',
          uid: 'path-attacker-' + Date.now(),
          name: 'PathAttacker',
          color: '#ff0000',
          char: charPath, // พยายามทำ path traversal
          x: 100,
          y: 100
        });

        socket.on('snapshot', (data) => {
          const player = data.players.find(p => p.char === charPath);
          if (player) {
            console.log('❌ VULNERABLE: Malicious path accepted!');
          } else {
            console.log('✓ Safe: Path was sanitized');
          }
        });

        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 300);
      });
    });
  }
  console.log('\n');
}

// รันทดสอบทั้งหมด
(async () => {
  try {
    await testPlayerNameXSS();
    await testChatXSS();
    await testCharPathInjection();
    
    console.log('✅ XSS Attack Tests Completed!');
    console.log('Check results above. ✓ = Protected, ❌ = Vulnerable');
    process.exit(0);
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
})();
