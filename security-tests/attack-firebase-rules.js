/**
 * Firebase Database Rules Attack Test
 * ทดสอบการเจาะ Firebase Realtime Database rules
 * ต้องมี Firebase config และ auth token
 */

const admin = require('firebase-admin');

// หมายเหตุ: ต้องตั้งค่า Firebase Admin SDK ก่อนรันสคริปต์นี้
// และต้องมี service account key

console.log('🔴 Starting Firebase Rules Attack Tests...\n');

// Test 1: พยายามเขียนห้องโดยไม่ใช่ host
async function testUnauthorizedRoomWrite() {
  console.log('Test 1: Unauthorized Room Write');
  console.log('=' .repeat(50));

  try {
    // สมมติ user A สร้างห้อง
    const userAUid = 'userA-' + Date.now();
    const roomCode = 'TEST' + Date.now();

    console.log('User A creates room...');
    // ปกติควรใช้ Firebase SDK ของ client แต่ที่นี่จำลอง

    // User B พยายามแก้ไขห้องของ User A
    const userBUid = 'userB-' + Date.now();
    console.log('User B attempts to modify User A\'s room...');

    // การทดสอบจริงต้องใช้ Firebase Emulator หรือ actual DB
    console.log('⚠️  This test requires Firebase Emulator or live DB');
    console.log('Expected: PERMISSION_DENIED if rules work correctly');
    
  } catch (error) {
    if (error.code === 'PERMISSION_DENIED') {
      console.log('✓ Safe: Firebase rules blocked unauthorized write');
    } else {
      console.log('❌ VULNERABLE: Write succeeded or unexpected error');
    }
  }

  console.log('\n');
}

// Test 2: พยายามแก้ไขแชทของคนอื่น
async function testChatMessageOverwrite() {
  console.log('Test 2: Chat Message Overwrite');
  console.log('=' .repeat(50));

  console.log('Attempting to overwrite existing chat message...');
  console.log('Expected: PERMISSION_DENIED due to !data.exists() rule');
  console.log('⚠️  This test requires Firebase Emulator or live DB');
  
  console.log('\n');
}

// Test 3: พยายามเขียนฟิลด์ที่ไม่อนุญาต
async function testInvalidFields() {
  console.log('Test 3: Invalid Field Injection');
  console.log('=' .repeat(50));

  const invalidRoomData = {
    code: 'TEST123',
    name: 'Test Room',
    type: 'public',
    host: 'Test Host',
    hostId: 'user123',
    playerCount: 1,
    maxPlayers: 10,
    status: 'lobby',
    createdAt: Date.now(),
    // ฟิลด์ที่ไม่ควรอนุญาต
    adminAccess: true,
    hackField: 'malicious',
    __proto__: { isAdmin: true }
  };

  console.log('Attempting to write room with extra fields...');
  console.log('Invalid fields:', Object.keys(invalidRoomData).filter(k => 
    !['code', 'name', 'type', 'host', 'hostId', 'playerCount', 'maxPlayers', 'status', 'createdAt', 'lastActivity'].includes(k)
  ));
  console.log('Expected: PERMISSION_DENIED due to $other: false rule');
  console.log('⚠️  This test requires Firebase Emulator or live DB');
  
  console.log('\n');
}

// Test 4: ทดสอบ regex bypass
async function testRegexBypass() {
  console.log('Test 4: Regex Pattern Bypass');
  console.log('=' .repeat(50));

  const maliciousNames = [
    'Valid Name<script>',
    'Name\x00WithNull',
    'Name\nWithNewline',
    'A'.repeat(41), // เกินความยาว
    '', // ว่างเปล่า
    '<>',
    'Name<br>Tag',
  ];

  console.log('Testing malicious room names:');
  maliciousNames.forEach(name => {
    const passesRegex = /^[A-Za-z0-9 _-]{1,40}$/.test(name);
    console.log(`"${name.substring(0, 30)}..." -> ${passesRegex ? '❌ PASSED (should reject!)' : '✓ REJECTED'}`);
  });

  console.log('\n');
}

// Test 5: ทดสอบ timestamp manipulation
async function testTimestampManipulation() {
  console.log('Test 5: Timestamp Manipulation');
  console.log('=' .repeat(50));

  const maliciousTimestamps = [
    -1, // ติดลบ
    Date.now() + 1000000000, // อนาคตไกล
    0,
    NaN,
    Infinity,
  ];

  console.log('Testing malicious timestamps:');
  maliciousTimestamps.forEach(ts => {
    const isValid = typeof ts === 'number' && ts >= 0 && ts <= Date.now() + 60000;
    console.log(`${ts} -> ${isValid ? '✓ Valid' : '❌ Should be rejected'}`);
  });

  console.log('\n');
}

// รันทดสอบ
(async () => {
  try {
    console.log('Firebase Rules Attack Tests');
    console.log('Note: Some tests require Firebase Emulator or live DB\n');
    
    await testUnauthorizedRoomWrite();
    await testChatMessageOverwrite();
    await testInvalidFields();
    await testRegexBypass();
    await testTimestampManipulation();
    
    console.log('✅ Firebase Rules Tests Completed!');
    console.log('\nTo run against live DB:');
    console.log('1. Start Firebase Emulator: firebase emulators:start');
    console.log('2. Configure Firebase Admin SDK');
    console.log('3. Implement actual write attempts');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
})();
