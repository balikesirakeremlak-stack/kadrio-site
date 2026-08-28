// === KADRIO APP.JS ===
const pageBody = document.getElementById('page-body');
const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
const heroPrimary = document.getElementById('hero-primary-button');
const heroSecondary = document.getElementById('hero-secondary-button');
const heroCheckoutButton = document.getElementById('hero-checkout-button');
const promoBuyButton = document.getElementById('promo-buy-button');
const loginButton = document.querySelector('.text-button');

const API_BASE = '';

async function goToCheckout() {
  try {
    const status = await fetchJson('/api/status');
    const checkoutUrl = status.product?.checkoutUrl || status.paymentLinkUrl;
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
      return true;
    }
    if (isLoggedIn()) {
      openModal('package-modal');
    } else {
      openModal('login-modal');
    }
    return false;
  } catch (error) {
    console.warn('Ödeme bağlantısı kontrol edilemedi:', error);
    if (isLoggedIn()) {
      openModal('package-modal');
    } else {
      openModal('login-modal');
    }
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

// === AUTH FUNCTIONS ===
function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('reeloram-user') || 'null');
  } catch (error) {
    return null;
  }
}

function setStoredUser(user, token = null) {
  if (!user) {
    localStorage.removeItem('reeloram-user');
    localStorage.removeItem('reeloram-token');
    return;
  }
  localStorage.setItem('reeloram-user', JSON.stringify(user));
  localStorage.setItem('reeloram-token', token || localStorage.getItem('reeloram-token') || '');
}

function isLoggedIn() {
  return !!getStoredUser();
}

async function restoreSession() {
  const user = getStoredUser();
  const token = localStorage.getItem('reeloram-token');
  if (!user || !token) {
    setStoredUser(null);
    return null;
  }
  try {
    const verifiedUser = await fetchJson(`/api/user/${user.id}`);
    setStoredUser(verifiedUser, token);
    return verifiedUser;
  } catch (error) {
    setStoredUser(null);
    return null;
  }
}

function updateAuthUi() {
  if (!loginButton) return;
  loginButton.textContent = isLoggedIn() ? 'Profil' : 'Giriş Yap';
}

async function registerUser(username, email, password) {
  const normalizedUsername = (username || email || '').toString().trim();
  const response = await fetchJson('/api/user/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: normalizedUsername, email, password })
  });
  setStoredUser(response.user, response.token);
  updateAuthUi();
  return response.user;
}

async function loginUser(usernameOrEmail, password) {
  const response = await fetchJson('/api/user/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameOrEmail, email: usernameOrEmail, password })
  });
  setStoredUser(response.user, response.token);
  updateAuthUi();
  return response.user;
}

// === API HELPERS ===
async function fetchJson(url, options = {}) {
  const token = localStorage.getItem('reeloram-token');
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  options.headers = headers;
  const response = await fetch(`${API_BASE}${url}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API hatası: ${response.status}`);
  return data;
}

function trackEvent(action, payload = {}) {
  fetchJson('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  }).catch(() => {});
}

// === MODAL FUNCTIONS ===
function closeAllModals() {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.add('hidden');
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  closeAllModals();
  modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

document.querySelectorAll('.close-modal').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) modal.classList.add('hidden');
  });
});

document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// === PAGE RENDERING ===
async function renderFeed() {
  pageBody.innerHTML = '<section class="feed"><div class="loading">Reeller yükleniyor...</div></section>';
  
  try {
    const { reels } = await fetchJson('/api/feed?limit=50');
    const hasReels = Boolean(reels && reels.length);
    document.body.classList.toggle('feed-mode', hasReels);
    document.body.classList.toggle('empty-mode', !hasReels);
    
    if (!reels || reels.length === 0) {
      pageBody.innerHTML = `<section class="feed empty-feed">
        <article class="empty-reel-card">
          <video src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" muted autoplay loop playsinline preload="metadata"></video>
          <div class="empty-reel-shade"></div>
          <div class="empty-reel-copy">
            <span class="preview-label">KADRİO ÖNİZLEME</span>
            <h2>İlk keşfini sen başlat.</h2>
            <p>Akışa katıl, reel'ini paylaş ve Kadrio'nun ilk creator topluluğunda yerini al.</p>
            <div class="empty-reel-actions">
              <button class="primary-button empty-start-button" type="button">Reel yükle</button>
              <button class="secondary-button invite-button" type="button">Davet et</button>
              <button class="secondary-button empty-promo-button" type="button">Tanıtım paketi</button>
            </div>
          </div>
        </article>
      </section>`;
      document.querySelector('.empty-start-button')?.addEventListener('click', () => {
        if (isLoggedIn()) openModal('reel-upload-modal');
        else openModal('login-modal');
      });
      document.querySelector('.empty-promo-button')?.addEventListener('click', goToCheckout);
      document.querySelector('.invite-button')?.addEventListener('click', async () => {
        const inviteUrl = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Kadrio beta', text: 'Kadrio’da kısa videoları keşfet:', url: inviteUrl });
          } else {
            await navigator.clipboard.writeText(inviteUrl);
            alert('Davet bağlantısı kopyalandı.');
          }
          trackEvent('invite.share');
        } catch (error) {
          if (error.name !== 'AbortError') console.error(error);
        }
      });
      return;
    }

    pageBody.innerHTML = `<section class="feed">${reels.map(reel => `
      <div class="reel-card" data-reel-id="${reel.id}" data-boost-request-id="${reel.boostRequestId || ''}">
        <div class="reel-header">
          <div class="reel-user">
            <div class="avatar">${(reel.username || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>${escapeHtml(reel.username || 'Anonim')}</strong>
              <small>${new Date(reel.timestamp).toLocaleString('tr-TR')}</small>
            </div>
          </div>
          <button class="more-btn">⋮</button>
        </div>
        
        <div class="reel-video">
          <video src="${reel.videoUrl || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'}" muted autoplay loop playsinline preload="metadata" controls></video>
        </div>
        
        <div class="reel-content">
          <h3>${escapeHtml(reel.title)}</h3>
          <p>${escapeHtml(reel.description || '')}</p>
          ${reel.tags ? `<div class="tags">${reel.tags.split(',').map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        </div>
        
        <div class="reel-actions">
          <button class="action-btn like-btn" data-reel-id="${reel.id}">
            <span class="icon">❤️</span>
            <span class="count">${reel.likeCount || 0}</span>
          </button>
          <button class="action-btn comment-btn" data-reel-id="${reel.id}">
            <span class="icon">💬</span>
            <span class="count">${reel.comments || 0}</span>
          </button>
          <button class="action-btn share-btn" data-reel-id="${reel.id}" data-reel-title="${escapeHtml(reel.title)}">
            <span class="icon">📤</span>
            <span class="count">${reel.shares || 0}</span>
          </button>
          <button class="action-btn save-btn">
            <span class="icon">🔖</span>
          </button>
          <button class="action-btn report-btn" data-reel-id="${reel.id}">Bildir</button>
        </div>
        <div class="comments-panel" data-comments-for="${reel.id}">
          <div class="comments-list"><span class="muted">Yorumlar yükleniyor...</span></div>
          <div class="comment-form">
            <input class="comment-input" type="text" maxlength="200" placeholder="Yorum yaz..." />
            <button class="comment-submit" data-reel-id="${reel.id}">Gönder</button>
          </div>
        </div>
      </div>
    `).join('')}</section>`;

    document.querySelectorAll('.reel-video video').forEach((video) => {
      video.addEventListener('error', () => {
        video.classList.add('video-unavailable');
        const notice = document.createElement('span');
        notice.className = 'video-unavailable-notice';
        notice.textContent = 'Video şu anda kullanılamıyor';
        video.parentElement.appendChild(notice);
      }, { once: true });
    });

    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.play().catch(() => {});
        else entry.target.pause();
      });
    }, { threshold: 0.65 });
    document.querySelectorAll('.reel-video video').forEach((video) => videoObserver.observe(video));

    document.querySelectorAll('.reel-card[data-boost-request-id]').forEach((card) => {
      card.addEventListener('click', async (event) => {
        if (event.target.closest('button, video, input, textarea')) return;
        const requestId = card.dataset.boostRequestId;
        const storageKey = `kadrio-boost-click-${requestId}`;
        if (sessionStorage.getItem(storageKey)) return;
        sessionStorage.setItem(storageKey, '1');
        await fetchJson('/api/boost-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId })
        }).catch(() => sessionStorage.removeItem(storageKey));
      });
    });

    // Like handlers
    document.querySelectorAll('.like-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const reelId = btn.dataset.reelId;
        const user = getStoredUser();
        if (!user) { openModal('login-modal'); return; }
        
        try {
          const { liked } = await fetchJson(`/api/reel/${reelId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
          });
          
          const countEl = btn.querySelector('.count');
          let count = parseInt(countEl.textContent);
          countEl.textContent = liked ? count + 1 : Math.max(0, count - 1);
          btn.classList.toggle('liked', liked);
        } catch (error) {
          console.error(error);
        }
      });
    });

    document.querySelectorAll('.report-btn').forEach((button) => button.addEventListener('click', async () => {
      const user = getStoredUser();
      if (!user) { openModal('login-modal'); return; }
      const reason = prompt('Bildirme nedeni:');
      if (!reason?.trim()) return;
      await fetchJson('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporterId: user.id, reelId: button.dataset.reelId, reason: reason.trim() }) });
      alert('Bildirimin alındı.');
    }));

    document.querySelectorAll('.share-btn').forEach((button) => button.addEventListener('click', async () => {
      const shareUrl = `${window.location.origin}/?reel=${encodeURIComponent(button.dataset.reelId)}`;
      const shareData = { title: button.dataset.reelTitle || 'Kadrio reel', text: 'Kadrio’da bu reeli keşfet:', url: shareUrl };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(shareUrl);
          alert('Reel bağlantısı kopyalandı.');
        }
        const countEl = button.querySelector('.count');
        countEl.textContent = parseInt(countEl.textContent || '0', 10) + 1;
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    }));

    document.querySelectorAll('.comments-panel').forEach(async (panel) => {
      const reelId = panel.dataset.commentsFor;
      try {
        const { reel } = await fetchJson(`/api/reel/${reelId}`);
        const comments = reel.comments || [];
        const list = panel.querySelector('.comments-list');
        list.innerHTML = comments.length
          ? comments.map((item) => `<div class="comment-item"><strong>${escapeHtml(item.username || `Kullanıcı ${item.userId}`)}</strong><span>${escapeHtml(item.comment)}</span></div>`).join('')
          : '<span class="muted">Henüz yorum yok.</span>';
        panel.closest('.reel-card').querySelector('.comment-btn .count').textContent = comments.length;
      } catch (error) {
        panel.querySelector('.comments-list').innerHTML = '<span class="muted">Yorumlar yüklenemedi.</span>';
      }
    });

    document.querySelectorAll('.comment-submit').forEach((button) => {
      button.addEventListener('click', async () => {
        const user = getStoredUser();
        if (!user) { openModal('login-modal'); return; }
        const panel = button.closest('.comments-panel');
        const input = panel.querySelector('.comment-input');
        const comment = input.value.trim();
        if (!comment) return;
        button.disabled = true;
        try {
          await fetchJson(`/api/reel/${button.dataset.reelId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, comment })
          });
          input.value = '';
          const list = panel.querySelector('.comments-list');
          if (list.querySelector('.muted')) list.innerHTML = '';
          list.insertAdjacentHTML('afterbegin', `<div class="comment-item"><strong>${escapeHtml(user.username)}</strong><span>${escapeHtml(comment)}</span></div>`);
          const count = panel.closest('.reel-card').querySelector('.comment-btn .count');
          count.textContent = parseInt(count.textContent || '0', 10) + 1;
        } catch (error) {
          console.error(error);
        } finally {
          button.disabled = false;
        }
      });
    });

  } catch (error) {
    console.error(error);
    pageBody.innerHTML = '<section class="feed"><div class="error">Feed yükleme hatası</div></section>';
  }
}

async function renderTrend() {
  pageBody.innerHTML = '<section class="feed"><div class="loading">Trendler yükleniyor...</div></section>';
  try {
    const { reels } = await fetchJson('/api/feed?limit=30');
    const trending = (reels || []).sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 10);
    pageBody.innerHTML = !trending.length 
      ? '<section class="feed"><div class="empty-state">Henüz trend yok</div></section>'
      : `<section class="trend-panel" style="padding:20px;"><h2 style="margin-top:0;">🔥 Trendler</h2><div class="trend-list" style="display:grid;gap:10px;">${trending.map((r, i) => `<div style="background:#1a1a1a;padding:15px;border-radius:8px;border-left:3px solid #6f5dff;display:flex;align-items:center;gap:15px;cursor:pointer;" data-reel="${r.id}"><div style="background:#6f5dff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0;">#${i+1}</div><div style="flex:1;"><h4 style="margin:0;">${r.title}</h4><p style="margin:5px 0 0 0;font-size:0.85rem;color:#999;">@${r.username} • ❤️ ${r.likeCount||0}</p></div></div>`).join('')}</div></section>`;
  } catch (e) {
    pageBody.innerHTML = '<section class="feed"><div class="error">Trend yükleme hatası</div></section>';
  }
}

async function renderSearch(query) {
  pageBody.innerHTML = '<section class="form-card"><div class="loading">Aranıyor...</div></section>';
  try {
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
    const users = data.users || [];
    const reels = data.reels || [];
    pageBody.innerHTML = `<section class="form-card search-results"><h2>Arama: ${query}</h2><h3>Creatorlar</h3><div class="search-users">${users.length ? users.map((item) => `<button class="search-user" data-user-id="${item.id}"><span class="avatar">${(item.avatar || item.username).charAt(0).toUpperCase()}</span><strong>@${item.username}</strong></button>`).join('') : '<p class="muted">Creator bulunamadı.</p>'}</div><h3>Reeller</h3><div class="search-reels">${reels.length ? reels.map((item) => `<article class="search-reel"><video src="${item.videoUrl}" controls></video><strong>${item.title}</strong><span class="muted">@${item.username}</span></article>`).join('') : '<p class="muted">Reel bulunamadı.</p>'}</div></section>`;
    document.querySelectorAll('.search-user').forEach((button) => button.addEventListener('click', () => renderProfilePage(button.dataset.userId)));
  } catch (error) {
    pageBody.innerHTML = '<section class="form-card"><div class="error">Arama başarısız</div></section>';
  }
}

async function renderNotifications() {
  const user = getStoredUser();
  if (!user) { openModal('login-modal'); return; }
  pageBody.innerHTML = '<section class="form-card"><div class="loading">Bildirimler yükleniyor...</div></section>';
  try {
    const { notifications } = await fetchJson(`/api/user/${user.id}/notifications`);
    pageBody.innerHTML = `<section class="form-card"><h2>Bildirimler</h2><div class="notification-list">${notifications.length ? notifications.map((item) => `<button class="notification-item ${item.isRead ? '' : 'unread'}" data-notification-id="${item.id}">${item.message}<small>${new Date(item.timestamp).toLocaleString('tr-TR')}</small></button>`).join('') : '<p class="muted">Henüz bildirimin yok.</p>'}</div></section>`;
    document.querySelectorAll('.notification-item').forEach((item) => item.addEventListener('click', async () => {
      await fetchJson(`/api/notification/${item.dataset.notificationId}/read`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
      item.classList.remove('unread');
    }));
  } catch (error) { pageBody.innerHTML = '<section class="form-card"><div class="error">Bildirimler yüklenemedi</div></section>'; }
}

async function renderCreatorPage() {
  if (!isLoggedIn()) {
    pageBody.innerHTML = `
      <section style="padding:20px;max-width:900px;margin:0 auto;">
        <div class="form-card" style="padding:28px;">
          <p class="eyebrow" style="margin:0 0 8px;">ÜRETİM PANELİ</p>
          <h2 style="margin:0 0 12px;">Giriş yaparak reel yüklemeye başla</h2>
          <p style="margin:0 0 18px; color:#c9d1dc;">İçerik üretmek için hesabına giriş yap veya işletmen için reklam talebi oluştur.</p>
          <div class="hero-actions" style="justify-content:flex-start;">
            <button class="submit-button" id="goto-login-btn">Giriş Yap</button>
            <button class="secondary-button" id="creator-package-btn">Üretici Paketleri</button>
          </div>
        </div>
      </section>
    `;

    document.getElementById('goto-login-btn')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('creator-package-btn')?.addEventListener('click', () => openModal('package-modal'));
    return;
  }

  const user = getStoredUser();
  pageBody.innerHTML = `<section style="padding:20px;max-width:900px;margin:0 auto;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;"><h2 style="margin:0;">📊 Yönetim Paneli</h2><div style="display:flex;gap:10px;align-items:center;"><button class="secondary-button" id="package-request-btn" style="cursor:pointer;">Üretici Paketleri</button><button class="submit-button" id="upload-reel-btn" style="cursor:pointer;">+ Yeni Reel</button></div></div><div class="stats-grid"><div class="stat-card"><span>Reeller</span><strong id="stat-reels">0</strong></div><div class="stat-card"><span>Beğeni</span><strong id="stat-likes">0</strong></div><div class="stat-card"><span>Görüntülenme</span><strong id="stat-views">0</strong></div><div class="stat-card"><span>Takipçi</span><strong id="stat-followers">0</strong></div></div><h3 style="margin-top:30px;margin-bottom:15px;">Reellerim</h3><div id="creator-reels" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;"></div></section>`;
  document.getElementById('upload-reel-btn').addEventListener('click', () => openModal('reel-upload-modal'));
  document.getElementById('package-request-btn')?.addEventListener('click', () => openModal('package-modal'));
  try {
    const { reels } = await fetchJson(`/api/reels/user/${user.id}`);
    const reelDiv = document.getElementById('creator-reels');
    if (reels && reels.length) {
      let tl=0, tv=0;
      reelDiv.innerHTML = reels.map(r => { tl+=r.likes||0; tv+=r.views||0; const statusLabel = r.status === 'published' ? 'Yayında' : r.status === 'rejected' ? 'Reddedildi' : 'İncelemede'; return `<div class="creator-reel-card" data-reel-id="${r.id}" style="background:#1a1a1a;border-radius:8px;overflow:hidden;border:1px solid #333;"><div style="aspect-ratio:1;overflow:hidden;background:#000;"><video src="${r.videoUrl}" style="width:100%;height:100%;object-fit:cover;" controls></video></div><div style="padding:8px;"><h5 style="margin:0;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title}</h5><p style="margin:4px 0;font-size:0.75rem;color:#999;">❤️ ${r.likes||0} 👁️ ${r.views||0}</p><p style="margin:4px 0;font-size:0.75rem;color:#c9d1dc;">Durum: ${statusLabel}</p><div style="display:flex;gap:6px;"><button class="edit-reel-btn" data-reel-id="${r.id}">Düzenle</button><button class="delete-reel-btn" data-reel-id="${r.id}">Sil</button></div></div></div>`; }).join('');
      document.getElementById('stat-reels').textContent = reels.length;
      document.getElementById('stat-likes').textContent = tl;
      document.getElementById('stat-views').textContent = tv;
      document.querySelectorAll('.delete-reel-btn').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Bu reeli silmek istediğine emin misin?')) return;
        await fetchJson(`/api/reel/${button.dataset.reelId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
        renderCreatorPage();
      }));
      document.querySelectorAll('.edit-reel-btn').forEach((button) => button.addEventListener('click', async () => {
        const reel = reels.find((item) => String(item.id) === button.dataset.reelId);
        const title = prompt('Reel başlığı:', reel.title);
        if (!title || title === reel.title) return;
        await fetchJson(`/api/reel/${reel.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, title, description: reel.description, tags: reel.tags }) });
        renderCreatorPage();
      }));
    } else {
      reelDiv.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;padding:40px 0;">Henüz reel yok. Hemen başla!</p>';
    }
  } catch (e) { console.error(e); }
}

async function renderProfilePage(profileUserId) {
  const viewer = getStoredUser();
  const userId = profileUserId || viewer?.id;
  const user = viewer && String(viewer.id) === String(userId) ? viewer : null;
  if (!user) {
    if (!viewer) { openModal('login-modal'); return; }
  }

  pageBody.innerHTML = '<section class="form-card"><div class="loading">Profil yükleniyor...</div></section>';
  try {
    const data = await fetchJson(`/api/creator/${userId}?viewerId=${viewer?.id || ''}`);
    const creator = data.user;
    const reels = data.reels || [];
    const totalViews = reels.reduce((sum, reel) => sum + (reel.views || 0), 0);
    pageBody.innerHTML = `
      <section class="form-card profile-card">
        <div class="profile-header">
          <div class="profile-avatar">${(creator.avatar || creator.username || 'U').charAt(0).toUpperCase()}</div>
          <div><h2>${creator.username}</h2><p>${creator.bio || 'Henüz bio eklenmemiş.'}</p></div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><span>Takipçi</span><strong>${data.followerCount}</strong></div>
          <div class="stat-card"><span>Takip</span><strong>${data.followingCount}</strong></div>
          <div class="stat-card"><span>Reel</span><strong>${reels.length}</strong></div>
          <div class="stat-card"><span>Görüntülenme</span><strong>${totalViews}</strong></div>
        </div>
        <div class="profile-actions">
          ${user ? '<button id="edit-profile-btn" class="submit-button">Profili Düzenle</button><button id="go-admin" class="secondary-button">Creator Dashboard</button><button id="logout-btn" class="secondary-button">Çıkış Yap</button>' : '<button id="follow-btn" class="submit-button">' + (data.isFollowing ? 'Takibi Bırak' : 'Takip Et') + '</button>'}
        </div>
        <h3>Reeller</h3>
        <div class="profile-reels">${reels.length ? reels.map((reel) => `<article class="profile-reel"><video src="${reel.videoUrl}" controls></video><strong>${reel.title}</strong></article>`).join('') : '<p class="muted">Henüz yayınlanmış reel yok.</p>'}</div>
      </section>`;

    if (user) {
      document.getElementById('edit-profile-btn').addEventListener('click', async () => {
        const bio = prompt('Bio:', creator.bio || '');
        if (bio === null) return;
        const avatar = prompt('Avatar harfi veya kısa metin:', creator.avatar || creator.username.charAt(0).toUpperCase());
        if (avatar === null) return;
        try {
          const result = await fetchJson(`/api/user/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bio: bio.trim().slice(0, 300), avatar: avatar.trim().slice(0, 2) })
          });
          setStoredUser(result.user, localStorage.getItem('reeloram-token'));
          renderProfilePage(user.id);
        } catch (error) {
          alert(error.message || 'Profil güncellenemedi');
        }
      });
      document.getElementById('go-admin').addEventListener('click', () => renderCreatorPage());
      document.getElementById('logout-btn').addEventListener('click', () => { setStoredUser(null); updateAuthUi(); renderFeed(); });
    } else {
      document.getElementById('follow-btn').addEventListener('click', async () => {
        const result = await fetchJson(`/api/user/${userId}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ followerId: viewer.id }) });
        document.getElementById('follow-btn').textContent = result.following ? 'Takibi Bırak' : 'Takip Et';
      });
    }
  } catch (error) {
    pageBody.innerHTML = '<section class="form-card"><div class="error">Profil yüklenemedi</div></section>';
  }
}

/* Legacy profile markup retained by the dashboard navigation. */
function renderLegacyProfilePage() {
  const user = getStoredUser();
  pageBody.innerHTML = `
    <section class="form-card profile-card">
      <h2>Profil</h2>
      <div class="profile-header">
        <div class="profile-avatar">${(user.username || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <strong>${user.username || 'Kullanıcı'}</strong>
          <p>${user.email}</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <span>Görüntülenme</span>
          <strong id="profile-views">0</strong>
        </div>
        <div class="stat-card">
          <span>Gelir</span>
          <strong>0₺</strong>
        </div>
        <div class="stat-card">
          <span>Takipçi</span>
          <strong>0</strong>
        </div>
        <div class="stat-card">
          <span>İş Birliği</span>
          <strong id="profile-reels">0</strong>
        </div>
      </div>
      <div class="profile-actions">
        <button id="go-admin" class="submit-button">Yönetim Paneli</button>
        <button id="logout-btn" class="secondary-button">Çıkış Yap</button>
      </div>
    </section>
  `;

  fetchJson(`/api/reels/user/${user.id}`).then(({ reels }) => {
    const totalViews = (reels || []).reduce((sum, reel) => sum + (reel.views || 0), 0);
    document.getElementById('profile-views').textContent = totalViews;
    document.getElementById('profile-reels').textContent = (reels || []).length;
  }).catch((error) => console.error(error));

  document.getElementById('go-admin').addEventListener('click', () => renderAdminPage());
  document.getElementById('logout-btn').addEventListener('click', () => {
    setStoredUser(null);
    updateAuthUi();
    renderFeed();
  });
}

async function renderAdminPage() {
  const token = localStorage.getItem('reeloram-admin-token') || '';
  pageBody.innerHTML = `
    <section class="form-card">
      <h2>Yönetim Paneli</h2>
      <div class="admin-token-row">
        <label>Yönetim Tokeni</label>
        <input id="admin-token-input" type="password" value="${token}" placeholder="ADMIN_TOKEN girin" />
        <button id="admin-load-btn" class="submit-button">Yükle</button>
      </div>
      <p class="muted" style="margin-top:12px;">Admin erişimi için sunucu tarafında güvenli bir ADMIN_TOKEN ayarlı olmalıdır.</p>
      <div id="admin-status-grid" class="stats-grid"></div>
      <div class="admin-list-wrap">
        <h3>Moderasyon Kuyruğu</h3>
        <ul id="admin-moderation" class="admin-list"></ul>
      </div>
      <div class="admin-list-wrap">
        <h3>Creator Talepleri</h3>
        <ul id="admin-creators" class="admin-list"></ul>
      </div>
      <div class="admin-list-wrap">
        <h3>Paket Talepleri</h3>
        <ul id="admin-packages" class="admin-list"></ul>
      </div>
      <div class="admin-list-wrap">
        <h3>Öne Çıkarma Talepleri</h3>
        <ul id="admin-boost-requests" class="admin-list"></ul>
      </div>
      <div class="admin-list-wrap">
        <h3>İçerik Raporları</h3>
        <ul id="admin-reports" class="admin-list"></ul>
      </div>
    </section>
  `;

  const loadBtn = document.getElementById('admin-load-btn');
  const tokenInput = document.getElementById('admin-token-input');
  
  const loadData = async () => {
    const activeToken = tokenInput.value.trim();
    localStorage.setItem('reeloram-admin-token', activeToken);

    if (!activeToken) {
      document.getElementById('admin-status-grid').innerHTML = `
        <div class="stat-card"><span>Status</span><strong>Token gerekli</strong></div>
        <div class="stat-card"><span>Admin</span><strong>Kapalı</strong></div>
        <div class="stat-card"><span>Token</span><strong>Yok</strong></div>
        <div class="stat-card"><span>Durum</span><strong>Bekliyor</strong></div>
      `;
      document.getElementById('admin-creators').innerHTML = '<li>Admin erişimi için token girin.</li>';
      document.getElementById('admin-packages').innerHTML = '<li>Admin erişimi için token girin.</li>';
      document.getElementById('admin-boost-requests').innerHTML = '<li>Admin erişimi için token girin.</li>';
      document.getElementById('admin-reports').innerHTML = '<li>Admin erişimi için token girin.</li>';
      return;
    }
    
    try {
      const [status, moderation, creators, packages, boostRequests, reports] = await Promise.all([
        fetchJson('/api/status'),
        fetchJson('/admin/reels?status=pending', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/creators', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/packages', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/boost-requests', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/reports', { headers: { 'x-admin-token': activeToken } })
      ]);

      document.getElementById('admin-status-grid').innerHTML = `
        <div class="stat-card"><span>Status</span><strong>${status.status}</strong></div>
        <div class="stat-card"><span>Users</span><strong>${status.creatorsCount}</strong></div>
        <div class="stat-card"><span>Packages</span><strong>${status.packageRequests}</strong></div>
        <div class="stat-card"><span>Events</span><strong>${status.analyticsCount}</strong></div>
      `;

      const moderationRows = moderation.reels || [];
      document.getElementById('admin-moderation').innerHTML = moderationRows.length
        ? moderationRows.map(r => `<li class="report-row"><strong>Reel #${r.id} · ${r.username}</strong><small>${r.title}</small><button class="moderation-status-btn" data-reel-id="${r.id}" data-status="published">Yayınla</button><button class="moderation-status-btn" data-reel-id="${r.id}" data-status="rejected">Reddet</button></li>`).join('')
        : '<li>Bekleyen içerik yok</li>';
      document.querySelectorAll('.moderation-status-btn').forEach((button) => button.addEventListener('click', async () => {
        await fetchJson(`/admin/reel/${button.dataset.reelId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': activeToken }, body: JSON.stringify({ status: button.dataset.status }) });
        loadData();
      }));

      const creatorRows = (creators.creators || []).slice(-10);
      document.getElementById('admin-creators').innerHTML = creatorRows.length 
        ? creatorRows.map(c => `<li><strong>${c.name}</strong><small>${c.channel || 'N/A'}</small></li>`).join('')
        : '<li>Veri yok</li>';

      const pkgRows = (packages.packages || []).slice(-10);
      document.getElementById('admin-packages').innerHTML = pkgRows.length
        ? pkgRows.map(p => `<li><strong>${p.company}</strong><small>${p.status}</small></li>`).join('')
        : '<li>Veri yok</li>';

      const boostRows = boostRequests.boostRequests || [];
      document.getElementById('admin-boost-requests').innerHTML = boostRows.length
        ? boostRows.map(b => `<li class="report-row"><strong>${b.username} · Reel #${b.reelId}</strong><small>${b.reelTitle} · ${b.packageName} · ${b.amount} TL · ${b.clickCount || 0}/${b.targetClicks || 100} tıklama · ${b.status}</small><button class="boost-status-btn" data-request-id="${b.id}" data-status="active">Aktifleştir</button><button class="boost-status-btn" data-request-id="${b.id}" data-status="rejected">Reddet</button></li>`).join('')
        : '<li>Bekleyen öne çıkarma talebi yok</li>';
      document.querySelectorAll('.boost-status-btn').forEach((button) => button.addEventListener('click', async () => {
        await fetchJson(`/admin/boost-request/${button.dataset.requestId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': activeToken }, body: JSON.stringify({ status: button.dataset.status }) });
        loadData();
      }));

      const reportRows = reports.reports || [];
      document.getElementById('admin-reports').innerHTML = reportRows.length
        ? reportRows.map(r => `<li class="report-row"><strong>${r.reelId ? `Reel #${r.reelId}` : `Yorum #${r.commentId}`}</strong><small>${r.reason} · ${r.status}</small><button class="report-status-btn" data-report-id="${r.id}" data-status="reviewed">İncelendi</button>${r.reelId ? `<button class="remove-reel-btn" data-reel-id="${r.reelId}">Kaldır</button>` : ''}</li>`).join('')
        : '<li>Rapor yok</li>';
      document.querySelectorAll('.report-status-btn').forEach((button) => button.addEventListener('click', async () => {
        await fetchJson(`/admin/report/${button.dataset.reportId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': activeToken }, body: JSON.stringify({ status: button.dataset.status }) });
        loadData();
      }));
      document.querySelectorAll('.remove-reel-btn').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Bu reel yayından kaldırılsın mı?')) return;
        await fetchJson(`/admin/reel/${button.dataset.reelId}`, { method: 'DELETE', headers: { 'x-admin-token': activeToken } });
        loadData();
      }));
    } catch (error) {
      alert('Token doğrulanamadı');
    }
  };

  loadBtn.addEventListener('click', loadData);
  tokenInput.addEventListener('keydown', (e) => e.key === 'Enter' && loadData());
  
  await loadData();
}

function changePage(pageKey) {
  closeAllModals();
  document.body.classList.toggle('feed-mode', pageKey === 'akis');
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
    case 'profil':
      renderProfilePage();
      break;
    case 'admin':
      renderAdminPage();
      break;
    default:
      renderFeed();
  }
  
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageKey);
  });
}

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', () => {
  const queryParams = new URLSearchParams(window.location.search);
  const source = queryParams.get('utm_source');
  const campaign = queryParams.get('utm_campaign');
  const attributionKey = `kadrio-attribution-${source || 'direct'}-${campaign || 'none'}`;
  if (!sessionStorage.getItem(attributionKey)) {
    sessionStorage.setItem(attributionKey, '1');
    trackEvent('visit.attribution', {
      source: source || 'direct',
      medium: queryParams.get('utm_medium') || 'none',
      campaign: campaign || 'none',
      reelId: queryParams.get('reel') || null,
    });
  }
  restoreSession().finally(() => {
    updateAuthUi();
    renderFeed();
  });
  document.getElementById('notifications-button')?.addEventListener('click', renderNotifications);

  document.querySelector('.icon-button')?.addEventListener('click', () => {
    const query = prompt('Kullanıcı veya reel ara:');
    if (query && query.trim().length >= 2) renderSearch(query.trim());
  });

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => changePage(btn.dataset.page));
  });

  heroPrimary?.addEventListener('click', () => {
    if (isLoggedIn()) {
      openModal('reel-upload-modal');
    } else {
      openModal('login-modal');
    }
  });

  heroSecondary?.addEventListener('click', () => openModal('package-modal'));
  heroCheckoutButton?.addEventListener('click', goToCheckout);
  promoBuyButton?.addEventListener('click', goToCheckout);

  const loginBtn = document.querySelector('.text-button');
  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isLoggedIn()) {
      changePage('profil');
    } else {
      openModal('login-modal');
    }
  });

  // Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    let registerMode = false;
    const authTitle = document.querySelector('#login-modal h3');
    const authSubmitButton = document.getElementById('auth-submit-button');
    const authModeToggle = document.getElementById('auth-mode-toggle');
    const registerUsernameGroup = document.getElementById('register-username-group');
    const passwordInput = loginForm.querySelector('#login-password');
    authModeToggle?.addEventListener('click', () => {
      registerMode = !registerMode;
      authTitle.textContent = registerMode ? 'Hesap Oluştur' : 'Giriş Yap';
      authSubmitButton.textContent = registerMode ? 'Kayıt Ol' : 'Giriş Yap';
      authModeToggle.textContent = registerMode ? 'Giriş yap' : 'Hesap oluştur';
      registerUsernameGroup.classList.toggle('hidden', !registerMode);
      passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identity = loginForm.querySelector('#login-email').value.trim();
      const username = loginForm.querySelector('#register-username').value.trim();
      const password = loginForm.querySelector('#login-password')?.value || '';
      if (!identity || password.length < (registerMode ? 8 : 6)) { alert(registerMode ? 'Kullanıcı adı/e-posta ve en az 8 karakterli şifre gerekli' : 'Kullanıcı adı/e-posta ve en az 6 karakterli şifre gerekli'); return; }
      if (registerMode && username.length < 3) { alert('En az 3 karakterli kullanıcı adı gerekli'); return; }
      
      try {
        const user = registerMode
          ? await registerUser(username, identity, password)
          : await loginUser(identity, password);
        alert(registerMode ? 'Hesabın oluşturuldu!' : `Hoşgeldin, ${user.username}!`);
        closeModal('login-modal');
        changePage('akis');
      } catch (error) {
        alert(error.message || (registerMode ? 'Kayıt başarısız' : 'Giriş başarısız'));
      }
      loginForm.reset();
    });
  }

  // Reel Upload Form
  const reelForm = document.getElementById('reel-upload-form');
  if (reelForm) {
    reelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = getStoredUser();
      if (!user) { alert('Giriş yapmalısınız'); return; }
      
      const title = reelForm.querySelector('#reel-title').value.trim();
      const description = reelForm.querySelector('#reel-desc').value.trim();
      const tagsStr = reelForm.querySelector('#reel-tags').value.trim();
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
      const videoFile = reelForm.querySelector('#reel-video')?.files[0];
      if (!videoFile) {
        alert('Lütfen bir video dosyası seçin.');
        return;
      }
      if (videoFile && videoFile.size > 100 * 1024 * 1024) {
        alert('Video dosyası 100 MB sınırını aşamaz.');
        return;
      }
      const body = new FormData();
      body.append('userId', user.id);
      body.append('title', title);
      body.append('description', description);
      body.append('tags', tags.join(','));
      if (videoFile) body.append('video', videoFile);
      
      try {
        await fetchJson('/api/reel', {
          method: 'POST',
          body
        });
        alert('Reel incelemeye gönderildi. Onaydan sonra akışta görünecek.');
        reelForm.reset();
        closeModal('reel-upload-modal');
        renderFeed();
      } catch (error) {
        alert(error.message || 'Video yüklenemedi. Dosya boyutunu ve video formatını kontrol edin.');
      }
    });
  }

  // Package Form
  const pkgForm = document.getElementById('package-form');
  if (pkgForm) {
    pkgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        company: pkgForm.company.value,
        contactEmail: pkgForm.contactEmail.value,
        budget: pkgForm.budget.value,
        targetUrl: pkgForm.targetUrl.value,
        campaignType: pkgForm.campaignType.value,
        campaignGoal: pkgForm.campaignGoal.value,
      };
      
      try {
        await fetchJson('/api/package-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        alert('Paket talebiniz alındı!');
        pkgForm.reset();
        closeModal('package-modal');
        trackEvent('package.request', { campaignType: payload.campaignType });
        try {
          const status = await fetchJson('/api/status');
          if (status.paymentLinkConfigured && status.paymentLinkUrl) {
            window.location.assign(status.paymentLinkUrl);
          }
        } catch (statusError) {
          console.warn('Ödeme bağlantısı kontrol edilemedi:', statusError);
        }
      } catch (error) {
        alert('Talep gönderilemedi');
      }
    });
  }

  window.analytics = window.analytics || { track: function(e, p){ console.log('[analytics]', e, p); } };
});
    // Comment handlers
    document.querySelectorAll('.comment-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const reelId = btn.dataset.reelId;
        const user = getStoredUser();
        if (!user) { openModal('login-modal'); return; }
        
        const card = btn.closest('.reel-card');
        let commentForm = card.querySelector('.comment-form');
        if (!commentForm) {
          commentForm = document.createElement('div');
          commentForm.className = 'comment-form';
          commentForm.innerHTML = `
            <input class="comment-input" type="text" placeholder="Yorum yaz..." maxlength="200" />
            <button class="comment-submit">Gönder</button>
          `;
          card.appendChild(commentForm);
          
          const submitBtn = commentForm.querySelector('.comment-submit');
          const input = commentForm.querySelector('.comment-input');
          submitBtn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) return;
            try {
              await fetchJson(`/api/reel/${reelId}/comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, comment: text })
              });
              input.value = '';
              const countEl = btn.querySelector('.count');
              countEl.textContent = parseInt(countEl.textContent) + 1;
            } catch (e) { console.error(e); }
          });
        }
        const commentsPanel = card.querySelector('.comments-panel');
        commentsPanel?.classList.toggle('is-open');
        commentForm.style.display = commentsPanel?.classList.contains('is-open') ? 'flex' : 'none';
      });
    });

