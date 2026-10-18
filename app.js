import * as db from './db.js';

const TYPES = {
  birth:    { label: '출산',   cls: 'birth' },
  hospital: { label: '병원',   cls: 'hospital' },
  anniv:    { label: '기념일', cls: 'anniv' },
  trip:     { label: '여행',   cls: 'trip' },
  shopping: { label: '쇼핑',   cls: 'shopping' },
  etc:      { label: '기타',   cls: 'etc' },
  todo:     { label: '할 일',  cls: 'todo' },
};
const STATUSES = ['조사 전', '조사 중', '조사 완료', '매장 확인', '구매 완료'];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CODE_KEY = 'ttobyoung.familyCode';
const VIEWS = {
  calendar: { title: '또병이', render: renderCalendar },
  gear:     { title: '준비물', render: renderGear },
  finance:  { title: '경제',   render: renderFinance },
};

const state = {
  code: null, unsub: null, loaded: new Set(),
  settings: {}, finance: null, events: [], todos: [], gear: [],
  month: null, selected: null, filter: '전체', view: 'calendar',
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

// ---------- dates & format ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const fmtMD = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const fmtRange = (e) => {
  if (!isDay(e.start)) { const d = parse(e.start); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 예정`; }
  if (!e.end || e.end === e.start) return fmtMD(e.start);
  const a = parse(e.start), b = parse(e.end);
  return a.getMonth() === b.getMonth()
    ? `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getDate()}일`
    : `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`;
};
const dday = (s) => {
  if (!isDay(s)) return '';
  const n = daysBetween(today(), parse(s));
  return n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`;
};
const won = (n) => {
  if (n == null || n === '') return '';
  if (n >= 10000) { const man = n / 10000; return `${Number.isInteger(man) ? man : man.toFixed(1)}만 원`; }
  return `${Number(n).toLocaleString('ko-KR')}원`;
};
const fmtStamp = (s) => { if (!s) return ''; const d = new Date(s); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
async function run(task, okMsg) {
  try { const r = await task(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast('저장하지 못했어요. 인터넷을 확인해 주세요.'); throw e; }
}

// ---------- gate (가족 코드) ----------
const normalizeCode = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

function renderGate(msg = '', presetCode = '') {
  document.body.classList.add('gated');
  closeSheet();
  Object.keys(VIEWS).forEach((k) => { $(`#view-${k}`).hidden = true; });
  $('#view-gate').hidden = false;
  $('#page-title').textContent = '또병이';
  $('#page-sub').textContent = '가족만 볼 수 있어요';
  $('#view-gate').innerHTML = `
    <form class="card gate" id="f-gate" autocomplete="off">
      <div class="hero-badge">🔒</div>
      <h2>가족 코드를 입력해 주세요</h2>
      <p class="muted">같은 코드를 입력한 기기끼리 일정과 준비물을 함께 봐요. 한 번 입력하면 이 기기에 기억돼요.</p>
      <label class="field"><span>가족 코드</span>
        <input name="code" value="${esc(presetCode)}" placeholder="예: 0204" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
      <p class="form-msg" role="alert">${esc(msg)}</p>
      <button class="btn" type="submit">들어가기</button>
    </form>`;
}

function renderGateCreate(code) {
  $('#view-gate').innerHTML = `
    <div class="card gate">
      <div class="hero-badge">🐣</div>
      <h2>이 코드로 만든 공간이 아직 없어요</h2>
      <p class="muted">와이프 폰에서 이미 만들었다면 코드에 오타가 없는지 확인해 주세요. 처음이라면 새로 만들면 돼요.</p>
      <div class="code-box">${esc(code)}</div>
      <button class="btn" data-act="gate-create">이 코드로 새로 만들기</button>
      <button class="btn secondary" data-act="gate-restore">백업 파일로 시작하기</button>
      <button class="btn ghost" data-act="gate-back">다시 입력</button>
    </div>`;
  $('#view-gate').dataset.code = code;
}

async function submitGate(form) {
  const code = normalizeCode(form.code.value);
  const btn = form.querySelector('button[type=submit]');
  if (code.length < 4) return renderGate('코드는 4자 이상이어야 해요.', code);
  btn.disabled = true; btn.textContent = '확인 중…';
  let exists;
  try { exists = await db.familyExists(code); }
  catch (e) { console.error(e); return renderGate('연결하지 못했어요. 인터넷을 확인해 주세요.', code); }
  if (exists) enter(code); else renderGateCreate(code);
}

function enter(code) {
  state.code = code;
  store.set(CODE_KEY, code);
  document.body.classList.remove('gated');
  $('#view-gate').hidden = true;
  state.unsub?.();
  state.loaded = new Set();
  state.unsub = db.subscribe(code, {
    meta: (name, data) => { state[name] = data || (name === 'settings' ? {} : null); state.loaded.add(name); rerender(); },
    list: (col, items) => { state[col] = items; state.loaded.add(col); rerender(); },
    error: (e) => { console.error(e); toast('데이터를 불러오지 못했어요'); },
  });
  const hash = location.hash.replace('#', '');
  show(VIEWS[hash] ? hash : 'calendar');
}

function leave() {
  state.unsub?.(); state.unsub = null;
  state.code = null;
  store.del(CODE_KEY);
  renderGate();
}

// ---------- views ----------
function show(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  Object.keys(VIEWS).forEach((k) => { $(`#view-${k}`).hidden = k !== view; });
  $('#page-title').textContent = VIEWS[view].title;
  VIEWS[view].render();
  history.replaceState(null, '', `#${view}`);
  window.scrollTo(0, 0);
}
function rerender() { if (state.code) VIEWS[state.view].render(); }
const loading = '<div class="card empty">불러오는 중…</div>';

// ---------- calendar ----------
function itemsOn(day) {
  const out = [];
  for (const e of state.events) {
    if (!isDay(e.start)) continue;
    if (day >= e.start && day <= (e.end || e.start)) out.push({ kind: 'event', ...e });
  }
  for (const t of state.todos) if (t.due === day) out.push({ kind: 'todo', ...t });
  return out;
}

function heroHtml() {
  const t = today();
  const birth = state.events.find((e) => e.type === 'birth');
  if (birth && isDay(birth.start)) {
    const n = daysBetween(t, parse(birth.start));
    if (n >= 0) return `<b>또병이 만나기까지 ${n === 0 ? 'D-Day' : `D-${n}`}</b><span>${fmtMD(birth.start)} 예정</span>`;
    return `<b>또병이와 함께한 지 ${-n + 1}일째</b><span>${fmtMD(birth.start)} 태어났어요</span>`;
  }
  if (birth) {
    const d = parse(birth.start);
    const n = daysBetween(t, d);
    return `<b>${d.getMonth() + 1}월에 만나요</b><span>${n > 0 ? `약 ${Math.round(n / 7)}주 남았어요 · ` : ''}예정일이 정해지면 '또병이 태어나는 날'을 눌러 날짜를 넣어 주세요</span>`;
  }
  return `<b>또병이를 기다려요</b><span>'+ 추가'에서 종류를 '출산'으로 넣으면 D-day가 표시돼요</span>`;
}

function renderCalendar() {
  const t = today();
  const tIso = iso(t);
  $('#page-sub').textContent = `${t.getMonth() + 1}월 ${t.getDate()}일 ${DOW[t.getDay()]}요일`;
  if (!state.loaded.has('events') || !state.loaded.has('todos')) { $('#view-calendar').innerHTML = loading; return; }

  const m = state.month;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i === 35 && d.getMonth() !== m.getMonth()) break;
    const s = iso(d);
    const items = itemsOn(s);
    const cls = ['day'];
    if (d.getMonth() !== m.getMonth()) cls.push('out');
    if (d.getDay() === 0) cls.push('sun');
    if (d.getDay() === 6) cls.push('sat');
    if (s === tIso) cls.push('today');
    if (s === state.selected) cls.push('sel');
    const spans = items.filter((x) => x.end && x.end !== x.start);
    const singles = items.filter((x) => !spans.includes(x));
    const dots = [...new Set(singles.map((x) => (x.kind === 'todo' ? 'todo' : TYPES[x.type]?.cls || 'etc')))].slice(0, 3)
      .map((c) => `<i class="c-${c}"></i>`).join('');
    const lines = spans.slice(0, 1).map((x) => {
      const pos = s === x.start ? ' start' : s === x.end ? ' end' : '';
      return `<span class="span-line c-${TYPES[x.type]?.cls || 'etc'}${pos}"></span>`;
    }).join('');
    cells += `<button class="${cls.join(' ')}" data-day="${s}" aria-label="${fmtMD(s)}${items.length ? `, ${items.length}개` : ''}"><span class="n">${d.getDate()}</span><span class="bars">${dots}</span>${lines}</button>`;
  }

  const selItems = itemsOn(state.selected);
  const upcoming = state.events
    .filter((e) => !isDay(e.start) || (e.end || e.start) >= tIso)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const past = state.events.filter((e) => isDay(e.start) && (e.end || e.start) < tIso).length;
  const todos = [...state.todos].sort((a, b) => (!!a.done - !!b.done) || ((a.due || '9') < (b.due || '9') ? -1 : 1));
  const left = todos.filter((x) => !x.done).length;

  $('#view-calendar').innerHTML = `
    <div class="card hero"><div class="hero-badge">👶</div><div>${heroHtml()}</div></div>

    <div class="card">
      <div class="cal-head">
        <h2>${m.getFullYear()}년 ${m.getMonth() + 1}월</h2>
        <div class="cal-nav">
          <button class="today-btn" data-act="today">오늘</button>
          <button class="icon-btn" data-act="prev" aria-label="이전 달"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
          <button class="icon-btn" data-act="next" aria-label="다음 달"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>
      </div>
      <div class="dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="grid">${cells}</div>
      <div class="legend">${['birth', 'hospital', 'anniv', 'trip', 'shopping', 'todo'].map((k) => `<span><i class="c-${k}"></i>${TYPES[k].label}</span>`).join('')}</div>
    </div>

    <div class="section-head"><span class="section-title">${fmtMD(state.selected)}</span>
      <button class="add-btn" data-act="add-event" data-date="${state.selected}">+ 이 날 일정</button></div>
    <div class="card list">${selItems.length ? selItems.map(rowHtml).join('') : '<div class="empty">일정이 없어요</div>'}</div>

    <div class="section-head"><span class="section-title">다가오는 일정</span>
      <button class="add-btn" data-act="add-event">+ 일정 추가</button></div>
    <div class="card list">${upcoming.length ? upcoming.map((e) => rowHtml({ kind: 'event', ...e })).join('') : '<div class="empty">예정된 일정이 없어요</div>'}</div>
    ${past ? `<p class="foot">지난 일정 ${past}개는 달력에서 볼 수 있어요</p>` : ''}

    <div class="section-head"><span class="section-title">할 일 · ${left}개 남음</span>
      <button class="add-btn" data-act="add-todo">+ 할 일 추가</button></div>
    <div class="card list">${todos.map(todoHtml).join('') || '<div class="empty">할 일이 없어요</div>'}</div>`;
}

function rowHtml(x) {
  if (x.kind === 'todo') return todoHtml(x);
  const c = TYPES[x.type]?.cls || 'etc';
  const d = parse(x.start);
  const chip = isDay(x.start) ? `<b>${d.getDate()}</b><small>${d.getMonth() + 1}월</small>` : `<b>${d.getMonth() + 1}월</b><small>예정</small>`;
  const meta = [fmtRange(x), x.place, x.note].filter(Boolean).map(esc).join(' · ');
  return `<button class="row" data-edit-event="${esc(x.id)}"><div class="date-chip c-${c}-soft">${chip}</div>
    <div class="row-main"><div class="row-title">${esc(x.title)}</div><div class="row-meta">${meta}</div></div>
    <div class="dday">${dday(x.start)}</div></button>`;
}

function todoHtml(t) {
  const link = typeof t.link === 'string' && t.link.startsWith('gear:') ? t.link.slice(5) : null;
  const meta = t.due ? `${fmtMD(t.due)}까지` : '날짜 미정';
  return `<div class="todo${t.done ? ' done' : ''}">
    <button class="check" data-toggle="${esc(t.id)}" aria-label="${esc(t.title)} ${t.done ? '완료 취소' : '완료'}"></button>
    <button class="row-main todo-main" data-edit-todo="${esc(t.id)}">
      <div class="row-title">${esc(t.title)}</div>
      <div class="row-meta">${esc(meta)}${t.note ? ` · ${esc(t.note)}` : ''}</div>
    </button>
    ${link ? `<button class="link-btn" data-gear="${esc(link)}">준비물 ›</button>` : ''}
    ${t.due && !t.done ? `<div class="dday">${dday(t.due)}</div>` : ''}</div>`;
}

// ---------- event / todo forms ----------
function eventForm(e = {}, presetDate) {
  const monthOnly = !!e.start && !isDay(e.start);
  const typeOpts = Object.entries(TYPES).filter(([k]) => k !== 'todo')
    .map(([k, v]) => `<option value="${k}"${(e.type || 'hospital') === k ? ' selected' : ''}>${v.label}</option>`).join('');
  $('#sheet-body').innerHTML = `
    <form id="f-event" class="form" data-id="${esc(e.id || '')}">
      <h2 id="sheet-title">${e.id ? '일정 수정' : '일정 추가'}</h2>
      <label class="field"><span>제목</span><input name="title" maxlength="60" required value="${esc(e.title)}" placeholder="예: 정밀초음파"></label>
      <label class="field"><span>종류</span><select name="type">${typeOpts}</select></label>
      <label class="switch"><input type="checkbox" name="monthOnly"${monthOnly ? ' checked' : ''}><span>날짜 미정 (월만 정하기)</span></label>
      <div class="two" data-days${monthOnly ? ' hidden' : ''}>
        <label class="field"><span>날짜</span><input type="date" name="start" value="${esc(isDay(e.start) ? e.start : (presetDate || ''))}"></label>
        <label class="field"><span>종료일 (선택)</span><input type="date" name="end" value="${esc(e.end || '')}"></label>
      </div>
      <label class="field" data-month${monthOnly ? '' : ' hidden'}><span>예정 월</span><input type="month" name="month" value="${esc(monthOnly ? e.start : '')}"></label>
      <label class="field"><span>장소 (선택)</span><input name="place" maxlength="60" value="${esc(e.place)}"></label>
      <label class="field"><span>메모 (선택)</span><textarea name="note" rows="2" maxlength="300">${esc(e.note)}</textarea></label>
      <p class="form-msg" role="alert"></p>
      <button class="btn" type="submit">저장</button>
      ${e.id ? '<button class="btn danger" type="button" data-act="delete" data-col="events">삭제</button>' : ''}
    </form>`;
  openSheet();
}

async function submitEvent(form) {
  const f = form.elements;
  const msg = (t) => { form.querySelector('.form-msg').textContent = t; };
  const title = f.title.value.trim();
  if (!title) return msg('제목을 입력해 주세요.');
  const obj = { title, type: f.type.value };
  if (f.monthOnly.checked) {
    if (!f.month.value) return msg('예정 월을 골라 주세요.');
    obj.start = f.month.value;
  } else {
    if (!f.start.value) return msg('날짜를 골라 주세요.');
    obj.start = f.start.value;
    if (f.end.value) {
      if (f.end.value < f.start.value) return msg('종료일이 시작일보다 빨라요.');
      if (f.end.value !== f.start.value) obj.end = f.end.value;
    }
  }
  if (f.place.value.trim()) obj.place = f.place.value.trim();
  if (f.note.value.trim()) obj.note = f.note.value.trim();
  obj.updatedAt = new Date().toISOString();
  await run(() => db.saveItem(state.code, 'events', form.dataset.id || null, obj), '저장했어요');
  if (isDay(obj.start)) { state.selected = obj.start; const d = parse(obj.start); state.month = new Date(d.getFullYear(), d.getMonth(), 1); }
  closeSheet(); renderCalendar();
}

function todoForm(t = {}) {
  $('#sheet-body').innerHTML = `
    <form id="f-todo" class="form" data-id="${esc(t.id || '')}">
      <h2 id="sheet-title">${t.id ? '할 일 수정' : '할 일 추가'}</h2>
      <label class="field"><span>할 일</span><input name="title" maxlength="80" required value="${esc(t.title)}" placeholder="예: 산후조리원 예약"></label>
      <label class="field"><span>언제까지 (선택)</span><input type="date" name="due" value="${esc(t.due || '')}"></label>
      <label class="field"><span>메모 (선택)</span><textarea name="note" rows="2" maxlength="300">${esc(t.note)}</textarea></label>
      ${t.id ? `<label class="switch"><input type="checkbox" name="done"${t.done ? ' checked' : ''}><span>완료</span></label>` : ''}
      <p class="form-msg" role="alert"></p>
      <button class="btn" type="submit">저장</button>
      ${t.id ? '<button class="btn danger" type="button" data-act="delete" data-col="todos">삭제</button>' : ''}
    </form>`;
  openSheet();
}

async function submitTodo(form) {
  const f = form.elements;
  const title = f.title.value.trim();
  if (!title) { form.querySelector('.form-msg').textContent = '할 일을 입력해 주세요.'; return; }
  const prev = state.todos.find((x) => x.id === form.dataset.id) || {};
  const obj = { title, due: f.due.value || null, done: f.done ? f.done.checked : false, updatedAt: new Date().toISOString() };
  if (f.note.value.trim()) obj.note = f.note.value.trim();
  if (prev.link) obj.link = prev.link;
  await run(() => db.saveItem(state.code, 'todos', form.dataset.id || null, obj), '저장했어요');
  closeSheet();
}

async function deleteFromForm(btn) {
  const form = btn.closest('form');
  const col = btn.dataset.col;
  const list = state[col];
  const item = list.find((x) => x.id === form.dataset.id);
  if (!item || !confirm(`'${item.title}'을(를) 삭제할까요?`)) return;
  await run(() => db.removeItem(state.code, col, item.id), '삭제했어요');
  closeSheet();
}

// ---------- gear ----------
function sortedGear() {
  return [...state.gear].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(b.name, 'ko'));
}

function renderGear() {
  if (!state.loaded.has('gear')) { $('#view-gear').innerHTML = loading; return; }
  const items = sortedGear();
  const idx = (s) => Math.max(0, STATUSES.indexOf(s));
  const researched = items.filter((i) => idx(i.status) >= 2).length;
  const bought = items.filter((i) => idx(i.status) === 4).length;
  const total = items.reduce((sum, i) => sum + (Number(i.storePrice ?? i.onlinePrice) || 0), 0);
  $('#page-sub').textContent = `${items.length}개 품목`;
  if (!items.length) {
    $('#view-gear').innerHTML = '<div class="card empty">아직 준비물이 없어요. Claude가 만든 업데이트 파일을 설정에서 불러오면 채워져요.</div>';
    return;
  }

  const counts = STATUSES.map((s) => items.filter((i) => (i.status || '조사 전') === s).length);
  const bar = counts.map((c, k) => (c ? `<i class="bar-s${k}" style="width:${(c / items.length) * 100}%"></i>` : '')).join('');
  const shown = state.filter === '전체' ? items : items.filter((i) => (i.status || '조사 전') === state.filter);
  const cats = [...new Set(shown.map((i) => i.category || '기타'))];
  const groups = cats.map((cat) => `
    <div class="section-title">${esc(cat)}</div>
    <div class="card group">${shown.filter((i) => (i.category || '기타') === cat).map((i) => itemHtml(i, idx(i.status))).join('')}</div>`).join('');

  $('#view-gear').innerHTML = `
    <div class="stats">
      <div class="stat"><b>${researched}<small>/${items.length}</small></b><span>조사 완료</span></div>
      <div class="stat"><b>${bought}</b><span>구매 완료</span></div>
      <div class="stat"><b>${won(total) || '-'}</b><span>예상 금액</span></div>
    </div>
    <div class="progress" aria-hidden="true">${bar}</div>
    <div class="chips" role="group" aria-label="상태 필터">
      ${['전체', ...STATUSES].map((s) => `<button class="chip" data-filter="${esc(s)}" aria-pressed="${state.filter === s}">${esc(s)}${s === '전체' ? '' : ` ${counts[STATUSES.indexOf(s)]}`}</button>`).join('')}
    </div>
    ${groups || '<div class="card empty">해당하는 품목이 없어요</div>'}
    <p class="foot">품목을 눌러 상태·매장가·메모를 바꿀 수 있어요 · 예상 금액은 매장가(없으면 온라인가) 합계</p>`;
}

function itemHtml(i, k) {
  const price = i.storePrice ?? i.onlinePrice;
  return `<button class="item" data-item="${esc(i.id)}">
    <div class="item-main">
      <div class="item-name">${esc(i.name)} ${i.when ? `<span class="when">${esc(i.when)}</span>` : ''}</div>
      <div class="item-pick">${esc(i.pick || i.note || '아직 조사 전이에요')}</div>
    </div>
    ${price ? `<div class="item-price">${won(price)}<small>${i.storePrice != null ? '매장가' : '온라인가'}</small></div>` : ''}
    <span class="badge s${k}">${esc(i.status || '조사 전')}</span>
    <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
  </button>`;
}

function openItem(id) {
  const i = state.gear.find((x) => x.id === id);
  if (!i) return;
  const k = Math.max(0, STATUSES.indexOf(i.status));
  const d = i.detail || {};
  const opts = (d.options || []).map((o) => `
    <div class="opt"><div class="opt-head">${esc(o.name)}<span>${esc(o.price)}</span></div>
    ${o.pros ? `<p><b>장점</b> ${esc(o.pros)}</p>` : ''}${o.cons ? `<p><b>단점</b> ${esc(o.cons)}</p>` : ''}</div>`).join('');
  const docLink = typeof d.doc === 'string' && /^https:\/\//.test(d.doc) ? d.doc : null;
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><h2 id="sheet-title">${esc(i.name)}</h2><span class="badge s${k}">${esc(i.status || '조사 전')}</span></div>
    <p class="lead">${esc(d.summary || i.note || '아직 조사 전이에요. 조사가 끝나면 여기에 정리돼요.')}</p>
    <div class="meta-grid">
      <div><small>1순위</small><b>${esc(i.pick || '-')}</b></div>
      <div><small>필요 시점</small><b>${esc(i.when || '-')}</b></div>
      <div><small>온라인가</small><b>${won(i.onlinePrice) || '-'}</b></div>
      <div><small>매장가</small><b>${won(i.storePrice) || '-'}</b></div>
    </div>
    ${opts ? `<div class="section-title flush">후보 비교</div><div class="card">${opts}</div>` : ''}
    ${d.checks?.length ? `<div class="section-title flush">매장에서 확인할 것</div><div class="card"><ul class="checks">${d.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${docLink ? `<a class="btn secondary" href="${esc(docLink)}" target="_blank" rel="noopener">자세한 정리 문서 보기</a>` : ''}

    <form id="f-gear" class="form card" data-id="${esc(i.id)}">
      <h3>매장 다녀와서 기록</h3>
      <label class="field"><span>상태</span><select name="status">${STATUSES.map((s) => `<option${(i.status || '조사 전') === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span>매장가 (원)</span><input name="storePrice" inputmode="numeric" placeholder="예: 1400000" value="${esc(i.storePrice ?? '')}"></label>
      <label class="field"><span>매장 메모</span><textarea name="storeNote" rows="3" maxlength="500" placeholder="사은품, 할인 조건, 구매처 등">${esc(i.storeNote)}</textarea></label>
      <p class="form-msg" role="alert"></p>
      <button class="btn" type="submit">저장</button>
    </form>`;
  openSheet();
}

async function submitGear(form) {
  const f = form.elements;
  const raw = f.storePrice.value.replace(/[^\d]/g, '');
  const obj = { status: f.status.value, storePrice: raw ? Number(raw) : null, storeNote: f.storeNote.value.trim(), updatedAt: new Date().toISOString() };
  await run(() => db.saveItem(state.code, 'gear', form.dataset.id, obj, true), '저장했어요');
  closeSheet();
}

// ---------- finance ----------
function renderFinance() {
  if (!state.loaded.has('finance')) { $('#view-finance').innerHTML = loading; return; }
  const f = state.finance || { active: false, intro: '또병이가 태어나면 채워갈 공간이에요.', sections: [] };
  $('#page-sub').textContent = f.active ? '' : '태어나면 시작해요';
  const secs = (f.sections || []).map((s) => `
    <div class="section-title">${esc(s.title)}</div>
    <div class="card">${(s.items || []).length
      ? s.items.map((x) => `<div class="kv"><span>${esc(x.name)}</span><span>${esc(x.value)}</span></div>`).join('')
      : '<div class="empty">출생 후 정리 예정</div>'}</div>`).join('');
  $('#view-finance').innerHTML = `
    ${f.active ? '' : `<div class="card soon"><div class="emoji">🐣</div><p>${esc(f.intro)}</p></div>`}
    ${secs}`;
}

// ---------- settings / backup ----------
function openSettings() {
  const s = state.settings || {};
  const last = s.lastBackupAt;
  const days = last ? daysBetween(new Date(last), new Date()) : null;
  const masked = state.code.replace(/[a-z0-9]/g, (c, i) => (i < 5 ? c : '•'));
  $('#sheet-body').innerHTML = `
    <h2 id="sheet-title">설정</h2>
    <div class="section-title flush">가족 코드</div>
    <div class="card">
      <div class="code-box" id="code-text" data-shown="0">${esc(masked)}</div>
      <div class="btn-row">
        <button class="btn secondary" data-act="code-show">보기</button>
        <button class="btn secondary" data-act="code-copy">복사</button>
      </div>
      <p class="muted small">와이프 폰에서도 이 코드를 입력하면 같은 내용을 함께 보고 고칠 수 있어요. 코드를 아는 사람만 들어올 수 있으니 다른 사람에게는 알려주지 마세요.</p>
    </div>

    <div class="section-title flush">백업 · 복구</div>
    <div class="card">
      <p class="muted small">마지막 백업: <b>${last ? `${fmtStamp(last)} (${days === 0 ? '오늘' : `${days}일 전`})` : '아직 없음'}</b>${!last || days > 30 ? ' · 한 달에 한 번 받아두는 걸 추천해요' : ''}</p>
      <button class="btn" data-act="backup">백업 파일 받기</button>
      <button class="btn secondary" data-act="import">파일 불러오기</button>
      <p class="muted small"><b>백업 파일</b>을 불러오면 그 시점으로 전체가 되돌아가요. Claude가 만든 <b>업데이트 파일</b>을 불러오면 해당 항목만 추가·수정돼요.</p>
    </div>

    <button class="btn ghost danger-text" data-act="leave">이 기기에서 나가기</button>`;
  openSheet();
}

function buildBackup() {
  const clean = (arr) => arr.map((x) => ({ ...x }));
  return {
    type: 'ttobyoung-backup', version: 1, exportedAt: new Date().toISOString(),
    events: clean(state.events), todos: clean(state.todos), gear: clean(sortedGear()),
    finance: state.finance || null,
  };
}

async function downloadBackup() {
  const data = buildBackup();
  const name = `ttobyoung-backup-${iso(new Date())}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '또병이 백업' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e); toast('백업 파일을 만들지 못했어요'); return;
  }
  await db.saveMeta(state.code, 'settings', { lastBackupAt: new Date().toISOString() }).catch(() => {});
  toast('백업 파일을 저장했어요');
  closeSheet();
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

let pendingImport = null; // 'settings' | 'gate'
async function handleFile(file) {
  let data;
  try { data = await readJsonFile(file); } catch { toast('파일을 읽을 수 없어요'); return; }
  const where = pendingImport; pendingImport = null;

  if (where === 'gate') {
    if (data?.type !== 'ttobyoung-backup') { toast('또병이 백업 파일이 아니에요'); return; }
    const code = $('#view-gate').dataset.code;
    try {
      await db.createFamily(code);
      await db.replaceAll(code, data);
    } catch (e) { console.error(e); toast('복구하지 못했어요. 인터넷을 확인해 주세요.'); return; }
    toast('백업으로 시작했어요');
    enter(code);
    return;
  }

  if (data?.type === 'ttobyoung-backup') {
    const when = data.exportedAt ? fmtStamp(data.exportedAt) : '알 수 없는 날짜';
    if (!confirm(`${when} 백업으로 되돌릴까요?\n지금 있는 일정·할 일·준비물이 모두 백업 내용으로 바뀌어요.`)) return;
    await run(() => db.replaceAll(state.code, data), '백업으로 복구했어요');
    closeSheet();
  } else if (data?.type === 'ttobyoung-update') {
    const c = await run(() => db.upsertMany(state.code, data));
    const parts = [['events', '일정'], ['todos', '할 일'], ['gear', '준비물']].filter(([k]) => c[k]).map(([k, l]) => `${l} ${c[k]}`);
    toast(`반영했어요${parts.length ? ` · ${parts.join(' · ')}` : ''}`);
    closeSheet();
  } else {
    toast('또병이 백업·업데이트 파일이 아니에요');
  }
}

// ---------- sheet ----------
function openSheet() { $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; $('#sheet-panel')?.scrollTo?.(0, 0); }
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; }

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('button, [data-close], a');
  if (!el || el.tagName === 'A') return;
  const ds = el.dataset;
  if ('close' in ds) return closeSheet();
  if (el.id === 'settings-btn') return state.code && openSettings();
  if (ds.view) return show(ds.view);
  if (ds.day) { state.selected = ds.day; return renderCalendar(); }
  if (ds.toggle) {
    const t = state.todos.find((x) => x.id === ds.toggle);
    if (t) run(() => db.saveItem(state.code, 'todos', t.id, { done: !t.done }, true));
    return;
  }
  if (ds.editEvent) return eventForm(state.events.find((x) => x.id === ds.editEvent));
  if (ds.editTodo) return todoForm(state.todos.find((x) => x.id === ds.editTodo));
  if (ds.filter) { state.filter = ds.filter; return renderGear(); }
  if (ds.item) return openItem(ds.item);
  if (ds.gear) { show('gear'); return openItem(ds.gear); }
  switch (ds.act) {
    case 'prev': case 'next': {
      const m = state.month;
      state.month = new Date(m.getFullYear(), m.getMonth() + (ds.act === 'next' ? 1 : -1), 1);
      return renderCalendar();
    }
    case 'today': { const t = today(); state.month = new Date(t.getFullYear(), t.getMonth(), 1); state.selected = iso(t); return renderCalendar(); }
    case 'add-event': return eventForm({}, ds.date);
    case 'add-todo': return todoForm();
    case 'delete': return deleteFromForm(el);
    case 'backup': return downloadBackup();
    case 'import': pendingImport = 'settings'; $('#file-input').value = ''; return $('#file-input').click();
    case 'leave': if (confirm('이 기기에서 나갈까요? 데이터는 지워지지 않고, 코드를 다시 입력하면 들어올 수 있어요.')) leave(); return;
    case 'code-show': {
      const box = $('#code-text');
      const shown = box.dataset.shown === '1';
      box.textContent = shown ? state.code.replace(/[a-z0-9]/g, (c, i) => (i < 5 ? c : '•')) : state.code;
      box.dataset.shown = shown ? '0' : '1';
      el.textContent = shown ? '보기' : '숨기기';
      return;
    }
    case 'code-copy':
      try { await navigator.clipboard.writeText(state.code); toast('코드를 복사했어요'); }
      catch { toast('복사하지 못했어요. 보기를 눌러 직접 적어 주세요.'); }
      return;
    case 'gate-create': {
      const code = $('#view-gate').dataset.code;
      el.disabled = true;
      try { await db.createFamily(code); } catch (err) { console.error(err); el.disabled = false; return toast('만들지 못했어요. 인터넷을 확인해 주세요.'); }
      toast('새 가족 공간을 만들었어요');
      return enter(code);
    }
    case 'gate-restore': pendingImport = 'gate'; $('#file-input').value = ''; return $('#file-input').click();
    case 'gate-back': return renderGate('', $('#view-gate').dataset.code);
    default:
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  const btn = form.querySelector('button[type=submit]');
  const done = () => { if (btn) btn.disabled = false; };
  if (btn) btn.disabled = true;
  const handlers = { 'f-gate': submitGate, 'f-event': submitEvent, 'f-todo': submitTodo, 'f-gear': submitGear };
  const h = handlers[form.id];
  if (!h) return done();
  Promise.resolve(h(form)).catch(() => {}).finally(done);
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'monthOnly') {
    const form = e.target.form;
    form.querySelector('[data-days]').hidden = e.target.checked;
    form.querySelector('[data-month]').hidden = !e.target.checked;
  }
  if (e.target.id === 'file-input' && e.target.files?.[0]) handleFile(e.target.files[0]);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// 달력 좌우 스와이프로 달 넘기기
let sx = null;
document.addEventListener('touchstart', (e) => { if (e.target.closest('.grid')) sx = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx; sx = null;
  if (Math.abs(dx) < 50) return;
  const m = state.month;
  state.month = new Date(m.getFullYear(), m.getMonth() + (dx < 0 ? 1 : -1), 1);
  renderCalendar();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- boot ----------
(function boot() {
  const t = today();
  state.month = new Date(t.getFullYear(), t.getMonth(), 1);
  state.selected = iso(t);
  const code = normalizeCode(store.get(CODE_KEY));
  if (code.length >= 4) enter(code); else renderGate();
})();
