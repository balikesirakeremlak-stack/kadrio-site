const pageBody = document.getElementById('page-body');
const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
const heroPrimary = document.querySelector('.primary-button');
const heroSecondary = document.querySelector('.secondary-button');
const searchButton = document.querySelector('.icon-button');
const heroHeading = document.querySelector('.hero-panel h1');

const API_BASE = '';

async function fetchJson(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, options);
  if (!response.ok) {
    throw new Error(`API hatası: ${response.status}`);
  }
  return response.json();
}

function trackEvent(action, payload = {}) {
  fetchJson('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  }).catch(() => {});
}

const reels = [
  {
    user: 'reeloram',
    avatar: 'Z',
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
];

const trendReels = [
  {
    ...reels[1],
    views: '1.2M',
    tags: ['#trend', '#viral', '#sponsor'],
    sponsored: true,
  },
  {
    ...reels[0],
    views: '2.1M',
    tags: ['#reklam', '#tasarım', '#üyelik'],
    sponsored: true,
  },
];

let currentObserver = null;

function formatCount(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
}

function createTagElements(tags) {
  return tags.map((tag) => {
    const tagElement = document.createElement('span');
    tagElement.className = 'tag';
    tagElement.textContent = tag;
    return tagElement;
  });
}

function setActivePage(pageKey) {
  navButtons.forEach((button) => {
    const isActive = button.dataset.page === pageKey;
    button.classList.toggle('active', isActive);
  });
}

function mountFeed(items) {
  pageBody.innerHTML = '<div class="feed no-scrollbar" id="feed"></div>';
  const feedElement = document.getElementById('feed');
  items.forEach((item) => feedElement.appendChild(buildReel(item)));
  initObserver();
}

function initObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
  }

  currentObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector('video');
        if (!video) return;
        if (entry.intersectionRatio > 0.75) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        } else {
          video.pause();
        }
      });
    },
    {
      threshold: [0.25, 0.75],
    }
  );

  document.querySelectorAll('.reel').forEach((reel) => currentObserver.observe(reel));
}

function buildReel(reel) {
  const reelElement = document.createElement('section');
  reelElement.className = 'reel';

  const video = document.createElement('video');
  video.src = reel.src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.loop = true;
  video.setAttribute('playsinline', '');

  const reelContent = document.createElement('div');
  reelContent.className = 'reel-content';

  const info = document.createElement('div');
  info.className = 'info';

  const userTag = document.createElement('div');
  userTag.className = 'user-tag';
  userTag.innerHTML = `
    <span class="user-avatar">${reel.avatar}</span>
    <span class="user-name">@${reel.user}</span>
  `;

  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = reel.description;

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = reel.song;

  const tagsRow = document.createElement('div');
  tagsRow.className = 'text-row';
  createTagElements(reel.tags).forEach((tagElement) => tagsRow.appendChild(tagElement));

  info.appendChild(userTag);
  info.appendChild(description);
  info.appendChild(meta);
  info.appendChild(tagsRow);

  const actions = document.createElement('aside');
  actions.className = 'side-actions';

  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.className = 'action-button';
  likeButton.dataset.action = 'like';
  likeButton.innerHTML = `❤<span>${formatCount(reel.likes)}</span>`;

  const commentButton = document.createElement('button');
  commentButton.type = 'button';
  commentButton.className = 'action-button';
  commentButton.dataset.action = 'comment';
  commentButton.innerHTML = `💬<span>${formatCount(reel.comments)}</span>`;

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'action-button';
  shareButton.dataset.action = 'share';
  shareButton.innerHTML = `↗<span>${formatCount(reel.shares)}</span>`;

  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'action-button';
  muteButton.dataset.action = 'mute';
  muteButton.textContent = '🔇';

  actions.appendChild(likeButton);
  actions.appendChild(commentButton);
  actions.appendChild(shareButton);
  actions.appendChild(muteButton);

  reelContent.appendChild(info);
  reelContent.appendChild(actions);
  reelElement.appendChild(video);
  reelElement.appendChild(reelContent);

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = reel.sponsored ? 'Sponsorlu' : 'Öne Çıkan';
  if (reel.sponsored) {
    badge.classList.add('sponsored');
  }
  reelElement.appendChild(badge);

  const videoStatus = document.createElement('div');
  videoStatus.className = 'video-status';
  videoStatus.textContent = `${reel.views} görüntüleme · ${reel.song}`;
  reelElement.appendChild(videoStatus);

  const muteTip = document.createElement('div');
  muteTip.className = 'mute-tip';
  muteTip.textContent = 'Tek dokunma: oynat/durdur · Çift dokunma: beğen';
  reelElement.appendChild(muteTip);

  const heartBurst = document.createElement('div');
  heartBurst.className = 'heart-burst';
  heartBurst.textContent = '❤';
  reelElement.appendChild(heartBurst);

  const showTip = (text) => {
    muteTip.textContent = text;
    muteTip.style.opacity = '1';
    clearTimeout(reelElement._tipTimeout);
    reelElement._tipTimeout = setTimeout(() => {
      muteTip.style.opacity = '0';
    }, 1400);
  };

  const toggleLike = () => {
    const liked = likeButton.classList.toggle('active');
    const count = liked ? reel.likes + 1 : reel.likes;
    likeButton.querySelector('span').textContent = formatCount(count);
    heartBurst.classList.add('show');
    setTimeout(() => heartBurst.classList.remove('show'), 700);
  };

  video.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      showTip('Oynatılıyor');
      trackEvent('reel.play', { reelId: reel.id });
    } else {
      video.pause();
      showTip('Duraklatıldı');
      trackEvent('reel.pause', { reelId: reel.id });
    }
  });

  video.addEventListener('dblclick', () => {
    toggleLike();
    trackEvent('reel.like', { reelId: reel.id });
  });

  muteButton.addEventListener('click', () => {
    video.muted = !video.muted;
    muteButton.textContent = video.muted ? '🔇' : '🔊';
    showTip(video.muted ? 'Ses kapalı' : 'Ses açık');
  });

  actions.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.dataset.action === 'mute') return;
    if (button.dataset.action === 'like') {
      toggleLike();
    }
  });

  return reelElement;
}

async function renderFeed() {
  heroHeading.textContent = 'İçerik üreticilerini büyüt, reklam gelirlerini artır.';
  let items = reels;

  try {
    const data = await fetchJson('/api/reels');
    if (Array.isArray(data.reels) && data.reels.length) {
      items = data.reels;
    }
  } catch (error) {
    console.warn('Reels yüklenemedi, varsayılan veri kullanılıyor.', error);
  }

  mountFeed(items);
}

async function renderTrend() {
  heroHeading.textContent = 'Trend içerikler, sponsor fırsatları ve keşif akışı.';
  let items = trendReels;

  try {
    const data = await fetchJson('/api/reels');
    if (Array.isArray(data.reels) && data.reels.length) {
      items = data.reels.slice(0, 3);
    }
  } catch (error) {
    console.warn('Trend reel yüklenemedi, varsayılan veri kullanılıyor.', error);
  }

  mountFeed(items);
}

function renderCreatorPage() {
  pageBody.innerHTML = `
    <section class="form-card">
      <h2>İçerik Üretici Başvurusu</h2>
      <p>Zayıf bir başvuru alanı ile doğrudan markalara ve reklamverenlere içerik oluştur.</p>
      <form id="creator-form" class="form-grid">
        <div class="input-group">
          <label for="name">Adınız</label>
          <input id="name" name="name" type="text" placeholder="Adınız" required />
        </div>
        <div class="input-group">
          <label for="email">E-posta</label>
          <input id="email" name="email" type="email" placeholder="mail@ornek.com" required />
        </div>
        <div class="input-group">
          <label for="channel">Kanal / Marka</label>
          <input id="channel" name="channel" type="text" placeholder="Kanal adı veya marka" required />
        </div>
        <div class="input-group">
          <label for="message">Kısa tanıtım</label>
          <textarea id="message" name="message" placeholder="Kendinizi ve hedefinizi anlatın..." required></textarea>
        </div>
        <button type="submit" class="submit-button">Başvuruyu Gönder</button>
      </form>
    </section>
  `;

  const form = document.getElementById('creator-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: form.name.value,
      email: form.email.value,
      channel: form.channel.value,
      message: form.message.value,
    };

    try {
      await fetchJson('/api/creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      alert('Başvurunuz alındı! Size en kısa sürede dönüş yapılacaktır.');
      form.reset();
      trackEvent('creator.application', { channel: payload.channel });
    } catch (error) {
      console.error(error);
      alert('Başvuru gönderilemedi. Lütfen tekrar deneyin.');
    }
  });
}

function renderMessagesPage() {
  pageBody.innerHTML = `
    <section class="placeholder-card">
      <h2>Mesajlar</h2>
      <p>Gelen mesajlar bu alanda gösterilecek. Reklam iş birlikleri, marka teklifleri ve kullanıcı geri bildirimleri için merkezi bir nokta.</p>
    </section>
  `;
}

function renderProfilePage() {
  pageBody.innerHTML = `
    <section class="placeholder-card">
      <h2>Profil</h2>
      <p>Üretici istatistikleri, gelir raporları ve yönetim paneline buradan erişebilirsiniz.</p>
    </section>
  `;
}

function changePage(pageKey) {
  setActivePage(pageKey);
  switch (pageKey) {
    case 'akis':
      renderFeed();
      break;
    case 'trend':
      renderTrend();
      break;
    case 'uret':
      renderCreatorPage();
      break;
    case 'mesaj':
      renderMessagesPage();
      break;
    case 'profil':
      renderProfilePage();
      break;
    default:
      renderFeed();
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => changePage(button.dataset.page));
});

heroPrimary.addEventListener('click', () => {
  changePage('uret');
});

heroSecondary.addEventListener('click', () => {
  changePage('akis');
});

searchButton.addEventListener('click', () => {
  const query = prompt('Ne aramak istersiniz?');
  if (query) {
    alert(`${query} için arama sonuçları gösteriliyor...`);
  }
});

window.addEventListener('load', () => {
  renderFeed();
});
// Modal and ad handlers
(function(){
  function openModal(id){ const m=document.getElementById(id); if(!m) return; m.classList.remove('hidden'); m.setAttribute('aria-hidden','false'); }
  function closeModal(id){ const m=document.getElementById(id); if(!m) return; m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }

  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('close-modal')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal.id);
    }
    if (e.target.classList && e.target.classList.contains('modal')) {
      closeModal(e.target.id);
    }
  });

  const loginBtn = document.querySelector('.text-button');
  if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); openModal('login-modal'); });

  const heroSecondary = document.querySelector('.secondary-button');
  if (heroSecondary) heroSecondary.addEventListener('click', (e) => { e.preventDefault(); openModal('package-modal'); });

  const adCopy = document.querySelector('.ad-copy');
  if (adCopy) adCopy.addEventListener('click', (e) => { e.preventDefault(); openModal('package-modal'); });

  const packageButtons = document.querySelectorAll('.package-action');
  packageButtons.forEach((button) => {
    button.addEventListener('click', (e) => { e.preventDefault(); openModal('package-modal'); });
  });

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); alert('Giriş simüle edildi — gerçek kimlik doğrulama eklenmeli.'); closeModal('login-modal'); });

  const packageForm = document.getElementById('package-form');
  if (packageForm) {
    packageForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        company: packageForm.company.value,
        budget: packageForm.budget.value,
        campaignType: packageForm.campaignType.value,
        campaignGoal: packageForm.campaignGoal.value,
      };

      try {
        await fetchJson('/api/package-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        alert('Paket talebiniz alındı! En kısa sürede size döneceğiz.');
        packageForm.reset();
        closeModal('package-modal');
        trackEvent('package.request', { campaignType: payload.campaignType });
      } catch (error) {
        console.error(error);
        alert('Talep gönderilemedi. Lütfen tekrar deneyin.');
      }
    });
  }

  // analytics stub
  window.analytics = window.analytics || { track: function(event, props){ console.log('[analytics]', event, props || {}); } };
})();
