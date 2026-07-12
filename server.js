const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let analytics = [];
let creators = [];
let packages = [];

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

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), analyticsCount: analytics.length, creatorsCount: creators.length, packageRequests: packages.length });
});

app.listen(port, () => {
  console.log(`Reeloram server listening on http://localhost:${port}`);
});
