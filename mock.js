/**
 * ═══════════════════════════════════════════════════════════════
 *  MOCK.JS — AGRIMETS Standalone Mock Test Engine
 *  Handles: data loading, category/test navigation, exam arena,
 *           timer, bubble navigator, scoring, results review.
 *  No Telegram, Firebase, or Grok dependencies.
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ── CONFIG ─────────────────────────────────────────────────────
const MOCK_SCHEDULE = [
  { catNorm: 'test series', unlockHour: 8 },
];
const SUNDAY_MEGA_COUNT = 100;
const SUNDAY_MEGA_HOUR  = 11;
const MOCK_TIMER_SECS   = 2400; // 40 minutes
const LS_MOCK_RESULTS   = 'dca_mock_results';
const LS_MOCK_DATA      = 'dca_mock_rows';
const LS_MOCK_TIME      = 'dca_mock_cache_time';

// ── EMOJI MAP ───────────────────────────────────────────────────
const CAT_EMOJI_MAP = [
  ['agronomy','🌾'],['soil','🌱'],['horticulture','🍎'],
  ['fishery','🐟'],['fish','🐟'],['forestry','🌲'],
  ['seed','🌰'],['animal','🐄'],['dairy','🥛'],
  ['poultry','🐓'],['icar','🏛'],['extension','📡'],
  ['economics','📈'],['economy','📈'],['afo','🏛'],
  ['mains','📝'],['pyq','📋'],['series','📋'],
  ['special','⭐'],['full','📝'],['agri','🌿'],
  ['sunday','📅'],['grand','🏆'],
];
function catEmoji(name) {
  const lower = name.toLowerCase();
  for (const [kw, em] of CAT_EMOJI_MAP) if (lower.includes(kw)) return em;
  return '📋';
}

// ── STATE ───────────────────────────────────────────────────────
const MockData = {
  allRows:           [],
  currentCategory:   null,
  testList:          [],
  currentTest:       null,
  questions:         [],
  currentIndex:      0,
  answers:           [],
  questionStatuses:  [],
  timerSecondsLeft:  MOCK_TIMER_SECS,
  timerInterval:     null,
  testSubmitted:     false,
  history:           [],
  countdownInterval: null,
  isPaused:          false,
  pauseStartedAt:    null,
};

// ── UTILS ───────────────────────────────────────────────────────
function ls_get(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(_) { return fallback; }
}
function ls_set(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(_) {}
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, duration = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

function confirm(msg, onOk) {
  const overlay = document.getElementById('confirm-overlay');
  const msgEl   = document.getElementById('confirm-msg');
  const okBtn   = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  if (!overlay) { if (window.confirm(msg)) onOk(); return; }
  msgEl.textContent = msg;
  overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  okBtn.onclick     = () => { close(); onOk(); };
  cancelBtn.onclick = close;
}

function secsUntilHour(h) {
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, 0, 0, 0);
  return t <= now ? 0 : Math.floor((t - now) / 1000);
}

function fmtCountdown(s) {
  if (s <= 0) return 'Unlocking…';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2,'0')}s`;
  return `${sec}s`;
}

function fmtMMSS(s) {
  const safe = Math.max(0, Math.floor(Number(s) || 0));
  const m = Math.floor(safe / 60).toString().padStart(2, '0');
  const sec = (safe % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function resetPauseUI() {
  const overlay = document.getElementById('mock-pause-overlay');
  const btn = document.getElementById('btn-mock-pause');
  MockData.isPaused = false;
  MockData.pauseStartedAt = null;
  if (overlay) overlay.classList.add('hidden');
  if (btn) btn.textContent = '⏸ Pause';
}

function setPause(paused) {
  if (!MockData.currentTest || MockData.testSubmitted) return;
  const overlay = document.getElementById('mock-pause-overlay');
  const btn = document.getElementById('btn-mock-pause');

  if (paused) {
    if (MockData.isPaused) return;
    MockData.isPaused = true;
    MockData.pauseStartedAt = Date.now();
    clearInterval(MockData.timerInterval);
    MockData.timerInterval = null;
    if (overlay) overlay.classList.remove('hidden');
    if (btn) btn.textContent = '▶ Resume';
    return;
  }

  if (!MockData.isPaused) return;
  resetPauseUI();
  clearInterval(MockData.timerInterval);
  MockData.timerInterval = setInterval(timerTick, 1000);
}

function confirmExitTest() {
  confirm('⚠️ Exit warning: Your current test progress will be lost.\nDo you want to exit?', () => goHome());
}

// ── DATA LOADING ────────────────────────────────────────────────
async function loadMockData() {
  if (MockData.allRows.length > 0) return;

  const normalise = raw => raw.map(r => {
    const n = {};
    Object.keys(r).forEach(k => { n[k.toLowerCase().trim()] = String(r[k] ?? '').trim(); });
    return n;
  });

  // 1) Try Google Sheets API first (Telegram app approach)
  // Spreadsheet ID used in your telegram app, sheet name 'sheet1'
  const SPREADSHEET_ID = '1x_SEEuZDey4XfoyYRDnrAN1eZcJ_d65PPDeLUWHRyGo';
  const SHEET_NAME = 'sheet1';
  
  try {
    const res = await fetch(`https://opensheet.elk.sh/${SPREADSHEET_ID}/${SHEET_NAME}`, { cache: 'no-store' });
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        MockData.allRows = normalise(raw);
        return;
      }
    }
  } catch(e) {
    console.warn('Google Sheets API failed. Falling back to mock-tests.json', e);
  }

  // 2) Fallback to local mock-tests.json
  try {
    const res = await fetch('./mock-tests.json', { cache: 'no-store' });
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        MockData.allRows = normalise(raw);
        return;
      }
    }
  } catch(_) {}

  throw new Error('Could not load mock-tests.json or Google Sheets API');
}

// ── NAVIGATION ──────────────────────────────────────────────────
function showView(id) {
  ['view-categories','view-tests'].forEach(v => {
    document.getElementById(v)?.classList.toggle('hidden', v !== id);
    document.getElementById(v)?.classList.toggle('active', v === id);
  });
}

function showArena() {
  document.getElementById('mock-arena').classList.remove('hidden');
  document.getElementById('mock-results').classList.add('hidden');
  document.getElementById('view-categories').classList.add('hidden');
  document.getElementById('view-tests').classList.add('hidden');
}

function showResults() {
  document.getElementById('mock-arena').classList.add('hidden');
  document.getElementById('mock-results').classList.remove('hidden');
}

function goHome() {
  clearInterval(MockData.timerInterval);
  clearInterval(MockData.countdownInterval);
  MockData.timerInterval = null;
  MockData.testSubmitted = true;
  resetPauseUI();
  document.getElementById('mock-arena').classList.add('hidden');
  document.getElementById('mock-results').classList.add('hidden');

  if (MockData.currentCategory) {
    openCategoryTests(MockData.currentCategory);
  } else {
    showView('view-categories');
  }
}

// ── DAILY UNLOCK LOGIC ──────────────────────────────────────────
function getDailyTestNo(catNorm, availableTestNos) {
  if (!availableTestNos || availableTestNos.length === 0) return null;

  const key      = 'dca_daily_' + catNorm.replace(/\s+/g,'_');
  const stored   = ls_get(key, { date: '', testNo: null, used: [] });
  const todayStr = today();

  if (stored.date === todayStr && stored.testNo) return stored.testNo;

  const sorted = availableTestNos.slice().sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    return !isNaN(na) && !isNaN(nb) ? na - nb : String(a).localeCompare(String(b));
  });

  const used = Array.isArray(stored.used) ? stored.used : [];
  const next = sorted.find(t => !used.includes(t));
  if (!next) return null;

  const newProgress = { date: todayStr, testNo: next, used: [...used, next] };
  ls_set(key, newProgress);
  return next;
}

function getDailyTestNoReadOnly(catNorm) {
  const key    = 'dca_daily_' + catNorm.replace(/\s+/g,'_');
  const stored = ls_get(key, { date: '', testNo: null, used: [] });
  if (stored.date === today() && stored.testNo) return stored.testNo;
  return null;
}

function getSundayMegaQuestions() {
  const usedKey = 'dca_sunday_used';
  const usedArr = ls_get(usedKey, []);
  const usedSet = new Set(usedArr);
  const pool = MockData.allRows.filter(r => !usedSet.has(r.id || r.question));
  const src  = pool.length >= SUNDAY_MEGA_COUNT ? pool : MockData.allRows;
  if (pool.length < SUNDAY_MEGA_COUNT) ls_set(usedKey, []);
  const chosen = shuffle([...src]).slice(0, SUNDAY_MEGA_COUNT);
  ls_set(usedKey, [...(pool.length >= SUNDAY_MEGA_COUNT ? usedArr : []), ...chosen.map(r => r.id || r.question)]);
  return chosen;
}

// ── CATEGORY SCREEN ─────────────────────────────────────────────
async function openCategories() {
  showView('view-categories');
  const listEl = document.getElementById('category-list');
  const subEl  = document.getElementById('cat-sub');
  listEl.innerHTML = '<div class="loading-state">⏳ Loading…</div>';

  try {
    await loadMockData();
  } catch(err) {
    listEl.innerHTML = `<div class="error-state">❌ Could not load tests.<br><small>Make sure mock-tests.json is in the same folder.</small></div>`;
    return;
  }

  // Build category map
  const countByNorm = {}, normToRaw = {}, testsByNorm = {};
  MockData.allRows.forEach(r => {
    const raw  = (r.category || 'Uncategorised').trim();
    const norm = raw.toLowerCase();
    countByNorm[norm] = (countByNorm[norm] || 0) + 1;
    if (!normToRaw[norm]) normToRaw[norm] = raw;
    if (!testsByNorm[norm]) testsByNorm[norm] = new Set();
    testsByNorm[norm].add(r.test_no || '1');
  });

  const cats = Object.keys(countByNorm)
    .sort((a, b) => a.localeCompare(b))
    .map(norm => ({
      key: normToRaw[norm], norm,
      count: countByNorm[norm],
      testNos: [...testsByNorm[norm]],
    }));

  if (subEl) subEl.textContent = `${cats.length} categories · ${MockData.allRows.length} questions`;

  renderCategories(cats);
  startCategoryCountdown(cats);
}

function renderCategories(cats) {
  const listEl = document.getElementById('category-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const hour = new Date().getHours();

  // ── Today's scheduled tests ──────────────────────────────────
  const schedItems = [];
  MOCK_SCHEDULE.forEach(cfg => {
    const cat = cats.find(c => c.norm === cfg.catNorm);
    if (!cat) return;
    const testNo = getDailyTestNo(cat.norm, cat.testNos);
    if (!testNo) return;
    const rows = MockData.allRows.filter(r =>
      (r.category || '').trim().toLowerCase() === cat.norm &&
      (r.test_no || '1') === testNo
    );
    if (rows.length === 0) return;
    const isUnlocked = hour >= cfg.unlockHour;
    const secsLeft   = secsUntilHour(cfg.unlockHour);
    schedItems.push({ cat, testNo, rows, isUnlocked, secsLeft, unlockHour: cfg.unlockHour });
  });

  // Sunday Mega
  const isSunday = new Date().getDay() === 0;
  const sundayLive = isSunday && hour >= SUNDAY_MEGA_HOUR;

  if (schedItems.length > 0 || isSunday) {
    listEl.appendChild(makeSectionLabel('📌 Today\'s Tests'));

    schedItems.forEach(item => {
      const label = `${item.cat.key} — Test ${item.testNo}`;
      const card = document.createElement('div');
      card.className = 'mock-sched-card' + (item.isUnlocked ? ' unlocked' : ' locked');
      card.innerHTML = `
        <div class="sched-badge">${item.isUnlocked ? '🟢' : '🔒'}</div>
        <div class="sched-info">
          <div class="sched-name">${escHtml(label)}</div>
          <div class="sched-meta">${item.rows.length} questions · −0.25 negative marking</div>
          ${item.isUnlocked
            ? '<div class="sched-live-label">Tap to start now!</div>'
            : `<div class="sched-countdown" data-unlock="${item.unlockHour}">Unlocks in ${fmtCountdown(item.secsLeft)}</div>`
          }
        </div>
        <span class="sched-arrow">${item.isUnlocked ? '›' : '⏳'}</span>`;
      if (item.isUnlocked) {
        card.addEventListener('click', () => {
          MockData.currentCategory = { ...item.cat };
          startMockTest({ testNo: item.testNo, name: label, questions: item.rows });
        });
      }
      listEl.appendChild(card);
    });

    // Sunday Mega
    const sundayCard = document.createElement('div');
    const sunSecsLeft = secsUntilHour(SUNDAY_MEGA_HOUR);
    sundayCard.className = 'mock-sched-card' + (sundayLive ? ' unlocked' : ' locked');
    if (isSunday) sundayCard.classList.add('sunday-highlight');
    sundayCard.innerHTML = `
      <div class="sched-badge">${sundayLive ? '🏆' : '🔒'}</div>
      <div class="sched-info">
        <div class="sched-name">Sunday Mega Test</div>
        <div class="sched-meta">${SUNDAY_MEGA_COUNT} random questions · All categories · −0.25</div>
        ${sundayLive
          ? '<div class="sched-live-label">LIVE — Tap to start!</div>'
          : `<div class="sched-countdown" data-unlock="${SUNDAY_MEGA_HOUR}">Unlocks in ${fmtCountdown(sunSecsLeft)}</div>`
        }
      </div>
      <span class="sched-arrow">${sundayLive ? '›' : '⏳'}</span>`;
    if (sundayLive) {
      sundayCard.addEventListener('click', () => {
        MockData.currentCategory = null;
        const qs = getSundayMegaQuestions();
        startMockTest({ testNo: 'Sunday', name: 'Sunday Mega Test', questions: qs });
      });
    }
    listEl.appendChild(sundayCard);
    listEl.appendChild(makeSectionLabel('📚 All Categories'));
  }

  // Grand Test
  const grandCard = document.createElement('div');
  grandCard.className = 'mock-cat-card grand';
  grandCard.style.setProperty('--i', 0);
  grandCard.innerHTML = `
    <div class="mock-cat-icon">🏆</div>
    <div class="mock-cat-info">
      <div class="mock-cat-name">Grand Test</div>
      <div class="mock-cat-meta">100 random questions from all categories · −0.25</div>
    </div>
    <span class="mock-cat-arrow">›</span>`;
  grandCard.addEventListener('click', () => {
    MockData.currentCategory = null;
    const pool = shuffle([...MockData.allRows]).slice(0, 100);
    startMockTest({ testNo: 'Grand', name: `Grand Test (${pool.length} Qs)`, questions: pool });
  });
  listEl.appendChild(grandCard);

  // All categories
  cats.forEach((cat, i) => {
    const card = document.createElement('div');
    const cls = cat.norm.includes('afo') ? 'cat-afo' : cat.norm.includes('test series') ? 'cat-test-series' : '';
    card.className = 'mock-cat-card ' + cls;
    card.style.setProperty('--i', i + 1);
    card.innerHTML = `
      <div class="mock-cat-icon">${catEmoji(cat.key)}</div>
      <div class="mock-cat-info">
        <div class="mock-cat-name">${escHtml(cat.key)}</div>
        <div class="mock-cat-meta">${cat.count} questions · ${cat.testNos.length} test${cat.testNos.length !== 1 ? 's' : ''}</div>
      </div>
      <span class="mock-cat-arrow">›</span>`;
    card.addEventListener('click', () => openCategoryTests(cat));
    listEl.appendChild(card);
  });
}

function makeSectionLabel(text) {
  const el = document.createElement('div');
  el.className = 'mock-section-label';
  el.textContent = text;
  return el;
}

function startCategoryCountdown(cats) {
  clearInterval(MockData.countdownInterval);
  MockData.countdownInterval = setInterval(() => {
    document.querySelectorAll('.sched-countdown[data-unlock]').forEach(el => {
      const h = parseInt(el.dataset.unlock);
      const s = secsUntilHour(h);
      if (s <= 0) {
        clearInterval(MockData.countdownInterval);
        openCategories();
        return;
      }
      el.textContent = `Unlocks in ${fmtCountdown(s)}`;
    });
  }, 1000);
}

// ── TEST LIST SCREEN ────────────────────────────────────────────
function openCategoryTests(cat) {
  MockData.currentCategory = { ...cat };
  showView('view-tests');

  const titleEl = document.getElementById('tests-title');
  const subEl   = document.getElementById('tests-sub');
  const listEl  = document.getElementById('test-list');
  if (titleEl) titleEl.textContent = cat.key;

  const rows = MockData.allRows.filter(r => {
    if ((r.category || 'Uncategorised').trim().toLowerCase() !== cat.norm) return false;
    return true;
  });

  // Build test list
  const groups = {};
  rows.forEach(r => {
    const t = r.test_no || '1';
    if (!groups[t]) groups[t] = [];
    groups[t].push(r);
  });

  MockData.testList = Object.entries(groups)
    .sort(([a],[b]) => { const na=parseFloat(a), nb=parseFloat(b); return !isNaN(na)&&!isNaN(nb)?na-nb:a.localeCompare(b); })
    .map(([testNo, questions]) => ({ testNo, name: `${cat.key} — ${testNo}`, questions }));

  if (subEl) subEl.textContent = `${MockData.testList.length} test${MockData.testList.length!==1?'s':''} available`;

  renderTestList();
}

const CARD_COLORS = ['mc-red','mc-orange','mc-amber','mc-green','mc-cyan','mc-blue','mc-purple'];
function renderTestList() {
  const listEl = document.getElementById('test-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  if (!MockData.testList || MockData.testList.length === 0) {
    listEl.innerHTML = `
      <div class="mock-empty-state">
        <div class="mock-empty-icon">📁</div>
        <div class="mock-empty-title">No tests available</div>
        <div class="mock-empty-sub">Check back later for new tests.</div>
      </div>`;
    return;
  }

  MockData.testList.forEach((test, i) => {
    const card = document.createElement('div');
    card.className = 'mock-test-card ' + (CARD_COLORS[i % CARD_COLORS.length] || '');
    card.style.setProperty('--i', i);
    card.innerHTML = `
      <div class="mock-test-num">${escHtml(test.testNo)}</div>
      <div class="mock-test-info">
        <div class="mock-test-name">${escHtml(test.name)}</div>
        <div class="mock-test-meta">${test.questions.length} questions · −0.25 negative marking</div>
      </div>
      <span class="mock-test-arrow">›</span>`;
    card.addEventListener('click', () => startMockTest(test));
    listEl.appendChild(card);
  });
}

// ── MOCK ARENA ──────────────────────────────────────────────────
function startMockTest(test) {
  MockData.currentTest      = test;
  MockData.questions        = shuffle([...test.questions]);
  MockData.currentIndex     = 0;
  MockData.history          = [];
  MockData.testSubmitted    = false;
  MockData.timerSecondsLeft = MOCK_TIMER_SECS;
  resetPauseUI();

  const n = MockData.questions.length;
  MockData.answers         = new Array(n).fill(null);
  MockData.questionStatuses = new Array(n).fill('unattempted');

  const testLabel  = document.getElementById('mock-test-label');
  const resultName = document.getElementById('mock-result-testname');
  if (testLabel)  testLabel.textContent  = test.name;
  if (resultName) resultName.textContent = test.name;

  showArena();
  renderQBubbles();
  updateTimerUI();
  clearInterval(MockData.timerInterval);
  MockData.timerInterval = setInterval(timerTick, 1000);
  loadQuestion();
}

function loadQuestion() {
  const q = MockData.questions[MockData.currentIndex];
  if (!q) { submitMockTest(); return; }

  const scrollEl = document.getElementById('mock-question-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;

  const idx   = MockData.currentIndex;
  const total = MockData.questions.length;

  document.getElementById('mock-progress').textContent = `Q ${idx + 1} / ${total}`;
  highlightBubble(idx);

  const prevBtn = document.getElementById('btn-mock-prev');
  const nextBtn = document.getElementById('btn-mock-next');
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.textContent = idx === total - 1 ? 'Review & Submit ›' : 'Next ›';

  const hintEl = document.getElementById('mock-nav-hint');
  if (hintEl) {
    const st = MockData.questionStatuses[idx];
    hintEl.textContent = st === 'answered' ? 'Selected — change any time' :
      st === 'skipped' ? 'Skipped' : st === 'review' ? '🟡 Marked for review' : 'Tap an option to answer';
  }

  // Render question
  const mqEl = document.getElementById('mock-q-text');
  const qBox = document.querySelector('.mock-question-box');
  if (qBox) { qBox.classList.remove('mock-q-animate'); void qBox.offsetWidth; qBox.classList.add('mock-q-animate'); }
  if (mqEl) {
    const rawQ = (q.question || '').replace(/\r/g, '').trim();
    if (rawQ.includes('★')) {
      const lines = rawQ.split('\n').map(l => l.trim()).filter(Boolean);
      mqEl.innerHTML = lines.map(line =>
        line.startsWith('★')
          ? `<div class="mock-bullet-line"><span class="mock-bullet-star">★</span><span class="mock-bullet-text">${escHtml(line.slice(1).trim())}</span></div>`
          : `<div class="mock-q-label">${escHtml(line)}</div>`
      ).join('');
    } else {
      mqEl.textContent = rawQ.replace(/\n+/g, ' ');
    }
  }

  // Render options
  const selectedText = MockData.answers[idx];
  let visibleOptIdx = 0;
  ['a','b','c','d','e'].forEach(o => {
    const btn  = document.getElementById('opt-' + o);
    if (!btn) return;
    const text = q['opt_' + o] || '';
    btn.textContent = text;
    btn.className   = 'mock-opt';
    btn.disabled    = false;
    btn.style.display = text ? '' : 'none';
    if (text) {
      btn.style.setProperty('--oi', visibleOptIdx);
      btn.classList.add('mock-opt-enter');
      visibleOptIdx++;
    }
    if (text && selectedText && text.trim() === selectedText.trim()) {
      btn.classList.add('mock-opt-selected');
    }
    btn.onclick = text ? () => handleAnswer(text, q.answer, idx) : null;
  });
}

function handleAnswer(selectedText, correctText, idx) {
  // Toggle off if already selected
  if (MockData.answers[idx] != null && MockData.answers[idx].trim() === selectedText.trim()) {
    MockData.answers[idx] = null;
    if (MockData.questionStatuses[idx] !== 'review') MockData.questionStatuses[idx] = 'unattempted';
    updateBubble(idx);
    document.querySelectorAll('.mock-opt').forEach(b => b.className = 'mock-opt');
    const hintEl = document.getElementById('mock-nav-hint');
    if (hintEl) hintEl.textContent = MockData.questionStatuses[idx] === 'review' ? '🟡 Marked for review' : 'Tap an option to answer';
    return;
  }

  MockData.answers[idx] = selectedText;
  if (MockData.questionStatuses[idx] !== 'review') MockData.questionStatuses[idx] = 'answered';
  updateBubble(idx);

  document.querySelectorAll('.mock-opt').forEach(btn => {
    btn.className = 'mock-opt';
    if (btn.textContent.trim() === selectedText.trim()) btn.classList.add('mock-opt-selected');
  });

  const hintEl = document.getElementById('mock-nav-hint');
  if (hintEl) hintEl.textContent = MockData.questionStatuses[idx] === 'review' ? '🟡 Marked for review' : 'Selected — change any time';
}

function markIfUnanswered(idx) {
  if (MockData.questionStatuses[idx] === 'unattempted') {
    MockData.questionStatuses[idx] = 'skipped';
    updateBubble(idx);
  }
}

function findNextQuestion(fromIdx) {
  const total = MockData.questions.length;
  for (let i = fromIdx + 1; i < total; i++) if (MockData.questionStatuses[i] === 'unattempted') return i;
  for (let i = 0; i < fromIdx; i++) if (MockData.questionStatuses[i] === 'unattempted') return i;
  return Math.min(fromIdx + 1, total - 1);
}

// ── BUBBLES ─────────────────────────────────────────────────────
function renderQBubbles() {
  const row = document.getElementById('mock-bubble-row');
  if (!row) return;
  row.innerHTML = '';
  MockData.questions.forEach((_, i) => {
    const b = document.createElement('button');
    b.className   = 'q-bubble q-bubble-unattempted';
    b.id          = 'qb-' + i;
    b.textContent = i + 1;
    b.setAttribute('aria-label', 'Go to question ' + (i + 1));
    b.addEventListener('click', () => {
      markIfUnanswered(MockData.currentIndex);
      MockData.currentIndex = i;
      loadQuestion();
    });
    row.appendChild(b);
  });
  highlightBubble(0);
  updateStatusIndicators();
}

function updateBubble(idx) {
  const b = document.getElementById('qb-' + idx);
  if (!b) return;
  b.className = 'q-bubble q-bubble-' + (MockData.questionStatuses[idx] || 'unattempted');
  updateStatusIndicators();
}

function highlightBubble(idx) {
  document.querySelectorAll('.q-bubble').forEach(b => b.classList.remove('q-bubble-current'));
  const cur = document.getElementById('qb-' + idx);
  if (cur) { cur.classList.add('q-bubble-current'); cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
}

function updateStatusIndicators() {
  const s = MockData.questionStatuses || [];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ind-answered',    s.filter(x => x === 'answered').length);
  set('ind-review',      s.filter(x => x === 'review').length);
  set('ind-skipped',     s.filter(x => x === 'skipped').length);
  set('ind-unattempted', s.filter(x => x === 'unattempted').length);
}

// ── TIMER ────────────────────────────────────────────────────────
function updateTimerUI() {
  const el = document.getElementById('mock-arena-timer');
  if (!el) return;
  const s = MockData.timerSecondsLeft;
  el.textContent = `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  el.classList.toggle('mock-timer-urgent', s <= 300);
}

function timerTick() {
  if (MockData.isPaused) return;
  if (MockData.timerSecondsLeft <= 0) {
    clearInterval(MockData.timerInterval);
    showToast('⏱ Time up! Auto-submitting…', 2500);
    setTimeout(submitMockTest, 800);
    return;
  }
  MockData.timerSecondsLeft--;
  updateTimerUI();
  if (MockData.timerSecondsLeft === 300) showToast('⚠️ 5 minutes left!', 2500);
  else if (MockData.timerSecondsLeft === 60) showToast('⏱ 1 minute remaining!', 2000);
}

// ── SUBMIT ───────────────────────────────────────────────────────
function confirmAndSubmit() {
  const unanswered = MockData.questionStatuses.filter(s => s === 'unattempted' || s === 'skipped').length;
  const msg = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered!==1?'s':''}.\nSubmit anyway?`
    : 'Submit the test now?';
  confirm(msg, () => submitMockTest());
}

function submitMockTest() {
  clearInterval(MockData.timerInterval);
  resetPauseUI();
  finishMock();
}

function finishMock() {
  if (MockData.testSubmitted) return;
  MockData.testSubmitted = true;

  MockData.history = MockData.questions.map((q, i) => {
    const selected = MockData.answers[i];
    const correct  = q.answer || '';
    const status   = MockData.questionStatuses[i];
    const opts     = { a:q.opt_a||'', b:q.opt_b||'', c:q.opt_c||'', d:q.opt_d||'', e:q.opt_e||'' };
    const isSkipped = status === 'skipped' || (!selected && status !== 'answered' && status !== 'review');
    if (isSkipped) return { id:q.id, question:q.question, selected:'Skipped', correct, status:'skipped', opts };
    const isCorrect = (selected||'').trim() === correct.trim();
    return { id:q.id, question:q.question, selected:selected||'Skipped', correct, status:selected?(isCorrect?'correct':'wrong'):'skipped', opts };
  });

  let c = 0, w = 0, s = 0;
  MockData.history.forEach(h => { if(h.status==='correct')c++; else if(h.status==='wrong')w++; else s++; });

  const score = c - (w * 0.25);
  const total = MockData.questions.length;
  const attempted = c + w;
  const accuracy = attempted > 0 ? (c / attempted) * 100 : 0;
  const scorePct = total > 0 ? (score / total) * 100 : 0;
  const timeTakenSec = Math.max(0, MOCK_TIMER_SECS - MockData.timerSecondsLeft);
  const avgTimePerQ = total > 0 ? timeTakenSec / total : 0;

  document.getElementById('mock-final-score').textContent = score.toFixed(2);
  document.getElementById('count-correct').textContent    = c;
  document.getElementById('count-wrong').textContent      = w;
  document.getElementById('count-skip').textContent       = s;
  document.getElementById('pts-correct').textContent      = c.toFixed(2);
  document.getElementById('pts-wrong').textContent        = (w * 0.25).toFixed(2);

  const band = scorePct >= 75 ? 'Excellent'
    : scorePct >= 60 ? 'Strong'
    : scorePct >= 45 ? 'Average'
    : 'Needs improvement';

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('analysis-attempted', `${attempted} / ${total}`);
  setText('analysis-accuracy', `${accuracy.toFixed(1)}%`);
  setText('analysis-score-pct', `${scorePct.toFixed(1)}%`);
  setText('analysis-time-taken', fmtMMSS(timeTakenSec));
  setText('analysis-avg-time', `${Math.round(avgTimePerQ)}s`);
  setText('analysis-band', band);

  saveMockResult(c, w, s, score, {
    attempted,
    accuracy: Number(accuracy.toFixed(2)),
    scorePct: Number(scorePct.toFixed(2)),
    timeTakenSec,
    avgTimePerQ: Number(avgTimePerQ.toFixed(2)),
    band,
  });

  document.querySelectorAll('.rev-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.rev-btn[data-filter="all"]')?.classList.add('active');

  showResults();
  renderReview('all');
}

function saveMockResult(correct, wrong, skipped, score, profile = {}) {
  try {
    let results  = ls_get(LS_MOCK_RESULTS, []);
    const testName = (MockData.currentTest?.name || 'Mock Test').trim();
    const testNo   = MockData.currentTest?.testNo || null;
    const category = (MockData.currentCategory?.name || MockData.currentCategory?.key || '').trim();
    const entry = {
      testName, testNo, category, ts: Date.now(),
      score, total: MockData.questions.length, correct, wrong, skipped,
      ...profile
    };
    const nameKey = testName.toLowerCase();
    results = results.filter(r => (r.testName || '').trim().toLowerCase() !== nameKey);
    results.unshift(entry);
    ls_set(LS_MOCK_RESULTS, results.slice(0, 200));
  } catch(_) {}
}

// ── REVIEW ───────────────────────────────────────────────────────
function renderReview(filter) {
  const list = document.getElementById('mock-review-list');
  if (!list) return;
  list.innerHTML = '';

  const data = filter === 'all' ? MockData.history : MockData.history.filter(h => h.status === filter);
  if (!data.length) {
    list.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">No items here</p>`;
    return;
  }

  data.forEach((h, ri) => {
    const div = document.createElement('div');
    div.className = `review-item ${h.status}`;
    div.style.setProperty('--ri', ri);

    let ansHtml = '';
    if (h.status === 'correct') {
      ansHtml = `<div class="rev-ans-clean"><div class="rev-ans-tag rev-correct-tag">✓ ${escHtml(h.correct)}</div></div>`;
    } else if (h.status === 'wrong') {
      ansHtml = `<div class="rev-ans-clean">
        <div class="rev-ans-tag rev-wrong-tag">✗ Your answer: ${escHtml(h.selected)}</div>
        <div class="rev-ans-tag rev-correct-tag">✓ Correct: ${escHtml(h.correct)}</div>
      </div>`;
    } else {
      ansHtml = `<div class="rev-ans-clean"><div class="rev-ans-tag rev-correct-tag">✓ ${escHtml(h.correct)}</div></div>`;
    }

    div.innerHTML = `<div class="rev-q">${escHtml(h.question)}</div>${ansHtml}`;
    list.appendChild(div);
  });
}

// ── FONT SCALE ───────────────────────────────────────────────────
let fontScale = parseFloat(ls_get('dca_font_scale', 1));
function applyFontScale() {
  document.documentElement.style.setProperty('--card-font-scale', fontScale);
  ls_set('dca_font_scale', fontScale);
}
applyFontScale();

// ── URL PARAM ROUTING ────────────────────────────────────────────
function routeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('cat');
  if (cat) {
    // Pre-select category after data loads
    loadMockData().then(() => {
      const countByNorm = {}, normToRaw = {}, testsByNorm = {};
      MockData.allRows.forEach(r => {
        const raw  = (r.category || 'Uncategorised').trim();
        const norm = raw.toLowerCase();
        countByNorm[norm] = (countByNorm[norm] || 0) + 1;
        if (!normToRaw[norm]) normToRaw[norm] = raw;
        if (!testsByNorm[norm]) testsByNorm[norm] = new Set();
        testsByNorm[norm].add(r.test_no || '1');
      });

      const slug = cat.toLowerCase();
      const normKey = Object.keys(normToRaw).find(n =>
        n.replace(/\s+/g,'-') === slug || n === slug.replace(/-/g,' ')
      );

      if (normKey) {
        const catObj = { key: normToRaw[normKey], norm: normKey, count: countByNorm[normKey], testNos: [...testsByNorm[normKey]] };
        openCategories().then(() => openCategoryTests(catObj));
      } else {
        openCategories();
      }
    }).catch(() => openCategories());
  } else {
    openCategories();
  }
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Font scale buttons
  document.querySelector('.font-btn-up')?.addEventListener('click', () => {
    fontScale = Math.min(1.5, fontScale + 0.1);
    applyFontScale();
  });
  document.querySelector('.font-btn-down')?.addEventListener('click', () => {
    fontScale = Math.max(0.75, fontScale - 0.1);
    applyFontScale();
  });

  // Back button: tests → categories
  document.getElementById('btn-tests-back')?.addEventListener('click', () => {
    clearInterval(MockData.countdownInterval);
    MockData.currentCategory = null;
    openCategories();
  });

  // Arena: exit / prev / next / skip / review / submit
  document.getElementById('btn-mock-exit')?.addEventListener('click', () => {
    confirmExitTest();
  });

  document.getElementById('btn-mock-pause')?.addEventListener('click', () => {
    setPause(!MockData.isPaused);
  });

  document.getElementById('btn-mock-resume')?.addEventListener('click', () => {
    setPause(false);
  });

  document.getElementById('btn-mock-exit-from-pause')?.addEventListener('click', () => {
    confirmExitTest();
  });

  document.getElementById('btn-mock-prev')?.addEventListener('click', () => {
    if (MockData.currentIndex > 0) {
      markIfUnanswered(MockData.currentIndex);
      MockData.currentIndex--;
      loadQuestion();
    }
  });

  document.getElementById('btn-mock-next')?.addEventListener('click', () => {
    const idx = MockData.currentIndex;
    if (idx < MockData.questions.length - 1) {
      markIfUnanswered(idx);
      MockData.currentIndex++;
      loadQuestion();
    } else {
      confirmAndSubmit();
    }
  });

  document.getElementById('btn-mock-skip')?.addEventListener('click', () => {
    const idx = MockData.currentIndex;
    MockData.questionStatuses[idx] = 'skipped';
    MockData.answers[idx] = null;
    updateBubble(idx);
    showToast('⏭ Skipped', 1200);
    const next = findNextQuestion(idx);
    MockData.currentIndex = next;
    loadQuestion();
  });

  document.getElementById('btn-mock-review')?.addEventListener('click', () => {
    const idx = MockData.currentIndex;
    const hasAnswer = MockData.answers[idx] != null;
    MockData.questionStatuses[idx] = hasAnswer ? 'review' : 'skipped';
    updateBubble(idx);
    showToast(hasAnswer ? '🟡 Marked for review' : '⏭ Skipped', 1200);
    const next = findNextQuestion(idx);
    MockData.currentIndex = next;
    loadQuestion();
  });

  document.getElementById('btn-mock-submit')?.addEventListener('click', () => {
    confirmAndSubmit();
  });

  // Results: home
  document.getElementById('btn-mock-home')?.addEventListener('click', () => {
    goHome();
  });

  // Review filter buttons
  document.querySelectorAll('.rev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rev-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderReview(btn.dataset.filter);
    });
  });

  // Start
  routeFromURL();
});
