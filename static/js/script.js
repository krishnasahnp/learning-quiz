// Learning Journal PWA - DOM interactions and reusable components

document.addEventListener('DOMContentLoaded', function () {
  renderNavbar();
  initMobileNavToggle();
  initDarkMode();
  initLiveDateOnHome();
  initJournalCollapsibles();
  initProjectCollapsibles();
  // initJournalForm(); // Disabled in favor of journal-data.js
  // renderUserJournalEntries(); // Disabled in favor of journal-data.js
});

function renderNavbar() {
  const existingNav = document.getElementById('navbar');
  const navTemplate = `
    <nav id="navbar">
      <div class="nav-container">
        <a href="index.html" class="logo"><img src="images/logo.png" alt="LJ.PWA Logo" class="site-logo" style="height: 40px; width: auto; vertical-align: middle;" onerror="this.style.display='none';this.insertAdjacentHTML('afterend', 'LJ.PWA');"></a>
        <ul class="nav-links" id="navLinks">
          <li><a href="index.html">Home</a></li>
          <li><a href="journal.html">Journal</a></li>
          <li><a href="about.html">About</a></li>
          <li><a href="projects.html">Projects</a></li>
          <li class="nav-cta"><a href="quiz.html" class="btn btn-glow">Play Quiz<span class="emoji">🎮</span></a></li>
        </ul>
        <div style="display:flex; align-items:center; gap:10px;">
          <button id="darkModeToggle" aria-label="Toggle dark mode" class="btn btn-outline" style="padding: 0.5rem 1rem;">Theme</button>
          <div class="menu-toggle" id="menuToggle">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </nav>
  `;

  if (existingNav) {
    existingNav.outerHTML = navTemplate;
  } else {
    document.body.insertAdjacentHTML('afterbegin', navTemplate);
  }

  // After injecting, update active link state to match current page
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    const href = link.getAttribute('href');
    if (
      href === currentPage ||
      (currentPage === '' && href === 'index.html') ||
      (currentPage === '/' && href === 'index.html') ||
      (currentPage === 'quiz' && href === 'quiz.html')
    ) {
      link.classList.add('active');
    }
  });
}

// Ensure mobile hamburger opens/closes the menu (robust against dynamic navbar)
function initMobileNavToggle() {
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  if (!menuToggle || !navLinks) return;
  if (menuToggle.getAttribute('data-nav-init') === 'true') return;
  menuToggle.setAttribute('data-nav-init', 'true');

  menuToggle.addEventListener('click', function () {
    this.classList.toggle('active');
    navLinks.classList.toggle('active');
    document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
  });

  // Close on link click
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      menuToggle.classList.remove('active');
      navLinks.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
      menuToggle.classList.remove('active');
      navLinks.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;

  const stored = localStorage.getItem('darkMode');
  if (stored === 'enabled') document.body.classList.add('dark-mode');

  toggle.addEventListener('click', function () {
    document.body.classList.toggle('dark-mode');
    const enabled = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
  });
}

function initLiveDateOnHome() {
  // Add current date on the home (index) page
  const isHome = /(^|\/)index\.html?$/.test(window.location.pathname) || document.title.toLowerCase().includes('home');
  if (!isHome) return;

  const heroText = document.querySelector('.hero-text');
  if (!heroText) return;

  const dateWrap = document.createElement('div');
  dateWrap.id = 'liveDate';
  dateWrap.style.marginTop = '0.75rem';
  dateWrap.style.color = 'var(--gray)';
  dateWrap.style.fontSize = '0.95rem';

  const timeContainer = document.createElement('div');
  timeContainer.className = 'time-container';
  timeContainer.setAttribute('aria-label', 'Current time in hours, minutes and seconds');
  timeContainer.setAttribute('role', 'timer');

  function createSegment(id, label) {
    const segment = document.createElement('div');
    segment.className = 'time-segment';
    const box = document.createElement('div');
    box.className = 'time-box';
    box.id = id;
    box.textContent = '00';
    const lbl = document.createElement('div');
    lbl.className = 'time-label';
    lbl.textContent = label;
    segment.appendChild(box);
    segment.appendChild(lbl);
    return segment;
  }

  timeContainer.appendChild(createSegment('timeHours', 'Hours'));
  timeContainer.appendChild(createSegment('timeMinutes', 'Minutes'));
  timeContainer.appendChild(createSegment('timeSeconds', 'Seconds'));

  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatDate(d) {
    return d.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function setBox(el, val) {
    if (!el) return;
    const next = pad2(val);
    if (el.textContent !== next) {
      el.textContent = next;
      // retrigger tick animation
      el.classList.remove('tick');
      void el.offsetWidth; // reflow
      el.classList.add('tick');
    }
  }

  function updateDateTime() {
    const now = new Date();
    dateWrap.textContent = `Today: ${formatDate(now)}`;
    setBox(document.getElementById('timeHours'), now.getHours());
    setBox(document.getElementById('timeMinutes'), now.getMinutes());
    setBox(document.getElementById('timeSeconds'), now.getSeconds());
  }

  updateDateTime();
  heroText.appendChild(dateWrap);
  heroText.appendChild(timeContainer);

  setInterval(updateDateTime, 1000);
}

// ================================
// Journal Form: validation + storage
// ================================
function initJournalForm() {
  const form = document.getElementById('journalForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Collect values
    const week = (document.getElementById('week') || {}).value || '';
    const journalName = (document.getElementById('journalName') || {}).value || '';
    const date = (document.getElementById('date') || {}).value || '';
    const taskName = (document.getElementById('taskName') || {}).value || '';
    const taskDescription = (document.getElementById('taskDescription') || {}).value || '';
    const techNodes = document.querySelectorAll('input[name="tech"]:checked');
    const technologies = Array.from(techNodes).map(n => n.value);
    const geoLat = (document.getElementById('geoLat') || {}).value || '';
    const geoLon = (document.getElementById('geoLon') || {}).value || '';
    const geoAddress = (document.getElementById('geoAddress') || {}).value || '';

    // Validate
    let valid = true;
    clearErrors();

    if (!week) { showError('week', 'Please provide a week number.'); valid = false; }
    if (!journalName.trim()) { showError('journalName', 'Please provide a journal name.'); valid = false; }
    if (!date) { showError('date', 'Please select a date.'); valid = false; }
    if (!taskName.trim()) { showError('taskName', 'Please provide a task name.'); valid = false; }

    const wordCount = taskDescription.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) { showError('taskDescription', 'Description must be at least 10 words.'); valid = false; }

    if (technologies.length === 0) { showError('tech', 'Select at least one technology.'); valid = false; }

    if (!valid) return;

    // Save
    const entry = {
      id: `entry_${Date.now()}`,
      week: Number(week),
      journalName: journalName.trim(),
      date,
      taskName: taskName.trim(),
      taskDescription: taskDescription.trim(),
      technologies,
      geoLat,
      geoLon,
      geoAddress,
      createdAt: new Date().toISOString()
    };

    const current = getStoredEntries();
    current.unshift(entry); // newest first
    // Save using storage wrapper if present
    if (window.StorageAPI && StorageAPI.saveEntries) {
      StorageAPI.saveEntries(current);
    } else {
      localStorage.setItem('journalEntries', JSON.stringify(current));
    }

    form.reset();
    renderUserJournalEntries();
    scrollToUserEntries();
    // Notify user
    if (typeof notifySavedEntry === 'function') {
      notifySavedEntry(entry.journalName);
    }
  });

  function showError(field, message) {
    const error = document.querySelector(`.form-error[data-error-for="${field}"]`);
    if (error) {
      error.textContent = message;
      error.style.display = 'block';
    }
  }

  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(function (el) {
      el.textContent = '';
      el.style.display = 'none';
    });
  }
}

function getStoredEntries() {
  try {
    if (window.StorageAPI && StorageAPI.getEntries) {
      return StorageAPI.getEntries();
    }
    const raw = localStorage.getItem('journalEntries');
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function renderUserJournalEntries() {
  const mount = document.getElementById('userJournalList');
  if (!mount) return;

  const entries = getStoredEntries();
  mount.innerHTML = '';

  entries.forEach(function (entry) {
    const card = document.createElement('div');
    card.className = 'journal-card fade-in';
    card.id = entry.id;

    const header = document.createElement('div');
    header.className = 'journal-header';
    header.innerHTML = `
      <span class="week-badge">Week ${entry.week}</span>
      <h3>${escapeHtml(entry.journalName)}</h3>
      <p class="journal-date">${escapeHtml(formatISODate(entry.date))}</p>
    `;

    const body = document.createElement('div');
    body.className = 'journal-body';
    const tags = entry.technologies.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    body.innerHTML = `
      <div class="journal-question">
        <h4>Task: ${escapeHtml(entry.taskName)}</h4>
        <p>${escapeHtml(entry.taskDescription)}</p>
      </div>
      ${entry.geoAddress ? `<p style="color:var(--gray);">Location: ${escapeHtml(entry.geoAddress)}</p>` : (entry.geoLat && entry.geoLon ? `<p style=\"color:var(--gray);\">Location: ${escapeHtml(entry.geoLat)}, ${escapeHtml(entry.geoLon)}</p>` : '')}
      <div class="journal-tags">${tags}</div>
      <div style="margin-top:1rem;"><button type="button" class="btn btn-outline" data-copy-entry="${entry.id}">Copy</button></div>
    `;

    card.appendChild(header);
    card.appendChild(body);
    mount.appendChild(card);
  });

  // Ensure newly added cards get collapsible behavior
  initJournalCollapsibles();
}

function formatISODate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return iso;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function scrollToUserEntries() {
  const el = document.getElementById('userJournalList');
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.pageYOffset - (document.getElementById('navbar')?.offsetHeight || 0) - 10;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

function initJournalCollapsibles() {
  const headers = document.querySelectorAll('.journal-card .journal-header');
  headers.forEach(function (header) {
    if (header.getAttribute('data-collapse-init') === 'true') return;
    header.setAttribute('data-collapse-init', 'true');
    header.style.cursor = 'pointer';
    const body = header.parentElement && header.parentElement.querySelector('.journal-body');
    if (!body) return;

    // Add toggle affordance and ARIA
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');
    if (!header.querySelector('.collapse-caret')) {
      const caret = document.createElement('span');
      caret.className = 'collapse-caret';
      caret.setAttribute('aria-hidden', 'true');
      header.appendChild(caret);
    }

    // Prepare animated collapsible
    body.classList.add('collapsible');
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity = '1';
    // After initial open, remove the clamp so layout changes won't hide content
    setTimeout(() => { if (header.getAttribute('aria-expanded') === 'true') body.style.maxHeight = 'none'; }, 400);

    function toggle() {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        // From auto to pixel to animate close
        if (getComputedStyle(body).maxHeight === 'none') {
          body.style.maxHeight = body.scrollHeight + 'px';
          void body.offsetHeight;
        }
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
        body.classList.add('collapsed');
      } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.opacity = '1';
        body.classList.remove('collapsed');
        // After expand animation completes, allow natural height
        setTimeout(() => { body.style.maxHeight = 'none'; }, 400);
      }
      header.setAttribute('aria-expanded', String(!expanded));
    }

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

// ==========================================
// Project Card Collapsibles
// ==========================================
function initProjectCollapsibles() {
  const cards = document.querySelectorAll('.project-card');
  cards.forEach(function (card) {
    const content = card.querySelector('.project-content');
    const title = content && content.querySelector('h3');
    if (!content || !title) return;

    if (title.getAttribute('data-collapse-init') === 'true') return;
    title.setAttribute('data-collapse-init', 'true');
    title.classList.add('collapse-toggle');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-expanded', 'true');

    if (!title.querySelector('.collapse-caret')) {
      const caret = document.createElement('span');
      caret.className = 'collapse-caret';
      caret.setAttribute('aria-hidden', 'true');
      title.appendChild(caret);
    }

    // Prepare animated collapsible
    content.classList.add('collapsible');
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.opacity = '1';
    setTimeout(() => { if (title.getAttribute('aria-expanded') === 'true') content.style.maxHeight = 'none'; }, 400);

    function toggle() {
      const expanded = title.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        if (getComputedStyle(content).maxHeight === 'none') {
          content.style.maxHeight = content.scrollHeight + 'px';
          void content.offsetHeight;
        }
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.classList.add('collapsed');
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
        content.classList.remove('collapsed');
        setTimeout(() => { content.style.maxHeight = 'none'; }, 400);
      }
      title.setAttribute('aria-expanded', String(!expanded));
    }

    title.addEventListener('click', toggle);
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}


