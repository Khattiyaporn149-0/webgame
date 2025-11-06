/**
 * Privilege Escalation Attack Test
 * พยายามแก้ไขข้อมูลของผู้เล่นคนอื่น, ห้องที่ไม่ใช่เจ้าของ
 */

const io = require('socket.io-client');

console.log('🔴 Starting Privilege Escalation Tests...\n');

// Test 1: พยายามแก้ไข player data ของคนอื่น
async function testModifyOtherPlayer() {
  console.log('Test 1: Modify Other Player Data');
  console.log('=' .repeat(50));

  // สร้าง victim player
  const victim = io('http://localhost:3000', { transports: ['websocket'] });
  const victimUid = 'victim-' + Date.now();

  await new Promise((resolve) => {
    victim.on('connect', () => {
      console.log('Victim joined...');
      victim.emit('game:join', {
        room: 'privilege-test',
        uid: victimUid,
        name: 'Victim',
        color: '#00ff00',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(async () => {
        // ตอนนี้ attacker พยายามแก้ไขข้อมูล victim
        const attacker = io('http://localhost:3000', { transports: ['websocket'] });
        
        attacker.on('connect', () => {
          console.log('Attacker attempting to impersonate victim...');
          
          // พยายามเข้าร่วมด้วย UID ของ victim
          attacker.emit('game:join', {
            room: 'privilege-test',
            uid: victimUid, // ใช้ UID เดียวกัน!
            name: 'HACKED BY ATTACKER',
            color: '#ff0000',
            char: 'mini_brown',
            x: 9999,
            y: 9999
          });

          // ดูว่าเซิร์ฟเวอร์อนุญาตหรือไม่
          attacker.on('snapshot', (data) => {
            const hackedPlayer = data.players.find(p => p.uid === victimUid);
            if (hackedPlayer && hackedPlayer.name === 'HACKED BY ATTACKER') {
              console.log('❌ VULNERABLE: Attacker successfully modified victim data!');
            } else {
              console.log('✓ Safe: Server prevented impersonation');
            }
          });

          setTimeout(() => {
            attacker.disconnect();
            victim.disconnect();
            resolve();
          }, 800);
        });
      }, 500);
    });
  });

  console.log('\n');
}

// Test 2: พยายามส่งข้อความแชทโดยปลอม UID
async function testSpoofChatMessage() {
  console.log('Test 2: Spoof Chat Message UID');
  console.log('=' .repeat(50));

  const attacker = io('http://localhost:3000', { transports: ['websocket'] });
  const attackerUid = 'attacker-' + Date.now();
  const victimUid = 'victim-' + Date.now();

  await new Promise((resolve) => {
    attacker.on('connect', () => {
      attacker.emit('game:join', {
        room: 'chat-spoof-test',
        uid: attackerUid,
        name: 'Attacker',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        console.log('Attempting to send chat as victim UID...');
        
        // พยายามส่งแชทโดยอ้าง uid ของเหยื่อ
        attacker.emit('chat:message', {
          room: 'chat-spoof-test',
          uid: victimUid, // UID ปลอม!
          name: 'FakeVictim',
          text: 'I am not really this person!',
          id: 'spoofed-' + Date.now()
        });

        attacker.on('chat:message', (data) => {
          if (data.uid === victimUid) {
            console.log('❌ VULNERABLE: Server accepted spoofed UID!');
            console.log('Message data:', data);
          } else if (data.uid === attackerUid) {
            console.log('✓ Safe: Server corrected UID to socket owner');
          }
        });

        setTimeout(() => {
          attacker.disconnect();
          resolve();
        }, 800);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 3: พยายาม move player คนอื่น
async function testMoveOtherPlayer() {
  console.log('Test 3: Move Other Player');
  console.log('=' .repeat(50));

  const victim = io('http://localhost:3000', { transports: ['websocket'] });
  const attacker = io('http://localhost:3000', { transports: ['websocket'] });
  
  const victimUid = 'move-victim-' + Date.now();
  const attackerUid = 'move-attacker-' + Date.now();

  await new Promise((resolve) => {
    let victimReady = false;
    let attackerReady = false;

    victim.on('connect', () => {
      victim.emit('game:join', {
        room: 'move-test',
        uid: victimUid,
        name: 'Victim',
        color: '#00ff00',
        char: 'mini_brown',
        x: 100,
        y: 100
      });
      victimReady = true;
      checkBothReady();
    });

    attacker.on('connect', () => {
      attacker.emit('game:join', {
        room: 'move-test',
        uid: attackerUid,
        name: 'Attacker',
        color: '#ff0000',
        char: 'mini_brown',
        x: 200,
        y: 200
      });
      attackerReady = true;
      checkBothReady();
    });

    function checkBothReady() {
      if (victimReady && attackerReady) {
        setTimeout(() => {
          console.log('Attacker trying to move victim...');
          
          // Attacker พยายามย้าย victim โดยไม่ได้รับอนุญาต
          attacker.emit('player:move', {
            uid: victimUid, // พยายามควบคุม victim!
            x: 9999,
            y: 9999,
            ts: Date.now()
          });

          let moved = false;
          victim.on('player:movedelta', (data) => {
            if (data.uid === victimUid && (data.x === 9999 || data.y === 9999)) {
              console.log('❌ VULNERABLE: Attacker moved victim!');
              moved = true;
            }
          });

          setTimeout(() => {
            if (!moved) {
              console.log('✓ Safe: Server ignored unauthorized move');
            }
            victim.disconnect();
            attacker.disconnect();
            resolve();
          }, 1000);
        }, 500);
      }
    }
  });

  console.log('\n');
}

// รันทดสอบ
(async () => {
  try {
    await testModifyOtherPlayer();
    await testSpoofChatMessage();
    await testMoveOtherPlayer();
    
    console.log('✅ Privilege Escalation Tests Completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
})();
