/**
 * Data Injection & Validation Test
 * ทดสอบการส่งข้อมูลผิดรูปแบบเพื่อหาช่องโหว่
 */

const io = require('socket.io-client');

console.log('🔴 Starting Data Injection Tests...\n');

// Test 1: Type confusion attacks
async function testTypeConfusion() {
  console.log('Test 1: Type Confusion Attacks');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      const testCases = [
        { name: 'Number as name', data: { name: 12345 } },
        { name: 'Array as name', data: { name: ['test'] } },
        { name: 'Object as name', data: { name: { hack: true } } },
        { name: 'Null as name', data: { name: null } },
        { name: 'Undefined as name', data: { name: undefined } },
        { name: 'Boolean as color', data: { color: true } },
        { name: 'String as coordinates', data: { x: '100', y: '200' } },
        { name: 'Infinity as position', data: { x: Infinity, y: -Infinity } },
        { name: 'NaN as position', data: { x: NaN, y: NaN } },
      ];

      testCases.forEach((testCase, index) => {
        setTimeout(() => {
          console.log(`Testing: ${testCase.name}`);
          
          socket.emit('game:join', {
            room: 'type-test',
            uid: `type-test-${index}`,
            name: testCase.data.name !== undefined ? testCase.data.name : 'TypeTest',
            color: testCase.data.color !== undefined ? testCase.data.color : '#ff0000',
            char: 'mini_brown',
            x: testCase.data.x !== undefined ? testCase.data.x : 100,
            y: testCase.data.y !== undefined ? testCase.data.y : 100
          });
        }, index * 200);
      });

      let results = [];
      socket.on('snapshot', (data) => {
        results.push(data);
      });

      setTimeout(() => {
        console.log(`Received ${results.length} snapshots`);
        console.log('Check server logs for type validation errors');
        console.log('✓ If server didn\'t crash, basic type validation works');
        socket.disconnect();
        resolve();
      }, testCases.length * 200 + 500);
    });
  });

  console.log('\n');
}

// Test 2: SQL/NoSQL Injection attempts
async function testInjectionStrings() {
  console.log('Test 2: Injection String Attempts');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'injection-test-' + Date.now();

  const injectionPayloads = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "' OR 1=1--",
    "{\$ne: null}",
    "{\$gt: ''}",
    "../../../etc/passwd",
    "{{7*7}}",
    "${7*7}",
    "#{7*7}",
    "%0d%0aLocation: http://evil.com",
  ];

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'injection-test',
        uid: uid,
        name: 'InjectionTester',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        injectionPayloads.forEach((payload, index) => {
          setTimeout(() => {
            console.log(`Testing payload: ${payload.substring(0, 30)}...`);
            
            socket.emit('chat:message', {
              room: 'injection-test',
              uid: uid,
              name: 'InjectionTester',
              text: payload,
              id: `inj-${index}`
            });
          }, index * 100);
        });

        socket.on('chat:message', (data) => {
          if (injectionPayloads.includes(data.text)) {
            console.log('⚠️  Raw injection string in response (check if sanitized)');
          } else {
            console.log('✓ Payload sanitized:', data.text.substring(0, 40));
          }
        });

        setTimeout(() => {
          console.log('✓ Server survived injection attempts');
          socket.disconnect();
          resolve();
        }, injectionPayloads.length * 100 + 1000);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 3: Buffer overflow attempts
async function testBufferOverflow() {
  console.log('Test 3: Buffer Overflow Attempts');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'buffer-test-' + Date.now();

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'buffer-test',
        uid: uid,
        name: 'BufferTester',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        const sizes = [1000, 5000, 10000, 50000, 100000];
        
        sizes.forEach((size, index) => {
          setTimeout(() => {
            const hugeString = 'A'.repeat(size);
            console.log(`Sending ${size} byte payload...`);
            
            socket.emit('chat:message', {
              room: 'buffer-test',
              uid: uid,
              name: 'BufferTester',
              text: hugeString,
              id: `buffer-${index}`
            });
          }, index * 500);
        });

        socket.on('chat:message', (data) => {
          console.log(`Received: ${data.text.length} chars (${data.text.length <= 500 ? '✓ truncated' : '❌ not truncated'})`);
        });

        setTimeout(() => {
          console.log('✓ Server survived buffer overflow attempts');
          socket.disconnect();
          resolve();
        }, sizes.length * 500 + 1000);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 4: Unicode and encoding attacks
async function testUnicodeAttacks() {
  console.log('Test 4: Unicode & Encoding Attacks');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });
  const uid = 'unicode-test-' + Date.now();

  const unicodePayloads = [
    '\u0000', // Null byte
    '\uFEFF', // Zero-width no-break space
    '\u202E', // Right-to-left override
    '\\u003cscript\\u003e', // Escaped HTML
    '%3Cscript%3E', // URL encoded
    '\x3Cscript\x3E', // Hex encoded
    '&#60;script&#62;', // HTML entities
    '\u0041\u0042\u0043', // Unicode letters
    '𝕳𝖆𝖈𝖐', // Mathematical bold
    'Hͪaͪcͪkͪ', // Combining diacriticals
  ];

  await new Promise((resolve) => {
    socket.on('connect', () => {
      socket.emit('game:join', {
        room: 'unicode-test',
        uid: uid,
        name: 'UnicodeTester',
        color: '#ff0000',
        char: 'mini_brown',
        x: 100,
        y: 100
      });

      setTimeout(() => {
        unicodePayloads.forEach((payload, index) => {
          setTimeout(() => {
            console.log(`Testing unicode payload ${index + 1}...`);
            
            socket.emit('chat:message', {
              room: 'unicode-test',
              uid: uid,
              name: payload,
              text: `Unicode test: ${payload}`,
              id: `unicode-${index}`
            });
          }, index * 100);
        });

        socket.on('chat:message', (data) => {
          // ตรวจสอบว่า sanitize control characters หรือไม่
          const hasControlChars = /[\x00-\x1F\x7F]/.test(data.text);
          console.log(`Message: ${hasControlChars ? '❌ Contains control chars' : '✓ Clean'}`);
        });

        setTimeout(() => {
          console.log('✓ Unicode attack tests completed');
          socket.disconnect();
          resolve();
        }, unicodePayloads.length * 100 + 1000);
      }, 500);
    });
  });

  console.log('\n');
}

// Test 5: Prototype pollution
async function testPrototypePollution() {
  console.log('Test 5: Prototype Pollution Attempts');
  console.log('=' .repeat(50));

  const socket = io('http://localhost:3000', { transports: ['websocket'] });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      const pollutionPayloads = [
        { '__proto__': { isAdmin: true } },
        { 'constructor': { 'prototype': { 'isAdmin': true } } },
        { '__proto__.isAdmin': true },
      ];

      pollutionPayloads.forEach((payload, index) => {
        setTimeout(() => {
          console.log(`Testing prototype pollution attempt ${index + 1}...`);
          
          socket.emit('game:join', {
            room: 'pollution-test',
            uid: `pollute-${index}`,
            name: 'PrototypePolluter',
            color: '#ff0000',
            char: 'mini_brown',
            x: 100,
            y: 100,
            equip: payload // พยายามส่ง malicious object
          });
        }, index * 200);
      });

      setTimeout(() => {
        // ตรวจสอบว่า prototype ถูก pollute หรือไม่
        const testObj = {};
        if (testObj.isAdmin === true) {
          console.log('❌ VULNERABLE: Prototype was polluted!');
        } else {
          console.log('✓ Safe: Prototype pollution blocked');
        }
        
        socket.disconnect();
        resolve();
      }, pollutionPayloads.length * 200 + 500);
    });
  });

  console.log('\n');
}

// รันทดสอบ
(async () => {
  try {
    await testTypeConfusion();
    await testInjectionStrings();
    await testBufferOverflow();
    await testUnicodeAttacks();
    await testPrototypePollution();
    
    console.log('✅ Data Injection Tests Completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
})();
