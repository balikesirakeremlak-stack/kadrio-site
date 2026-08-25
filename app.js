// === KADRIO APP.JS ===
const pageBody = document.getElementById('page-body');
const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
const heroPrimary = document.querySelector('.primary-button');
const heroSecondary = document.querySelector('.secondary-button');
const loginButton = document.querySelector('.text-button');

const API_BASE = '';

// === AUTH FUNCTIONS ===
function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('reeloram-user') || 'null');
  } catch (error) {
    return null;
  }
}

function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem('reeloram-user');
    localStorage.removeItem('reeloram-token');
    return;
  }
  localStorage.setItem('reeloram-user', JSON.stringify(user));
  localStorage.setItem('reeloram-token', user.id || 'temp');
}

function isLoggedIn() {
  return !!getStoredUser();
}

function updateAuthUi() {
  if (!loginButton) return;
  loginButton.textContent = isLoggedIn() ? 'Profil' : 'Giriş Yap';
}

async function registerUser(username, email, password) {
  const response = await fetchJson('/api/user/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  setStoredUser(response.user);
  updateAuthUi();
  return response.user;
}

async function loginUser(username, password) {
  const response = await fetchJson('/api/user/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  setStoredUser(response.user);
  updateAuthUi();
  return response.user;
}

// === API HELPERS ===
async function fetchJson(url, options = {}) {
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
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
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
    
    if (!reels || reels.length === 0) {
      pageBody.innerHTML = '<section class="feed"><div class="empty-state">Henüz reel yok. İlk reeli sen yükle!</div></section>';
      return;
    }

    pageBody.innerHTML = `<section class="feed">${reels.map(reel => `
      <div class="reel-card" data-reel-id="${reel.id}">
        <div class="reel-header">
          <div class="reel-user">
            <div class="avatar">${(reel.username || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <strong>${reel.username || 'Anonim'}</strong>
              <small>${new Date(reel.timestamp).toLocaleString('tr-TR')}</small>
            </div>
          </div>
          <button class="more-btn">⋮</button>
        </div>
        
        <div class="reel-video">
          <video src="${reel.videoUrl || 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'}" controls></video>
        </div>
        
        <div class="reel-content">
          <h3>${reel.title}</h3>
          <p>${reel.description || ''}</p>
          ${reel.tags ? `<div class="tags">${reel.tags.split(',').map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` : ''}
        </div>
        
        <div class="reel-actions">
          <button class="action-btn like-btn" data-reel-id="${reel.id}">
            <span class="icon">❤️</span>
            <span class="count">${reel.likeCount || 0}</span>
          </button>
          <button class="action-btn comment-btn" data-reel-id="${reel.id}">
            <span class="icon">💬</span>
            <span class="count">0</span>
          </button>
          <button class="action-btn share-btn">
            <span class="icon">📤</span>
            <span class="count">0</span>
          </button>
          <button class="action-btn save-btn">
            <span class="icon">🔖</span>
          </button>
          <button class="action-btn report-btn" data-reel-id="${reel.id}">⚑ Bildir</button>
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

    document.querySelectorAll('.comments-panel').forEach(async (panel) => {
      const reelId = panel.dataset.commentsFor;
      try {
        const { reel } = await fetchJson(`/api/reel/${reelId}`);
        const comments = reel.comments || [];
        const list = panel.querySelector('.comments-list');
        list.innerHTML = comments.length
          ? comments.map((item) => `<div class="comment-item"><strong>${item.username || `Kullanıcı ${item.userId}`}</strong><span>${item.comment}</span></div>`).join('')
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
          list.insertAdjacentHTML('afterbegin', `<div class="comment-item"><strong>${user.username}</strong><span>${comment}</span></div>`);
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
  if (!isLoggedIn()) { openModal('login-modal'); return; }
  const user = getStoredUser();
  pageBody.innerHTML = `<section style="padding:20px;max-width:900px;margin:0 auto;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;"><h2 style="margin:0;">📊 Yönetim Paneli</h2><button class="submit-button" id="upload-reel-btn" style="cursor:pointer;">+ Yeni Reel</button></div><div class="stats-grid"><div class="stat-card"><span>Reeller</span><strong id="stat-reels">0</strong></div><div class="stat-card"><span>Beğeni</span><strong id="stat-likes">0</strong></div><div class="stat-card"><span>Görüntülenme</span><strong id="stat-views">0</strong></div><div class="stat-card"><span>Takipçi</span><strong id="stat-followers">0</strong></div></div><h3 style="margin-top:30px;margin-bottom:15px;">Reellerim</h3><div id="creator-reels" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;"></div></section>`;
  document.getElementById('upload-reel-btn').addEventListener('click', () => openModal('reel-upload-modal'));
  try {
    const { reels } = await fetchJson(`/api/reels/user/${user.id}`);
    const reelDiv = document.getElementById('creator-reels');
    if (reels && reels.length) {
      let tl=0, tv=0;
      reelDiv.innerHTML = reels.map(r => { tl+=r.likes||0; tv+=r.views||0; return `<div class="creator-reel-card" data-reel-id="${r.id}" style="background:#1a1a1a;border-radius:8px;overflow:hidden;border:1px solid #333;"><div style="aspect-ratio:1;overflow:hidden;background:#000;"><video src="${r.videoUrl}" style="width:100%;height:100%;object-fit:cover;" controls></video></div><div style="padding:8px;"><h5 style="margin:0;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title}</h5><p style="margin:4px 0;font-size:0.75rem;color:#999;">❤️ ${r.likes||0} 👁️ ${r.views||0}</p><div style="display:flex;gap:6px;"><button class="edit-reel-btn" data-reel-id="${r.id}">Düzenle</button><button class="delete-reel-btn" data-reel-id="${r.id}">Sil</button></div></div></div>`; }).join('');
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
          ${user ? '<button id="go-admin" class="submit-button">Creator Dashboard</button><button id="logout-btn" class="secondary-button">Çıkış Yap</button>' : '<button id="follow-btn" class="submit-button">' + (data.isFollowing ? 'Takibi Bırak' : 'Takip Et') + '</button>'}
        </div>
        <h3>Reeller</h3>
        <div class="profile-reels">${reels.length ? reels.map((reel) => `<article class="profile-reel"><video src="${reel.videoUrl}" controls></video><strong>${reel.title}</strong></article>`).join('') : '<p class="muted">Henüz yayınlanmış reel yok.</p>'}</div>
      </section>`;

    if (user) {
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
  const token = localStorage.getItem('reeloram-admin-token') || 'devtoken';
  pageBody.innerHTML = `
    <section class="form-card">
      <h2>Yönetim Paneli</h2>
      <div class="admin-token-row">
        <label>Yönetim Tokeni</label>
        <input id="admin-token-input" type="password" value="${token}" />
        <button id="admin-load-btn" class="submit-button">Yükle</button>
      </div>
      <div id="admin-status-grid" class="stats-grid"></div>
      <div class="admin-list-wrap">
        <h3>Creator Talepleri</h3>
        <ul id="admin-creators" class="admin-list"></ul>
      </div>
      <div class="admin-list-wrap">
        <h3>Paket Talepleri</h3>
        <ul id="admin-packages" class="admin-list"></ul>
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
    
    try {
      const [status, creators, packages, reports] = await Promise.all([
        fetchJson('/api/status'),
        fetchJson('/admin/creators', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/packages', { headers: { 'x-admin-token': activeToken } }),
        fetchJson('/admin/reports', { headers: { 'x-admin-token': activeToken } })
      ]);

      document.getElementById('admin-status-grid').innerHTML = `
        <div class="stat-card"><span>Status</span><strong>${status.status}</strong></div>
        <div class="stat-card"><span>Users</span><strong>${status.creatorsCount}</strong></div>
        <div class="stat-card"><span>Packages</span><strong>${status.packageRequests}</strong></div>
        <div class="stat-card"><span>Events</span><strong>${status.analyticsCount}</strong></div>
      `;

      const creatorRows = (creators.creators || []).slice(-10);
      document.getElementById('admin-creators').innerHTML = creatorRows.length 
        ? creatorRows.map(c => `<li><strong>${c.name}</strong><small>${c.channel || 'N/A'}</small></li>`).join('')
        : '<li>Veri yok</li>';

      const pkgRows = (packages.packages || []).slice(-10);
      document.getElementById('admin-packages').innerHTML = pkgRows.length
        ? pkgRows.map(p => `<li><strong>${p.company}</strong><small>${p.status}</small></li>`).join('')
        : '<li>Veri yok</li>';

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
  updateAuthUi();
  renderFeed();
  document.getElementById('notifications-button')?.addEventListener('click', renderNotifications);

  document.querySelector('.icon-button')?.addEventListener('click', () => {
    const query = prompt('Kullanıcı veya reel ara:');
    if (query && query.trim().length >= 2) renderSearch(query.trim());
  });

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => changePage(btn.dataset.page));
  });

  heroPrimary.addEventListener('click', () => {
    if (isLoggedIn()) {
      openModal('reel-upload-modal');
    } else {
      openModal('login-modal');
    }
  });

  heroSecondary.addEventListener('click', () => openModal('package-modal'));

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
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = loginForm.querySelector('#login-email').value.trim();
      const password = loginForm.querySelector('#login-password')?.value || '';
      if (!email || password.length < 6) { alert('E-posta ve en az 6 karakterli şifre gerekli'); return; }
      
      try {
        const user = await loginUser(email, password);
        alert(`Hoşgeldin, ${user.username}!`);
        closeModal('login-modal');
        changePage('akis');
      } catch (error) {
        try {
          const user = await registerUser(email, email, password);
          alert(`Hesap oluşturuldu!`);
          closeModal('login-modal');
          changePage('akis');
        } catch (regError) {
          alert('Giriş başarısız');
        }
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
        alert('Reel yayınlandı!');
        reelForm.reset();
        closeModal('reel-upload-modal');
        renderFeed();
      } catch (error) {
        alert(error.message || 'Yükleme başarısız');
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
        budget: pkgForm.budget.value,
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
        commentForm.style.display = commentForm.style.display === 'none' ? 'flex' : 'none';
      });
    });

