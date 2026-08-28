const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
let multer;
try {
  multer = require('multer');
} catch (error) {
  console.warn('Multer is not installed. Run npm install before using local video uploads.');
}
const crypto = require('crypto');
const { promisify } = require('util');
const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN must be configured in production.');
if (isProduction && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be configured in production.');
if (isProduction && process.env.ADMIN_TOKEN === process.env.SESSION_SECRET) throw new Error('ADMIN_TOKEN and SESSION_SECRET must be different in production.');
const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'local-development-session-secret';
const defaultPaymentLinkUrl = 'https://www.shopier.com/kadrio/50337921';
const paymentLinkUrl = typeof process.env.PAYMENT_LINK_URL === 'string' && /^https:\/\//i.test(process.env.PAYMENT_LINK_URL)
  ? process.env.PAYMENT_LINK_URL.trim()
  : defaultPaymentLinkUrl;
const singleProductName = (process.env.SINGLE_PRODUCT_NAME || process.env.PRODUCT_NAME || 'Kadrio Tek Ürün').trim();
const singleProductPrice = Number(process.env.SINGLE_PRODUCT_PRICE || 99) || 99;
const singleProductUrl = typeof process.env.SINGLE_PRODUCT_URL === 'string' && /^https?:\/\//i.test(process.env.SINGLE_PRODUCT_URL)
  ? process.env.SINGLE_PRODUCT_URL.trim()
  : paymentLinkUrl;
const checkoutProduct = {
  name: singleProductName,
  price: singleProductPrice,
  checkoutUrl: singleProductUrl,
  configured: Boolean(singleProductUrl)
};

const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? false : true);
app.set('trust proxy', 1);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const requestWindows = new Map();
const authWindows = new Map();
const publicWriteWindows = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const windowData = requestWindows.get(key);
  if (!windowData || now - windowData.startedAt >= 60_000) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  windowData.count += 1;
  if (windowData.count > 120) return res.status(429).json({ error: 'Çok fazla istek. Lütfen biraz bekleyin.' });
  if (requestWindows.size > 10_000) {
    for (const [storedKey, storedWindow] of requestWindows) {
      if (now - storedWindow.startedAt >= 60_000) requestWindows.delete(storedKey);
    }
  }
  next();
});

app.use(['/api/user/login', '/api/user/register'], (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const windowData = authWindows.get(key);
  if (!windowData || now - windowData.startedAt >= 60_000) {
    authWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  windowData.count += 1;
  if (windowData.count > 10) return res.status(429).json({ error: 'Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.' });
  next();
});

app.use(['/api/track', '/api/creator', '/api/package-request'], (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
  const windowData = publicWriteWindows.get(key);
  if (!windowData || now - windowData.startedAt >= 60_000) {
    publicWriteWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  windowData.count += 1;
  if (windowData.count > 20) return res.status(429).json({ error: 'Çok fazla talep. Lütfen biraz bekleyin.' });
  next();
});

const accessLogPath = path.join(__dirname, 'access.log');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'reeloram.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

const videoUpload = multer ? multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith('video/')) return callback(new Error('Yalnızca video dosyaları yüklenebilir.'));
    callback(null, true);
  }
}) : { single: () => (req, res, next) => next() };

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to sqlite database:', err.message);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derivedKey = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
}

function sanitizeUser(user) {
  if (!user) return user;
  const safeUser = { ...user };
  delete safeUser.passwordHash;
  return safeUser;
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId: Number(userId), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getSessionUserId(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() && Number.isInteger(session.userId) ? session.userId : null;
  } catch (error) {
    return null;
  }
}

async function requireUser(req, res, next) {
  const userId = getSessionUserId(req);
  if (!userId || !(await userExists(userId))) return res.status(401).json({ error: 'authenticated session required' });
  req.userId = userId;
  next();
}

const blockedReelTerms = [
  'silah', 'tabanca', 'tufek', 'bicak', 'bomba', 'mermi', 'siddet', 'kanli', 'kanama', 'iskence',
  'cinsel', 'tecavuz', 'pornografi', 'porno', 'ciplak', 'mustehcen', 'sexual', 'porn',
  'weapon', 'gun', 'violence', 'gore'
];

function moderateReelContent({ title = '', description = '', tags = '', videoUrl = '' }) {
  const content = [title, description, tags, videoUrl]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR');
  const words = content.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = words.join('');
  return blockedReelTerms.find((term) => words.includes(term) || compact.includes(term)) || null;
}

function validateVideoUrl(videoUrl) {
  if (typeof videoUrl === 'string' && /^\/uploads\/[a-zA-Z0-9-]+\.(mp4|webm|ogg|mov|m4v)$/i.test(videoUrl)) return true;
  try {
    const parsed = new URL(videoUrl);
    return parsed.protocol === 'https:' && videoUrl.length <= 2048;
  } catch (error) {
    return false;
  }
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createNotification(userId, actorId, type, message, reelId = null) {
  if (!userId || String(userId) === String(actorId)) return Promise.resolve();
  return runDb(
    'INSERT INTO notifications (userId, actorId, type, reelId, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, actorId || null, type, reelId, message, new Date().toISOString()]
  ).catch(() => {});
}

async function initDatabase() {
  await runDb(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT,
    passwordHash TEXT,
    avatar TEXT,
    bio TEXT,
    timestamp TEXT
  )`);

  try {
    await runDb('ALTER TABLE users ADD COLUMN passwordHash TEXT');
  } catch (error) {
    if (!error.message.includes('duplicate column')) throw error;
  }

  await runDb(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    action TEXT,
    payload TEXT
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    name TEXT,
    email TEXT,
    channel TEXT,
    message TEXT
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    company TEXT,
    contactEmail TEXT,
    budget TEXT,
    campaignType TEXT,
    campaignGoal TEXT,
    status TEXT
  )`);
  try {
    await runDb('ALTER TABLE packages ADD COLUMN contactEmail TEXT');
  } catch (error) {
    if (!error.message.includes('duplicate column')) throw error;
  }

  await runDb(`CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aid TEXT,
    timestamp TEXT,
    ip TEXT,
    ua TEXT
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS reels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    description TEXT,
    videoUrl TEXT,
    duration INTEGER,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    tags TEXT,
    status TEXT DEFAULT 'draft',
    timestamp TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS reel_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reelId INTEGER,
    userId INTEGER,
    timestamp TEXT,
    FOREIGN KEY(reelId) REFERENCES reels(id),
    FOREIGN KEY(userId) REFERENCES users(id),
    UNIQUE(reelId, userId)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS reel_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reelId INTEGER,
    userId INTEGER,
    comment TEXT,
    timestamp TEXT,
    FOREIGN KEY(reelId) REFERENCES reels(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS creator_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER UNIQUE,
    category TEXT,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    totalViews INTEGER DEFAULT 0,
    totalEarnings REAL DEFAULT 0,
    isVerified INTEGER DEFAULT 0,
    timestamp TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    followerId INTEGER NOT NULL,
    followingId INTEGER NOT NULL,
    timestamp TEXT,
    FOREIGN KEY(followerId) REFERENCES users(id),
    FOREIGN KEY(followingId) REFERENCES users(id),
    UNIQUE(followerId, followingId)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    actorId INTEGER,
    type TEXT NOT NULL,
    reelId INTEGER,
    message TEXT NOT NULL,
    isRead INTEGER DEFAULT 0,
    timestamp TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  await runDb(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporterId INTEGER NOT NULL,
    reelId INTEGER,
    commentId INTEGER,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    timestamp TEXT,
    FOREIGN KEY(reporterId) REFERENCES users(id)
  )`);
}

initDatabase().catch((error) => console.error('DB init error:', error));

// Admin token (must be set in production via environment variable).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const effectiveAdminToken = process.env.ADMIN_TOKEN || '';
if (!effectiveAdminToken) {
  console.warn('Warning: ADMIN_TOKEN is not set. Admin routes are disabled until a persistent token is configured.');
}

async function userExists(userId) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return false;
  const rows = await allDb('SELECT id FROM users WHERE id = ?', [userId]);
  return rows.length > 0;
}

function requireAdmin(req, res, next) {
  if (!effectiveAdminToken) {
    return res.status(503).json({ error: 'admin access disabled', adminConfigured: false });
  }

  const token = req.get('x-admin-token') || req.query.token || req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', '');
  if (!token || token !== effectiveAdminToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Simple request tracking middleware: records requests in memory and appends to access.log
app.use((req, res, next) => {
  const entry = {
    id: analytics.length + 1,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    ua: req.get('user-agent') || ''
  };

  analytics.push(entry);
  try {
    fs.appendFile(accessLogPath, JSON.stringify(entry) + '\n', () => {});
  } catch (e) {}
  next();
});

let analytics = [];
let creators = [];
let packages = [];
let affiliateClicks = [];

const statePath = path.join(__dirname, 'data', 'state.json');

function ensureStateStore() {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistState() {
  ensureStateStore();
  const payload = {
    analytics,
    creators,
    packages,
    affiliateClicks
  };
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), 'utf8');
}

function loadState() {
  try {
    if (!fs.existsSync(statePath)) return;
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    analytics = Array.isArray(parsed.analytics) ? parsed.analytics : [];
    creators = Array.isArray(parsed.creators) ? parsed.creators : [];
    packages = Array.isArray(parsed.packages) ? parsed.packages : [];
    affiliateClicks = Array.isArray(parsed.affiliateClicks) ? parsed.affiliateClicks : [];
  } catch (error) {
    console.warn('State file could not be loaded, starting fresh.', error.message);
    analytics = [];
    creators = [];
    packages = [];
    affiliateClicks = [];
  }
}

loadState();

// Simple affiliate map (key -> destination). Update or load from DB in production.
const affiliateMap = {
  'sample-aff-1': 'https://www.example.com/?ref=sample-aff-1',
  'sample-aff-2': 'https://www.example.com/?ref=sample-aff-2'
};

app.get('/api/reels', (req, res) => {
  res.json({
    reels: [
      {
        id: 1,
        user: 'reeloram',
        avatar: 'R',
        description: 'Yaratıcı ekiplerin içeriklerini hızlıca paylaşabileceği modern bir akış deneyimi.',
        tags: ['#kadrio', '#reklam', '#yaratıcı'],
        song: 'Kadrio Studio · Premium',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        likes: 2400,
        comments: 14,
        shares: 520,
        views: '1.8M',
        sponsored: true,
      },
      {
        id: 2,
        user: 'trendguru',
        avatar: 'T',
        description: 'İçerik yayıncıları için profesyonel keşif seçenekleri ve sponsor uyumları.',
        tags: ['#trend', '#tasarım', '#promo'],
        song: 'Trend Guru · Yeni Hit',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        likes: 1120,
        comments: 22,
        shares: 310,
        views: '920K',
        sponsored: false,
      },
      {
        id: 3,
        user: 'createkit',
        avatar: 'C',
        description: 'Üreticiler ve markalar için herkese açık performans desteği.',
        tags: ['#frontend', '#ui', '#demo'],
        song: 'Create Kit · Groove',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        likes: 894,
        comments: 7,
        shares: 98,
        views: '430K',
        sponsored: true,
      },
    ],
  });
});

app.post('/api/track', async (req, res) => {
  const action = String(req.body.action || 'track').trim().slice(0, 80);
  const event = {
    timestamp: new Date().toISOString(),
    action,
    payload: req.body.payload || {}
  };

  try {
    await runDb('INSERT INTO analytics (timestamp, action, payload) VALUES (?, ?, ?)', [
      event.timestamp,
      event.action,
      JSON.stringify(event)
    ]);
    analytics.push(event);
    persistState();
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ error: 'track failed' });
  }
});

app.post('/api/creator', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 160);
  const channel = String(req.body.channel || '').trim().slice(0, 200);
  const message = String(req.body.message || '').trim().slice(0, 1000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'geçerli ad ve email gerekli' });
  const creator = {
    timestamp: new Date().toISOString(),
    name,
    email,
    channel,
    message
  };

  try {
    await runDb('INSERT INTO creators (timestamp, name, email, channel, message) VALUES (?, ?, ?, ?, ?)', [
      creator.timestamp,
      creator.name || '',
      creator.email || '',
      creator.channel || '',
      creator.message || ''
    ]);
    creators.push(creator);
    persistState();
    res.json({ success: true, creator });
  } catch (error) {
    res.status(500).json({ error: 'creator save failed' });
  }
});

app.post('/api/package-request', async (req, res) => {
  const company = String(req.body.company || '').trim().slice(0, 160);
  const contactEmail = String(req.body.contactEmail || '').trim().toLowerCase().slice(0, 160);
  const budget = String(req.body.budget || '').trim().slice(0, 40);
  const campaignType = String(req.body.campaignType || '').trim().slice(0, 80);
  const campaignGoal = String(req.body.campaignGoal || '').trim().slice(0, 1000);
  if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || !budget || !campaignType || !campaignGoal) return res.status(400).json({ error: 'firma, geçerli iletişim emaili, bütçe ve kampanya alanları gerekli' });
  const request = {
    timestamp: new Date().toISOString(),
    status: 'pending',
    company,
    contactEmail,
    budget,
    campaignType,
    campaignGoal
  };

  try {
    await runDb('INSERT INTO packages (timestamp, company, contactEmail, budget, campaignType, campaignGoal, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      request.timestamp,
      request.company || '',
      request.contactEmail || '',
      request.budget || '',
      request.campaignType || '',
      request.campaignGoal || '',
      request.status
    ]);
    packages.push(request);
    persistState();
    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: 'package save failed' });
  }
});

// User Authentication & Profile endpoints
app.post('/api/user/register', async (req, res) => {
  const rawUsername = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 8) {
    return res.status(400).json({ error: 'geçerli email ve en az 8 karakterli şifre gerekli' });
  }

  const normalizedUsername = (rawUsername || email.split('@')[0] || 'creator').toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'kullanıcı adı 3-30 karakter olmalı; yalnızca harf, rakam, ., _ ve - kullanılabilir' });
  }
  const user = {
    username: normalizedUsername,
    email,
    avatar: normalizedUsername.charAt(0).toUpperCase(),
    bio: '',
    timestamp: new Date().toISOString(),
  };

  try {
    const existingUsers = await allDb(
      'SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?) LIMIT 1',
      [user.username, user.email]
    );
    if (existingUsers.length) return res.status(409).json({ error: 'username or email already exists' });
    const passwordHash = await hashPassword(password);
    const result = await runDb(
      'INSERT INTO users (username, email, passwordHash, avatar, bio, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [user.username, user.email, passwordHash, user.avatar, user.bio, user.timestamp]
    );
    res.status(201).json({ success: true, token: createSessionToken(result.id), user: { id: result.id, ...user } });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'username or email already exists' });
    } else {
      res.status(500).json({ error: 'registration failed' });
    }
  }
});

app.post('/api/user/login', async (req, res) => {
  const identity = String(req.body.username || req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!identity || !password) {
    return res.status(400).json({ error: 'username or email and password required' });
  }

  try {
    const rows = await allDb('SELECT * FROM users WHERE username = ? OR email = ?', [identity, identity]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    const user = rows[0];
    if (!(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    delete user.passwordHash;
    res.json({ success: true, token: createSessionToken(user.id), user });
  } catch (error) {
    res.status(500).json({ error: 'login failed' });
  }
});

app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const rows = await allDb('SELECT * FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    res.json(sanitizeUser(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch user' });
  }
});

app.put('/api/user/:userId', requireUser, async (req, res) => {
  const { userId } = req.params;
  const { bio, avatar } = req.body;
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });

  try {
    await runDb('UPDATE users SET bio = ?, avatar = ? WHERE id = ?', [bio || '', avatar || '', userId]);
    const rows = await allDb('SELECT * FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    res.json({ success: true, user: sanitizeUser(rows[0]) });
  } catch (error) {
    res.status(500).json({ error: 'profile update failed' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const rows = await allDb('SELECT id, username, avatar, bio, timestamp FROM users ORDER BY timestamp DESC LIMIT 20');
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch users' });
  }
});

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 80);
  if (query.length < 2) return res.json({ users: [], reels: [] });
  const pattern = `%${query}%`;
  try {
    const users = await allDb('SELECT id, username, avatar, bio FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY timestamp DESC LIMIT 20', [pattern, pattern]);
    const reels = await allDb('SELECT r.id, r.title, r.description, r.videoUrl, r.tags, r.views, u.id as userId, u.username FROM reels r JOIN users u ON u.id = r.userId WHERE r.status = ? AND (r.title LIKE ? OR r.description LIKE ? OR r.tags LIKE ?) ORDER BY r.timestamp DESC LIMIT 20', ['published', pattern, pattern, pattern]);
    res.json({ users, reels });
  } catch (error) { res.status(500).json({ error: 'search failed' }); }
});

app.post('/api/user/:userId/follow', requireUser, async (req, res) => {
  const followingId = Number(req.params.userId);
  const followerId = Number(req.body.followerId);
  if (!followerId || !followingId || followerId === followingId) return res.status(400).json({ error: 'invalid follow request' });
    if (followerId !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
    if (!(await userExists(followerId)) || !(await userExists(followingId))) return res.status(404).json({ error: 'user not found' });
  try {
    const existing = await allDb('SELECT id FROM follows WHERE followerId = ? AND followingId = ?', [followerId, followingId]);
    if (existing.length) {
      await runDb('DELETE FROM follows WHERE followerId = ? AND followingId = ?', [followerId, followingId]);
      return res.json({ success: true, following: false });
    }
    await runDb('INSERT INTO follows (followerId, followingId, timestamp) VALUES (?, ?, ?)', [followerId, followingId, new Date().toISOString()]);
    const follower = await allDb('SELECT username FROM users WHERE id = ?', [followerId]);
    await createNotification(followingId, followerId, 'follow', `@${follower[0]?.username || 'Bir kullanıcı'} seni takip etmeye başladı.`);
    res.json({ success: true, following: true });
  } catch (error) {
    res.status(500).json({ error: 'follow operation failed' });
  }
});

app.get('/api/user/:userId/followers', async (req, res) => {
  try {
    const rows = await allDb('SELECT u.id, u.username, u.avatar FROM follows f JOIN users u ON u.id = f.followerId WHERE f.followingId = ? ORDER BY f.timestamp DESC', [req.params.userId]);
    res.json({ users: rows });
  } catch (error) { res.status(500).json({ error: 'failed to fetch followers' }); }
});

app.get('/api/user/:userId/notifications', requireUser, async (req, res) => {
  if (Number(req.params.userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  try {
    const rows = await allDb('SELECT n.*, u.username as actorUsername FROM notifications n LEFT JOIN users u ON u.id = n.actorId WHERE n.userId = ? ORDER BY n.timestamp DESC LIMIT 50', [req.params.userId]);
    res.json({ notifications: rows });
  } catch (error) { res.status(500).json({ error: 'failed to fetch notifications' }); }
});

app.put('/api/notification/:notificationId/read', requireUser, async (req, res) => {
  if (Number(req.body.userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  try {
    await runDb('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [req.params.notificationId, req.body.userId]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'notification update failed' }); }
});

app.post('/api/report', requireUser, async (req, res) => {
  const { reporterId, reelId, commentId, reason } = req.body;
  if (!reporterId || (!reelId && !commentId) || !reason || String(reason).length > 300) return res.status(400).json({ error: 'reporterId, target and reason required' });
  if (Number(reporterId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  try {
    const result = await runDb('INSERT INTO reports (reporterId, reelId, commentId, reason, timestamp) VALUES (?, ?, ?, ?, ?)', [reporterId, reelId || null, commentId || null, String(reason).trim(), new Date().toISOString()]);
    res.status(201).json({ success: true, reportId: result.id });
  } catch (error) { res.status(500).json({ error: 'report failed' }); }
});

// Admin creator approval endpoints
app.get('/admin/creators', requireAdmin, async (req, res) => {
  try {
    const rows = await allDb('SELECT * FROM creators ORDER BY timestamp DESC');
    res.json({ total: creators.length, creators: rows });
  } catch (error) {
    res.json({ total: creators.length, creators });
  }
});

app.get('/admin/packages', requireAdmin, async (req, res) => {
  try {
    const rows = await allDb('SELECT * FROM packages ORDER BY timestamp DESC');
    res.json({ total: packages.length, packages: rows });
  } catch (error) {
    res.json({ total: packages.length, packages });
  }
});

app.get('/admin/reports', requireAdmin, async (req, res) => {
  try {
    const rows = await allDb('SELECT r.*, u.username as reporterUsername FROM reports r JOIN users u ON u.id = r.reporterId ORDER BY r.timestamp DESC LIMIT 100');
    res.json({ reports: rows });
  } catch (error) { res.status(500).json({ error: 'failed to fetch reports' }); }
});

app.get('/admin/reels', requireAdmin, async (req, res) => {
  try {
    const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = await allDb('SELECT r.*, u.username FROM reels r JOIN users u ON u.id = r.userId WHERE r.status = ? ORDER BY r.timestamp DESC LIMIT 100', [status]);
    res.json({ reels: rows });
  } catch (error) { res.status(500).json({ error: 'failed to fetch moderation queue' }); }
});

app.put('/admin/reel/:reelId/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'published', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid reel status' });
  try {
    const result = await runDb('UPDATE reels SET status = ? WHERE id = ?', [status, req.params.reelId]);
    if (!result.changes) return res.status(404).json({ error: 'reel not found' });
    res.json({ success: true, status });
  } catch (error) { res.status(500).json({ error: 'reel status update failed' }); }
});

app.put('/admin/report/:reportId/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid report status' });
  try {
    const result = await runDb('UPDATE reports SET status = ? WHERE id = ?', [status, req.params.reportId]);
    if (!result.changes) return res.status(404).json({ error: 'report not found' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'report status update failed' }); }
});

app.delete('/admin/reel/:reelId', requireAdmin, async (req, res) => {
  try {
    const rows = await allDb('SELECT videoUrl FROM reels WHERE id = ?', [req.params.reelId]);
    if (!rows.length) return res.status(404).json({ error: 'reel not found' });
    await runDb('DELETE FROM reel_likes WHERE reelId = ?', [req.params.reelId]);
    await runDb('DELETE FROM reel_comments WHERE reelId = ?', [req.params.reelId]);
    await runDb('DELETE FROM reports WHERE reelId = ?', [req.params.reelId]);
    await runDb('DELETE FROM reels WHERE id = ?', [req.params.reelId]);
    if (rows[0].videoUrl?.startsWith('/uploads/')) {
      const filePath = path.join(uploadDir, path.basename(rows[0].videoUrl));
      fs.unlink(filePath, () => {});
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'admin reel removal failed' }); }
});

app.put('/admin/package/:packageId/status', requireAdmin, async (req, res) => {
  const { packageId } = req.params;
  const { status } = req.body;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  try {
    await runDb('UPDATE packages SET status = ? WHERE id = ?', [status, packageId]);
    const rows = await allDb('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'package not found' });
    }
    res.json({ success: true, package: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'status update failed' });
  }
});
// Affiliate redirect - tracks clicks then redirects
app.get('/affiliate/redirect', (req, res) => {
  const aid = req.query.aid;
  if (!aid || !affiliateMap[aid]) return res.status(404).send('Affiliate not found');

  const click = {
    id: affiliateClicks.length + 1,
    aid,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection.remoteAddress,
    ua: req.get('user-agent') || ''
  };
  affiliateClicks.push(click);
  persistState();
  runDb('INSERT INTO affiliate_clicks (aid, timestamp, ip, ua) VALUES (?, ?, ?, ?)', [
    aid,
    click.timestamp,
    click.ip,
    click.ua
  ]).catch(() => {});
  // Append to access log as well
  try { fs.appendFileSync(accessLogPath, JSON.stringify({ type: 'affiliate', ...click }) + '\n'); } catch(e) {}

  // Redirect to affiliate destination
  res.redirect(affiliateMap[aid]);
});

app.get('/admin/affiliate-stats', requireAdmin, (req, res) => {
  const counts = affiliateClicks.reduce((acc, c) => { acc[c.aid] = (acc[c.aid]||0)+1; return acc; }, {});
  res.json({ totalClicks: affiliateClicks.length, byAffiliate: counts, recent: affiliateClicks.slice(-100) });
});

app.get('/health', async (req, res) => {
  try {
    await allDb('SELECT 1 as ok');
    res.status(200).json({ status: 'ok', database: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    analyticsCount: analytics.length,
    creatorsCount: creators.length,
    packageRequests: packages.length,
    adminConfigured: Boolean(effectiveAdminToken),
    paymentConfigured: false,
    paymentLinkConfigured: checkoutProduct.configured,
    paymentLinkUrl: checkoutProduct.checkoutUrl,
    product: checkoutProduct
  });
});

// Admin endpoints for quick monitoring
app.get('/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const rows = await allDb('SELECT * FROM analytics ORDER BY id DESC LIMIT 50');
    const recent = rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      ...JSON.parse(row.payload || '{}')
    }));
    res.json({ count: analytics.length, recent });
  } catch (error) {
    res.json({ count: analytics.length, recent: analytics.slice(-50) });
  }
});

app.get('/admin/access-log', requireAdmin, (req, res) => {
  fs.readFile(accessLogPath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'no log' });
    const lines = data.trim().split('\n');
    const tail = lines.slice(-200).map(l => {
      try { return JSON.parse(l); } catch(e) { return l; }
    });
    res.json({ lines: tail });
  });
});

// Reel Management APIs
app.post('/api/reel', requireUser, (req, res, next) => videoUpload.single('video')(req, res, (error) => {
  if (error) return res.status(422).json({ error: error.message || 'Video yüklenemedi.' });
  next();
}), async (req, res) => {
  const { userId, title, description, videoUrl, tags } = req.body;
  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title required' });
  }
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });

  const uploadedVideoUrl = req.file ? `/uploads/${req.file.filename}` : videoUrl;
  const reel = {
    userId,
    title,
    description: description || '',
    videoUrl: uploadedVideoUrl || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    duration: 30,
    tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  if (!validateVideoUrl(reel.videoUrl)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(422).json({ error: 'Video yalnızca güvenli HTTPS adresinden yüklenebilir.' });
  }

  const blockedTerm = moderateReelContent(reel);
  if (blockedTerm) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(422).json({ error: 'Bu içerik güvenlik kuralları nedeniyle yayınlanamaz.' });
  }

  try {
    const result = await runDb(
      'INSERT INTO reels (userId, title, description, videoUrl, duration, tags, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [reel.userId, reel.title, reel.description, reel.videoUrl, reel.duration, reel.tags, reel.status, reel.timestamp]
    );
    await runDb('UPDATE users SET timestamp = ? WHERE id = ?', [reel.timestamp, userId]);
    res.status(201).json({ success: true, reel: { id: result.id, ...reel } });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'reel upload failed' });
  }
});

app.get('/api/reels/user/:userId', requireUser, async (req, res) => {
  const { userId } = req.params;
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  try {
    const rows = await allDb('SELECT * FROM reels WHERE userId = ? ORDER BY timestamp DESC', [userId]);
    res.json({ reels: rows });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch reels' });
  }
});

app.put('/api/reel/:reelId', requireUser, async (req, res) => {
  const { reelId } = req.params;
  const { userId, title, description, tags, videoUrl } = req.body;
  if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  if (videoUrl && !validateVideoUrl(videoUrl)) return res.status(422).json({ error: 'Video yalnızca güvenli HTTPS adresinden yüklenebilir.' });
  const blockedTerm = moderateReelContent({ title, description, tags, videoUrl });
  if (blockedTerm) return res.status(422).json({ error: 'Bu içerik güvenlik kuralları nedeniyle yayınlanamaz.' });
  try {
    const result = await runDb(
      'UPDATE reels SET title = ?, description = ?, tags = ?, videoUrl = COALESCE(?, videoUrl) WHERE id = ? AND userId = ?',
      [title.trim(), description || '', Array.isArray(tags) ? tags.join(',') : (tags || ''), videoUrl || null, reelId, userId]
    );
    if (!result.changes) return res.status(404).json({ error: 'reel not found or unauthorized' });
    const rows = await allDb('SELECT * FROM reels WHERE id = ?', [reelId]);
    res.json({ success: true, reel: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'reel update failed' });
  }
});

app.delete('/api/reel/:reelId', requireUser, async (req, res) => {
  const { reelId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });
  try {
    await runDb('DELETE FROM reel_likes WHERE reelId = ?', [reelId]);
    await runDb('DELETE FROM reel_comments WHERE reelId = ?', [reelId]);
    const result = await runDb('DELETE FROM reels WHERE id = ? AND userId = ?', [reelId, userId]);
    if (!result.changes) return res.status(404).json({ error: 'reel not found or unauthorized' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'reel deletion failed' });
  }
});

app.get('/api/reel/:reelId', async (req, res) => {
  const { reelId } = req.params;
  try {
    const rows = await allDb('SELECT r.*, u.username, u.avatar FROM reels r JOIN users u ON r.userId = u.id WHERE r.id = ? AND r.status = ?', [reelId, 'published']);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'reel not found' });
    }
    const reel = rows[0];
    const likes = await allDb('SELECT COUNT(*) as count FROM reel_likes WHERE reelId = ?', [reelId]);
    const comments = await allDb('SELECT * FROM reel_comments WHERE reelId = ? ORDER BY timestamp DESC LIMIT 10', [reelId]);
    res.json({ reel: { ...reel, likeCount: likes[0]?.count || 0, comments } });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch reel' });
  }
});

app.post('/api/reel/:reelId/like', requireUser, async (req, res) => {
  const { reelId } = req.params;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });

  try {
    if (!(await userExists(userId))) return res.status(404).json({ error: 'user not found' });
    const reelExists = await allDb('SELECT id FROM reels WHERE id = ?', [reelId]);
    if (!reelExists.length) return res.status(404).json({ error: 'reel not found' });
    const existing = await allDb('SELECT id FROM reel_likes WHERE reelId = ? AND userId = ?', [reelId, userId]);
    if (existing.length > 0) {
      await runDb('DELETE FROM reel_likes WHERE reelId = ? AND userId = ?', [reelId, userId]);
      res.json({ success: true, liked: false });
    } else {
      await runDb('INSERT INTO reel_likes (reelId, userId, timestamp) VALUES (?, ?, ?)', [reelId, userId, new Date().toISOString()]);
      const reelRows = await allDb('SELECT userId FROM reels WHERE id = ?', [reelId]);
      const actor = await allDb('SELECT username FROM users WHERE id = ?', [userId]);
      await createNotification(reelRows[0]?.userId, userId, 'like', `@${actor[0]?.username || 'Bir kullanıcı'} reelinizi beğendi.`, reelId);
      res.json({ success: true, liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'like operation failed' });
  }
});

app.post('/api/reel/:reelId/comment', requireUser, async (req, res) => {
  const { reelId } = req.params;
  const { userId, comment } = req.body;
  if (!userId || !comment || String(comment).trim().length > 500) {
    return res.status(400).json({ error: 'userId and comment required' });
  }
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });

  try {
    if (!(await userExists(userId))) return res.status(404).json({ error: 'user not found' });
    const reelExists = await allDb('SELECT id FROM reels WHERE id = ?', [reelId]);
    if (!reelExists.length) return res.status(404).json({ error: 'reel not found' });
    const result = await runDb(
      'INSERT INTO reel_comments (reelId, userId, comment, timestamp) VALUES (?, ?, ?, ?)',
      [reelId, userId, String(comment).trim(), new Date().toISOString()]
    );
    const reelRows = await allDb('SELECT userId FROM reels WHERE id = ?', [reelId]);
    const actor = await allDb('SELECT username FROM users WHERE id = ?', [userId]);
    await createNotification(reelRows[0]?.userId, userId, 'comment', `@${actor[0]?.username || 'Bir kullanıcı'} reelinize yorum yaptı.`, reelId);
    res.status(201).json({ success: true, comment: { id: result.id, userId, comment } });
  } catch (error) {
    res.status(500).json({ error: 'comment failed' });
  }
});

// Creator Profile APIs
app.post('/api/creator-profile/:userId', requireUser, async (req, res) => {
  const { userId } = req.params;
  const { category } = req.body;
  if (Number(userId) !== req.userId) return res.status(403).json({ error: 'user identity mismatch' });

  try {
    const existing = await allDb('SELECT id FROM creator_profiles WHERE userId = ?', [userId]);
    if (existing.length > 0) {
      await runDb('UPDATE creator_profiles SET category = ?, timestamp = ? WHERE userId = ?', 
        [category || 'general', new Date().toISOString(), userId]);
    } else {
      await runDb(
        'INSERT INTO creator_profiles (userId, category, timestamp) VALUES (?, ?, ?)',
        [userId, category || 'general', new Date().toISOString()]
      );
    }
    const rows = await allDb('SELECT * FROM creator_profiles WHERE userId = ?', [userId]);
    res.json({ success: true, profile: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'profile creation failed' });
  }
});

app.get('/api/creator/:userId', async (req, res) => {
  const { userId } = req.params;
  const viewerId = Number(req.query.viewerId);
  try {
    const userRows = await allDb('SELECT * FROM users WHERE id = ?', [userId]);
    const profileRows = await allDb('SELECT * FROM creator_profiles WHERE userId = ?', [userId]);
    const reelRows = await allDb('SELECT * FROM reels WHERE userId = ? AND status = ? ORDER BY timestamp DESC LIMIT 20', [userId, 'published']);
    const followerCount = await allDb('SELECT COUNT(*) as count FROM follows WHERE followingId = ?', [userId]);
    const followingCount = await allDb('SELECT COUNT(*) as count FROM follows WHERE followerId = ?', [userId]);
    const following = viewerId ? await allDb('SELECT id FROM follows WHERE followerId = ? AND followingId = ?', [viewerId, userId]) : [];
    
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'creator not found' });
    }
    
    res.json({
      user: sanitizeUser(userRows[0]),
      profile: profileRows[0] || null,
      reels: reelRows,
      followerCount: followerCount[0]?.count || 0,
      followingCount: followingCount[0]?.count || 0,
      isFollowing: following.length > 0
    });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch creator' });
  }
});

// Popular Reels Feed
app.get('/api/feed', async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
    const rows = await allDb(
      'SELECT r.*, u.username, u.avatar, (SELECT COUNT(*) FROM reel_likes WHERE reelId = r.id) as likeCount FROM reels r JOIN users u ON r.userId = u.id WHERE r.status = ? ORDER BY r.timestamp DESC LIMIT ?',
      ['published', parseInt(limit)]
    );
    res.json({ reels: rows });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch feed' });
  }
});

const httpServer = app.listen(port, () => {
  console.log(`Kadrio server listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  httpServer.close(() => db.close((error) => {
    if (error) {
      console.error('Database close failed:', error.message);
      process.exitCode = 1;
    }
    process.exit();
  }));
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
