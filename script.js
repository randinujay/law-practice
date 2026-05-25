/* ═══════════════════════════════════════════════════════════
   SLC Entrance Past Paper Practice — Script
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── Constants ─── */
const SUBJECTS = ['IQ', 'GK'];
const YEARS    = [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];

function getPaperConfig(year) {
  return year >= 2023
    ? { questions: 50, seconds: 3600 }          // 1 hr
    : { questions: 60, seconds: 5400 };          // 1.5 hr
}

const LS = {
  SESSION: 'slc_session',
  HISTORY: 'slc_history',
};

/* ─── State ─── */
let state = {
  subject: 'IQ',
  year: 2024,
  // paper
  answers: [],          // string[]
  started: false,
  paused: false,
  startTime: null,      // epoch ms when paper started (adjusted for pauses)
  pausedAt: null,       // epoch ms when paused
  totalPausedMs: 0,     // accumulated pause ms
  // marks
  marks: [],            // 0=unmarked 1=correct -1=incorrect
};

/* ─── Screen Router ─── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

/* ═══════════════════════════════ HOME ═══════════════════════════════ */

function initHome() {
  // Subject pills
  const pills = document.querySelectorAll('#subject-pills .pill');
  pills.forEach(p => {
    p.addEventListener('click', () => {
      pills.forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      state.subject = p.dataset.value;
      updateHomeInfo();
      checkResume();
    });
  });

  // Year grid
  const grid = document.getElementById('year-grid');
  grid.innerHTML = '';
  YEARS.forEach(y => {
    const btn = document.createElement('button');
    btn.className = 'year-btn' + (y === state.year ? ' active' : '');
    btn.textContent = y;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.year-btn').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      state.year = y;
      updateHomeInfo();
      checkResume();
    });
    grid.appendChild(btn);
  });

  updateHomeInfo();
  checkResume();

  document.getElementById('btn-start').addEventListener('click', onStartPaper);
  document.getElementById('btn-history').addEventListener('click', showHistory);
}

function updateHomeInfo() {
  const cfg = getPaperConfig(state.year);
  document.getElementById('info-questions').textContent = cfg.questions;
  const h = Math.floor(cfg.seconds / 3600);
  const m = (cfg.seconds % 3600) / 60;
  document.getElementById('info-duration').textContent =
    h ? `${h} hr ${m ? m + ' min' : ''}` : `${m} min`;
}

function checkResume() {
  const raw = localStorage.getItem(LS.SESSION);
  const row  = document.getElementById('info-resume-row');
  if (!raw) { row.style.display = 'none'; return; }
  try {
    const sess = JSON.parse(raw);
    if (sess.subject === state.subject && sess.year === state.year) {
      row.style.display = 'flex';
    } else {
      row.style.display = 'none';
    }
  } catch { row.style.display = 'none'; }
}

function onStartPaper() {
  const raw = localStorage.getItem(LS.SESSION);
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      if (sess.subject === state.subject && sess.year === state.year) {
        resumePaper(sess);
        return;
      }
    } catch {}
  }
  startFreshPaper();
}

/* ═══════════════════════════════ PAPER ═══════════════════════════════ */

let timerInterval = null;

function startFreshPaper() {
  const cfg = getPaperConfig(state.year);
  state.answers        = Array(cfg.questions).fill('');
  state.started        = true;
  state.paused         = false;
  state.startTime      = Date.now();
  state.pausedAt       = null;
  state.totalPausedMs  = 0;
  state.marks          = Array(cfg.questions).fill(0);

  renderPaper();
  saveSession();
  showScreen('screen-paper');
  startTimer();
}

function resumePaper(sess) {
  state.subject       = sess.subject;
  state.year          = sess.year;
  state.answers       = sess.answers;
  state.startTime     = sess.startTime;
  state.totalPausedMs = sess.totalPausedMs;
  state.paused        = false;
  state.pausedAt      = null;
  state.marks         = sess.marks || Array(sess.answers.length).fill(0);

  renderPaper();
  showScreen('screen-paper');
  startTimer();
}

function renderPaper() {
  const cfg = getPaperConfig(state.year);

  document.getElementById('ph-subject').textContent = state.subject;
  document.getElementById('ph-year').textContent    = state.year;

  const list = document.getElementById('questions-list');
  list.innerHTML = '';

  for (let i = 0; i < cfg.questions; i++) {
    const div = document.createElement('div');
    div.className = 'question-item' + (state.answers[i] ? ' has-answer' : '');
    div.id = `qi-${i}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'q-num';
    numSpan.textContent = i + 1;

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'q-input';
    input.placeholder = 'Your answer…';
    input.value       = state.answers[i] || '';
    input.autocomplete = 'off';
    input.autocorrect  = 'off';
    input.autocapitalize = 'off';
    input.spellcheck   = false;

    input.addEventListener('input', () => {
      state.answers[i] = input.value;
      div.classList.toggle('has-answer', !!input.value);
      updateProgress();
      updateNavGrid();
      saveSession();
    });

    div.appendChild(numSpan);
    div.appendChild(input);
    list.appendChild(div);
  }

  updateProgress();
  renderNavGrid();

  document.getElementById('btn-pause-resume').onclick = togglePause;
  document.getElementById('btn-complete').onclick     = completePaper;
  document.getElementById('nav-fab-toggle').onclick   = openNavDrawer;
  document.getElementById('nav-close').onclick        = closeNavDrawer;
  document.getElementById('nav-overlay').onclick      = closeNavDrawer;
}

function updateProgress() {
  const total     = state.answers.length;
  const answered  = state.answers.filter(a => a.trim() !== '').length;
  document.getElementById('ph-progress-text').textContent = `${answered} / ${total}`;
  document.getElementById('progress-bar-fill').style.width = `${(answered / total) * 100}%`;
}

/* ─── Timer ─── */
function startTimer() {
  clearInterval(timerInterval);
  renderTimer();
  timerInterval = setInterval(renderTimer, 1000);
}

function renderTimer() {
  const cfg       = getPaperConfig(state.year);
  const elapsed   = elapsedMs();
  const remaining = cfg.seconds * 1000 - elapsed;

  const display = document.getElementById('timer-display');

  if (remaining >= 0) {
    display.className  = 'timer-normal';
    display.textContent = formatMs(remaining);
  } else {
    display.className  = 'timer-overtime';
    display.textContent = '−' + formatMs(-remaining);
  }
}

function elapsedMs() {
  if (!state.startTime) return 0;
  const now = state.paused ? (state.pausedAt || Date.now()) : Date.now();
  return (now - state.startTime) - state.totalPausedMs;
}

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function togglePause() {
  const btn = document.getElementById('btn-pause-resume');
  if (!state.paused) {
    state.paused  = true;
    state.pausedAt = Date.now();
    btn.textContent = '▶';
    clearInterval(timerInterval);
  } else {
    state.totalPausedMs += Date.now() - (state.pausedAt || Date.now());
    state.paused   = false;
    state.pausedAt = null;
    btn.textContent = '⏸';
    startTimer();
  }
  saveSession();
}

/* ─── Navigator ─── */
function renderNavGrid() {
  const grid = document.getElementById('nav-grid');
  grid.innerHTML = '';
  state.answers.forEach((ans, i) => {
    const cell = document.createElement('button');
    cell.className = 'nav-cell' + (ans.trim() ? ' answered' : '');
    cell.textContent = i + 1;
    cell.addEventListener('click', () => {
      closeNavDrawer();
      setTimeout(() => {
        const el = document.getElementById(`qi-${i}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    });
    grid.appendChild(cell);
  });
}

function updateNavGrid() {
  const cells = document.querySelectorAll('.nav-cell');
  cells.forEach((cell, i) => {
    cell.classList.toggle('answered', !!state.answers[i]?.trim());
  });
}

function openNavDrawer() {
  renderNavGrid();
  document.getElementById('nav-drawer').classList.add('open');
  document.getElementById('nav-overlay').classList.add('open');
}
function closeNavDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('open');
}

/* ─── Session persistence ─── */
function saveSession() {
  const sess = {
    subject:       state.subject,
    year:          state.year,
    answers:       state.answers,
    startTime:     state.startTime,
    totalPausedMs: state.totalPausedMs,
    marks:         state.marks,
  };
  localStorage.setItem(LS.SESSION, JSON.stringify(sess));
}

function clearSession() {
  localStorage.removeItem(LS.SESSION);
}

/* ─── Complete Paper ─── */
function completePaper() {
  clearInterval(timerInterval);
  // Snapshot elapsed before anything changes
  state._elapsedAtComplete = elapsedMs();
  clearSession();
  renderMarkingScreen();
  showScreen('screen-marking');
}

/* ═══════════════════════════════ MARKING ═══════════════════════════════ */

function renderMarkingScreen() {
  document.getElementById('marking-meta').textContent =
    `${state.subject} · ${state.year}`;

  state.marks = Array(state.answers.length).fill(0);

  const list = document.getElementById('marking-list');
  list.innerHTML = '';

  state.answers.forEach((ans, i) => {
    const div = document.createElement('div');
    div.className = 'mark-item';
    div.id = `mi-${i}`;

    const numSpan = document.createElement('span');
    numSpan.className = 'mark-num';
    numSpan.textContent = i + 1;

    const ansSpan = document.createElement('span');
    ansSpan.className = 'mark-answer' + (ans.trim() ? ' has-text' : '');
    ansSpan.textContent = ans.trim() || '(no answer)';

    const statusSpan = document.createElement('span');
    statusSpan.className = 'mark-status';
    statusSpan.textContent = '○';
    statusSpan.id = `ms-${i}`;

    div.appendChild(numSpan);
    div.appendChild(ansSpan);
    div.appendChild(statusSpan);

    // Tap logic
    let tapCount = 0;
    let tapTimer = null;

    div.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        if (tapCount === 1)      applyMark(i, 1);   // correct
        else if (tapCount === 2) applyMark(i, -1);  // incorrect
        else                     applyMark(i, 0);   // reset
        tapCount = 0;
      }, 280);
    });

    list.appendChild(div);
  });

  updateMarkingSummary();

  document.getElementById('btn-marking-done').onclick = finishMarking;
}

function applyMark(i, val) {
  state.marks[i] = val;
  const div = document.getElementById(`mi-${i}`);
  const statusSpan = document.getElementById(`ms-${i}`);
  div.classList.remove('state-correct', 'state-incorrect');

  if (val === 1) {
    div.classList.add('state-correct');
    statusSpan.textContent = '✓';
  } else if (val === -1) {
    div.classList.add('state-incorrect');
    statusSpan.textContent = '✗';
  } else {
    statusSpan.textContent = '○';
  }

  updateMarkingSummary();
}

function updateMarkingSummary() {
  const correct   = state.marks.filter(m => m === 1).length;
  const incorrect = state.marks.filter(m => m === -1).length;
  const unmarked  = state.marks.filter(m => m === 0).length;

  document.getElementById('ms-correct').textContent   = correct;
  document.getElementById('ms-incorrect').textContent = incorrect;
  document.getElementById('ms-unmarked').textContent  = unmarked;
}

function finishMarking() {
  showResults();
}

/* ═══════════════════════════════ RESULTS ═══════════════════════════════ */

function showResults() {
  const total     = state.marks.length;
  const correct   = state.marks.filter(m => m === 1).length;
  const incorrect = state.marks.filter(m => m === -1).length;
  const unmarked  = state.marks.filter(m => m === 0).length;
  const pct       = total > 0 ? Math.round((correct / total) * 100) : 0;

  const cfg       = getPaperConfig(state.year);
  const elapsed   = state._elapsedAtComplete || 0;
  const overtime  = elapsed - (cfg.seconds * 1000);

  // Performance label
  let perfClass, perfText;
  if (pct >= 90)      { perfClass = 'perf-excellent';  perfText = 'Excellent'; }
  else if (pct >= 75) { perfClass = 'perf-strong';     perfText = 'Strong'; }
  else if (pct >= 60) { perfClass = 'perf-average';    perfText = 'Average'; }
  else                { perfClass = 'perf-needs-impr'; perfText = 'Needs Improvement'; }

  // Render
  document.getElementById('res-subject').textContent = state.subject;
  document.getElementById('res-year').textContent    = state.year;
  document.getElementById('res-pct').textContent     = pct + '%';
  document.getElementById('res-frac').textContent    = `${correct}/${total}`;

  const perfLabel = document.getElementById('res-perf-label');
  perfLabel.className = 'perf-label ' + perfClass;
  perfLabel.textContent = perfText;

  document.getElementById('res-correct').textContent   = correct;
  document.getElementById('res-incorrect').textContent = incorrect;
  document.getElementById('res-unmarked').textContent  = unmarked;
  document.getElementById('res-time').textContent      = formatMs(Math.min(elapsed, cfg.seconds * 1000));

  const otRow = document.getElementById('res-overtime-row');
  if (overtime > 0) {
    otRow.style.display = 'flex';
    document.getElementById('res-overtime').textContent = '+' + formatMs(overtime);
  } else {
    otRow.style.display = 'none';
  }

  const now = new Date();
  document.getElementById('res-date').textContent = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  // Animate ring
  const circumference = 2 * Math.PI * 50; // ≈314
  const offset = circumference - (pct / 100) * circumference;
  const ring = document.getElementById('ring-fill');
  ring.style.strokeDashoffset = circumference; // reset
  // Colour ring by performance
  if (pct >= 90)      ring.style.stroke = 'var(--green)';
  else if (pct >= 75) ring.style.stroke = 'var(--accent)';
  else if (pct >= 60) ring.style.stroke = 'var(--amber)';
  else                ring.style.stroke = 'var(--red)';

  requestAnimationFrame(() => {
    setTimeout(() => {
      ring.style.strokeDashoffset = offset;
    }, 80);
  });

  // Save to history
  saveHistory({
    subject:   state.subject,
    year:      state.year,
    score:     correct,
    total:     total,
    pct:       pct,
    elapsed:   elapsed,
    overtime:  overtime > 0 ? overtime : 0,
    date:      now.toISOString(),
  });

  document.getElementById('btn-res-home').onclick = () => {
    showScreen('screen-home');
    checkResume();
  };

  showScreen('screen-results');
}

/* ═══════════════════════════════ HISTORY ═══════════════════════════════ */

function saveHistory(entry) {
  const hist = loadHistory();
  hist.unshift(entry);
  // Keep last 100 attempts
  if (hist.length > 100) hist.splice(100);
  localStorage.setItem(LS.HISTORY, JSON.stringify(hist));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS.HISTORY)) || [];
  } catch { return []; }
}

function showHistory() {
  const hist = loadHistory();

  // Stats bar
  const statsBar = document.getElementById('history-stats-bar');
  statsBar.innerHTML = '';

  if (hist.length > 0) {
    const avg = Math.round(hist.reduce((s, h) => s + h.pct, 0) / hist.length);
    const best = Math.max(...hist.map(h => h.pct));
    const latest = hist[0].pct;

    const iqHist = hist.filter(h => h.subject === 'IQ');
    const gkHist = hist.filter(h => h.subject === 'GK');

    const chips = [
      { label: 'Total Papers', val: hist.length },
      { label: 'Avg Score',    val: avg + '%' },
      { label: 'Best Score',   val: best + '%' },
      { label: 'Latest',       val: latest + '%' },
    ];
    if (iqHist.length) chips.push({ label: 'IQ Average', val: Math.round(iqHist.reduce((s,h)=>s+h.pct,0)/iqHist.length) + '%' });
    if (gkHist.length) chips.push({ label: 'GK Average', val: Math.round(gkHist.reduce((s,h)=>s+h.pct,0)/gkHist.length) + '%' });

    chips.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'hist-stat-chip';
      chip.innerHTML = `<span class="hs-label">${c.label}</span><span class="hs-val">${c.val}</span>`;
      statsBar.appendChild(chip);
    });
  }

  // List
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  list.innerHTML = '';

  if (hist.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    hist.forEach(h => {
      const item = document.createElement('div');
      item.className = 'hist-item';

      let pctClass;
      if (h.pct >= 90)      pctClass = 'excellent';
      else if (h.pct >= 75) pctClass = 'strong';
      else if (h.pct >= 60) pctClass = 'average';
      else                  pctClass = 'needs-impr';

      const date = new Date(h.date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

      item.innerHTML = `
        <div class="hist-item-left">
          <span class="hist-subject-badge">${h.subject}</span>
          <div class="hist-year">${h.year}</div>
          <div class="hist-date">${date}</div>
        </div>
        <div class="hist-item-right">
          <div class="hist-score">${h.score}<span style="color:var(--text-dim);font-size:12px">/${h.total}</span></div>
          <div class="hist-pct ${pctClass}">${h.pct}%</div>
        </div>`;

      list.appendChild(item);
    });
  }

  document.getElementById('btn-history-back').onclick = () => showScreen('screen-home');
  showScreen('screen-history');
}

/* ═══════════════════════════════ BOOT ═══════════════════════════════ */

function init() {
  initHome();
  showScreen('screen-home');
}

document.addEventListener('DOMContentLoaded', init);
