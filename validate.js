/**
 * Kadrio Professional - System Validation Script
 * 
 * Runs automated tests to verify all systems are operational
 * Usage: node validate.js
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const LOCAL_ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'local-dev-admin-token';
const TESTS = [];
let passCount = 0;
let failCount = 0;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(name, fn) {
  TESTS.push({ name, fn });
}

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const safeHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (!safeHeaders['X-Forwarded-For']) {
      safeHeaders['X-Forwarded-For'] = `127.0.0.${(Math.floor(Math.random() * 250) + 1)}`;
    }
    const options = {
      method,
      headers: safeHeaders
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTest(test) {
  try {
    await test.fn();
    log(`✓ ${test.name}`, 'green');
    passCount++;
  } catch (error) {
    log(`✗ ${test.name}`, 'red');
    log(`  Error: ${error.message}`, 'red');
    failCount++;
  }
}

// ============ TESTS ============

test('Server is running', async () => {
  const res = await request('GET', '/health');
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.body || res.body.status !== 'ok') throw new Error('Health check failed');
});

test('Database connection works', async () => {
  const res = await request('GET', '/health');
  if (res.body.database !== 'ok') throw new Error('Database not responding');
});

test('Configuration loaded correctly', async () => {
  const res = await request('GET', '/api/status');
  if (res.status !== 200) throw new Error('Status endpoint failed');
  if (!res.body.adminConfigured) throw new Error('Admin token not configured');
});

test('Logs directory exists', () => {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    throw new Error('Logs directory not created');
  }
});

test('Database directory exists', () => {
  const dbDir = path.join(__dirname, 'database');
  if (!fs.existsSync(dbDir)) {
    throw new Error('Database directory not created');
  }
});

test('Uploads directory exists', () => {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    throw new Error('Uploads directory not created');
  }
});

test('Rate limiting works', async () => {
  // Exercise the dedicated 10 requests/minute authentication limiter.
  const requests = [];
  for (let i = 0; i < 11; i++) {
    requests.push(request('POST', '/api/user/login', { username: '', password: '' }, {
      'X-Forwarded-For': '198.51.100.1'
    }));
  }
  
  const results = await Promise.all(requests);
  const limitedResponse = results.find(r => r.status === 429);
  
  if (!limitedResponse) {
    throw new Error('Rate limiting not enforced');
  }
});

test('Invalid email validation works', async () => {
  const res = await request('POST', '/api/user/register', {
    email: 'invalid-email',
    password: 'password123'
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  if (!res.body.error || res.body.error.code !== 'VALIDATION_ERROR') {
    throw new Error('Validation not working');
  }
});

test('Short password rejected', async () => {
  const res = await request('POST', '/api/user/register', {
    email: 'test@example.com',
    password: 'short'
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

test('User registration creates account', async () => {
  const timestamp = Date.now();
  const res = await request('POST', '/api/user/register', {
    email: `test${timestamp}@example.com`,
    password: 'password123',
    username: `user${timestamp}`
  });
  if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
  if (!res.body.token) throw new Error('No session token returned');
  if (!res.body.user || !res.body.user.id) throw new Error('No user ID returned');
});

test('Duplicate email rejected', async () => {
  const email = `test${Date.now()}@example.com`;
  
  // First registration
  await request('POST', '/api/user/register', {
    email,
    password: 'password123',
    username: `user${Date.now()}`
  });
  
  // Duplicate attempt
  const res = await request('POST', '/api/user/register', {
    email,
    password: 'password456',
    username: `user${Date.now() + 1}`
  });
  
  if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
});

test('Login with valid credentials works', async () => {
  const email = `test${Date.now()}@example.com`;
  const password = 'password123';
  
  // Register
  await request('POST', '/api/user/register', {
    email,
    password,
    username: `user${Date.now()}`
  });
  
  // Login
  const res = await request('POST', '/api/user/login', {
    email,
    password
  });
  
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.body.token) throw new Error('No token returned');
});

test('Login with wrong password fails', async () => {
  const email = `test${Date.now()}@example.com`;
  
  // Register
  await request('POST', '/api/user/register', {
    email,
    password: 'correct_password',
    username: `user${Date.now()}`
  });
  
  // Login with wrong password
  const res = await request('POST', '/api/user/login', {
    email,
    password: 'wrong_password'
  });
  
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

test('Protected endpoints require authentication', async () => {
  const res = await request('POST', '/api/reel', {
    userId: 1,
    title: 'Test'
  });
  
  // Should fail without token
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

test('Invalid token rejected', async () => {
  const res = await request('POST', '/api/reel', 
    { userId: 1, title: 'Test' },
    { 'Authorization': 'Bearer invalid_token' }
  );
  
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

test('Creator endpoint works', async () => {
  const res = await request('POST', '/api/creator', {
    name: 'Test Creator',
    email: 'creator@example.com',
    channel: 'https://youtube.com/test',
    message: 'Hello!'
  });
  
  if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
});

test('Package request endpoint works', async () => {
  const res = await request('POST', '/api/package-request', {
    company: 'Test Company',
    contactEmail: 'contact@test.com',
    budget: '5000-10000',
    campaignType: 'promotional',
    campaignGoal: 'Brand awareness'
  });
  
  if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
});

test('Track event endpoint works', async () => {
  const res = await request('POST', '/api/track', {
    action: 'page_view',
    payload: { page: 'home' }
  });
  
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

test('Search endpoint works', async () => {
  const res = await request('GET', '/api/search?q=test');
  
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!Array.isArray(res.body.users) || !Array.isArray(res.body.reels)) {
    throw new Error('Invalid search response');
  }
});

test('Personalized feed prioritizes followed creators and user interactions', async () => {
  const shortUnique = () => `${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
  const viewerUnique = shortUnique();
  const creatorAUnique = shortUnique();
  const creatorBUnique = shortUnique();
  const likerUnique = shortUnique();

  const viewer = await request('POST', '/api/user/register', {
    email: `viewer_${viewerUnique}@example.com`,
    password: 'password123',
    username: `viewer${viewerUnique}`
  });
  const creatorA = await request('POST', '/api/user/register', {
    email: `creatorA_${creatorAUnique}@example.com`,
    password: 'password123',
    username: `creatora${creatorAUnique}`
  });
  const creatorB = await request('POST', '/api/user/register', {
    email: `creatorB_${creatorBUnique}@example.com`,
    password: 'password123',
    username: `creatorb${creatorBUnique}`
  });
  const liker = await request('POST', '/api/user/register', {
    email: `liker_${likerUnique}@example.com`,
    password: 'password123',
    username: `liker${likerUnique}`
  });

  const followedReel = await request('POST', '/api/reel', {
    userId: creatorA.body.user.id,
    title: 'Followed creator reel',
    description: 'Should rank higher for viewer after follow',
    tags: '#kadrio,#creator',
    videoUrl: 'https://example.com/followed.mp4'
  }, { Authorization: `Bearer ${creatorA.body.token}` });

  const popularReel = await request('POST', '/api/reel', {
    userId: creatorB.body.user.id,
    title: 'Popular random reel',
    description: 'More likes but not followed',
    tags: '#viral,#random',
    videoUrl: 'https://example.com/popular.mp4'
  }, { Authorization: `Bearer ${creatorB.body.token}` });

  const followRes = await request('POST', `/api/user/${creatorA.body.user.id}/follow`, {
    followerId: viewer.body.user.id
  }, { Authorization: `Bearer ${viewer.body.token}` });

  if (followRes.status !== 200 || !followRes.body.following) {
    throw new Error('Follow request failed');
  }

  const likeRes = await request('POST', `/api/reel/${popularReel.body.reel.id}/like`, {
    userId: liker.body.user.id
  }, { Authorization: `Bearer ${liker.body.token}` });

  if (likeRes.status !== 200 || !likeRes.body.liked) {
    throw new Error('Like request failed');
  }

  const publishFollowed = await request('PUT', `/admin/reel/${followedReel.body.reel.id}/status`, { status: 'published' }, { 'x-admin-token': LOCAL_ADMIN_TOKEN });
  const publishPopular = await request('PUT', `/admin/reel/${popularReel.body.reel.id}/status`, { status: 'published' }, { 'x-admin-token': LOCAL_ADMIN_TOKEN });

  if (publishFollowed.status !== 200 || publishPopular.status !== 200) {
    throw new Error('Reels could not be published for feed ranking test');
  }

  const feedRes = await request('GET', '/api/feed?limit=10&mode=discover', null, { Authorization: `Bearer ${viewer.body.token}` });

  if (feedRes.status !== 200) {
    throw new Error(`Expected 200, got ${feedRes.status}`);
  }

  const reels = Array.isArray(feedRes.body.reels) ? feedRes.body.reels : [];
  const followedIndex = reels.findIndex((reel) => Number(reel.id) === Number(followedReel.body.reel.id));
  const popularIndex = reels.findIndex((reel) => Number(reel.id) === Number(popularReel.body.reel.id));

  if (followedIndex === -1 || popularIndex === -1) {
    throw new Error('Expected both reels to appear in personalized feed');
  }

  if (followedIndex > popularIndex) {
    throw new Error('Personalized feed did not prioritize the followed creator reel');
  }
});

test('404 for non-existent endpoints', async () => {
  const res = await request('GET', '/api/nonexistent');
  
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

test('JSON error response format is correct', async () => {
  const res = await request('POST', '/api/user/register', {
    email: 'invalid'
  });
  
  if (!res.body || res.body.success !== false) throw new Error('Response missing success field');
  if (!res.body.error || !res.body.error.code) throw new Error('Error structure invalid');
  if (!res.body.timestamp) throw new Error('Response missing timestamp');
});

test('Admin status endpoint works', async () => {
  const res = await request('GET', '/api/status');
  
  if (!res.body.product) throw new Error('Missing product info');
  if (!res.body.stats) throw new Error('Missing stats');
});

// ============ RUN TESTS ============
async function runAllTests() {
  console.log('\n');
  log('╔════════════════════════════════════════╗', 'blue');
  log('║  Kadrio Professional - System Validation║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  console.log('');
  
  for (const test of TESTS) {
    await runTest(test);
  }
  
  console.log('\n');
  log('╔════════════════════════════════════════╗', 'blue');
  log('║             Test Results               ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  log(`Passed: ${passCount}`, 'green');
  log(`Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');
  log(`Total:  ${TESTS.length}`, 'blue');
  console.log('');
  
  if (failCount === 0) {
    log('✓ All tests passed! System is ready for production.', 'green');
    process.exit(0);
  } else {
    log('✗ Some tests failed. Please check the errors above.', 'red');
    process.exit(1);
  }
}

// Start validation
console.log('\nConnecting to server...');
setTimeout(runAllTests, 1000);
