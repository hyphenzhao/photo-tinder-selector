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
    const videoPlayer = document.getElementById('game-lightbox-video');
    const modeToggle = document.querySelector('[data-game-mode-toggle]');
    const pairButtons = Array.from(document.querySelectorAll('[data-game-pair]'));
    const videoButtons = Array.from(document.querySelectorAll('[data-game-video]'));
    let currentLayers = null;
    let currentVideos = null;
    let activePair = ['1', '2'];
    let mousouMode = Boolean(modeToggle?.checked);
    let playingVideoLayer = null;

    const setActivePair = pair => {
      activePair = pair;
      pairButtons.forEach(button => {
        button.classList.toggle('is-active', button.dataset.gamePair === pair.join('|'));
      });
    };

    const syncVideoButtons = () => {
      videoButtons.forEach(button => {
        const layer = button.dataset.gameVideo;
        const disabled = mousouMode || !currentVideos?.[layer] || playingVideoLayer !== null;
        button.disabled = disabled;
        button.classList.toggle('is-disabled', disabled);
      });
    };

    const stopVideoPlayback = () => {
      playingVideoLayer = null;
      if (!videoPlayer) {
        syncVideoButtons();
        return;
      }
      videoPlayer.pause();
      videoPlayer.hidden = true;
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
      syncVideoButtons();
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
      currentVideos = gamePhoto.videos || {};
      lightboxImage.alt = gamePhoto.filename || '';
      stopVideoPlayback();
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
      stopVideoPlayback();
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

    const playBakuiVideo = layer => {
      if (!videoPlayer || !currentLayers || !currentVideos?.[layer] || mousouMode || playingVideoLayer !== null) return;
      const targetPair = layer === '1' ? ['2', '3'] : ['1', '3'];
      const targetLayer = layer === '1' ? '2' : '3';
      playingVideoLayer = layer;
      syncVideoButtons();
      resetOverlay();
      lightboxImage.src = currentLayers[targetLayer];
      videoPlayer.src = currentVideos[layer];
      videoPlayer.hidden = false;
      const finalize = () => {
        stopVideoPlayback();
        setActivePair(targetPair);
        if (mousouMode) {
          renderMousouDefault();
        } else {
          renderPairPosition(0);
        }
      };
      videoPlayer.onended = finalize;
      videoPlayer.onerror = finalize;
      videoPlayer.play().catch(finalize);
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

        const videoButton = event.target.closest('[data-game-video]');
        if (videoButton) {
          playBakuiVideo(videoButton.dataset.gameVideo);
          return;
        }

        if (event.target.closest('[data-lightbox-close]')) {
          closeLightbox(lightbox, lightboxImage, () => {
            currentLayers = null;
            currentVideos = null;
            stopVideoPlayback();
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
            currentVideos = null;
            stopVideoPlayback();
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
        stopVideoPlayback();
        applyModeClass();
        resetOverlay();
        if (mousouMode) {
          renderMousouDefault();
        } else {
          renderPairPosition(0);
        }
        syncVideoButtons();
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
        stopVideoPlayback();
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
      syncVideoButtons();
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
    const buildWallFilterParams = () => {
      const params = new URLSearchParams({ order: order?.value || 'random' });
      if (toggle?.checked) params.set('layout', 'wall');
      const outfitFrom = document.getElementById('filter-outfit-from')?.value;
      const outfitTo = document.getElementById('filter-outfit-to')?.value;
      const girlFrom = document.getElementById('filter-girl-from')?.value;
      const girlTo = document.getElementById('filter-girl-to')?.value;
      const videoReady = document.getElementById('filter-video-ready')?.value;
      if (outfitFrom) params.set('outfit_from', outfitFrom);
      if (outfitTo) params.set('outfit_to', outfitTo);
      if (girlFrom) params.set('girl_from', girlFrom);
      if (girlTo) params.set('girl_to', girlTo);
      if (videoReady) params.set('video_ready', videoReady);
      return params;
    };

    const refreshWallPanel = params => {
      if (!window.htmx) return;
      window.htmx.ajax('GET', `${favoritesUrl}?${params.toString()}`, { target: '#favorite-panel-body', swap: 'outerHTML' });
    };

    const savedLayout = localStorage.getItem(storageKey);
    if (toggle && savedLayout) {
      toggle.checked = savedLayout === 'wall';
      if (order && window.htmx) {
        refreshWallPanel(buildWallFilterParams());
      }
    }
    toggle?.addEventListener('change', () => {
      localStorage.setItem(storageKey, toggle.checked ? 'wall' : 'stack');
      if (toggle.checked) {
        refreshWallPanel(buildWallFilterParams());
      }
    });
    order?.addEventListener('change', () => {
      localStorage.setItem(storageKey, toggle?.checked ? 'wall' : 'stack');
      if (toggle?.checked) {
        refreshWallPanel(buildWallFilterParams());
      }
    });

    const bindWallFilters = () => {
      const shell = document.getElementById('wall-filter-shell');
      const panel = document.getElementById('wall-filter-panel');
      const applyBtn = document.getElementById('apply-wall-filter');
      const clearBtn = document.getElementById('clear-wall-filter');
      const toggleButton = document.getElementById('wall-filter-toggle');

      if (toggleButton && toggleButton.dataset.bound !== 'true') {
        toggleButton.dataset.bound = 'true';
        toggleButton.addEventListener('click', () => {
          if (!panel) return;
          panel.hidden = !panel.hidden;
          panel.classList.toggle('is-open', !panel.hidden);
          shell?.classList.toggle('is-open', !panel.hidden);
          toggleButton.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
        });
      }

      if (applyBtn && applyBtn.dataset.bound !== 'true') {
        applyBtn.dataset.bound = 'true';
        applyBtn.addEventListener('click', () => {
          refreshWallPanel(buildWallFilterParams());
        });
      }

      if (clearBtn && clearBtn.dataset.bound !== 'true') {
        clearBtn.dataset.bound = 'true';
        clearBtn.addEventListener('click', () => {
          ['filter-outfit-from', 'filter-outfit-to', 'filter-girl-from', 'filter-girl-to', 'filter-video-ready'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
          });
          if (panel) {
            panel.hidden = false;
            panel.classList.add('is-open');
            shell?.classList.add('is-open');
            toggleButton?.setAttribute('aria-expanded', 'true');
          }
          refreshWallPanel(buildWallFilterParams());
        });
      }

      const loader = document.querySelector('.favorites-wall-loader');
      if (loader && !loader.dataset.filterBound) {
        loader.dataset.filterBound = 'true';
        loader.setAttribute('hx-get', `${favoritesUrl}?${buildWallFilterParams().toString()}&page=${loader.getAttribute('hx-get')?.match(/page=(\d+)/)?.[1] || '1'}`);
      }
    };

    initFavoritePanel(document.getElementById('favorite-panel-body'));
    bindWallFilters();
    document.body.addEventListener('htmx:afterSwap', event => {
      const favoritePanel = document.getElementById('favorite-panel-body');
      if (!favoritePanel) return;
      initFavoritePanel(favoritePanel);
      bindWallFilters();
    });
    return;
  }

  initStack(document.querySelector('.tinder-shell'));
})();
