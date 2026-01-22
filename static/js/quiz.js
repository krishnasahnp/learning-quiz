// Interactive Quiz Web App - all modes
document.addEventListener('DOMContentLoaded', () => {
  const api = new APIService('');
  const store = new QuizStorage();
  const ui = new QuizUI(api, store);
  ui.init();
});

class APIService {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }
  async fetchQuestions(mode) {
    return this._get(`/api/questions/${mode}`);
  }
  async registerUser(userName) {
    return this._post('/api/users', { userName });
  }
  async submitScore(payload) {
    return this._post('/api/leaderboard', payload);
  }
  async getLeaderboard(mode = 'all', limit = 50) {
    const qs = new URLSearchParams({ mode, limit }).toString();
    return this._get(`/api/leaderboard?${qs}`);
  }
  async _get(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GET ${path} failed`);
    return res.json();
  }
  async _post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed`);
    return res.json();
  }
}

class QuizStorage {
  constructor() {
    this.dbPromise = this._initDB();
  }
  async _initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('QuizAppDB', 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'userId' }).createIndex('userName', 'userName', { unique: false });
        }
        if (!db.objectStoreNames.contains('scores')) {
          db.createObjectStore('scores', { keyPath: 'scoreId' }).createIndex('userId', 'userId', { unique: false });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'progressId' }).createIndex('userId', 'userId', { unique: false });
        }
        if (!db.objectStoreNames.contains('cachedQuestions')) {
          db.createObjectStore('cachedQuestions', { keyPath: 'cacheId' }).createIndex('mode', 'mode', { unique: false });
        }
        if (!db.objectStoreNames.contains('pendingScores')) {
          db.createObjectStore('pendingScores', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async _tx(storeName, mode, fn) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }
  async saveUser(user) {
    await this._tx('users', 'readwrite', (store) => store.put(user));
    localStorage.setItem('quizUser', JSON.stringify(user));
  }
  async getUser() {
    const local = localStorage.getItem('quizUser');
    if (local) return JSON.parse(local);
    const all = await this._tx('users', 'readonly', (store) => store.getAll());
    return all[0] || null;
  }
  async cacheQuestions(mode, items) {
    const cacheId = `cache_${mode}`;
    await this._tx('cachedQuestions', 'readwrite', (store) => store.put({ cacheId, mode, cachedAt: Date.now(), items }));
  }
  async getCachedQuestions(mode) {
    const cacheId = `cache_${mode}`;
    return this._tx('cachedQuestions', 'readonly', (store) => store.get(cacheId)).then((v) => v?.items || null);
  }
  async enqueueScore(score) {
    const id = `ps_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await this._tx('pendingScores', 'readwrite', (store) => store.put({ id, score }));
  }
  async flushPendingScores(sender) {
    const pending = await this._tx('pendingScores', 'readonly', (store) => store.getAll());
    for (const item of pending) {
      try {
        await sender(item.score);
        await this._tx('pendingScores', 'readwrite', (store) => store.delete(item.id));
      } catch (e) {
        // Keep in queue
      }
    }
  }
}

class QuizUI {
  constructor(api, store) {
    this.api = api;
    this.store = store;
    this.currentMode = null;
    this.rulesHidden = JSON.parse(localStorage.getItem('quizRulesHidden') || '{}');
    this.timerHandle = null;
    this.questionTimer = null;
    this.state = {
      technical: { questions: [], index: 0, score: 0, correct: 0, incorrect: 0, duration: 0, totalQuestions: 0, allQuestions: [] },
      memory: { moves: 0, pairs: 0, score: 0, startTs: 0, questionIndex: 0, totalQuestions: 0, allSets: [] },
      wordscramble: { idx: 0, score: 0, attempts: 0, totalQuestions: 0, allWords: [] },
      reflection: { idx: 0, score: 0, correct: 0, startTs: 0, totalQuestions: 0, allPuzzles: [] },
    };
    this.pendingMode = null;
  }

  init() {
    this.cacheElements();
    this.bindGlobalActions();
    this.ensureUser().then(() => this.bindModes());
    window.addEventListener('online', () => this.store.flushPendingScores((score) => this.api.submitScore(score)));
  }

  cacheElements() {
    this.el = {
      rulesBtn: document.getElementById('viewRulesBtn'),
      leaderboardBtn: document.getElementById('viewLeaderboardBtn'),
      profileActionBtn: document.getElementById('profileActionBtn'),
      switchUserBtn: document.getElementById('switchUserBtn'),
      dashboard: document.getElementById('quizDashboard'),
      playArea: document.getElementById('quizPlayArea'),
      leaderSection: document.getElementById('leaderboardSection'),
      modePanels: {
        technical: document.getElementById('panel-technical'),
        memory: document.getElementById('panel-memory'),
        wordscramble: document.getElementById('panel-wordscramble'),
        reflection: document.getElementById('panel-reflection'),
      },
      techQuestion: document.getElementById('techQuestion'),
      techOptions: document.getElementById('techOptions'),
      technicalQuestionNumber: document.getElementById('technicalQuestionNumber'),
      technicalSkipBtn: document.getElementById('technicalSkipBtn'),
      memoryGrid: document.getElementById('memoryGrid'),
      memoryMoves: document.getElementById('memoryMoves'),
      memoryPairs: document.getElementById('memoryPairs'),
      memoryTimer: document.getElementById('memoryTimer'),
      memoryQuestionNumber: document.getElementById('memoryQuestionNumber'),
      memorySkipBtn: document.getElementById('memorySkipBtn'),
      scrambleTiles: document.getElementById('scrambleTiles'),
      scrambleInput: document.getElementById('scrambleInput'),
      scrambleSubmit: document.getElementById('scrambleSubmit'),
      scrambleHint: document.getElementById('scrambleHint'),
      scrambleSkip: document.getElementById('scrambleSkip'),
      scrambleSkipBtn: document.getElementById('scrambleSkipBtn'),
      scrambleHintText: document.getElementById('scrambleHintText'),
      scrambleQuestionNumber: document.getElementById('scrambleQuestionNumber'),
      scrambleShowAnswerBtn: document.getElementById('scrambleShowAnswerBtn'),
      scrambleAnswerDisplay: document.getElementById('scrambleAnswerDisplay'),
      scrambleAnswerValue: document.getElementById('scrambleAnswerValue'),
      reflectionCanvas: document.getElementById('reflectionCanvas'),
      reflectionOptions: document.getElementById('reflectionOptions'),
      reflectionQuestionNumber: document.getElementById('reflectionQuestionNumber'),
      reflectionQuestionText: document.getElementById('reflectionQuestionText'),
      reflectionSkipBtn: document.getElementById('reflectionSkipBtn'),
      reflectionHint: document.getElementById('reflectionHint'),
      reflectionHintText: document.getElementById('reflectionHintText'),
      questionCounter: document.getElementById('questionCounter'),
      progressFill: document.getElementById('progressFill'),
      timerValue: document.getElementById('timerValue'),
      scoreValue: document.getElementById('scoreValue'),
      rulesInlineBtn: document.getElementById('rulesInlineBtn'),
      quitModeBtn: document.getElementById('quitModeBtn'),
      userModal: document.getElementById('userModal'),
      saveUserBtn: document.getElementById('saveUserBtn'),
      skipUserBtn: document.getElementById('skipUserBtn'),
      userNameInput: document.getElementById('userNameInput'),
      rulesModal: document.getElementById('rulesModal'),
      rulesContent: document.getElementById('rulesContent'),
      hideRulesToggle: document.getElementById('hideRulesToggle'),
      summaryModal: document.getElementById('summaryModal'),
      summaryContent: document.getElementById('summaryContent'),
      retryModeBtn: document.getElementById('retryModeBtn'),
      anotherModeBtn: document.getElementById('anotherModeBtn'),
      nextQuestionBtn: document.getElementById('nextQuestionBtn'),
      leaderboardMode: document.getElementById('leaderboardMode'),
      leaderboardLimit: document.getElementById('leaderboardLimit'),
      leaderboardSearch: document.getElementById('leaderboardSearch'),
      leaderboardBody: document.getElementById('leaderboardBody'),
      searchClearBtn: document.getElementById('searchClearBtn'),
    };
  }

  async ensureUser() {
    const existing = await this.store.getUser();
    if (existing) {
      this.user = existing;
      this.updateUserStatus(existing.userName);
      return;
    }
    // Default to guest without blocking UI
    this.user = { userId: 'guest', userName: 'Guest' };
    this.updateUserStatus('Guest');
  }

  updateUserStatus(name) {
    if (this.el.profileActionBtn) this.el.profileActionBtn.textContent = name && name !== 'Guest' ? name : 'Add Player';
  }

  bindGlobalActions() {
    const handleActionCard = (element, action) => {
      if (!element) return;
      element.addEventListener('click', action);
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          action();
        }
      });
    };

    this.el.profileActionBtn?.addEventListener('click', () => this.openModal(this.el.userModal));
    this.el.switchUserBtn?.addEventListener('click', () => this.openModal(this.el.userModal));
    this.el.saveUserBtn?.addEventListener('click', () => this.saveUser());
    this.el.skipUserBtn?.addEventListener('click', () => this.skipUser());
    this.el.userModal?.addEventListener('click', (e) => {
      if (e.target.dataset.closeUser !== undefined || e.target === this.el.userModal || e.target.closest('.user-modal-close')) {
        this.closeModal(this.el.userModal);
      }
    });
    handleActionCard(this.el.rulesBtn, () => this.showRules(this.currentMode || 'technical'));
    this.el.rulesInlineBtn?.addEventListener('click', () => this.showRules(this.currentMode || 'technical'));
    this.el.rulesModal?.addEventListener('click', (e) => {
      if (e.target.dataset.closeRules !== undefined || e.target === this.el.rulesModal) this.closeModal(this.el.rulesModal);
    });
    this.el.summaryModal?.addEventListener('click', (e) => {
      if (e.target.dataset.closeSummary !== undefined || e.target === this.el.summaryModal) this.closeModal(this.el.summaryModal);
    });
    this.el.quitModeBtn?.addEventListener('click', () => this.exitMode());
    const openLeader = () => this.toggleLeaderboard(true);
    handleActionCard(this.el.leaderboardBtn, openLeader);
    const cardBtn = document.getElementById('viewLeaderboardBtnCard');
    cardBtn?.addEventListener('click', openLeader);
    this.el.leaderboardMode?.addEventListener('change', () => this.loadLeaderboard());
    this.el.leaderboardLimit?.addEventListener('change', () => this.loadLeaderboard());
    this.el.leaderboardSearch?.addEventListener('input', () => {
      this.filterLeaderboard();
      this.toggleSearchClear();
    });
    this.el.searchClearBtn?.addEventListener('click', () => {
      this.el.leaderboardSearch.value = '';
      this.filterLeaderboard();
      this.toggleSearchClear();
      this.el.leaderboardSearch.focus();
    });
    this.el.retryModeBtn?.addEventListener('click', () => { this.closeModal(this.el.summaryModal); this.startMode(this.currentMode); });
    this.el.anotherModeBtn?.addEventListener('click', () => { this.closeModal(this.el.summaryModal); this.exitMode(); });
    this.el.nextQuestionBtn?.addEventListener('click', () => {
      this.closeModal(this.el.summaryModal);
      if (this.currentMode === 'memory') {
        this.skipMemory();
      } else if (this.currentMode === 'wordscramble') {
        this.nextScramble();
      } else if (this.currentMode === 'reflection') {
        this.nextReflection();
      } else if (this.currentMode === 'technical') {
        this.nextTechnical();
      }
    });
    this.el.technicalSkipBtn?.addEventListener('click', () => this.nextTechnical());
    this.el.reflectionSkipBtn?.addEventListener('click', () => this.nextReflection());
    this.el.memorySkipBtn?.addEventListener('click', () => this.skipMemory());

    this.el.scrambleSubmit?.addEventListener('click', () => this.checkScramble());
    this.el.scrambleHint?.addEventListener('click', () => this.useScrambleHint());
    this.el.scrambleSkip?.addEventListener('click', () => this.nextScramble());
    this.el.scrambleSkipBtn?.addEventListener('click', () => this.nextScramble());
    this.el.scrambleShowAnswerBtn?.addEventListener('click', () => this.showScrambleAnswer());
    this.el.scrambleInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.checkScramble();
    });
    this.el.reflectionHint?.addEventListener('click', () => this.useReflectionHint());
  }

  bindModes() {
    document.querySelectorAll('.start-mode').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.quiz-card');
        const mode = card?.dataset.mode;
        if (mode) this.startMode(mode);
      });
    });
  }

  async saveUser() {
    const name = this.el.userNameInput.value.trim();
    if (name.length < 2 || name.length > 50) {
      this.el.userNameInput.focus();
      return;
    }
    let user;
    try {
      user = await this.api.registerUser(name);
    } catch {
      // Offline fallback
      user = { userId: `local_${Date.now()}`, userName: name, createdAt: new Date().toISOString() };
    }
    await this.store.saveUser(user);
    this.user = user;
    this.updateUserStatus(name);
    this.closeModal(this.el.userModal);
    if (this.pendingMode) {
      const mode = this.pendingMode;
      this.pendingMode = null;
      this.startMode(mode);
    }
  }

  skipUser() {
    this.closeModal(this.el.userModal);
    if (this.pendingMode) {
      const mode = this.pendingMode;
      this.pendingMode = null;
      this.startMode(mode, true);
    }
  }

  async startMode(mode, allowGuest = false) {
    if (!this.user) {
      if (allowGuest) {
        this.user = { userId: 'guest', userName: 'Guest' };
        this.updateUserStatus('Guest');
      } else {
        this.pendingMode = mode;
        this.openModal(this.el.userModal);
        return;
      }
    }
    this.currentMode = mode;
    this.el.dashboard.classList.add('hidden');
    this.el.playArea.classList.remove('hidden');
    Object.values(this.el.modePanels).forEach((p) => p.classList.add('hidden'));
    this.el.modePanels[mode].classList.remove('hidden');
    this.resetToolbar();

    if (!this.rulesHidden[mode]) {
      this.showRules(mode, true);
    }

    switch (mode) {
      case 'technical':
        await this.startTechnical(true);
        break;
      case 'memory':
        // Always reset when starting mode from dashboard
        await this.startMemory(true);
        break;
      case 'wordscramble':
        await this.startScramble(true);
        break;
      case 'reflection':
        await this.startReflection();
        break;
    }
  }

  resetToolbar() {
    this.updateProgress(0, 1);
    this.updateTimer(0);
    this.updateScore(0);
    this.stopTimers();
  }

  stopTimers() {
    if (this.timerHandle) clearInterval(this.timerHandle);
    if (this.questionTimer) clearInterval(this.questionTimer);
    this.timerHandle = null;
    this.questionTimer = null;
  }

  updateProgress(current, total) {
    this.el.questionCounter.textContent = `${current}/${total}`;
    const pct = total ? Math.floor((current / total) * 100) : 0;
    this.el.progressFill.style.width = `${pct}%`;
  }

  updateTimer(seconds) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    this.el.timerValue.textContent = `${mm}:${ss}`;
  }

  updateScore(val) {
    this.el.scoreValue.textContent = val;
  }

  async startTechnical(reset = false) {
    const data = await this.loadQuestions('technical');
    if (!this.ensureQuestions('technical', data)) return;
    
    const st = this.state.technical;
    if (reset || !st.allQuestions || st.allQuestions.length === 0) {
      const questions = this.shuffle([...data]);
      st.allQuestions = questions;
      st.totalQuestions = data.length;
      st.questions = questions;
      st.index = 0;
      st.score = 0;
      st.correct = 0;
      st.incorrect = 0;
      st.duration = 0;
    } else {
      st.questions = st.allQuestions;
    }
    
    this.updateScore(st.score);
    this.renderTechnicalQuestion();
    
    // Update question number
    if (this.el.technicalQuestionNumber) {
      this.el.technicalQuestionNumber.textContent = `${st.index + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.technicalSkipBtn) {
      if (st.index >= st.totalQuestions - 1) {
        this.el.technicalSkipBtn.disabled = true;
        this.el.technicalSkipBtn.style.opacity = '0.5';
        this.el.technicalSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.technicalSkipBtn.disabled = false;
        this.el.technicalSkipBtn.style.opacity = '1';
        this.el.technicalSkipBtn.style.cursor = 'pointer';
      }
    }
    
    this.timerHandle = setInterval(() => { st.duration += 1; this.updateTimer(st.duration); }, 1000);
  }

  nextTechnical() {
    const st = this.state.technical;
    if (st.index >= st.totalQuestions - 1) {
      this.finishMode();
      return;
    }
    st.index += 1;
    this.renderTechnicalQuestion();
    
    // Update question number
    if (this.el.technicalQuestionNumber) {
      this.el.technicalQuestionNumber.textContent = `${st.index + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.technicalSkipBtn) {
      if (st.index >= st.totalQuestions - 1) {
        this.el.technicalSkipBtn.disabled = true;
        this.el.technicalSkipBtn.style.opacity = '0.5';
        this.el.technicalSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.technicalSkipBtn.disabled = false;
        this.el.technicalSkipBtn.style.opacity = '1';
        this.el.technicalSkipBtn.style.cursor = 'pointer';
      }
    }
  }

  renderTechnicalQuestion() {
    const st = this.state.technical;
    const q = st.questions[st.index];
    if (!q) return this.finishMode();

    this.updateProgress(st.index + 1, st.questions.length);
    
    // Update question number
    if (this.el.technicalQuestionNumber) {
      this.el.technicalQuestionNumber.textContent = `${st.index + 1}/${st.totalQuestions}`;
    }
    
    // Update question text
    if (this.el.techQuestion) {
      this.el.techQuestion.textContent = q.question;
    }
    
    // Render options with modern UI
    if (this.el.techOptions) {
      this.el.techOptions.innerHTML = '';
      q.options.forEach((opt, idx) => {
        const optionCard = document.createElement('div');
        optionCard.className = 'technical-option-card';
        optionCard.dataset.optionIndex = idx;
        
        const optionLabel = document.createElement('div');
        optionLabel.className = 'technical-option-label';
        optionLabel.textContent = String.fromCharCode(65 + idx); // A, B, C, D
        
        const optionText = document.createElement('div');
        optionText.className = 'technical-option-text';
        optionText.textContent = opt;
        
        optionCard.appendChild(optionLabel);
        optionCard.appendChild(optionText);
        optionCard.addEventListener('click', () => this.handleTechAnswer(idx));
        this.el.techOptions.appendChild(optionCard);
      });
    }
    
    this.startQuestionTimer(60, () => this.handleTechAnswer(null, true));
  }

  handleTechAnswer(idx, timedOut = false) {
    const st = this.state.technical;
    const q = st.questions[st.index];
    this.stopQuestionTimer();
    const correctIdx = q.correctAnswer;
    
    // Disable all options
    const optionCards = Array.from(this.el.techOptions.querySelectorAll('.technical-option-card'));
    optionCards.forEach((card, i) => {
      card.style.pointerEvents = 'none';
      if (i === correctIdx) {
        card.classList.add('correct');
      }
      if (idx !== null && idx === i && i !== correctIdx) {
        card.classList.add('wrong');
      }
    });
    
    if (idx === correctIdx && !timedOut) {
      st.score += 10;
      st.correct += 1;
    } else {
      st.incorrect += 1;
    }
    this.updateScore(st.score);
    
    // Move to next question or finish
    setTimeout(() => {
      if (st.index >= st.totalQuestions - 1) {
        this.finishMode();
      } else {
        st.index += 1;
        this.renderTechnicalQuestion();
      }
    }, 1500);
  }

  startQuestionTimer(seconds, onExpire) {
    this.remaining = seconds;
    this.updateTimer(this.state.technical.duration);
    this.stopQuestionTimer();
    this.questionTimer = setInterval(() => {
      this.remaining -= 1;
      if (this.remaining <= 0) {
        this.stopQuestionTimer();
        onExpire();
      }
    }, 1000);
  }

  stopQuestionTimer() {
    if (this.questionTimer) clearInterval(this.questionTimer);
    this.questionTimer = null;
  }

  async startMemory(reset = false) {
    const data = await this.loadQuestions('memory');
    if (!this.ensureQuestions('memory', data)) return;
    
    // Store all sets and initialize question tracking
    const st = this.state.memory;
    if (reset || !st.allSets || st.allSets.length === 0) {
      // Shuffle all sets for variety
      st.allSets = this.shuffle([...data]);
      st.questionIndex = 0;
      st.totalQuestions = data.length;
      st.score = 0; // Reset score when starting fresh
    }
    
    // Get current question set
    const currentSet = st.allSets[st.questionIndex];
    if (!currentSet) {
      // All questions completed, finish mode
      this.finishMode();
      return;
    }
    
    // Use only first 8 cards (4 pairs) from the selected set
    const selectedPairs = currentSet.pairs.slice(0, 8);
    const cards = this.shuffle(selectedPairs.map((p, i) => ({ ...p, uid: `${p.pairId}_${i}` })));
    const totalPairs = 4; // Always 4 pairs (8 cards)
    
    // Reset state for new question
    st.moves = 0;
    st.pairs = 0;
    st.startTs = Date.now();
    st.cards = cards;
    st.open = [];
    st.totalPairs = totalPairs;
    
    this.updateScore(st.score); // Keep cumulative score
    this.updateProgress(0, totalPairs);
    
    // Update question number display
    if (this.el.memoryQuestionNumber) {
      this.el.memoryQuestionNumber.textContent = `${st.questionIndex + 1}/${st.totalQuestions}`;
    }
    
    // Initialize UI
    if (this.el.memoryMoves) this.el.memoryMoves.textContent = '0';
    if (this.el.memoryPairs) this.el.memoryPairs.textContent = `0/${totalPairs}`;
    if (this.el.memoryTimer) this.el.memoryTimer.textContent = '00:00';
    
    // Update skip button state
    if (this.el.memorySkipBtn) {
      if (st.questionIndex >= st.totalQuestions - 1) {
        this.el.memorySkipBtn.disabled = true;
        this.el.memorySkipBtn.style.opacity = '0.5';
        this.el.memorySkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.memorySkipBtn.disabled = false;
        this.el.memorySkipBtn.style.opacity = '1';
        this.el.memorySkipBtn.style.cursor = 'pointer';
      }
    }
    
    this.el.memoryGrid.innerHTML = '';
    cards.forEach((card) => {
      const div = document.createElement('div');
      div.className = 'memory-card';
      div.dataset.uid = card.uid;
      div.innerHTML = '<span class="card-back-icon">🎴</span>';
      div.addEventListener('click', () => this.flipMemory(card, div));
      this.el.memoryGrid.appendChild(div);
    });
    
    // Clear existing timer
    if (this.timerHandle) clearInterval(this.timerHandle);
    
    this.timerHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - st.startTs) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      if (this.el.memoryTimer) this.el.memoryTimer.textContent = timeStr;
      this.updateTimer(elapsed);
    }, 1000);
  }

  skipMemory() {
    const st = this.state.memory;
    if (st.questionIndex >= st.totalQuestions - 1) {
      // Last question, finish mode
      this.finishMode();
      return;
    }
    
    // Move to next question
    st.questionIndex += 1;
    this.startMemory();
  }

  flipMemory(card, el) {
    const st = this.state.memory;
    if (el.classList.contains('matched') || el.classList.contains('revealed')) return;
    if (st.open.length === 2) return;
    el.classList.add('revealed');
    el.textContent = card.content;
    st.open.push({ card, el });
    if (st.open.length === 2) {
      st.moves += 1;
      if (this.el.memoryMoves) this.el.memoryMoves.textContent = st.moves;
      const [a, b] = st.open;
      if (a.card.pairId === b.card.pairId) {
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        st.pairs += 1;
        st.score += 20;
        this.updateScore(st.score);
        const totalPairs = st.totalPairs || 4;
        if (this.el.memoryPairs) this.el.memoryPairs.textContent = `${st.pairs}/${totalPairs}`;
        this.updateProgress(st.pairs, totalPairs);
        st.open = [];
        if (st.pairs === totalPairs) {
          const elapsed = Math.floor((Date.now() - st.startTs) / 1000);
          st.score += Math.max(0, (120 - elapsed)) * 2;
          // Efficiency bonus for low moves
          if (st.moves < 30) {
            st.score += 50;
          }
          this.updateScore(st.score);
          
          // Show summary modal instead of auto-advancing
          // User can click "Next Question" to continue
          this.finishMode();
        }
      } else {
        setTimeout(() => {
          a.el.classList.remove('revealed');
          b.el.classList.remove('revealed');
          a.el.innerHTML = '<span class="card-back-icon">🎴</span>';
          b.el.innerHTML = '<span class="card-back-icon">🎴</span>';
          st.open = [];
        }, 800);
      }
    }
  }

  async startScramble(reset = false) {
    const data = await this.loadQuestions('wordscramble');
    if (!this.ensureQuestions('wordscramble', data)) return;
    
    const st = this.state.wordscramble;
    if (reset || !st.allWords || st.allWords.length === 0) {
      this.scrambleData = this.shuffle([...data]);
      st.allWords = this.scrambleData;
      st.totalQuestions = data.length;
      st.idx = 0;
      st.score = 0;
    } else {
      this.scrambleData = st.allWords;
    }
    
    this.updateScore(st.score);
    this.nextScramble(true);
    
    // Update question number
    if (this.el.scrambleQuestionNumber) {
      this.el.scrambleQuestionNumber.textContent = `${st.idx + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.scrambleSkipBtn) {
      if (st.idx >= st.totalQuestions - 1) {
        this.el.scrambleSkipBtn.disabled = true;
        this.el.scrambleSkipBtn.style.opacity = '0.5';
        this.el.scrambleSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.scrambleSkipBtn.disabled = false;
        this.el.scrambleSkipBtn.style.opacity = '1';
        this.el.scrambleSkipBtn.style.cursor = 'pointer';
      }
    }
    
    this.timerHandle = setInterval(() => {
      st.duration = (st.duration || 0) + 1;
      this.updateTimer(st.duration || 0);
    }, 1000);
  }

  nextScramble(reset = false) {
    const st = this.state.wordscramble;
    if (!reset) st.idx += 1;
    if (st.idx >= this.scrambleData.length) return this.finishMode();
    const word = this.scrambleData[st.idx];
    st.current = word;
    st.attempts = 0;
    this.updateProgress(st.idx + 1, this.scrambleData.length);
    
    // Update question number
    if (this.el.scrambleQuestionNumber) {
      this.el.scrambleQuestionNumber.textContent = `${st.idx + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.scrambleSkipBtn) {
      if (st.idx >= st.totalQuestions - 1) {
        this.el.scrambleSkipBtn.disabled = true;
        this.el.scrambleSkipBtn.style.opacity = '0.5';
        this.el.scrambleSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.scrambleSkipBtn.disabled = false;
        this.el.scrambleSkipBtn.style.opacity = '1';
        this.el.scrambleSkipBtn.style.cursor = 'pointer';
      }
    }
    
    // Reset UI
    this.el.scrambleInput.value = '';
    if (this.el.scrambleHintText) {
      this.el.scrambleHintText.textContent = '';
      this.el.scrambleHintText.classList.remove('error', 'success');
    }
    
    // Reset reflection hint if in reflection mode
    if (this.el.reflectionHintText) {
      this.el.reflectionHintText.textContent = '';
      this.el.reflectionHintText.classList.remove('error', 'success');
      this.el.reflectionHintText.style.display = 'none';
    }
    if (this.el.scrambleAnswerDisplay) {
      this.el.scrambleAnswerDisplay.classList.add('hidden');
    }
    if (this.el.scrambleShowAnswerBtn) {
      this.el.scrambleShowAnswerBtn.classList.add('hidden');
    }
    this.el.scrambleTiles.innerHTML = '';
    
    // Reset tiles
    word.scrambled.split('').forEach((ch, i) => {
      const span = document.createElement('div');
      span.className = 'scramble-tile-modern';
      span.textContent = ch;
      span.addEventListener('click', () => {
        if (!span.classList.contains('selected')) {
          this.el.scrambleInput.value += ch;
          span.classList.add('selected');
        }
      });
      this.el.scrambleTiles.appendChild(span);
    });
  }

  checkScramble() {
    const st = this.state.wordscramble;
    const attempt = this.el.scrambleInput.value.trim().toUpperCase();
    if (!attempt) return;
    
    st.attempts += 1;
    if (attempt === st.current.word.toUpperCase()) {
      let add = 15;
      if (st.attempts === 2) add = 10;
      if (st.attempts >= 3) add = 5;
      st.score += add;
      this.updateScore(st.score);
      
      // Show success message
      if (this.el.scrambleHintText) {
        this.el.scrambleHintText.textContent = '✓ Correct!';
        this.el.scrambleHintText.classList.add('success');
        this.el.scrambleHintText.classList.remove('error');
      }
      
      // Hide show answer button
      if (this.el.scrambleShowAnswerBtn) {
        this.el.scrambleShowAnswerBtn.classList.add('hidden');
      }
      
      // Move to next question after delay
      setTimeout(() => {
        this.nextScramble();
      }, 1500);
    } else {
      // Show error message
      if (this.el.scrambleHintText) {
        this.el.scrambleHintText.textContent = '✗ Incorrect, try again.';
        this.el.scrambleHintText.classList.add('error');
        this.el.scrambleHintText.classList.remove('success');
      }
      
      // Show "Show Answer" button after incorrect attempt
      if (this.el.scrambleShowAnswerBtn && st.attempts >= 1) {
        this.el.scrambleShowAnswerBtn.classList.remove('hidden');
      }
    }
  }

  showScrambleAnswer() {
    const st = this.state.wordscramble;
    if (!st.current) return;
    
    // Show answer
    if (this.el.scrambleAnswerValue) {
      this.el.scrambleAnswerValue.textContent = st.current.word;
    }
    if (this.el.scrambleAnswerDisplay) {
      this.el.scrambleAnswerDisplay.classList.remove('hidden');
    }
    
    // Hide show answer button
    if (this.el.scrambleShowAnswerBtn) {
      this.el.scrambleShowAnswerBtn.classList.add('hidden');
    }
  }

  useScrambleHint() {
    const st = this.state.wordscramble;
    if (!st.current) return;
    st.score = Math.max(0, st.score - 5);
    this.updateScore(st.score);
    const hint = st.current.hint || '';
    if (this.el.scrambleHintText) {
      this.el.scrambleHintText.textContent = hint ? `💡 Hint: ${hint}` : 'No hint available.';
      this.el.scrambleHintText.classList.remove('error', 'success');
    }
  }

  async startReflection(reset = false) {
    const data = await this.loadQuestions('reflection');
    if (!this.ensureQuestions('reflection', data)) return;
    
    const st = this.state.reflection;
    if (reset || !st.allPuzzles || st.allPuzzles.length === 0) {
      this.reflectionData = this.shuffle([...data]);
      st.allPuzzles = this.reflectionData;
      st.totalQuestions = data.length;
      st.idx = 0;
      st.score = 0;
      st.correct = 0;
    } else {
      this.reflectionData = st.allPuzzles;
    }
    
    st.startTs = Date.now();
    this.updateScore(st.score);
    this.renderReflection();
    
    // Update question number
    if (this.el.reflectionQuestionNumber) {
      this.el.reflectionQuestionNumber.textContent = `${st.idx + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.reflectionSkipBtn) {
      if (st.idx >= st.totalQuestions - 1) {
        this.el.reflectionSkipBtn.disabled = true;
        this.el.reflectionSkipBtn.style.opacity = '0.5';
        this.el.reflectionSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.reflectionSkipBtn.disabled = false;
        this.el.reflectionSkipBtn.style.opacity = '1';
        this.el.reflectionSkipBtn.style.cursor = 'pointer';
      }
    }
    
    this.timerHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - st.startTs) / 1000);
      this.updateTimer(elapsed);
    }, 1000);
  }

  nextReflection() {
    const st = this.state.reflection;
    if (st.idx >= st.totalQuestions - 1) {
      this.finishMode();
      return;
    }
    st.idx += 1;
    this.renderReflection();
    
    // Update question number
    if (this.el.reflectionQuestionNumber) {
      this.el.reflectionQuestionNumber.textContent = `${st.idx + 1}/${st.totalQuestions}`;
    }
    
    // Update skip button state
    if (this.el.reflectionSkipBtn) {
      if (st.idx >= st.totalQuestions - 1) {
        this.el.reflectionSkipBtn.disabled = true;
        this.el.reflectionSkipBtn.style.opacity = '0.5';
        this.el.reflectionSkipBtn.style.cursor = 'not-allowed';
      } else {
        this.el.reflectionSkipBtn.disabled = false;
        this.el.reflectionSkipBtn.style.opacity = '1';
        this.el.reflectionSkipBtn.style.cursor = 'pointer';
      }
    }
    
    // Reset hint display
    if (this.el.reflectionHintText) {
      this.el.reflectionHintText.textContent = '';
      this.el.reflectionHintText.classList.remove('error', 'success');
    }
  }

  useReflectionHint() {
    const st = this.state.reflection;
    const item = this.reflectionData[st.idx];
    if (!item) return;
    
    // Deduct points for hint
    st.score = Math.max(0, st.score - 5);
    this.updateScore(st.score);
    
    // Show hint (use explanation if available)
    const hint = item.hint || item.explanation || 'Look carefully at the pattern and try to identify the rule or sequence.';
    if (this.el.reflectionHintText) {
      this.el.reflectionHintText.textContent = `💡 Hint: ${hint}`;
      this.el.reflectionHintText.classList.remove('error', 'success');
      this.el.reflectionHintText.style.display = 'block';
    }
  }

  renderReflection() {
    const st = this.state.reflection;
    if (st.idx >= this.reflectionData.length) return this.finishMode();
    const item = this.reflectionData[st.idx];
    this.updateProgress(st.idx + 1, this.reflectionData.length);
    
    // Update question text
    if (this.el.reflectionQuestionText) {
      this.el.reflectionQuestionText.textContent = item.question || 'Complete the pattern';
    }
    
    // Add instruction text if it doesn't exist
    let instructionEl = this.el.reflectionCanvas.parentElement.querySelector('.reflection-instruction-text');
    if (!instructionEl) {
      instructionEl = document.createElement('div');
      instructionEl.className = 'reflection-instruction-text';
      this.el.reflectionCanvas.parentElement.insertBefore(instructionEl, this.el.reflectionCanvas);
    }
    instructionEl.textContent = 'Study the pattern above, then select the option (A, B, C, or D) that best completes it.';
    
    // Reset hint display
    if (this.el.reflectionHintText) {
      this.el.reflectionHintText.textContent = '';
      this.el.reflectionHintText.classList.remove('error', 'success');
      this.el.reflectionHintText.style.display = 'none';
    }
    
    // Update question number
    if (this.el.reflectionQuestionNumber) {
      this.el.reflectionQuestionNumber.textContent = `${st.idx + 1}/${st.totalQuestions}`;
    }
    
    // Render canvas
    const ctx = this.el.reflectionCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.el.reflectionCanvas.width, this.el.reflectionCanvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, this.el.reflectionCanvas.width, this.el.reflectionCanvas.height);
    
    // Draw shapes on canvas - scale from original 400x300 to new 700x300 (wider, same height)
    const scaleX = this.el.reflectionCanvas.width / 400;
    const scaleY = this.el.reflectionCanvas.height / 300;
    
    (item.canvasData?.shapes || []).forEach((shape) => {
      ctx.fillStyle = shape.color || '#4A90E2';
      const scaledX = shape.x * scaleX;
      const scaledY = shape.y * scaleY;
      
      if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(scaledX, scaledY, (shape.r || 10) * Math.min(scaleX, scaleY), 0, Math.PI * 2);
        ctx.fill();
      } else if (shape.type === 'square') {
        const scaledSize = (shape.size || 16) * Math.min(scaleX, scaleY);
        ctx.fillRect(scaledX - scaledSize/2, scaledY - scaledSize/2, scaledSize, scaledSize);
      } else if (shape.type === 'triangle') {
        const scaledSize = (shape.size || 10) * Math.min(scaleX, scaleY);
        ctx.beginPath();
        ctx.moveTo(scaledX, scaledY - scaledSize);
        ctx.lineTo(scaledX - scaledSize, scaledY + scaledSize);
        ctx.lineTo(scaledX + scaledSize, scaledY + scaledSize);
        ctx.closePath();
        ctx.fill();
      }
    });
    
    // Render options with improved UI - compact and clear
    this.el.reflectionOptions.innerHTML = '';
    item.options.forEach((opt, index) => {
      const div = document.createElement('div');
      div.className = 'reflection-option-modern';
      div.dataset.optionId = opt.id;
      
      // Create option card with horizontal layout
      const optionCard = document.createElement('div');
      optionCard.className = 'reflection-option-card';
      
      // Option badge (A, B, C, D)
      const optionBadge = document.createElement('div');
      optionBadge.className = 'reflection-option-badge';
      optionBadge.textContent = opt.id.toUpperCase();
      
      // Option preview area - always show actual pattern preview
      const optionPreview = document.createElement('div');
      optionPreview.className = 'reflection-option-preview';
      
      // Always generate and show the actual pattern preview for this option
      this.createMiniCanvasPreview(optionPreview, opt, item);
      
      // Option label text
      const optionLabel = document.createElement('div');
      optionLabel.className = 'reflection-option-label-text';
      optionLabel.textContent = opt.label || `Select ${opt.id.toUpperCase()}`;
      
      // Assemble the card
      optionCard.appendChild(optionBadge);
      optionCard.appendChild(optionPreview);
      optionCard.appendChild(optionLabel);
      div.appendChild(optionCard);
      
      // Add click handler
      div.addEventListener('click', () => {
        if (div.style.pointerEvents !== 'none') {
          this.handleReflection(opt.id);
        }
      });
      div.style.pointerEvents = 'auto';
      this.el.reflectionOptions.appendChild(div);
    });
  }

  createMiniCanvasPreview(container, opt, item) {
    // Create a small canvas to show option preview
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = 120;
    miniCanvas.height = 90;
    miniCanvas.className = 'reflection-mini-canvas';
    const ctx = miniCanvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    
    // Generate pattern preview based on puzzle type and option
    const baseShapes = item.canvasData?.shapes || [];
    const puzzleType = item.puzzleType || 'pattern-completion';
    const correctAnswer = item.correctAnswer;
    const optionId = opt.id;
    
    // Generate shapes for this option based on puzzle type
    let shapesToDraw = this.generateOptionPattern(baseShapes, puzzleType, optionId, correctAnswer, miniCanvas.width, miniCanvas.height);
    
    if (shapesToDraw.length > 0) {
      // Scale shapes to fit mini canvas (from original 400x300 canvas)
      const scaleX = miniCanvas.width / 400;
      const scaleY = miniCanvas.height / 300;
      
      shapesToDraw.forEach((shape) => {
        ctx.fillStyle = shape.color || '#4A90E2';
        const x = shape.x * scaleX;
        const y = shape.y * scaleY;
        
        if (shape.type === 'circle') {
          ctx.beginPath();
          ctx.arc(x, y, (shape.r || 10) * Math.min(scaleX, scaleY), 0, Math.PI * 2);
          ctx.fill();
        } else if (shape.type === 'square') {
          const size = (shape.size || 16) * Math.min(scaleX, scaleY);
          ctx.fillRect(x - size/2, y - size/2, size, size);
        } else if (shape.type === 'triangle') {
          const size = (shape.size || 10) * Math.min(scaleX, scaleY);
          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size, y + size);
          ctx.lineTo(x + size, y + size);
          ctx.closePath();
          ctx.fill();
        }
      });
    } else {
      // Fallback: show base pattern
      const scaleX = miniCanvas.width / 400;
      const scaleY = miniCanvas.height / 300;
      baseShapes.forEach((shape) => {
        ctx.fillStyle = shape.color || '#4A90E2';
        const x = shape.x * scaleX;
        const y = shape.y * scaleY;
        
        if (shape.type === 'circle') {
          ctx.beginPath();
          ctx.arc(x, y, (shape.r || 10) * Math.min(scaleX, scaleY), 0, Math.PI * 2);
          ctx.fill();
        } else if (shape.type === 'square') {
          const size = (shape.size || 16) * Math.min(scaleX, scaleY);
          ctx.fillRect(x - size/2, y - size/2, size, size);
        } else if (shape.type === 'triangle') {
          const size = (shape.size || 10) * Math.min(scaleX, scaleY);
          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size, y + size);
          ctx.lineTo(x + size, y + size);
          ctx.closePath();
          ctx.fill();
        }
      });
    }
    
    container.appendChild(miniCanvas);
  }

  generateOptionPattern(baseShapes, puzzleType, optionId, correctAnswer, canvasWidth, canvasHeight) {
    // Generate pattern variations for each option based on puzzle type
    const shapes = JSON.parse(JSON.stringify(baseShapes)); // Deep copy
    
    switch (puzzleType) {
      case 'symmetry':
        // For symmetry puzzles, generate mirror images
        return shapes.map(shape => {
          const mirrored = { ...shape };
          if (optionId === 'a') {
            // Horizontal flip
            mirrored.x = canvasWidth - shape.x;
          } else if (optionId === 'b') {
            // Vertical flip (correct for most symmetry puzzles)
            mirrored.y = canvasHeight - shape.y;
          } else if (optionId === 'c') {
            // Both flips
            mirrored.x = canvasWidth - shape.x;
            mirrored.y = canvasHeight - shape.y;
          } else if (optionId === 'd') {
            // Rotated 180
            mirrored.x = canvasWidth - shape.x;
            mirrored.y = canvasHeight - shape.y;
            // Add rotation indicator
            mirrored.rotation = 180;
          }
          return mirrored;
        });
        
      case 'rotation':
        // For rotation puzzles, show rotated versions
        return shapes.map(shape => {
          const rotated = { ...shape };
          const centerX = canvasWidth / 2;
          const centerY = canvasHeight / 2;
          const angle = optionId === 'a' ? 90 : optionId === 'b' ? 180 : optionId === 'c' ? 270 : 0;
          const rad = (angle * Math.PI) / 180;
          const dx = shape.x - centerX;
          const dy = shape.y - centerY;
          rotated.x = centerX + dx * Math.cos(rad) - dy * Math.sin(rad);
          rotated.y = centerY + dx * Math.sin(rad) + dy * Math.cos(rad);
          rotated.rotation = angle;
          return rotated;
        });
        
      case 'sequence':
        // For sequence puzzles, add next element in pattern
        const newShapes = [...shapes];
        if (optionId === correctAnswer) {
          // Correct answer: continue the pattern
          const lastShape = shapes[shapes.length - 1];
          const newShape = {
            type: lastShape.type === 'circle' ? 'square' : 'circle',
            x: lastShape.x + 50,
            y: lastShape.y + 50,
            r: lastShape.r || 12,
            size: lastShape.size || 16,
            color: lastShape.color
          };
          newShapes.push(newShape);
        } else {
          // Wrong answers: different patterns
          const lastShape = shapes[shapes.length - 1];
          const newShape = {
            type: optionId === 'a' ? 'triangle' : optionId === 'b' ? 'square' : 'circle',
            x: lastShape.x + 50,
            y: lastShape.y + 50,
            r: lastShape.r || 12,
            size: lastShape.size || 16,
            color: optionId === 'a' ? '#FF6B35' : optionId === 'b' ? '#4A90E2' : '#2ECC71'
          };
          newShapes.push(newShape);
        }
        return newShapes;
        
      case 'pattern-completion':
      default:
        // For pattern completion, show variations
        if (optionId === correctAnswer) {
          // Correct: continue pattern logically
          const newShapes = [...shapes];
          const lastShape = shapes[shapes.length - 1];
          const newShape = {
            ...lastShape,
            x: lastShape.x + 40,
            y: lastShape.y + 40,
            color: lastShape.color
          };
          newShapes.push(newShape);
          return newShapes;
        } else {
          // Wrong: show different variations
          return shapes.map(shape => ({
            ...shape,
            color: optionId === 'a' ? '#FF6B35' : optionId === 'b' ? '#E74C3C' : '#9B59B6',
            x: shape.x + (optionId === 'a' ? 20 : optionId === 'b' ? -20 : 0),
            y: shape.y + (optionId === 'c' ? 20 : 0)
          }));
        }
    }
  }

  handleReflection(choice) {
    const st = this.state.reflection;
    const item = this.reflectionData[st.idx];
    
    // Disable all options to prevent multiple clicks
    document.querySelectorAll('.reflection-option-modern').forEach(opt => {
      opt.style.pointerEvents = 'none';
    });
    
    // Mark selected option
    const selectedOption = document.querySelector(`.reflection-option-modern[data-option-id="${choice}"]`);
    if (selectedOption) {
      selectedOption.classList.add('selected');
      if (choice === item.correctAnswer) {
        selectedOption.classList.add('correct');
        st.score += 25;
        st.correct += 1;
      } else {
        selectedOption.classList.add('incorrect');
        // Highlight correct answer
        setTimeout(() => {
          const correctOption = document.querySelector(`.reflection-option-modern[data-option-id="${item.correctAnswer}"]`);
          if (correctOption) {
            correctOption.classList.add('correct');
          }
        }, 500);
      }
    }
    
    this.updateScore(st.score);
    
    // Move to next question or finish
    setTimeout(() => {
      if (st.idx >= st.totalQuestions - 1) {
        this.finishMode();
      } else {
        st.idx += 1;
        this.renderReflection();
      }
    }, 2000);
  }

  async loadQuestions(mode) {
    try {
      const items = await this.api.fetchQuestions(mode);
      await this.store.cacheQuestions(mode, items);
      return items;
    } catch {
      const cached = await this.store.getCachedQuestions(mode);
      if (cached) return cached;
      return [];
    }
  }

  ensureQuestions(mode, data) {
    if (!Array.isArray(data) || data.length === 0) {
      this.exitMode();
      alert(`No questions found for ${mode}. Please add data or try again later.`);
      return false;
    }
    return true;
  }

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  showRules(mode, auto = false) {
    const rules = {
      technical: `
        <div style="margin-bottom: 1.5rem;">
          <strong>🎯 Objective:</strong> Answer multiple-choice questions correctly within the time limit.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>💯 Scoring:</strong> +10 points per correct answer. Instant feedback on selection.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>⏱ Timer:</strong> 60 seconds per question (soft guidance). Timer counts down but doesn't force submission.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>📋 Progress:</strong> 20 questions per session, no duplicates. Auto-advance after selection.
        </div>
        <div style="margin-bottom: 0;">
          <strong>💡 Tips:</strong> Quick decisions earn more time overall. Read questions carefully and trust your first instinct!
        </div>
      `,
      memory: `
        <div style="margin-bottom: 1.5rem;">
          <strong>🎯 Objective:</strong> Match all card pairs by flipping cards and finding matching pairs.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>💯 Scoring:</strong> +20 points per matched pair. Time bonus applied at completion (remaining seconds × 2). Efficiency bonus of +50 points for completing in under 30 moves.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>📋 Rules:</strong> Click two cards to flip them. If they match, they stay revealed. If they don't match, they flip back after 1 second. Continue until all pairs are matched.
        </div>
        <div style="margin-bottom: 0;">
          <strong>💡 Tips:</strong> Plan your flips strategically to minimize moves. Remember card positions to improve your efficiency and earn bonus points!
        </div>
      `,
      wordscramble: `
        <div style="margin-bottom: 1.5rem;">
          <strong>🎯 Objective:</strong> Unscramble the word using tiles or typing to form the correct word.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>💯 Scoring:</strong> +15 points on first attempt, +10 on second attempt, +5 on third attempt. Hint costs 5 points.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>⏱ Timer:</strong> 60 seconds soft guidance per word. Time bonus applied based on remaining seconds.
        </div>
        <div style="margin-bottom: 0;">
          <strong>💡 Tips:</strong> Use hints sparingly to maximize points. Tap tiles to build the word quickly and efficiently!
        </div>
      `,
      reflection: `
        <div style="margin-bottom: 1.5rem;">
          <strong>🎯 Objective:</strong> Solve visual logic puzzles by identifying patterns and selecting the correct option.
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>💯 Scoring:</strong> +25 points per correct puzzle. Time bonus applied at summary (remaining seconds × 2).
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong>📋 Rules:</strong> View the canvas puzzle, analyze the pattern, and select the best matching option from the choices.
        </div>
        <div style="margin-bottom: 0;">
          <strong>💡 Tips:</strong> Look for rotation, symmetry, and color cues. Patterns often follow logical sequences!
        </div>
      `,
    };
    this.el.rulesContent.innerHTML = rules[mode] || 'Review mode rules.';
    this.el.hideRulesToggle.checked = this.rulesHidden[mode] || false;
    this.el.hideRulesToggle.onchange = (e) => {
      this.rulesHidden[mode] = e.target.checked;
      localStorage.setItem('quizRulesHidden', JSON.stringify(this.rulesHidden));
    };
    this.openModal(this.el.rulesModal);
    if (auto) {
      // auto-close after 1.5s when auto-opened and already hidden
      setTimeout(() => this.closeModal(this.el.rulesModal), 1800);
    }
  }

  async finishMode() {
    if (!this.currentMode) return;
    this.stopTimers();
    const summary = this.buildSummary();
    if (summary?.html) {
      this.el.summaryContent.innerHTML = summary.html;
      
      // Show/hide Next Question button based on mode and remaining questions
      if (this.el.nextQuestionBtn) {
        if (this.currentMode === 'memory') {
          const st = this.state.memory;
          const hasMoreQuestions = st.questionIndex < st.totalQuestions - 1;
          if (hasMoreQuestions) {
            this.el.nextQuestionBtn.classList.remove('hidden');
          } else {
            this.el.nextQuestionBtn.classList.add('hidden');
          }
        } else if (this.currentMode === 'wordscramble') {
          const st = this.state.wordscramble;
          const hasMoreQuestions = st.idx < st.totalQuestions - 1;
          if (hasMoreQuestions) {
            this.el.nextQuestionBtn.classList.remove('hidden');
          } else {
            this.el.nextQuestionBtn.classList.add('hidden');
          }
        } else if (this.currentMode === 'reflection') {
          const st = this.state.reflection;
          const hasMoreQuestions = st.idx < st.totalQuestions - 1;
          if (hasMoreQuestions) {
            this.el.nextQuestionBtn.classList.remove('hidden');
          } else {
            this.el.nextQuestionBtn.classList.add('hidden');
          }
        } else if (this.currentMode === 'technical') {
          const st = this.state.technical;
          const hasMoreQuestions = st.index < st.totalQuestions - 1;
          if (hasMoreQuestions) {
            this.el.nextQuestionBtn.classList.remove('hidden');
          } else {
            this.el.nextQuestionBtn.classList.add('hidden');
          }
        } else {
          this.el.nextQuestionBtn.classList.add('hidden');
        }
      }
      
      this.openModal(this.el.summaryModal);
    }
    if (summary.entry) {
      try {
        await this.api.submitScore(summary.entry);
      } catch {
        await this.store.enqueueScore(summary.entry);
      }
    }
    this.updateLastPlayed();
  }

  buildSummary() {
    const user = this.user || { userId: 'local', userName: 'Player' };
    let entry = null;
    let html = '';
    switch (this.currentMode) {
      case 'technical': {
        const st = this.state.technical;
        if (!st.questions || st.questions.length === 0) return {};
        const total = st.questions.length;
        const incorrect = total - st.correct;
        const accuracy = total ? Math.round((st.correct / total) * 100) : 0;
        const performanceRating = accuracy >= 90 ? 'Excellent' : accuracy >= 70 ? 'Good' : accuracy >= 50 ? 'Average' : 'Needs Improvement';
        const performanceEmoji = accuracy >= 90 ? '🌟' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '📊' : '💪';
        const minutes = Math.floor(st.duration / 60);
        const seconds = st.duration % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        html = `
          <div class="summary-score-display">
            <div class="summary-score-value">${st.score}</div>
            <div class="summary-score-label">Total Score</div>
          </div>
          <div class="summary-stats-grid">
            <div class="summary-stat-card">
              <div class="summary-stat-icon">📝</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${total}</div>
                <div class="summary-stat-label">Questions</div>
              </div>
            </div>
            <div class="summary-stat-card success">
              <div class="summary-stat-icon">✅</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.correct}</div>
                <div class="summary-stat-label">Correct</div>
              </div>
            </div>
            <div class="summary-stat-card error">
              <div class="summary-stat-icon">❌</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${incorrect}</div>
                <div class="summary-stat-label">Wrong</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">⏱</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${timeStr}</div>
                <div class="summary-stat-label">Time</div>
              </div>
            </div>
          </div>
          <div class="summary-performance">
            <div class="summary-accuracy">
              <div class="accuracy-label">Accuracy</div>
              <div class="accuracy-value">${accuracy}%</div>
              <div class="accuracy-bar">
                <div class="accuracy-fill" style="width: ${accuracy}%"></div>
              </div>
            </div>
            <div class="summary-rating">
              <span class="rating-emoji">${performanceEmoji}</span>
              <span class="rating-text">${performanceRating}</span>
            </div>
          </div>
        `;
        entry = {
          userId: user.userId,
          userName: user.userName,
          mode: 'technical',
          score: st.score,
          questionsAttempted: total,
          correctAnswers: st.correct,
          accuracy,
          duration: st.duration,
          timestamp: new Date().toISOString(),
        };
        break;
      }
      case 'memory': {
        const st = this.state.memory;
        if (!st.cards || st.cards.length === 0) return {};
        const elapsed = Math.floor((Date.now() - st.startTs) / 1000);
        const accuracy = 100;
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        const efficiencyRating = st.moves < 20 ? 'Excellent' : st.moves < 30 ? 'Good' : st.moves < 40 ? 'Average' : 'Keep Practicing';
        const efficiencyEmoji = st.moves < 20 ? '🌟' : st.moves < 30 ? '👍' : st.moves < 40 ? '📊' : '💪';
        html = `
          <div class="summary-score-display">
            <div class="summary-score-value">${st.score}</div>
            <div class="summary-score-label">Total Score</div>
          </div>
          <div class="summary-stats-grid">
            <div class="summary-stat-card success">
              <div class="summary-stat-icon">✨</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.pairs}</div>
                <div class="summary-stat-label">Pairs Matched</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">🎯</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.moves}</div>
                <div class="summary-stat-label">Moves</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">⏱</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${timeStr}</div>
                <div class="summary-stat-label">Time</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">💯</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${accuracy}%</div>
                <div class="summary-stat-label">Accuracy</div>
              </div>
            </div>
          </div>
          <div class="summary-performance">
            <div class="summary-efficiency">
              <div class="efficiency-label">Efficiency Rating</div>
              <div class="efficiency-rating">
                <span class="rating-emoji">${efficiencyEmoji}</span>
                <span class="rating-text">${efficiencyRating}</span>
              </div>
            </div>
          </div>
        `;
        entry = {
          userId: user.userId,
          userName: user.userName,
          mode: 'memory',
          score: st.score,
          questionsAttempted: st.pairs,
          correctAnswers: st.pairs,
          accuracy,
          duration: elapsed,
          timestamp: new Date().toISOString(),
        };
        break;
      }
      case 'wordscramble': {
        const st = this.state.wordscramble;
        if (!this.scrambleData || this.scrambleData.length === 0) return {};
        const total = this.scrambleData.length;
        const accuracy = total ? Math.round((st.idx / total) * 100) : 0;
        const duration = st.duration || 0;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        const performanceRating = accuracy >= 90 ? 'Excellent' : accuracy >= 70 ? 'Good' : accuracy >= 50 ? 'Average' : 'Keep Practicing';
        const performanceEmoji = accuracy >= 90 ? '🌟' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '📊' : '💪';
        html = `
          <div class="summary-score-display">
            <div class="summary-score-value">${st.score}</div>
            <div class="summary-score-label">Total Score</div>
          </div>
          <div class="summary-stats-grid">
            <div class="summary-stat-card">
              <div class="summary-stat-icon">🔤</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.idx}/${total}</div>
                <div class="summary-stat-label">Words Solved</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">⏱</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${timeStr}</div>
                <div class="summary-stat-label">Time</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">💯</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${accuracy}%</div>
                <div class="summary-stat-label">Accuracy</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">🎯</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.attempts || 0}</div>
                <div class="summary-stat-label">Total Attempts</div>
              </div>
            </div>
          </div>
          <div class="summary-performance">
            <div class="summary-accuracy">
              <div class="accuracy-label">Accuracy</div>
              <div class="accuracy-value">${accuracy}%</div>
              <div class="accuracy-bar">
                <div class="accuracy-fill" style="width: ${accuracy}%"></div>
              </div>
            </div>
            <div class="summary-rating">
              <span class="rating-emoji">${performanceEmoji}</span>
              <span class="rating-text">${performanceRating}</span>
            </div>
          </div>
        `;
        entry = {
          userId: user.userId,
          userName: user.userName,
          mode: 'wordscramble',
          score: st.score,
          questionsAttempted: total,
          correctAnswers: st.idx,
          accuracy,
          duration,
          timestamp: new Date().toISOString(),
        };
        break;
      }
      case 'reflection': {
        const st = this.state.reflection;
        if (!this.reflectionData || this.reflectionData.length === 0) return {};
        const total = this.reflectionData.length;
        const duration = Math.floor((Date.now() - st.startTs) / 1000);
        const accuracy = total ? Math.round((st.correct / total) * 100) : 0;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        const performanceRating = accuracy >= 90 ? 'Excellent' : accuracy >= 70 ? 'Good' : accuracy >= 50 ? 'Average' : 'Keep Practicing';
        const performanceEmoji = accuracy >= 90 ? '🌟' : accuracy >= 70 ? '👍' : accuracy >= 50 ? '📊' : '💪';
        html = `
          <div class="summary-score-display">
            <div class="summary-score-value">${st.score}</div>
            <div class="summary-score-label">Total Score</div>
          </div>
          <div class="summary-stats-grid">
            <div class="summary-stat-card">
              <div class="summary-stat-icon">🪞</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${total}</div>
                <div class="summary-stat-label">Puzzles</div>
              </div>
            </div>
            <div class="summary-stat-card success">
              <div class="summary-stat-icon">✅</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${st.correct}</div>
                <div class="summary-stat-label">Correct</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">⏱</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${timeStr}</div>
                <div class="summary-stat-label">Time</div>
              </div>
            </div>
            <div class="summary-stat-card">
              <div class="summary-stat-icon">💯</div>
              <div class="summary-stat-content">
                <div class="summary-stat-value">${accuracy}%</div>
                <div class="summary-stat-label">Accuracy</div>
              </div>
            </div>
          </div>
          <div class="summary-performance">
            <div class="summary-accuracy">
              <div class="accuracy-label">Accuracy</div>
              <div class="accuracy-value">${accuracy}%</div>
              <div class="accuracy-bar">
                <div class="accuracy-fill" style="width: ${accuracy}%"></div>
              </div>
            </div>
            <div class="summary-rating">
              <span class="rating-emoji">${performanceEmoji}</span>
              <span class="rating-text">${performanceRating}</span>
            </div>
          </div>
        `;
        entry = {
          userId: user.userId,
          userName: user.userName,
          mode: 'reflection',
          score: st.score,
          questionsAttempted: total,
          correctAnswers: st.correct,
          accuracy,
          duration,
          timestamp: new Date().toISOString(),
        };
        break;
      }
    }
    return { html, entry };
  }

  exitMode() {
    this.stopTimers();
    this.el.playArea.classList.add('hidden');
    this.el.dashboard.classList.remove('hidden');
    Object.values(this.el.modePanels).forEach((p) => p.classList.add('hidden'));
    this.currentMode = null;
  }

  openModal(el) {
    el?.classList.remove('hidden');
  }
  closeModal(el) {
    el?.classList.add('hidden');
  }

  async toggleLeaderboard(show) {
    if (show) {
      this.el.leaderSection.classList.remove('hidden');
      await this.loadLeaderboard();
      this.el.leaderSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      this.el.leaderSection.classList.add('hidden');
    }
  }

  async loadLeaderboard() {
    const mode = this.el.leaderboardMode.value;
    const limit = this.el.leaderboardLimit.value;
    try {
      this.leaderRows = await this.api.getLeaderboard(mode, limit);
    } catch {
      this.leaderRows = [];
    }
    this.renderLeaderboard(this.leaderRows);
  }

  filterLeaderboard() {
    const term = (this.el.leaderboardSearch.value || '').toLowerCase();
    const filtered = (this.leaderRows || []).filter((r) => (r.userName || '').toLowerCase().includes(term));
    this.renderLeaderboard(filtered);
  }

  toggleSearchClear() {
    if (this.el.searchClearBtn) {
      const hasValue = this.el.leaderboardSearch.value.trim().length > 0;
      if (hasValue) {
        this.el.searchClearBtn.classList.add('visible');
      } else {
        this.el.searchClearBtn.classList.remove('visible');
      }
    }
  }

  renderLeaderboard(rows) {
    const tbody = this.el.leaderboardBody;
    tbody.innerHTML = '';
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem; color: #64748b;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
            <div style="font-weight: 600; margin-bottom: 0.5rem;">No scores yet</div>
            <div style="font-size: 0.9rem;">Be the first to play and appear on the leaderboard!</div>
          </td>
        </tr>
      `;
      return;
    }
    rows.forEach((row, idx) => {
      const rank = idx + 1;
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
      const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
      const mode = (row.mode || '').toLowerCase();
      const accuracy = row.accuracy != null ? parseFloat(row.accuracy) : null;
      let accuracyClass = 'average';
      let accuracyIcon = '📊';
      if (accuracy !== null) {
        if (accuracy >= 90) {
          accuracyClass = 'excellent';
          accuracyIcon = '⭐';
        } else if (accuracy >= 75) {
          accuracyClass = 'good';
          accuracyIcon = '✓';
        } else if (accuracy >= 50) {
          accuracyClass = 'average';
          accuracyIcon = '📊';
        } else {
          accuracyClass = 'poor';
          accuracyIcon = '⚠';
        }
      }
      const date = row.timestamp ? new Date(row.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rank-col">
          <span class="rank-badge ${rankClass}">
            ${rankIcon || rank}
          </span>
        </td>
        <td class="name-col">
          <strong>${this.escapeHtml(row.userName || 'Guest')}</strong>
        </td>
        <td class="mode-col">
          <span class="mode-badge ${mode}">${this.escapeHtml(mode)}</span>
        </td>
        <td class="score-col">${row.score || 0}</td>
        <td class="questions-col">${row.questionsAttempted || '-'}</td>
        <td class="accuracy-col">
          ${accuracy !== null ? `
            <span class="accuracy-badge ${accuracyClass}">
              <span>${accuracyIcon}</span>
              <span>${accuracy}%</span>
            </span>
          ` : '-'}
        </td>
        <td class="date-col">${date}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updateLastPlayed() {
    const now = new Date().toLocaleString();
    const span = document.querySelector(`[data-last="${this.currentMode}"]`);
    if (span) span.textContent = now;
  }
}

