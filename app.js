const PAGE_SIZE = 10;
const STORAGE_KEY = 'ppla-quiz-state';

let questions = [];
let state = { page: 0, answers: {}, shuffles: {} };

const $ = id => document.getElementById(id);

async function init() {
  loadState();

  try {
    const res = await fetch('./data/questions-prawo.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    questions = await res.json();
  } catch {
    $('questions').innerHTML =
      '<p style="color:#b91c1c;padding:32px">Nie można załadować pytań.<br>' +
      'Uruchom najpierw: <code>node generate-json.js</code> w katalogu nadrzędnym.</p>';
    return;
  }

  // clamp page in case questions count changed
  const maxPage = Math.max(0, Math.ceil(questions.length / PAGE_SIZE) - 1);
  if (state.page > maxPage) state.page = maxPage;

  // generate shuffles on first load (no stored shuffles yet)
  if (!state.shuffles || Object.keys(state.shuffles).length === 0) {
    state.shuffles = generateShuffles();
    saveState();
  }

  setupEvents();
  render();
  registerSW();
}

// ── State ────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) state = JSON.parse(s);
  } catch {}
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Events ───────────────────────────────────────────────────────────────────

function setupEvents() {
  // Pagination
  ['prev-top', 'prev-bot'].forEach(id =>
    $(id).addEventListener('click', () => changePage(state.page - 1))
  );
  ['next-top', 'next-bot'].forEach(id =>
    $(id).addEventListener('click', () => changePage(state.page + 1))
  );

  // Answer selection (event delegation)
  $('questions').addEventListener('click', e => {
    const btn = e.target.closest('[data-answer]');
    if (!btn) return;
    selectAnswer(parseInt(btn.dataset.q), parseInt(btn.dataset.answer));
  });

  // Hamburger / drawer
  $('hamburger-btn').addEventListener('click', openDrawer);
  $('close-drawer').addEventListener('click', closeDrawer);
  $('overlay').addEventListener('click', closeDrawer);

  // Reset
  $('reset-btn').addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz zresetować wszystkie odpowiedzi i wrócić do strony 1?')) {
      state = { page: 0, answers: {}, shuffles: generateShuffles() };
      saveState();
      closeDrawer();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Go-to-page
  $('goto-btn').addEventListener('click', gotoPage);
  $('goto-input').addEventListener('keydown', e => { if (e.key === 'Enter') gotoPage(); });
}

function changePage(p) {
  const max = Math.ceil(questions.length / PAGE_SIZE) - 1;
  state.page = Math.max(0, Math.min(p, max));
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function gotoPage() {
  const total = Math.ceil(questions.length / PAGE_SIZE);
  const p = parseInt($('goto-input').value, 10);
  if (!isNaN(p) && p >= 1 && p <= total) {
    changePage(p - 1);
    closeDrawer();
  }
}

function selectAnswer(qIndex, aIndex) {
  state.answers[qIndex] = aIndex;
  saveState();

  // Update only the affected card's buttons (no full re-render)
  const card = document.querySelector(`[data-question="${qIndex}"]`);
  if (!card) return;
  const q = questions[qIndex];
  const shuffleOrder = state.shuffles[qIndex] ?? q.answers.map((_, i) => i);
  card.querySelectorAll('[data-answer]').forEach(btn => {
    const displayIdx = parseInt(btn.dataset.answer);
    const origIdx = shuffleOrder[displayIdx];
    btn.className = answerClass(displayIdx === aIndex, q.answers[origIdx].correct && displayIdx === aIndex);
  });
  renderProgress();
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  renderProgress();
  renderQuestions();
  renderPagination();
}

function renderProgress() {
  const answered = Object.keys(state.answers).length;
  const correct = Object.entries(state.answers)
    .filter(([qi, ai]) => {
      const q = questions[+qi];
      const shuffleOrder = state.shuffles[+qi];
      const origIdx = shuffleOrder ? shuffleOrder[+ai] : +ai;
      return q?.answers[origIdx]?.correct;
    }).length;
  const total = questions.length;
  const pct = total ? Math.round(answered / total * 100) : 0;

  $('progress-bar').style.width = pct + '%';
  $('progress-text').textContent = `${answered} / ${total} odpowiedzi (${pct}%)`;

  // drawer stats (updated on open)
  const drawerStats = $('drawer-stats');
  if (drawerStats) {
    drawerStats.innerHTML =
      `<div class="stat-row"><span>Odpowiedziano</span><strong>${answered} / ${total}</strong></div>` +
      `<div class="stat-row"><span>Poprawnie</span><strong class="correct-count">${correct}</strong></div>` +
      `<div class="stat-row"><span>Błędnie</span><strong class="wrong-count">${answered - correct}</strong></div>`;
  }
}

function renderQuestions() {
  const start = state.page * PAGE_SIZE;
  const pageQs = questions.slice(start, start + PAGE_SIZE);

  $('questions').innerHTML = pageQs.map((q, i) => {
    const qIndex = start + i;
    const selected = state.answers[qIndex] ?? -1;

    const shuffleOrder = state.shuffles[qIndex] ?? q.answers.map((_, i) => i);
    const answersHtml = shuffleOrder.map((origIdx, displayIdx) => {
      const a = q.answers[origIdx];
      const cls = answerClass(displayIdx === selected, a.correct && displayIdx === selected);
      return `<button class="${cls}" data-q="${qIndex}" data-answer="${displayIdx}">${esc(a.text)}</button>`;
    }).join('');

    const refBtn = q.url
      ? `<a class="ref-btn" href="${esc(q.url)}" target="_blank" rel="noopener noreferrer"
            aria-label="Wyjaśnienie pytania ${esc(q.id)}">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"/>
             <path d="M12 16v-4M12 8h.01"/>
           </svg>
         </a>`
      : '';

    return `
      <div class="question-card" data-question="${qIndex}">
        <div class="question-meta">
          <span class="question-id">${esc(q.id)}</span>
          <span class="meta-sep">|</span>
          ${refBtn}
        </div>
        <p class="question-text">${esc(q.question)}</p>
        <div class="answers-list">${answersHtml}</div>
      </div>`;
  }).join('');
}

function renderPagination() {
  const total = Math.ceil(questions.length / PAGE_SIZE);
  const cur = state.page;
  const label = `Strona ${cur + 1} z ${total}`;

  $('page-info-top').textContent = label;
  $('page-info-bot').textContent = label;

  ['prev-top', 'prev-bot'].forEach(id => { $(id).disabled = cur === 0; });
  ['next-top', 'next-bot'].forEach(id => { $(id).disabled = cur >= total - 1; });

  // update goto max
  $('goto-input').max = total;
  $('goto-input').placeholder = `1–${total}`;
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function openDrawer() {
  renderProgress(); // refresh stats
  $('drawer').classList.add('open');
  $('overlay').classList.remove('hidden');
}

function closeDrawer() {
  $('drawer').classList.remove('open');
  $('overlay').classList.add('hidden');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function answerClass(isSelected, isCorrect) {
  if (!isSelected) return 'answer-btn';
  return isCorrect ? 'answer-btn correct' : 'answer-btn wrong';
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateShuffles() {
  const shuffles = {};
  questions.forEach((q, i) => {
    shuffles[i] = shuffleArray(q.answers.map((_, idx) => idx));
  });
  return shuffles;
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
