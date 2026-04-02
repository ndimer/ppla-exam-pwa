const PAGE_SIZE = 10;
const STORAGE_KEY = 'ppla-quiz-state';

let questions = [];
let state = { page: 0, answers: {} };

const $ = id => document.getElementById(id);

async function init() {
  loadState();

  try {
    const res = await fetch('./data/questions.json');
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
      state = { page: 0, answers: {} };
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
  card.querySelectorAll('[data-answer]').forEach(btn => {
    const i = parseInt(btn.dataset.answer);
    btn.className = answerClass(i === aIndex, q.answers[i].correct);
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
    .filter(([qi, ai]) => questions[+qi]?.answers[+ai]?.correct).length;
  const total = questions.length;
  const pct = total ? (answered / total * 100).toFixed(1) : 0;

  $('progress-bar').style.width = pct + '%';
  $('progress-text').textContent = `${answered} / ${total} odpowiedzi`;

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

    const answersHtml = q.answers.map((a, aIndex) => {
      const cls = answerClass(aIndex === selected, a.correct && aIndex === selected);
      return `<button class="${cls}" data-q="${qIndex}" data-answer="${aIndex}">${esc(a.text)}</button>`;
    }).join('');

    return `
      <div class="question-card" data-question="${qIndex}">
        <div class="question-meta">
          <span class="question-id">${esc(q.id)}</span>
          <span class="meta-sep">|</span>
          <span class="lightbulb">💡</span>
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

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
