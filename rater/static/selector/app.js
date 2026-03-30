(() => {
  const cfg = window.selectorConfig;
  if (!cfg) return;

  async function fetchPhoto(id) {
    const res = await fetch(`/api/photos/${id}/`);
    if (!res.ok) return null;
    return await res.json();
  }

  async function fetchGamePhoto(id) {
    const res = await fetch(`/api/game/${id}/`);
    if (!res.ok) return null;
    return await res.json();
  }

  function closeLightbox(lightbox, lightboxImage, extraCleanup) {
    if (!lightbox || !lightboxImage) return;
    lightbox.classList.remove('is-open');
    setTimeout(() => {
      if (!lightbox.classList.contains('is-open')) {
        lightbox.hidden = true;
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
        lightbox.removeAttribute('data-photo-id');
        extraCleanup?.();
      }
    }, 200);
  }

    function bindFavoriteWall(panel) {
      if (!panel || panel.dataset.layout !== 'wall') return;

      const grid = panel.querySelector('.favorites-wall-grid');
      const lightbox = document.getElementById('favorite-lightbox');
      const lightboxImage = document.getElementById('favorite-lightbox-image');
      const viewTile = tile => {
        const imageUrl = tile?.dataset.imageUrl;
        const alt = tile?.dataset.filename || '';

        if (!imageUrl || !lightbox || !lightboxImage) return;

        lightboxImage.src = imageUrl;
        lightboxImage.alt = alt;
        lightbox.dataset.photoId = tile.dataset.photoId || '';
        lightbox.hidden = false;
        requestAnimationFrame(() => {
          lightbox.classList.add('is-open');
        });
      };

      const stepLightbox = direction => {
        if (!grid || !lightbox?.classList.contains('is-open')) return;
        const tiles = Array.from(grid.querySelectorAll('.favorite-wall-tile:not(.favorite-wall-tile-placeholder)'));
        if (!tiles.length) return;

        const currentId = lightbox.dataset.photoId;
        const currentIndex = tiles.findIndex(tile => tile.dataset.photoId === currentId);
        const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (fallbackIndex + direction + tiles.length) % tiles.length;
        viewTile(tiles[nextIndex]);
      };

      grid?.querySelectorAll('.favorite-wall-image').forEach(image => {
        const tile = image.closest('.favorite-wall-tile');
        const reveal = () => tile?.classList.add('has-image');

        if (!image.getAttribute('src') && image.dataset.src) {
          image.src = image.dataset.src;
        }

        if (image.complete && image.naturalWidth > 0) {
          reveal();
        } else {
          image.addEventListener('load', reveal, { once: true });
        }
      });

      if (grid && grid.dataset.lightboxBound !== 'true') {
        grid.dataset.lightboxBound = 'true';

        grid.addEventListener('click', event => {
          const tile = event.target.closest('.favorite-wall-tile:not(.favorite-wall-tile-placeholder)');
          if (!tile) return;

          viewTile(tile);
        });
      }

      if (lightbox && lightbox.dataset.bound !== 'true') {
        lightbox.dataset.bound = 'true';

        lightbox.addEventListener('click', event => {
          if (event.target.closest('[data-lightbox-prev]')) {
            stepLightbox(-1);
            return;
          }

          if (event.target.closest('[data-lightbox-next]')) {
            stepLightbox(1);
            return;
          }

          if (event.target.closest('[data-lightbox-close]')) {
            closeLightbox(lightbox, lightboxImage);
          }
        });

        window.addEventListener('keydown', event => {
          if (event.key === 'ArrowLeft') {
            stepLightbox(-1);
            return;
          }

          if (event.key === 'ArrowRight') {
            stepLightbox(1);
            return;
          }

          if (event.key === 'Escape') {
            closeLightbox(lightbox, lightboxImage);
          }
        });
      }
    }

  function initGameWall(panel) {
    if (!panel || panel.dataset.layout !== 'wall') return;

    const grid = panel.querySelector('.favorites-wall-grid');
    const lightbox = document.getElementById('favorite-lightbox');
    const stage = document.getElementById('favorite-lightbox-stage');
    const lightboxImage = document.getElementById('favorite-lightbox-image');
    const overlayImage = document.getElementById('game-lightbox-overlay');
    const modeToggle = document.querySelector('[data-game-mode-toggle]');
    const pairButtons = Array.from(document.querySelectorAll('[data-game-pair]'));
    let currentLayers = null;
    let activePair = ['1', '2'];
    let mousouMode = Boolean(modeToggle?.checked);

    const setActivePair = pair => {
      activePair = pair;
      pairButtons.forEach(button => {
        button.classList.toggle('is-active', button.dataset.gamePair === pair.join('|'));
      });
    };

    const resetOverlay = () => {
      if (!overlayImage) return;
      overlayImage.removeAttribute('src');
      overlayImage.style.clipPath = 'inset(0 100% 0 0)';
      overlayImage.style.webkitMaskImage = '';
      overlayImage.style.maskImage = '';
      overlayImage.style.webkitMaskRepeat = '';
      overlayImage.style.maskRepeat = '';
    };

    const applyModeClass = () => {
      if (!stage) return;
      stage.classList.toggle('is-mousou', mousouMode && lightbox?.classList.contains('is-open'));
      stage.classList.toggle('is-scrubbing', !mousouMode && lightbox?.classList.contains('is-open'));
    };

    const renderPairPosition = ratio => {
      if (!currentLayers || !lightboxImage || !overlayImage) return;
      const [topLayer, bottomLayer] = activePair;
      const topSrc = currentLayers[topLayer];
      const bottomSrc = currentLayers[bottomLayer];
      if (!topSrc || !bottomSrc) return;

      lightboxImage.src = bottomSrc;
      overlayImage.src = topSrc;
      overlayImage.alt = lightboxImage.alt;
      overlayImage.style.webkitMaskImage = '';
      overlayImage.style.maskImage = '';
      const percent = Math.max(0, Math.min(1, ratio)) * 100;
      overlayImage.style.clipPath = `inset(0 0 0 ${percent}%)`;
    };

    const renderMousouPosition = event => {
      if (!currentLayers || !stage || !lightboxImage || !overlayImage) return;
      const [topLayer, bottomLayer] = activePair;
      const topSrc = currentLayers[topLayer];
      const bottomSrc = currentLayers[bottomLayer];
      if (!topSrc || !bottomSrc) return;

      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const radius = Math.max(60, rect.width * 0.14);

      lightboxImage.src = bottomSrc;
      overlayImage.src = topSrc;
      overlayImage.alt = lightboxImage.alt;
      overlayImage.style.clipPath = 'inset(0 0 0 0)';
      const mask = `radial-gradient(circle ${radius}px at ${x}px ${y}px, transparent 0, transparent ${radius * 0.72}px, black ${radius}px)`;
      overlayImage.style.webkitMaskImage = mask;
      overlayImage.style.maskImage = mask;
      overlayImage.style.webkitMaskRepeat = 'no-repeat';
      overlayImage.style.maskRepeat = 'no-repeat';
    };

    const renderMousouDefault = () => {
      if (!currentLayers || !lightboxImage || !overlayImage) return;
      const [topLayer, bottomLayer] = activePair;
      const topSrc = currentLayers[topLayer];
      const bottomSrc = currentLayers[bottomLayer];
      if (!topSrc || !bottomSrc) return;

      lightboxImage.src = bottomSrc;
      overlayImage.src = topSrc;
      overlayImage.alt = lightboxImage.alt;
      overlayImage.style.clipPath = 'inset(0 0 0 0)';
      overlayImage.style.webkitMaskImage = '';
      overlayImage.style.maskImage = '';
      overlayImage.style.webkitMaskRepeat = '';
      overlayImage.style.maskRepeat = '';
    };

    const showGameTile = async tile => {
      const photoId = tile?.dataset.photoId;
      if (!photoId || !lightbox || !lightboxImage) return;

      const gamePhoto = await fetchGamePhoto(photoId);
      if (!gamePhoto) return;

      currentLayers = gamePhoto.layers;
      lightboxImage.alt = gamePhoto.filename || '';
      resetOverlay();
      setActivePair(['1', '2']);
      if (mousouMode) {
        renderMousouDefault();
      } else {
        renderPairPosition(0);
      }
      lightbox.dataset.photoId = photoId;
      lightbox.hidden = false;
      requestAnimationFrame(() => {
        lightbox.classList.add('is-open');
        applyModeClass();
      });
    };

    const stepGameLightbox = direction => {
      if (!grid || !lightbox?.classList.contains('is-open')) return;
      const tiles = Array.from(grid.querySelectorAll('.favorite-wall-tile:not(.favorite-wall-tile-placeholder)'));
      if (!tiles.length) return;
      const currentId = lightbox.dataset.photoId;
      const currentIndex = tiles.findIndex(tile => tile.dataset.photoId === currentId);
      const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (fallbackIndex + direction + tiles.length) % tiles.length;
      showGameTile(tiles[nextIndex]);
    };

    const updateScrubFromEvent = event => {
      if (!stage || !lightbox.classList.contains('is-open')) return;
      if (mousouMode) {
        renderMousouPosition(event);
        return;
      }
      const rect = stage.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      renderPairPosition(ratio);
    };

    const switchPair = pairValue => {
      if (!pairValue || !currentLayers) return;
      const pair = pairValue.split('|');
      if (pair.length !== 2) return;
      setActivePair(pair);
      resetOverlay();
      if (mousouMode) {
        renderMousouDefault();
      } else {
        renderPairPosition(0);
      }
    };

    grid?.querySelectorAll('.favorite-wall-image').forEach(image => {
      const tile = image.closest('.favorite-wall-tile');
      const reveal = () => tile?.classList.add('has-image');

      if (!image.getAttribute('src') && image.dataset.src) {
        image.src = image.dataset.src;
      }

      if (image.complete && image.naturalWidth > 0) {
        reveal();
      } else {
        image.addEventListener('load', reveal, { once: true });
      }
    });

    if (grid && grid.dataset.lightboxBound !== 'true') {
      grid.dataset.lightboxBound = 'true';
      grid.addEventListener('click', event => {
        const tile = event.target.closest('.favorite-wall-tile:not(.favorite-wall-tile-placeholder)');
        if (!tile) return;
        showGameTile(tile);
      });
    }

    if (lightbox && lightbox.dataset.bound !== 'true') {
      lightbox.dataset.bound = 'true';

      lightbox.addEventListener('click', event => {
        if (event.target.closest('[data-lightbox-prev]')) {
          stepGameLightbox(-1);
          return;
        }

        if (event.target.closest('[data-lightbox-next]')) {
          stepGameLightbox(1);
          return;
        }

        const pairButton = event.target.closest('[data-game-pair]');
        if (pairButton) {
          switchPair(pairButton.dataset.gamePair);
          return;
        }

        if (event.target.closest('[data-lightbox-close]')) {
          closeLightbox(lightbox, lightboxImage, () => {
            currentLayers = null;
            setActivePair(['1', '2']);
            resetOverlay();
            stage?.classList.remove('is-scrubbing');
            stage?.classList.remove('is-mousou');
          });
        }
      });

      window.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') {
          stepGameLightbox(-1);
          return;
        }

        if (event.key === 'ArrowRight') {
          stepGameLightbox(1);
          return;
        }

        if (event.key === 'Escape') {
          closeLightbox(lightbox, lightboxImage, () => {
            currentLayers = null;
            setActivePair(['1', '2']);
            resetOverlay();
            stage?.classList.remove('is-scrubbing');
            stage?.classList.remove('is-mousou');
          });
        }
      });
    }

    if (modeToggle && modeToggle.dataset.bound !== 'true') {
      modeToggle.dataset.bound = 'true';
      modeToggle.addEventListener('change', () => {
        mousouMode = modeToggle.checked;
        applyModeClass();
        resetOverlay();
        if (mousouMode) {
          renderMousouDefault();
        } else {
          renderPairPosition(0);
        }
      });
    }

    if (stage && stage.dataset.scrubBound !== 'true') {
      stage.dataset.scrubBound = 'true';
      stage.addEventListener('mouseenter', () => {
        if (lightbox?.classList.contains('is-open')) {
          applyModeClass();
        }
      });
      stage.addEventListener('mouseleave', () => {
        stage.classList.remove('is-scrubbing');
        stage.classList.remove('is-mousou');
        resetOverlay();
        if (mousouMode) {
          renderMousouDefault();
        } else {
          renderPairPosition(0);
        }
      });
      stage.addEventListener('mousemove', updateScrubFromEvent);
    }

    if (pairButtons.length && !lightbox?.dataset.gameButtonsBound) {
      lightbox.dataset.gameButtonsBound = 'true';
      setActivePair(['1', '2']);
    }
  }

  function initStack(panel) {
    const ids = JSON.parse(panel.dataset.stack || '[]');
    const front = panel.querySelector('#card-front');
    const back = panel.querySelector('#card-back');
    const empty = panel.querySelector('.empty-state');
    const reactLike = panel.querySelector('#reaction-like');
    const reactDislike = panel.querySelector('#reaction-dislike');
    const reactSkip = panel.querySelector('#reaction-skip');
    const btnLike = panel.querySelector('#btn-like');
    const btnDislike = panel.querySelector('#btn-dislike');
    const btnSkip = panel.querySelector('#btn-skip');
    if (!front || !back || !empty) return;

    let queue = [];
    let current = null;
    let next = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;

    function csrf() { return cfg.csrfToken; }

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
      const [firstPhoto, secondPhoto] = await Promise.all([
        fetchPhoto(ids[0]),
        ids[1] ? fetchPhoto(ids[1]) : Promise.resolve(null),
      ]);
      current = firstPhoto;
      next = secondPhoto;
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
  }

  function initFavoritePanel(panel) {
    if (!panel) return;
    if (cfg.viewName === 'game' && panel.dataset.layout === 'wall') {
      initGameWall(panel);
      return;
    }
    if (panel.dataset.layout === 'wall') {
      bindFavoriteWall(panel);
      return;
    }
    initStack(panel);
  }

  const pageView = cfg.viewName;
  if (pageView === 'favorites' || pageView === 'game') {
    const toggle = document.getElementById('layout-toggle');
    const order = document.getElementById('order-select');
    const favoritesUrl = toggle?.getAttribute('hx-get') || order?.getAttribute('hx-get') || (pageView === 'game' ? '/game/' : '/favorites/');
    const storageKey = pageView === 'game' ? 'game-layout' : 'favorites-layout';
    const savedLayout = localStorage.getItem(storageKey);
    if (toggle && savedLayout) {
      toggle.checked = savedLayout === 'wall';
      if (order && window.htmx) {
        const params = new URLSearchParams({ order: order.value });
        if (toggle.checked) params.set('layout', 'wall');
        window.htmx.ajax('GET', `${favoritesUrl}?${params.toString()}`, { target: '#favorite-panel-body', swap: 'outerHTML' });
      }
    }
    toggle?.addEventListener('change', () => {
      localStorage.setItem(storageKey, toggle.checked ? 'wall' : 'stack');
    });
    order?.addEventListener('change', () => {
      localStorage.setItem(storageKey, toggle?.checked ? 'wall' : 'stack');
    });
    initFavoritePanel(document.getElementById('favorite-panel-body'));
    document.body.addEventListener('htmx:afterSwap', event => {
      const favoritePanel = document.getElementById('favorite-panel-body');
      if (!favoritePanel) return;
      initFavoritePanel(favoritePanel);
    });
    return;
  }

  initStack(document.querySelector('.tinder-shell'));
})();
