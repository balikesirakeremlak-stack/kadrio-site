/**
 * KADRIO - Professional Production Server
 * 
 * Key Features:
 * - Comprehensive error handling and logging
 * - Input validation on all endpoints
 * - Security hardening (HTTPS enforcement, CORS, rate limiting)
 * - Database connection management
 * - Graceful shutdown
 * - Request tracking and performance monitoring
 * - Admin panel with moderation
 * - Creator monetization support
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const { promisify } = require('util');

// Professional libraries
const Logger = require('./lib/logger');
const { validators, sanitizers, ValidationError } = require('./lib/validator');
const { 
  errorHandler, 
  asyncHandler,
  AppError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
} = require('./lib/errorHandler');
const { getConfig } = require('./lib/config');
const LRUCache = require('./lib/cache');
const { createFollowHelper, createReelHelper, compareTokensSafe } = require('./lib/database-helpers');

// Initialize configuration
let config;
let logger;
try {
  config = getConfig();
  logger = new Logger({
    level: config.get('LOG_LEVEL'),
    logDir: config.get('LOG_DIR'),
    isProduction: config.isProduction()
  });
  logger.info('Application starting', config.summary());
} catch (error) {
  console.error('Fatal: Configuration error -', error.message);
  process.exit(1);
}

// ============= EXPRESS APP SETUP =============
const app = express();
app.set('logger', logger);
app.set('config', config);

// Request timing middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.request(req.method, req.path, res.statusCode, duration, {
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 100)
    });
  });
  next();
});

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS
const corsOrigin = config.get('CORS_ORIGIN');
app.set('trust proxy', 1);
app.use(cors({ origin: corsOrigin }));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Static file serving
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// ============= RATE LIMITING (LRU Cache) =============
const createRateLimiter = (windowMs = 60000, maxRequests = 120) => {
  const cache = new LRUCache(5000);  // Max 5000 IPs tracked - prevents memory leak
  
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const windowData = cache.get(key);

    if (!windowData || now - windowData.startedAt >= windowMs) {
      cache.set(key, { startedAt: now, count: 1 });
      return next();
    }

    windowData.count++;
    if (windowData.count > maxRequests) {
      logger.warn('Rate limit exceeded', { key, count: windowData.count });
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Çok fazla istek. Lütfen biraz bekleyin.'
        }
      });
    }

    next();
  };
};

app.use('/api', createRateLimiter(config.get('RATE_LIMIT_WINDOW_MS'), config.get('RATE_LIMIT_MAX_REQUESTS')));
app.use(['/api/user/login', '/api/user/register'], createRateLimiter(60000, 10));
app.use(['/api/track', '/api/creator', '/api/package-request'], createRateLimiter(60000, 20));

// ============= DATABASE SETUP =============
const dbPath = config.get('DB_PATH');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  } else {
    logger.info('Database connected', { path: dbPath });
  }
});

// Promisified database methods
const runDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        logger.database('run', Date.now(), err, { sql });
        reject(new DatabaseError('Database operation failed', err));
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

const allDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.database('all', Date.now(), err, { sql });
        reject(new DatabaseError('Database query failed', err));
      } else {
        resolve(rows || []);
      }
    });
  });
};

// ============= FILE UPLOADS SETUP =============
const uploadDir = config.get('UPLOAD_DIR');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer video upload (optional)
let multer;
let videoUpload;
try {
  multer = require('multer');
  videoUpload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${crypto.randomUUID()}${extension}`);
      }
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.startsWith('video/')) {
        callback(new Error('Yalnızca video dosyaları yüklenebilir.'));
      } else {
        callback(null, true);
      }
    }
  });
} catch (error) {
  logger.warn('Multer not installed. File uploads disabled.', { error: error.message });
  videoUpload = {
    single: () => (req, res, next) => {
      req.file = null;
      next();
    }
  };
}

app.use('/uploads', express.static(uploadDir, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
}));

// ============= PASSWORD HASHING =============
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

// ============= SESSION MANAGEMENT =============
const sessionSecret = config.get('SESSION_SECRET');
const adminToken = config.get('ADMIN_TOKEN');

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ 
    userId: Number(userId), 
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 
  })).toString('base64url');
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
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() && Number.isInteger(session.userId) ? session.userId : null;
  } catch (error) {
    return null;
  }
}

// ============= MIDDLEWARE =============
async function requireUser(req, res, next) {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    
    const rows = await allDb('SELECT id FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }
    
    req.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || req.query.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!adminToken) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'ADMIN_NOT_CONFIGURED',
        message: 'Admin access is not configured'
      }
    });
  }
  
  if (!token || !compareTokensSafe(token, adminToken)) {
    throw new UnauthorizedError('Invalid admin token');
  }
  
  next();
}

// ============= HELPERS =============
async function userExists(userId) {
  try {
    if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return false;
    const rows = await allDb('SELECT id FROM users WHERE id = ?', [userId]);
    return rows.length > 0;
  } catch (error) {
    logger.error('Error checking user existence', { userId, error: error.message });
    return false;
  }
}

function sanitizeUser(user) {
  if (!user) return user;
  const safeUser = { ...user };
  delete safeUser.passwordHash;
  return safeUser;
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
    .toLowerCase();
  const words = content.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = words.join('');
  return blockedReelTerms.find((term) => words.includes(term) || compact.includes(term)) || null;
}

function validateVideoUrl(videoUrl) {
  if (typeof videoUrl === 'string' && /^\/uploads\/[a-zA-Z0-9-]+\.(mp4|webm|ogg|mov|m4v)$/i.test(videoUrl)) {
    return true;
  }
  try {
    const parsed = new URL(videoUrl);
    return parsed.protocol === 'https:' && videoUrl.length <= 2048;
  } catch (error) {
    return false;
  }
}

async function createNotification(userId, actorId, type, message, reelId = null) {
  if (!userId || String(userId) === String(actorId)) return;
  try {
    await runDb(
      'INSERT INTO notifications (userId, actorId, type, reelId, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, actorId || null, type, reelId, message, new Date().toISOString()]
    );
  } catch (error) {
    logger.debug('Notification creation failed', { userId, type });
  }
}

// ============= DATABASE INITIALIZATION =============
async function initDatabase() {
  try {
    await runDb('PRAGMA foreign_keys = ON');
    await runDb(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT,
      passwordHash TEXT,
      avatar TEXT,
      bio TEXT,
      timestamp TEXT
    )`);

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

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_reels_user_status_time ON reels(userId, status, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reels_status_time ON reels(status, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reel_likes_reel ON reel_likes(reelId)',
      'CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_time ON reel_comments(reelId, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(followerId)',
      'CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(followingId)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_time ON notifications(userId, isRead, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_action_time ON analytics(action, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reports_status_time ON reports(status, timestamp DESC)'
    ];
    for (const indexSql of indexes) {
      await runDb(indexSql);
    }

    logger.info('Database initialized successfully', { indexes: indexes.length });
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }
}

// Initialize database and helpers
let followHelper, reelHelper;
initDatabase().then(() => {
  // Create helpers after DB is ready
  followHelper = createFollowHelper(allDb, runDb);
  reelHelper = createReelHelper(allDb, runDb);
}).catch((error) => {
  logger.error('Fatal: Could not initialize database', { error: error.message });
  process.exit(1);
});

// ============= HEALTH & STATUS ENDPOINTS =============
app.get('/health', asyncHandler(async (req, res) => {
  try {
    await allDb('SELECT 1');
    res.status(200).json({
      status: 'ok',
      database: 'ok',
      uptime: process.uptime()
    });
  } catch (error) {
    throw new AppError('Database unavailable', 503, 'DATABASE_UNAVAILABLE');
  }
}));

app.get('/api/status', asyncHandler(async (req, res) => {
  const [analyticsCount, creatorsCount, packagesCount] = await Promise.all([
    allDb('SELECT COUNT(*) as count FROM analytics'),
    allDb('SELECT COUNT(*) as count FROM creators'),
    allDb('SELECT COUNT(*) as count FROM packages')
  ]);

  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    database: 'ok',
    adminConfigured: Boolean(adminToken),
    product: {
      name: config.get('SINGLE_PRODUCT_NAME'),
      price: config.get('SINGLE_PRODUCT_PRICE'),
      checkoutUrl: config.get('PAYMENT_LINK_URL') || 'https://www.shopier.com/kadrio/50337921'
    },
    stats: {
      analyticsCount: analyticsCount[0]?.count || 0,
      creatorsCount: creatorsCount[0]?.count || 0,
      packagesCount: packagesCount[0]?.count || 0
    }
  });
}));

app.get('/api/reels', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const reels = await reelHelper.getReelsWithStats({ status: 'published', limit, offset });
  res.json({ success: true, reels, limit, offset });
}));

app.post('/api/track', asyncHandler(async (req, res) => {
  const action = validators.string(req.body.action || '', { maxLength: 80, fieldName: 'action' });
  
  const event = {
    timestamp: new Date().toISOString(),
    action,
    payload: req.body.payload || {}
  };

  await runDb(
    'INSERT INTO analytics (timestamp, action, payload) VALUES (?, ?, ?)',
    [event.timestamp, event.action, JSON.stringify(event)]
  );

  res.json({ success: true, event });
}));

app.post('/api/creator', asyncHandler(async (req, res) => {
  const name = validators.string(req.body.name || '', { minLength: 1, maxLength: 100, fieldName: 'name' });
  const email = validators.email(req.body.email);
  const channel = validators.string(req.body.channel || '', { maxLength: 200, fieldName: 'channel' });
  const message = validators.string(req.body.message || '', { maxLength: 1000, fieldName: 'message' });

  const creator = {
    timestamp: new Date().toISOString(),
    name,
    email,
    channel,
    message
  };

  const result = await runDb(
    'INSERT INTO creators (timestamp, name, email, channel, message) VALUES (?, ?, ?, ?, ?)',
    [creator.timestamp, creator.name, creator.email, creator.channel, creator.message]
  );

  res.status(201).json({ success: true, creator: { id: result.id, ...creator } });
}));

app.post('/api/package-request', asyncHandler(async (req, res) => {
  const company = validators.string(req.body.company || '', { minLength: 1, maxLength: 160, fieldName: 'company' });
  const contactEmail = validators.email(req.body.contactEmail);
  const budget = validators.string(req.body.budget || '', { minLength: 1, maxLength: 40, fieldName: 'budget' });
  const campaignType = validators.string(req.body.campaignType || '', { minLength: 1, maxLength: 80, fieldName: 'campaignType' });
  const campaignGoal = validators.string(req.body.campaignGoal || '', { minLength: 1, maxLength: 1000, fieldName: 'campaignGoal' });

  const request = {
    timestamp: new Date().toISOString(),
    status: 'pending',
    company,
    contactEmail,
    budget,
    campaignType,
    campaignGoal
  };

  const result = await runDb(
    'INSERT INTO packages (timestamp, company, contactEmail, budget, campaignType, campaignGoal, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [request.timestamp, request.company, request.contactEmail, request.budget, request.campaignType, request.campaignGoal, request.status]
  );

  res.status(201).json({ success: true, request: { id: result.id, ...request } });
}));

// ============= USER AUTHENTICATION ENDPOINTS =============
app.post('/api/user/register', asyncHandler(async (req, res) => {
  const email = validators.email(req.body.email);
  const password = validators.password(req.body.password);
  const username = validators.username(req.body.username || email.split('@')[0]);

  const existingUsers = await allDb(
    'SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)',
    [username, email]
  );

  if (existingUsers.length > 0) {
    throw new ConflictError('Bu kullanıcı adı veya e-posta zaten kayıtlı');
  }

  const passwordHash = await hashPassword(password);
  const user = {
    username,
    email,
    avatar: username.charAt(0).toUpperCase(),
    bio: '',
    timestamp: new Date().toISOString()
  };

  const result = await runDb(
    'INSERT INTO users (username, email, passwordHash, avatar, bio, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [user.username, user.email, passwordHash, user.avatar, user.bio, user.timestamp]
  );

  const token = createSessionToken(result.id);
  logger.info('User registered', { username: user.username });

  res.status(201).json({
    success: true,
    token,
    user: { id: result.id, ...user }
  });
}));

app.post('/api/user/login', asyncHandler(async (req, res) => {
  const identity = validators.required(req.body.username || req.body.email, 'Email or username');
  const password = validators.required(req.body.password, 'Password');

  const rows = await allDb(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    [identity, identity]
  );

  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  const user = rows[0];
  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    logger.warn('Failed login attempt', { username: user.username });
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = createSessionToken(user.id);
  logger.info('User logged in', { username: user.username });

  res.json({
    success: true,
    token,
    user: sanitizeUser(user)
  });
}));

app.get('/api/user/:userId', asyncHandler(async (req, res) => {
  const userId = validators.positiveInteger(req.params.userId, 'User ID');
  
  const rows = await allDb('SELECT * FROM users WHERE id = ?', [userId]);
  
  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, user: sanitizeUser(rows[0]) });
}));

app.put('/api/user/:userId', requireUser, asyncHandler(async (req, res) => {
  const userId = validators.positiveInteger(req.params.userId, 'User ID');
  
  if (Number(userId) !== req.userId) {
    throw new ForbiddenError('Cannot modify other users');
  }

  const bio = validators.string(req.body.bio || '', { maxLength: 500, fieldName: 'bio' });
  const avatar = validators.string(req.body.avatar || '', { maxLength: 2, fieldName: 'avatar' });

  await runDb(
    'UPDATE users SET bio = ?, avatar = ? WHERE id = ?',
    [bio, avatar, userId]
  );

  const rows = await allDb('SELECT * FROM users WHERE id = ?', [userId]);
  
  if (rows.length === 0) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, user: sanitizeUser(rows[0]) });
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  const users = await allDb(
    'SELECT id, username, avatar, bio, timestamp FROM users ORDER BY timestamp DESC LIMIT 20'
  );
  res.json({ success: true, users });
}));

// ============= SEARCH ENDPOINT =============
app.get('/api/search', asyncHandler(async (req, res) => {
  const query = validators.string(req.query.q || '', { maxLength: 80, fieldName: 'search query' });
  
  if (query.length < 2) {
    return res.json({ success: true, users: [], reels: [] });
  }

  const pattern = `%${query}%`;
  
  const [users, reels] = await Promise.all([
    allDb(
      'SELECT id, username, avatar, bio FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY timestamp DESC LIMIT 20',
      [pattern, pattern]
    ),
    allDb(
      `SELECT r.id, r.title, r.description, r.videoUrl, r.tags, r.views, u.id as userId, u.username 
       FROM reels r JOIN users u ON u.id = r.userId 
       WHERE r.status = ? AND (r.title LIKE ? OR r.description LIKE ? OR r.tags LIKE ?) 
       ORDER BY r.timestamp DESC LIMIT 20`,
      ['published', pattern, pattern, pattern]
    )
  ]);

  res.json({ success: true, users, reels });
}));

// ============= FOLLOW ENDPOINTS =============
app.post('/api/user/:userId/follow', requireUser, asyncHandler(async (req, res) => {
  const followingId = validators.positiveInteger(req.params.userId, 'User ID');
  const followerId = req.userId;

  if (followerId === followingId) {
    throw new AppError('Cannot follow yourself', 400, 'INVALID_REQUEST');
  }

  const [followerExists, followingExists] = await Promise.all([
    userExists(followerId),
    userExists(followingId)
  ]);

  if (!followerExists || !followingExists) {
    throw new NotFoundError('User');
  }

  // Race-condition safe toggle follow
  const result = await followHelper.toggleFollow(followerId, followingId);
  
  if (result.following && result.changed > 0) {
    // Only send notification if we actually followed
    const followerRows = await allDb('SELECT username FROM users WHERE id = ?', [followerId]);
    await createNotification(
      followingId,
      followerId,
      'follow',
      `@${followerRows[0]?.username || 'A user'} started following you`
    );
    logger.debug('User followed', { followerId, followingId });
  }

  res.json({ success: true, following: result.following });
}));

app.get('/api/user/:userId/followers', asyncHandler(async (req, res) => {
  const userId = validators.positiveInteger(req.params.userId, 'User ID');
  
  const users = await allDb(
    'SELECT u.id, u.username, u.avatar FROM follows f JOIN users u ON u.id = f.followerId WHERE f.followingId = ? ORDER BY f.timestamp DESC',
    [userId]
  );

  res.json({ success: true, users });
}));

// ============= NOTIFICATION ENDPOINTS =============
app.get('/api/user/:userId/notifications', requireUser, asyncHandler(async (req, res) => {
  const userId = validators.positiveInteger(req.params.userId, 'User ID');
  
  if (Number(userId) !== req.userId) {
    throw new ForbiddenError('Cannot view other users notifications');
  }

  const notifications = await allDb(
    `SELECT n.*, u.username as actorUsername 
     FROM notifications n 
     LEFT JOIN users u ON u.id = n.actorId 
     WHERE n.userId = ? 
     ORDER BY n.timestamp DESC 
     LIMIT 50`,
    [userId]
  );

  res.json({ success: true, notifications });
}));

app.put('/api/notification/:notificationId/read', requireUser, asyncHandler(async (req, res) => {
  const notificationId = validators.positiveInteger(req.params.notificationId, 'Notification ID');
  const userId = req.userId;

  const result = await runDb(
    'UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?',
    [notificationId, userId]
  );

  if (result.changes === 0) {
    throw new NotFoundError('Notification');
  }

  res.json({ success: true });
}));

// ============= REEL ENDPOINTS =============
app.post('/api/reel', requireUser, asyncHandler(async (req, res, next) => {
  const uploadHandler = videoUpload.single('video');
  uploadHandler(req, res, (err) => {
    if (err) {
      next(new AppError(err.message || 'Video upload failed', 422, 'UPLOAD_ERROR'));
    } else {
      next();
    }
  });
}), asyncHandler(async (req, res) => {
  const userId = validators.positiveInteger(req.body.userId, 'User ID');
  const title = validators.string(req.body.title || '', { minLength: 1, maxLength: 200, fieldName: 'title' });
  const description = validators.string(req.body.description || '', { maxLength: 1000, fieldName: 'description' });
  const tags = Array.isArray(req.body.tags) ? req.body.tags.join(',') : (req.body.tags || '');

  if (Number(userId) !== req.userId) {
    throw new ForbiddenError('Cannot create reels for other users');
  }

  const uploadedVideoUrl = req.file ? `/uploads/${req.file.filename}` : req.body.videoUrl;
  const videoUrl = uploadedVideoUrl || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

  if (!validateVideoUrl(videoUrl)) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    throw new AppError('Video URL must be HTTPS', 422, 'INVALID_VIDEO_URL');
  }

  const blockedTerm = moderateReelContent({ title, description, tags, videoUrl });
  if (blockedTerm) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    throw new AppError('Content violates safety guidelines', 422, 'CONTENT_BLOCKED');
  }

  const reel = {
    userId,
    title,
    description,
    videoUrl,
    duration: 30,
    tags,
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  const result = await runDb(
    'INSERT INTO reels (userId, title, description, videoUrl, duration, tags, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [reel.userId, reel.title, reel.description, reel.videoUrl, reel.duration, reel.tags, reel.status, reel.timestamp]
  );

  logger.info('Reel created', { reelId: result.id, userId });
  res.status(201).json({ success: true, reel: { id: result.id, ...reel } });
}));

app.get('/api/reel/:reelId', asyncHandler(async (req, res) => {
  const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
  
  const reel = await reelHelper.getReelWithStats(reelId);

  if (!reel || reel.status !== 'published') {
    throw new NotFoundError('Reel');
  }

  const comments = await reelHelper.getReelComments(reelId, 10);

  res.json({ success: true, reel: { ...reel, comments } });
}));

app.put('/api/reel/:reelId', requireUser, asyncHandler(async (req, res) => {
  const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
  const userId = validators.positiveInteger(req.body.userId, 'User ID');
  const title = validators.string(req.body.title || '', { minLength: 1, maxLength: 200, fieldName: 'title' });
  const description = validators.string(req.body.description || '', { maxLength: 1000, fieldName: 'description' });

  if (Number(userId) !== req.userId) {
    throw new ForbiddenError('Cannot edit other users reels');
  }

  if (req.body.videoUrl && !validateVideoUrl(req.body.videoUrl)) {
    throw new AppError('Video URL must be HTTPS', 422, 'INVALID_VIDEO_URL');
  }

  const tags = Array.isArray(req.body.tags) ? req.body.tags.join(',') : (req.body.tags || '');
  const blockedTerm = moderateReelContent({ title, description, tags, videoUrl: req.body.videoUrl || '' });
  
  if (blockedTerm) {
    throw new AppError('Content violates safety guidelines', 422, 'CONTENT_BLOCKED');
  }

  const result = await runDb(
    'UPDATE reels SET title = ?, description = ?, tags = ?, videoUrl = COALESCE(?, videoUrl) WHERE id = ? AND userId = ?',
    [title, description, tags, req.body.videoUrl || null, reelId, userId]
  );

  if (result.changes === 0) {
    throw new NotFoundError('Reel');
  }

  const rows = await allDb('SELECT * FROM reels WHERE id = ?', [reelId]);
  res.json({ success: true, reel: rows[0] });
}));

app.delete('/api/reel/:reelId', requireUser, asyncHandler(async (req, res) => {
  const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
  const userId = validators.positiveInteger(req.body.userId, 'User ID');

  if (Number(userId) !== req.userId) {
    throw new ForbiddenError('Cannot delete other users reels');
  }

  const rows = await allDb('SELECT videoUrl FROM reels WHERE id = ? AND userId = ?', [reelId, userId]);
  
  if (rows.length === 0) {
    throw new NotFoundError('Reel');
  }

  await Promise.all([
    runDb('DELETE FROM reel_likes WHERE reelId = ?', [reelId]),
    runDb('DELETE FROM reel_comments WHERE reelId = ?', [reelId]),
    runDb('DELETE FROM reels WHERE id = ? AND userId = ?', [reelId, userId])
  ]);

  if (rows[0]?.videoUrl?.startsWith('/uploads/')) {
    const filePath = path.join(uploadDir, path.basename(rows[0].videoUrl));
    fs.promises.unlink(filePath).catch(() => {});
  }

  logger.info('Reel deleted', { reelId, userId });
  res.json({ success: true });
}));

// ============= LIKE & COMMENT ENDPOINTS =============
app.post('/api/reel/:reelId/like', requireUser, asyncHandler(async (req, res) => {
  const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
  const userId = req.userId;

  const [reelExists] = await Promise.all([
    allDb('SELECT id FROM reels WHERE id = ?', [reelId])
  ]);

  if (reelExists.length === 0) {
    throw new NotFoundError('Reel');
  }

  const existing = await allDb(
    'SELECT id FROM reel_likes WHERE reelId = ? AND userId = ?',
    [reelId, userId]
  );

  if (existing.length > 0) {
    await runDb('DELETE FROM reel_likes WHERE reelId = ? AND userId = ?', [reelId, userId]);
    return res.json({ success: true, liked: false });
  }

  await runDb(
    'INSERT INTO reel_likes (reelId, userId, timestamp) VALUES (?, ?, ?)',
    [reelId, userId, new Date().toISOString()]
  );

  const [reelRows, userRows] = await Promise.all([
    allDb('SELECT userId FROM reels WHERE id = ?', [reelId]),
    allDb('SELECT username FROM users WHERE id = ?', [userId])
  ]);

  await createNotification(
    reelRows[0]?.userId,
    userId,
    'like',
    `@${userRows[0]?.username || 'A user'} liked your reel`,
    reelId
  );

  res.json({ success: true, liked: true });
}));

app.post('/api/reel/:reelId/comment', requireUser, asyncHandler(async (req, res) => {
  const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
  const comment = validators.string(req.body.comment || '', { minLength: 1, maxLength: 500, fieldName: 'comment' });

  const reelExists = await allDb('SELECT id FROM reels WHERE id = ?', [reelId]);
  
  if (reelExists.length === 0) {
    throw new NotFoundError('Reel');
  }

  const result = await runDb(
    'INSERT INTO reel_comments (reelId, userId, comment, timestamp) VALUES (?, ?, ?, ?)',
    [reelId, req.userId, comment, new Date().toISOString()]
  );

  const [reelRows, userRows] = await Promise.all([
    allDb('SELECT userId FROM reels WHERE id = ?', [reelId]),
    allDb('SELECT username FROM users WHERE id = ?', [req.userId])
  ]);

  await createNotification(
    reelRows[0]?.userId,
    req.userId,
    'comment',
    `@${userRows[0]?.username || 'A user'} commented on your reel`,
    reelId
  );

  logger.debug('Comment created', { reelId, commentId: result.id });
  res.status(201).json({
    success: true,
    comment: { id: result.id, reelId, userId: req.userId, comment }
  });
}));

// ============= REPORT ENDPOINT =============
app.post('/api/report', requireUser, asyncHandler(async (req, res) => {
  const reelId = req.body.reelId ? validators.positiveInteger(req.body.reelId, 'Reel ID') : null;
  const commentId = req.body.commentId ? validators.positiveInteger(req.body.commentId, 'Comment ID') : null;
  const reason = validators.string(req.body.reason || '', { minLength: 1, maxLength: 300, fieldName: 'reason' });

  if (!reelId && !commentId) {
    throw new AppError('Either reelId or commentId must be provided', 400, 'INVALID_REQUEST');
  }

  const result = await runDb(
    'INSERT INTO reports (reporterId, reelId, commentId, reason, timestamp) VALUES (?, ?, ?, ?, ?)',
    [req.userId, reelId, commentId, reason, new Date().toISOString()]
  );

  logger.info('Report created', { reportId: result.id, reporterId: req.userId });
  res.status(201).json({ success: true, reportId: result.id });
}));

// ============= ADMIN ENDPOINTS =============
app.get('/admin/creators', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const creators = await allDb('SELECT * FROM creators ORDER BY timestamp DESC');
      res.json({ success: true, count: creators.length, creators });
    } catch (error) {
      next(error);
    }
  });
}));

app.get('/admin/packages', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const packages = await allDb('SELECT * FROM packages ORDER BY timestamp DESC');
      res.json({ success: true, count: packages.length, packages });
    } catch (error) {
      next(error);
    }
  });
}));

app.get('/admin/reports', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const reports = await allDb(
        `SELECT r.*, u.username as reporterUsername 
         FROM reports r JOIN users u ON u.id = r.reporterId 
         ORDER BY r.timestamp DESC LIMIT 100`
      );
      res.json({ success: true, reports });
    } catch (error) {
      next(error);
    }
  });
}));

app.get('/admin/reels', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const reels = await allDb(
        'SELECT r.*, u.username FROM reels r JOIN users u ON u.id = r.userId WHERE r.status = ? ORDER BY r.timestamp DESC LIMIT 100',
        [status]
      );
      res.json({ success: true, reels });
    } catch (error) {
      next(error);
    }
  });
}));

app.put('/admin/reel/:reelId/status', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
      const status = validators.enum(req.body.status, ['pending', 'published', 'rejected'], 'status');

      const result = await runDb('UPDATE reels SET status = ? WHERE id = ?', [status, reelId]);
      
      if (result.changes === 0) {
        throw new NotFoundError('Reel');
      }

      logger.info('Reel status updated', { reelId, status });
      res.json({ success: true, status });
    } catch (error) {
      next(error);
    }
  });
}));

app.put('/admin/report/:reportId/status', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const reportId = validators.positiveInteger(req.params.reportId, 'Report ID');
      const status = validators.enum(req.body.status, ['pending', 'reviewed', 'rejected'], 'status');

      const result = await runDb('UPDATE reports SET status = ? WHERE id = ?', [status, reportId]);
      
      if (result.changes === 0) {
        throw new NotFoundError('Report');
      }

      logger.info('Report status updated', { reportId, status });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
}));

app.delete('/admin/reel/:reelId', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const reelId = validators.positiveInteger(req.params.reelId, 'Reel ID');
      
      const rows = await allDb('SELECT videoUrl FROM reels WHERE id = ?', [reelId]);
      
      if (rows.length === 0) {
        throw new NotFoundError('Reel');
      }

      await Promise.all([
        runDb('DELETE FROM reel_likes WHERE reelId = ?', [reelId]),
        runDb('DELETE FROM reel_comments WHERE reelId = ?', [reelId]),
        runDb('DELETE FROM reports WHERE reelId = ?', [reelId]),
        runDb('DELETE FROM reels WHERE id = ?', [reelId])
      ]);

      if (rows[0]?.videoUrl?.startsWith('/uploads/')) {
        const filePath = path.join(uploadDir, path.basename(rows[0].videoUrl));
        fs.promises.unlink(filePath).catch(() => {});
      }

      logger.info('Reel deleted by admin', { reelId });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
}));

app.put('/admin/package/:packageId/status', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const packageId = validators.positiveInteger(req.params.packageId, 'Package ID');
      const status = validators.enum(req.body.status, ['pending', 'approved', 'rejected'], 'status');

      const result = await runDb('UPDATE packages SET status = ? WHERE id = ?', [status, packageId]);
      
      if (result.changes === 0) {
        throw new NotFoundError('Package');
      }

      const rows = await allDb('SELECT * FROM packages WHERE id = ?', [packageId]);
      logger.info('Package status updated', { packageId, status });
      res.json({ success: true, package: rows[0] });
    } catch (error) {
      next(error);
    }
  });
}));

app.get('/admin/analytics', asyncHandler(async (req, res, next) => {
  requireAdmin(req, res, async () => {
    try {
      const recent = await allDb(
        'SELECT * FROM analytics ORDER BY id DESC LIMIT 50'
      );
      res.json({ success: true, count: recent.length, recent });
    } catch (error) {
      next(error);
    }
  });
}));

// ============= ERROR HANDLING =============
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`
    }
  });
});

// Global error handler
app.use(errorHandler);

// ============= SERVER STARTUP =============
const port = config.get('PORT');
const httpServer = app.listen(port, () => {
  logger.info(`Server started successfully on port ${port}`);
  if (config.isProduction()) {
    logger.info('Running in PRODUCTION mode');
  } else {
    logger.info('Running in DEVELOPMENT mode');
  }
});

// ============= GRACEFUL SHUTDOWN =============
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    db.close(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    db.close(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason), promise: String(promise) });
});

module.exports = app;
