// Simple storage utilities for the Learning Journal PWA

const StorageAPI = (function () {
  const ENTRIES_KEY = 'journalEntries';
  const THEME_KEY = 'darkMode';
  const SESSION_LAST_VISIT = 'sessionLastVisit';

  function getEntries() {
    try {
      const raw = localStorage.getItem(ENTRIES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY);
  }

  function setTheme(value) {
    localStorage.setItem(THEME_KEY, value);
  }

  function getSessionLastVisit() {
    return sessionStorage.getItem(SESSION_LAST_VISIT);
  }

  function setSessionLastVisit(ts) {
    sessionStorage.setItem(SESSION_LAST_VISIT, ts);
  }

  return { getEntries, saveEntries, getTheme, setTheme, getSessionLastVisit, setSessionLastVisit };
})();


