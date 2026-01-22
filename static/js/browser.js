// Browser API features: Clipboard, Notifications, Geolocation

document.addEventListener('DOMContentLoaded', function () {
  initClipboardForJournal();
  initNotificationsSetup();
  initGeolocationButton();
});

function initClipboardForJournal() {
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-copy-entry]');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-entry');
    const card = document.getElementById(targetId);
    if (!card) return;
    const text = card.innerText.replace(/\s+/g, ' ').trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.innerText = 'Copied!';
      setTimeout(() => (btn.innerText = 'Copy'), 1200);
    } catch (_) {
      btn.innerText = 'Copy failed';
      setTimeout(() => (btn.innerText = 'Copy'), 1200);
    }
  });
}

function initNotificationsSetup() {
  // Request permission upfront (optional). We'll also request on-demand when saving.
  if ('Notification' in window && Notification.permission === 'default') {
    // Don't block UX; request lightly after a delay
    setTimeout(() => Notification.requestPermission().catch(() => {}), 1500);
  }
}

function notifySavedEntry(titleText) {
  if (!('Notification' in window)) return;
  const make = () => new Notification('Journal saved', { body: titleText || 'Your entry has been stored.' });
  if (Notification.permission === 'granted') {
    make();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') make(); });
  }
}

function initGeolocationButton() {
  const geoBtn = document.getElementById('useGeolocation');
  if (!geoBtn || !('geolocation' in navigator)) return;
  const out = document.getElementById('geoOutput');
  const latEl = document.getElementById('geoLat');
  const lonEl = document.getElementById('geoLon');
  const addrEl = document.getElementById('geoAddress');

  geoBtn.addEventListener('click', function () {
    geoBtn.disabled = true;
    geoBtn.innerText = 'Locating...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      const { latitude, longitude } = pos.coords;
      if (latEl) latEl.value = latitude.toFixed(6);
      if (lonEl) lonEl.value = longitude.toFixed(6);
      if (out) out.textContent = `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      // Reverse geocode via OpenStreetMap Nominatim
      reverseGeocode(latitude, longitude).then(addr => {
        if (addrEl) addrEl.value = addr;
        if (out) out.textContent = `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} — ${addr}`;
      }).catch(() => {
        // Ignore failure; keep coords
      });
      geoBtn.disabled = false;
      geoBtn.innerText = 'Use my location';
    }, function () {
      if (out) out.textContent = 'Unable to retrieve your location.';
      geoBtn.disabled = false;
      geoBtn.innerText = 'Use my location';
    });
  });
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': navigator.language || 'en',
      // Nominatim usage policy recommends identifying the application via User-Agent or Referer
    }
  });
  if (!res.ok) throw new Error('reverse geocode failed');
  const data = await res.json();
  return data.display_name || 'Unknown place';
}


