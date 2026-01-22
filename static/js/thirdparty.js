// Third-party API integrations

document.addEventListener('DOMContentLoaded', function () {
  initYouTubeEmbed();
  initQuotesSlider();
  initJournalYouTube();
});

function initYouTubeEmbed() {
  const mount = document.getElementById('ytMount');
  if (!mount) return;
  // Simple iframe embed (no API key needed)
  mount.innerHTML = '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.1);"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div>';
}

// Modern Quotes Slider for 'Inspiration' section on index.html
async function initQuotesSlider() {
  const mount = document.getElementById('quotesGrid');
  if (!mount) return;
  let quotes = [];
  try {
    // Fetch 20, keep only first 12 unique by content
    let seen = new Set();
    while (quotes.length < 12) {
      const res = await fetch('https://api.quotable.io/random');
      if (!res.ok) throw new Error('Failed');
      const q = await res.json();
      if (!seen.has(q.content)) {
        quotes.push(q);
        seen.add(q.content);
      }
    }
  } catch {
    quotes = Array(12).fill().map(() => ({
      content: `“Stay curious and keep building.”`,
      author: 'Learning Journal'
    }));
  }
  // Render quotes in cards, 3 per row, as flexbox slider
  mount.innerHTML = `<div class="slider-track">
    ${quotes.map(q => `
      <div class="quote-card">
        <div class="quote-content">${q.content}</div>
        <div class="quote-author">${q.author ? '— ' + q.author : ''}</div>
      </div>`).join('')}
    </div>`;
  // Auto-scroll carousel (cycle every 1s)
  const track = mount.querySelector('.slider-track');
  let cur = 0, total = Math.ceil(quotes.length / 3);
  function scrollQuotes() {
    track.scrollTo({ left: cur * mount.clientWidth, behavior: 'smooth' });
    cur = (cur + 1) % total;
  }
  setInterval(scrollQuotes, 1000);
}

// =============================
// Journal YouTube Manager
// =============================
let YT_API_READY = false;
let ytPlayers = {}; // id -> YT.Player

function initJournalYouTube() {
  ensureYouTubeApi();
  initModalListeners();
  
  // Wait a bit for DOM to be fully ready
  setTimeout(() => {
    renderYouTubeList();
  }, 100);
  
  const form = document.getElementById('youtubeForm');
  if (!form) {
    console.warn('YouTube form not found');
    return;
  }
  
  const input = document.getElementById('youtubeLink');
  const previewDiv = document.getElementById('youtubePreview');
  const previewFrame = document.getElementById('youtubePreviewFrame');
  const errorEl = document.querySelector('.form-error[data-error-for="youtubeLink"]');
  
  if (!input) return;
  
  // Live preview as user types/pastes
  let previewTimeout;
  input.addEventListener('input', function() {
    const url = this.value.trim();
    
    // Clear previous timeout
    clearTimeout(previewTimeout);
    
    if (!url) {
      if (previewDiv) previewDiv.style.display = 'none';
      if (previewFrame) previewFrame.src = '';
      return;
    }
    
      // Debounce preview update
      previewTimeout = setTimeout(() => {
        const videoId = extractYouTubeId(url);
        
        if (videoId && previewDiv && previewFrame) {
          previewFrame.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
          previewDiv.style.display = 'block';
          if (errorEl) errorEl.textContent = '';
        } else {
          if (previewDiv) previewDiv.style.display = 'none';
          if (previewFrame) previewFrame.src = '';
          if (errorEl && url.length > 10) {
            errorEl.textContent = 'Please enter a valid YouTube link.';
          }
        }
      }, 500); // Wait 500ms after user stops typing
  });
  
  // Handle paste event for instant preview
  input.addEventListener('paste', function() {
    setTimeout(() => {
      const url = this.value.trim();
      const videoId = extractYouTubeId(url);
      
      if (videoId && previewDiv && previewFrame) {
        previewFrame.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
        previewDiv.style.display = 'block';
        if (errorEl) errorEl.textContent = '';
      }
    }, 100);
  });
  
  // Form submission - save video
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    
    const url = input.value.trim();
    
    if (!url) {
      if (errorEl) errorEl.textContent = 'Please enter a YouTube link.';
      return;
    }
    
    if (errorEl) errorEl.textContent = '';
    
    const videoId = extractYouTubeId(url);
    console.log('Extracted video ID:', videoId);
    
    if (!videoId) {
      if (errorEl) errorEl.textContent = 'Please enter a valid YouTube link.';
      return;
    }
    
    // Save to localStorage
    const list = getYouTubeList();
    const newItem = { id: `yt_${Date.now()}`, videoId };
    list.unshift(newItem);
    localStorage.setItem('journalYoutubeVideos', JSON.stringify(list));
    console.log('Saved to localStorage:', list);
    
    // Clear form and preview
    input.value = '';
    if (previewDiv) previewDiv.style.display = 'none';
    if (previewFrame) previewFrame.src = '';
    
    // Refresh video list
    renderYouTubeList();
    
    // Show success message briefly
    if (errorEl) {
      errorEl.style.color = 'green';
      errorEl.textContent = 'Video added successfully!';
      setTimeout(() => {
        errorEl.textContent = '';
        errorEl.style.color = '';
      }, 2000);
    }
  });
}

function getYouTubeList() {
  try {
    const raw = localStorage.getItem('journalYoutubeVideos');
    return raw ? JSON.parse(raw) : [];
  } catch(_) {
    return [];
  }
}

function initModalListeners() {
  const backdrop = document.getElementById('ytModal');
  if (!backdrop) return;
  
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop || e.target.classList.contains('modal-close')) {
      closeYtModal();
    }
  });
  
  document.addEventListener('keydown', function(e) {
    const backdrop = document.getElementById('ytModal');
    if (e.key === 'Escape' && backdrop && backdrop.style.display === 'flex') {
      closeYtModal();
    }
  });
}

function closeYtModal() {
  const backdrop = document.getElementById('ytModal');
  const frame = document.getElementById('ytModalFrame');
  if (frame) {
    frame.src = '';
  }
  if (backdrop) {
    backdrop.style.display = 'none';
    backdrop.style.visibility = 'hidden';
    backdrop.style.opacity = '0';
    document.body.style.overflow = '';
  }
}

function showYtModal(videoId) {
  const backdrop = document.getElementById('ytModal');
  const frame = document.getElementById('ytModalFrame');
  
  if (!backdrop) {
    console.error('Modal backdrop element not found');
    return;
  }
  
  if (!frame) {
    console.error('Modal frame element not found');
    return;
  }
  
  console.log('Showing modal with video ID:', videoId);
  
  // Set video source (no autoplay to avoid permissions issues)
  frame.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
  backdrop.style.display = 'flex';
  backdrop.style.visibility = 'visible';
  backdrop.style.opacity = '1';
  document.body.style.overflow = 'hidden';
  
  console.log('Modal should be visible now');
}

function getYouTubeThumbnail(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function renderYouTubeList() {
  const mount = document.getElementById('youtubeVideoGrid');
  if (!mount) return;
  const list = getYouTubeList();
  mount.innerHTML = '';
  list.forEach(function(item) {
    const card = document.createElement('div');
    card.className = 'journal-card fade-in';
    card.id = item.id;
    const header = document.createElement('div');
    header.className = 'journal-header';
    header.innerHTML = '<span class="week-badge">Video</span><h3>YouTube</h3><p class="journal-date">Saved</p>';
    const body = document.createElement('div');
    body.className = 'journal-body';
    body.innerHTML = `
      <div class="yt-thumb-wrap" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.08);cursor:pointer;">
        <img src="${getYouTubeThumbnail(item.videoId)}" data-thumb-for="${item.id}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" alt="YouTube thumbnail">
        <button class="yt-play-thumb" data-thumb-for="${item.id}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.60);color:#fff;border:none;font-size:2.25rem;border-radius:50%;width:64px;height:64px;display:flex;align-items:center;justify-content:center;z-index:3;cursor:pointer;">&#9654;</button>
      </div>
      <div class="project-links" style="margin-top:1rem;display:none;" id="yt-controls-${item.id}">
        <button class="btn btn-outline" data-yt-play="${item.id}">Play</button>
        <button class="btn btn-outline" data-yt-pause="${item.id}">Pause</button>
        <button class="btn btn-outline" data-yt-mute="${item.id}">Mute</button>
        <button class="btn btn-outline" data-yt-unmute="${item.id}">Unmute</button>
      </div>
    `;
    card.appendChild(header);
    card.appendChild(body);
    mount.appendChild(card);
  });

  // Play overlay handler (swap thumb for IFrame)
  mount.querySelectorAll('.yt-play-thumb').forEach(btn => {
    btn.onclick = function() {
      const id = btn.getAttribute('data-thumb-for');
      const item = getYouTubeList().find(i => i.id === id);
      if (!item) return;
      const card = document.getElementById(id);
      if (!card) return;
      const playerWrap = card.querySelector('.yt-thumb-wrap');
      const controls = card.querySelector(`#yt-controls-${id}`);
      if (!playerWrap || !controls) return;
      playerWrap.innerHTML = `<div id="${id}_player" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>`;
      controls.style.display = '';
      waitForYouTubeApi().then(() => {
        createYtPlayer(id, `${id}_player`, item.videoId);
      });
    };
  });
}

// Wire controls once using event delegation (not in renderYouTubeList to avoid duplicates)
if (!window.ytControlsWired) {
  document.addEventListener('click', function (e) {
    const play = e.target.closest('[data-yt-play]');
    const pause = e.target.closest('[data-yt-pause]');
    const mute = e.target.closest('[data-yt-mute]');
    const unmute = e.target.closest('[data-yt-unmute]');
    
    if (play) {
      const id = play.getAttribute('data-yt-play');
      if (ytPlayers[id]) ytPlayers[id].playVideo();
    }
    if (pause) {
      const id = pause.getAttribute('data-yt-pause');
      if (ytPlayers[id]) ytPlayers[id].pauseVideo();
    }
    if (mute) {
      const id = mute.getAttribute('data-yt-mute');
      if (ytPlayers[id]) ytPlayers[id].mute();
    }
    if (unmute) {
      const id = unmute.getAttribute('data-yt-unmute');
      if (ytPlayers[id]) ytPlayers[id].unMute();
    }
  }, { passive: true });
  window.ytControlsWired = true;
}

function createYtPlayer(id, containerId, videoId) {
  if (!window.YT || !YT.Player) return;
  ytPlayers[id] = new YT.Player(containerId, {
    videoId,
    playerVars: { rel: 0, modestbranding: 1 },
    events: {
      onReady: function () {},
      onStateChange: function () {},
      onError: function (event) {
        // Error 101 or 150/153 => video cannot be embedded
        const codes = [2, 5, 100, 101, 150, 153];
        if (codes.includes(event.data)) {
          const card = document.getElementById(id);
          if (card) {
            const err = card.querySelector('.yt-embed-error') || document.createElement('div');
            err.className = 'yt-embed-error';
            err.style.cssText = 'color:#a22;background:#fff4;padding:1rem;text-align:center;border-radius:12px;margin:8px 0;position:absolute;top:0;left:0;width:100%;z-index:2;';
            err.innerHTML = 'This video cannot be played here.<br>Embedding is disabled by the video owner.';
            // Add error overlay onto player container:
            const playerWrap = card.querySelector('.yt-thumb-wrap') || card.querySelector(`#${id}_player`).parentElement;
            if (playerWrap) playerWrap.appendChild(err);
          }
        }
      }
    }
  });
}

function ensureYouTubeApi() {
  if (window.YT && YT.Player) { YT_API_READY = true; return; }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = function () {
    YT_API_READY = true;
  };
}

function waitForYouTubeApi() {
  return new Promise(resolve => {
    if (YT_API_READY && window.YT && YT.Player) return resolve();
    const int = setInterval(() => {
      if (YT_API_READY && window.YT && YT.Player) {
        clearInterval(int);
        resolve();
      }
    }, 50);
  });
}

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Remove whitespace
  url = url.trim();
  if (!url) return null;
  
  try {
    // Handle URLs without protocol
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
      // Check if it's already a video ID (11 characters, alphanumeric and hyphens/underscores)
      if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
      }
      url = 'https://' + url;
    }
    
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }
    
    const u = new URL(url);
    
    // youtube.com/watch?v=VIDEO_ID
    if (u.hostname.includes('youtube.com')) {
      const videoId = u.searchParams.get('v');
      if (videoId) return videoId;
    }
    
    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be' || u.hostname.includes('youtu.be')) {
      const videoId = u.pathname.slice(1).split('?')[0];
      if (videoId) return videoId;
    }
    
    // youtube.com/embed/VIDEO_ID
    if (u.hostname.includes('youtube.com') && u.pathname.includes('/embed/')) {
      const videoId = u.pathname.split('/embed/')[1]?.split('?')[0];
      if (videoId) return videoId;
    }
    
    return null;
  } catch (e) {
    // If URL parsing fails, try to extract video ID from common patterns
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }
}


