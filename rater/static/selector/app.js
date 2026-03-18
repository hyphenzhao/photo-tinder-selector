(() => {
  const cfg = window.selectorConfig;
  if (!cfg) return;

  const ids = [...cfg.stack];
  const front = document.getElementById('card-front');
  const back = document.getElementById('card-back');
  const empty = document.querySelector('.empty-state');
  const reactLike = document.getElementById('reaction-like');
  const reactDislike = document.getElementById('reaction-dislike');
  const reactSkip = document.getElementById('reaction-skip');
  const btnLike = document.getElementById('btn-like');
  const btnDislike = document.getElementById('btn-dislike');
  const btnSkip = document.getElementById('btn-skip');

  let queue = [];
  let current = null;
  let next = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;

  function csrf() { return cfg.csrfToken; }

  async function fetchPhoto(id) {
    const res = await fetch(`/api/photos/${id}/`);
    if (!res.ok) return null;
    return await res.json();
  }

  function badgeMarkup(badge) {
    if (badge === 'favorite') return '<div class="state-badge favorite">♥</div>';
    if (badge === 'dislike') return '<div class="state-badge dislike">💔</div>';
    return '';
  }

  function renderCard(el, photo, isFront) {
    if (!photo) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <img class="photo-image" src="${photo.image_url}" alt="${photo.filename}">
      ${badgeMarkup(photo.badge)}
      <div class="photo-overlay">
        <div class="photo-name">${photo.filename}</div>
        <div class="photo-meta">#${photo.id} · ${photo.timestamp}</div>
      </div>
    `;
    if (isFront) {
      el.style.transform = 'translate(0px, 0px) rotate(0deg)';
      el.style.opacity = '1';
    }
  }

  function showEmpty(show) {
    empty.classList.toggle('hidden', !show);
  }

  function popReaction(type) {
    const map = { favorite: reactLike, dislike: reactDislike, skip: reactSkip };
    const node = map[type];
    if (!node) return;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 240);
  }

  async function bootstrap() {
    if (!ids.length) {
      showEmpty(true);
      return;
    }
    queue = ids.slice(2);
    current = await fetchPhoto(ids[0]);
    next = ids[1] ? await fetchPhoto(ids[1]) : null;
    renderCard(front, current, true);
    renderCard(back, next, false);
    showEmpty(!current);
  }

  async function refillBack() {
    const nextId = queue.shift();
    next = nextId ? await fetchPhoto(nextId) : null;
    renderCard(back, next, false);
  }

  async function sendAction(photoId, action) {
    const form = new FormData();
    form.append('action', action);
    await fetch(`/api/photos/${photoId}/rate/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf() },
      body: form,
    });
    // update stats after action
    try {
      const r = await fetch('/api/stats/');
      if (r.ok) {
        const s = await r.json();
        document.getElementById('stat-total').textContent = s.total;
        document.getElementById('stat-unread').textContent = s.unread;
        document.getElementById('stat-favorite').textContent = s.favorite;
        document.getElementById('stat-dislike').textContent = s.dislike;
      }
    } catch (e) { console.warn('stats update failed', e); }
  }

  async function advance(action, dirX = 0, dirY = 0) {
    if (!current) return;
    const activeId = current.id;
    popReaction(action);
    await sendAction(activeId, action);

    front.style.transition = 'transform .28s ease, opacity .28s ease';
    if (action === 'favorite') front.style.transform = `translate(${Math.max(dirX, 420)}px, ${dirY}px) rotate(18deg)`;
    if (action === 'dislike') front.style.transform = `translate(${Math.min(dirX, -420)}px, ${dirY}px) rotate(-18deg)`;
    if (action === 'skip') front.style.transform = `translate(${dirX}px, ${Math.max(dirY, 420)}px) rotate(3deg)`;
    front.style.opacity = '.1';

    setTimeout(async () => {
      current = next;
      renderCard(front, current, true);
      await refillBack();
      if (!current) showEmpty(true);
    }, 220);
  }

  function resetFront() {
    front.style.transition = 'transform .2s ease';
    front.style.transform = 'translate(0px, 0px) rotate(0deg)';
  }

  function attachDrag() {
    const start = (x, y) => {
      if (!current) return;
      dragging = true;
      startX = x; startY = y; dx = 0; dy = 0;
      front.style.transition = 'none';
    };
    const move = (x, y) => {
      if (!dragging) return;
      dx = x - startX; dy = y - startY;
      const rot = dx / 18;
      front.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (dx > 120) advance('favorite', dx, dy);
      else if (dx < -120) advance('dislike', dx, dy);
      else if (dy > 140) advance('skip', dx, dy);
      else resetFront();
    };

    front.addEventListener('pointerdown', e => start(e.clientX, e.clientY));
    window.addEventListener('pointermove', e => move(e.clientX, e.clientY));
    window.addEventListener('pointerup', end);
  }

  btnLike?.addEventListener('click', () => advance('favorite', 420, 0));
  btnDislike?.addEventListener('click', () => advance('dislike', -420, 0));
  btnSkip?.addEventListener('click', () => advance('skip', 0, 420));

  bootstrap().then(attachDrag);
})();
