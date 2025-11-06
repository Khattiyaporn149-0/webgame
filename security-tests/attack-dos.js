/**
 * DoS Attack Test (Rate Limiting)
 * ทดสอบการสแปมข้อความและ events เพื่อทำให้เซิร์ฟเวอร์ล่ม
 */

const io = require('socket.io-client');

console.log('🔴 Starting DoS/Rate Limit Tests...\n');

// Test 1: Chat spam
async function testChatSpam() {
  console.log('Test 1: Chat Message Spam');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'spammer-' + Date.now();

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'spam-test',
        uid: uid,
        name: 'Spammer',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        console.log('Sending 100 chat messages rapidly...');
        let sent = 0;
        let received = 0;

        const startTime = Date.now();

        // ส่ง 100 ข้อความอย่างรวดเร็ว
        for (let i = 0; i < 100; i++) {
          socket.emit('chat:message', {
            room: 'spam-test',
            uid: uid,
            name: 'Spammer',
            text: `Spam message ${i}`,
            id: `spam-${Date.now()}-${i}`
          });
          sent++;
        }

        socket.on('chat:message', (data) => {
          received++;
        });

        setTimeout(() => {
          const duration = Date.now() - startTime;
          console.log(`Sent: ${sent}, Received: ${received}, Duration: ${duration}ms`);
          
          if (received >= 90) {
            console.log('❌ VULNERABLE: Most messages went through (weak rate limit)');
          } else if (received >= 50) {
            console.log('⚠️  WARNING: Moderate rate limiting (~50% blocked)');
          } else if (received >= 20) {
            console.log('✓ Good: Strong rate limiting (~80% blocked)');
          } else {
            console.log('✓ Excellent: Very strong rate limiting');
          }

          socket.disconnect();
          resolve();
        }, 3000);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 2: Movement spam
async function testMovementSpam() {
  console.log('Test 2: Player Movement Spam');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'move-spammer-' + Date.now();

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'move-spam-test',
        uid: uid,
        name: 'MoveSpammer',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        console.log('Sending 200 move commands rapidly...');
        let sent = 0;
        let received = 0;

        const startTime = Date.now();

        // ส่ง 200 คำสั่งเคลื่อนที่อย่างรวดเร็ว
        for (let i = 0; i < 200; i++) {
          socket.emit('player:move', {
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            ts: Date.now()
          });
          sent++;
        }

        socket.on('player:movedelta', (data) => {
          if (data.uid === uid) {
            received++;
          }
        });

        setTimeout(() => {
          const duration = Date.now() - startTime;
          console.log(`Sent: ${sent}, Received: ${received}, Duration: ${duration}ms`);
          
          if (received >= 180) {
            console.log('❌ VULNERABLE: Most moves went through (weak throttling)');
          } else if (received >= 100) {
            console.log('⚠️  WARNING: Moderate throttling (~50% blocked)');
          } else if (received >= 60) {
            console.log('✓ Good: Strong throttling (~70% blocked)');
          } else {
            console.log('✓ Excellent: Very strong throttling');
          }

          socket.disconnect();
          resolve();
        }, 3000);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 3: Connection spam
async function testConnectionSpam() {
  console.log('Test 3: Connection Spam');
  console.log('=' .repeat(50));

  console.log('Creating 50 simultaneous connections...');
  const sockets = [];
  const startTime = Date.now();

  for (let i = 0; i < 50; i++) {
    const socket = io('http://localhost:3000', { 
      transports: ['websocket'],
      reconnection: false
    });
    
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'conn-spam-test',
        uid: `spam-${i}-${Date.now()}`,
        name: `Spammer${i}`,
        color: '#ff0000',
        char: 'mini_brown',
        x: i * 10,
        y: i * 10
      });
    });

    sockets.push(socket);
  }

  await new Promise((resolve) => {
    setTimeout(() => {
      let connected = 0;
      sockets.forEach(s => {
        if (s.connected) connected++;
        s.disconnect();
      });

      const duration = Date.now() - startTime;
      console.log(`Connections: ${connected}/50, Duration: ${duration}ms`);

      if (connected >= 45) {
        console.log('⚠️  All connections accepted (consider connection limits)');
      } else {
        console.log('✓ Some connections rejected (rate limiting active)');
      }

      resolve();
    }, 2000);
  });

  console.log('\n');
}

// Test 4: Oversized payload
async function testOversizedPayload() {
  console.log('Test 4: Oversized Payload Attack');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'payload-attacker-' + Date.now();

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'payload-test',
        uid: uid,
        name: 'PayloadAttacker',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        // สร้างข้อความยาวมาก (10KB)
        const hugeMessage = 'A'.repeat(10000);
        console.log(`Sending ${hugeMessage.length} character message...`);

        socket.emit('chat:message', {
          room: 'payload-test',
          uid: uid,
          name: 'PayloadAttacker',
          text: hugeMessage,
          id: 'huge-' + Date.now()
        });

        socket.on('chat:message', (data) => {
          if (data.text.length >= 9000) {
            console.log('❌ VULNERABLE: Huge payload accepted!');
          } else {
            console.log(`✓ Safe: Payload truncated to ${data.text.length} chars`);
          }
        });

        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 1000);
      }, 500);
    });
  });

  console.log('\n');
}

// รันทดสอบ
(async () => {
  try {
    await testChatSpam();
    await testMovementSpam();
    await testConnectionSpam();
    await testOversizedPayload();
    
    console.log('✅ DoS/Rate Limit Tests Completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
})();
