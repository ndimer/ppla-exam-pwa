const PAGE_SIZE = 10;
const STORAGE_KEY = 'ppla-quiz-state';
const FAV_KEY    = 'ppla-quiz-favorites';

let questions  = [];
let state      = { page: 0, answers: {}, shuffles: {} };
let favState   = { ids: [], answers: {}, page: 0 };
let currentView = 'all'; // 'all' | 'fav'

const $ = id => document.getElementById(id);

async function init() {
  loadState();
  loadFavState();

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

function loadFavState() {
  try {
    const s = localStorage.getItem(FAV_KEY);
    if (s) favState = JSON.parse(s);
  } catch {}
}

function saveFavState() {
  localStorage.setItem(FAV_KEY, JSON.stringify(favState));
}

// ── Events ───────────────────────────────────────────────────────────────────

function setupEvents() {
  // Pagination
  ['prev-top', 'prev-bot'].forEach(id =>
    $(id).addEventListener('click', () => changePage(currentPage() - 1))
  );
  ['next-top', 'next-bot'].forEach(id =>
    $(id).addEventListener('click', () => changePage(currentPage() + 1))
  );

  // Answer selection + favourite toggle (event delegation)
  $('questions').addEventListener('click', e => {
    const favBtn = e.target.closest('[data-fav-toggle]');
    if (favBtn) { toggleFavorite(parseInt(favBtn.dataset.favToggle)); return; }
    const btn = e.target.closest('[data-answer]');
    if (!btn) return;
    selectAnswer(parseInt(btn.dataset.q), parseInt(btn.dataset.answer));
  });

  // Hamburger / drawer
  $('hamburger-btn').addEventListener('click', openDrawer);
  $('close-drawer').addEventListener('click', closeDrawer);
  $('overlay').addEventListener('click', closeDrawer);

  // View selector
  $('view-all-btn').addEventListener('click', () => switchView('all'));
  $('view-fav-btn').addEventListener('click', () => switchView('fav'));

  // Reset all answers (favourites list is preserved)
  $('reset-btn').addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz zresetować wszystkie odpowiedzi i wrócić do strony 1?')) {
      state = { page: 0, answers: {}, shuffles: generateShuffles() };
      saveState();
      closeDrawer();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Reset favourites answers only (favourite list preserved)
  $('reset-fav-btn').addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz zresetować odpowiedzi ulubionych pytań?')) {
      favState.answers = {};
      favState.page = 0;
      saveFavState();
      closeDrawer();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Go-to-page
  $('goto-btn').addEventListener('click', gotoPage);
  $('goto-input').addEventListener('keydown', e => { if (e.key === 'Enter') gotoPage(); });
}

function currentPage() {
  return currentView === 'fav' ? favState.page : state.page;
}

function switchView(view) {
  currentView = view;
  $('view-all-btn').classList.toggle('active', view === 'all');
  $('view-fav-btn').classList.toggle('active', view === 'fav');
  closeDrawer();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changePage(p) {
  const totalQs = currentView === 'fav' ? favQuestions().length : questions.length;
  const max = Math.max(0, Math.ceil(totalQs / PAGE_SIZE) - 1);
  const clamped = Math.max(0, Math.min(p, max));
  if (currentView === 'fav') {
    favState.page = clamped;
    saveFavState();
  } else {
    state.page = clamped;
    saveState();
  }
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function gotoPage() {
  const totalQs = currentView === 'fav' ? favQuestions().length : questions.length;
  const total = Math.ceil(totalQs / PAGE_SIZE);
  const p = parseInt($('goto-input').value, 10);
  if (!isNaN(p) && p >= 1 && p <= total) {
    changePage(p - 1);
    closeDrawer();
  }
}

function toggleFavorite(qIndex) {
  const qId = questions[qIndex].id;
  const pos = favState.ids.indexOf(qId);
  if (pos >= 0) {
    favState.ids.splice(pos, 1);
    delete favState.answers[qId];
    // clamp favourites page after removal
    const maxFavPage = Math.max(0, Math.ceil(favState.ids.length / PAGE_SIZE) - 1);
    if (favState.page > maxFavPage) favState.page = maxFavPage;
  } else {
    favState.ids.push(qId);
  }
  saveFavState();

  if (currentView === 'fav') {
    // List changed — full re-render
    render();
  } else {
    // Partial update: just flip the star on the card
    const card = document.querySelector(`[data-question="${qIndex}"]`);
    if (card) {
      const btn = card.querySelector('[data-fav-toggle]');
      if (btn) {
        const nowFav = favState.ids.includes(qId);
        btn.classList.toggle('active', nowFav);
        btn.textContent = nowFav ? '★' : '☆';
        btn.setAttribute('aria-label', nowFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych');
      }
    }
  }
}

function selectAnswer(qIndex, aIndex) {
  const q = questions[qIndex];
  if (currentView === 'fav') {
    favState.answers[q.id] = aIndex;
    saveFavState();
  } else {
    state.answers[qIndex] = aIndex;
    saveState();
  }

  // Update only the affected card's buttons (no full re-render)
  const card = document.querySelector(`[data-question="${qIndex}"]`);
  if (!card) return;
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
  let answered, correct, total;

  if (currentView === 'fav') {
    const favQs = favQuestions();
    total    = favQs.length;
    answered = 0;
    correct  = 0;
    favQs.forEach(({ q, qIndex }) => {
      const sel = favState.answers[q.id];
      if (sel === undefined) return;
      answered++;
      const shuffleOrder = state.shuffles[qIndex] ?? q.answers.map((_, i) => i);
      if (q.answers[shuffleOrder[sel]]?.correct) correct++;
    });
  } else {
    total    = questions.length;
    answered = Object.keys(state.answers).length;
    correct  = Object.entries(state.answers)
      .filter(([qi, ai]) => {
        const q          = questions[+qi];
        const shuffleOrder = state.shuffles[+qi];
        const origIdx    = shuffleOrder ? shuffleOrder[+ai] : +ai;
        return q?.answers[origIdx]?.correct;
      }).length;
  }

  const pct = total ? Math.round(answered / total * 100) : 0;
  $('progress-bar').style.width = pct + '%';
  $('progress-text').textContent = currentView === 'fav'
    ? `Ulubione: ${answered} / ${total} odpowiedzi (${pct}%)`
    : `${answered} / ${total} odpowiedzi (${pct}%)`;

  const drawerStats = $('drawer-stats');
  if (drawerStats) {
    const label = currentView === 'fav' ? 'Ulubione – odpowiedzi' : 'Odpowiedziano';
    drawerStats.innerHTML =
      `<div class="stat-row"><span>${label}</span><strong>${answered} / ${total}</strong></div>` +
      `<div class="stat-row"><span>Poprawnie</span><strong class="correct-count">${correct}</strong></div>` +
      `<div class="stat-row"><span>Błędnie</span><strong class="wrong-count">${answered - correct}</strong></div>`;
  }
}

// Returns [{q, qIndex}] for all currently valid favourite questions
function favQuestions() {
  return favState.ids
    .map(id => {
      const qIndex = questions.findIndex(q => q.id === id);
      return qIndex >= 0 ? { q: questions[qIndex], qIndex } : null;
    })
    .filter(Boolean);
}

function renderQuestions() {
  if (currentView === 'fav') {
    renderFavQuestions();
  } else {
    renderAllQuestions();
  }
}

function renderAllQuestions() {
  const start  = state.page * PAGE_SIZE;
  const pageQs = questions.slice(start, start + PAGE_SIZE);

  $('questions').innerHTML = pageQs.map((q, i) => {
    const qIndex   = start + i;
    const selected = state.answers[qIndex] ?? -1;
    const isFav    = favState.ids.includes(q.id);
    return questionCardHtml(q, qIndex, selected, isFav);
  }).join('');
}

function renderFavQuestions() {
  const all = favQuestions();
  if (all.length === 0) {
    $('questions').innerHTML =
      '<p class="text-center text-gray-400 py-16 text-sm">' +
      'Brak ulubionych pytań.<br>' +
      'Dodaj pytania klikając gwiazdkę ☆ na karcie pytania.</p>';
    return;
  }
  const start  = favState.page * PAGE_SIZE;
  const pageQs = all.slice(start, start + PAGE_SIZE);

  $('questions').innerHTML = pageQs.map(({ q, qIndex }) => {
    const selected = favState.answers[q.id] ?? -1;
    return questionCardHtml(q, qIndex, selected, true);
  }).join('');
}

function questionCardHtml(q, qIndex, selected, isFav) {
  const shuffleOrder = state.shuffles[qIndex] ?? q.answers.map((_, i) => i);

  const answersHtml = shuffleOrder.map((origIdx, displayIdx) => {
    const a   = q.answers[origIdx];
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

  const starLabel = isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
  const starBtn = `<button class="fav-btn${isFav ? ' active' : ''}" data-fav-toggle="${qIndex}"
    aria-label="${starLabel}">${isFav ? '★' : '☆'}</button>`;

  return `
    <div class="question-card" data-question="${qIndex}">
      <div class="question-meta">
        <span class="question-id">${esc(q.id)}</span>
        <span class="meta-sep">|</span>
        ${refBtn}
        ${starBtn}
      </div>
      <p class="question-text">${esc(q.question)}</p>
      <div class="answers-list">${answersHtml}</div>
    </div>`;
}

function renderPagination() {
  const totalQs = currentView === 'fav' ? favQuestions().length : questions.length;
  const total   = Math.max(1, Math.ceil(totalQs / PAGE_SIZE));
  const cur     = currentPage();
  const label   = `Strona ${cur + 1} z ${total}`;

  $('page-info-top').textContent = label;
  $('page-info-bot').textContent = label;

  ['prev-top', 'prev-bot'].forEach(id => { $(id).disabled = cur === 0; });
  ['next-top', 'next-bot'].forEach(id => { $(id).disabled = cur >= total - 1; });

  $('goto-input').max         = total;
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
