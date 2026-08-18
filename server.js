const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const fs = require('fs');
const accessLogPath = path.join(__dirname, 'access.log');

// Admin token (set via environment variable). Change in production.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
if (ADMIN_TOKEN === 'changeme') {
  console.warn('Warning: ADMIN_TOKEN is using default value. Set ADMIN_TOKEN env var to secure admin endpoints.');
}

function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || req.query.token || req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', '');
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
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
        tags: ['#reeloram', '#reklam', '#yaratıcı'],
        song: 'Reeloram Studio · Premium',
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

app.post('/api/track', (req, res) => {
  const event = {
    id: analytics.length + 1,
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  analytics.push(event);
  res.json({ success: true, event });
});

app.post('/api/creator', (req, res) => {
  const creator = {
    id: creators.length + 1,
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  creators.push(creator);
  res.json({ success: true, creator });
});

app.post('/api/package-request', (req, res) => {
  const request = {
    id: packages.length + 1,
    timestamp: new Date().toISOString(),
    ...req.body,
  };

  packages.push(request);
  res.json({ success: true, request });
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
  // Append to access log as well
  try { fs.appendFileSync(accessLogPath, JSON.stringify({ type: 'affiliate', ...click }) + '\n'); } catch(e) {}

  // Redirect to affiliate destination
  res.redirect(affiliateMap[aid]);
});

app.get('/admin/affiliate-stats', requireAdmin, (req, res) => {
  const counts = affiliateClicks.reduce((acc, c) => { acc[c.aid] = (acc[c.aid]||0)+1; return acc; }, {});
  res.json({ totalClicks: affiliateClicks.length, byAffiliate: counts, recent: affiliateClicks.slice(-100) });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), analyticsCount: analytics.length, creatorsCount: creators.length, packageRequests: packages.length });
});

// Admin endpoints for quick monitoring
app.get('/admin/analytics', requireAdmin, (req, res) => {
  res.json({ count: analytics.length, recent: analytics.slice(-50) });
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

app.listen(port, () => {
  console.log(`Reeloram server listening on http://localhost:${port}`);
});
