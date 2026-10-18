(() => {
  'use strict';

  const TYPES = {
    birth:    { label: '출산',   cls: 'birth' },
    hospital: { label: '병원',   cls: 'hospital' },
    anniv:    { label: '기념일', cls: 'anniv' },
    trip:     { label: '여행',   cls: 'trip' },
    shopping: { label: '쇼핑',   cls: 'shopping' },
    todo:     { label: '할 일',  cls: 'todo' },
  };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const VIEWS = {
    calendar: { title: '또병이', render: renderCalendar },
    gear:     { title: '준비물', render: renderGear },
    finance:  { title: '경제',   render: renderFinance },
  };

  const state = { events: null, gear: null, finance: null, month: null, selected: null, filter: '전체', view: 'calendar' };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- dates ----------
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
    if (n == null) return '';
    if (n >= 10000) { const man = n / 10000; return `${Number.isInteger(man) ? man : man.toFixed(1)}만 원`; }
    return `${n.toLocaleString('ko-KR')}원`;
  };

  // ---------- data ----------
  async function load(name) {
    const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(name);
    return res.json();
  }

  async function init() {
    try {
      [state.events, state.gear, state.finance] = await Promise.all([load('events'), load('gear'), load('finance')]);
    } catch (e) {
      $('#view-calendar').innerHTML = '<div class="card empty">데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div>';
      return;
    }
    const t = today();
    state.month = new Date(t.getFullYear(), t.getMonth(), 1);
    state.selected = iso(t);
    const hash = location.hash.replace('#', '');
    show(VIEWS[hash] ? hash : 'calendar');
  }

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

  // ---------- calendar ----------
  function itemsOn(day) {
    const out = [];
    for (const e of state.events.events) {
      if (!isDay(e.start)) continue;
      const end = e.end || e.start;
      if (day >= e.start && day <= end) out.push({ kind: 'event', ...e });
    }
    for (const t of state.events.todos) if (t.due === day) out.push({ kind: 'todo', type: 'todo', ...t });
    return out;
  }

  function renderCalendar() {
    const ev = state.events;
    const t = today();
    const tIso = iso(t);
    const due = ev.dueDate || {};
    let hero;
    if (due.date) {
      const n = daysBetween(t, parse(due.date));
      hero = `<b>또병이 만나기까지 D-${n}</b><span>${fmtMD(due.date)} 예정</span>`;
    } else {
      const d = parse(due.month || '2027-02');
      const n = daysBetween(t, d);
      hero = `<b>${d.getMonth() + 1}월에 만나요</b><span>${n > 0 ? `약 ${Math.round(n / 7)}주 남았어요 · ` : ''}${esc(due.note || '')}</span>`;
    }
    $('#page-sub').textContent = `${t.getMonth() + 1}월 ${t.getDate()}일 ${DOW[t.getDay()]}요일`;

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
      const singles = items.filter((x) => !(x.end && x.end !== x.start));
      const spans = items.filter((x) => x.end && x.end !== x.start);
      const dots = [...new Set(singles.map((x) => TYPES[x.type]?.cls || 'todo'))].slice(0, 3)
        .map((c) => `<i class="c-${c}"></i>`).join('');
      const lines = spans.slice(0, 1).map((x) => {
        const pos = s === x.start ? ' start' : s === x.end ? ' end' : '';
        return `<span class="span-line c-${TYPES[x.type]?.cls}${pos}"></span>`;
      }).join('');
      cells += `<button class="${cls.join(' ')}" data-day="${s}" aria-label="${fmtMD(s)}${items.length ? `, 일정 ${items.length}개` : ''}"><span class="n">${d.getDate()}</span><span class="bars">${dots}</span>${lines}</button>`;
    }

    const selItems = itemsOn(state.selected);
    const upcoming = ev.events
      .filter((e) => !isDay(e.start) || (e.end || e.start) >= tIso)
      .sort((a, b) => (a.start < b.start ? -1 : 1));
    const todos = [...ev.todos].sort((a, b) => (a.done - b.done) || ((a.due || '9') < (b.due || '9') ? -1 : 1));

    $('#view-calendar').innerHTML = `
      <div class="card hero"><div class="hero-badge">👶</div><div>${hero}</div></div>

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

      <div class="section-title">${fmtMD(state.selected)}</div>
      <div class="card list">${selItems.length ? selItems.map(rowHtml).join('') : '<div class="empty">일정이 없어요</div>'}</div>

      <div class="section-title">다가오는 일정</div>
      <div class="card list">${upcoming.length ? upcoming.map((e) => rowHtml({ kind: 'event', ...e })).join('') : '<div class="empty">예정된 일정이 없어요</div>'}</div>

      <div class="section-title">할 일 · ${todos.filter((x) => !x.done).length}개 남음</div>
      <div class="card list">${todos.map(todoHtml).join('') || '<div class="empty">할 일이 없어요</div>'}</div>

      <p class="foot">업데이트 ${esc(ev.updated)}</p>`;
  }

  function rowHtml(x) {
    if (x.kind === 'todo') return todoHtml(x);
    const c = TYPES[x.type]?.cls || 'todo';
    let chip;
    if (isDay(x.start)) { const d = parse(x.start); chip = `<b>${d.getDate()}</b><small>${d.getMonth() + 1}월</small>`; }
    else { const d = parse(x.start); chip = `<b>${d.getMonth() + 1}월</b><small>예정</small>`; }
    const meta = [fmtRange(x), x.place, x.note].filter(Boolean).map(esc).join(' · ');
    return `<div class="row"><div class="date-chip c-${c}-soft">${chip}</div>
      <div class="row-main"><div class="row-title">${esc(x.title)}</div><div class="row-meta">${meta}</div></div>
      <div class="dday">${dday(x.start)}</div></div>`;
  }

  function todoHtml(t) {
    const link = t.link && t.link.startsWith('gear:') ? t.link.slice(5) : null;
    const meta = [t.due ? `${fmtMD(t.due)}까지` : '날짜 미정', link ? '준비물 보기 ›' : ''].filter(Boolean).join(' · ');
    return `<div class="todo${t.done ? ' done' : ''}"${link ? ` data-gear="${esc(link)}" role="button" tabindex="0"` : ''}>
      <span class="check" aria-label="${t.done ? '완료' : '미완료'}"></span>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta">${esc(meta)}</div></div>
      ${t.due && !t.done ? `<div class="dday">${dday(t.due)}</div>` : ''}</div>`;
  }

  // ---------- gear ----------
  function renderGear() {
    const g = state.gear;
    const st = g.statuses;
    const items = g.items;
    const idx = (s) => Math.max(0, st.indexOf(s));
    const researched = items.filter((i) => idx(i.status) >= 2).length;
    const bought = items.filter((i) => idx(i.status) === 4).length;
    const total = items.reduce((sum, i) => sum + (i.storePrice ?? i.onlinePrice ?? 0), 0);
    $('#page-sub').textContent = `${items.length}개 품목 · 업데이트 ${g.updated}`;

    const counts = st.map((s) => items.filter((i) => i.status === s).length);
    const bar = counts.map((c, k) => c ? `<i class="bar-s${k}" style="width:${(c / items.length) * 100}%"></i>` : '').join('');

    const shown = state.filter === '전체' ? items : items.filter((i) => i.status === state.filter);
    const cats = [...new Set(shown.map((i) => i.category))];
    const groups = cats.map((cat) => `
      <div class="section-title">${esc(cat)}</div>
      <div class="card group">${shown.filter((i) => i.category === cat).map((i) => itemHtml(i, idx(i.status))).join('')}</div>`).join('');

    $('#view-gear').innerHTML = `
      <div class="stats">
        <div class="stat"><b>${researched}<span style="font-size:14px;color:var(--ink-3)">/${items.length}</span></b><span>조사 완료</span></div>
        <div class="stat"><b>${bought}</b><span>구매 완료</span></div>
        <div class="stat"><b>${won(total) || '-'}</b><span>예상 금액</span></div>
      </div>
      <div class="progress" aria-hidden="true">${bar}</div>
      <div class="chips" role="group" aria-label="상태 필터">
        ${['전체', ...st].map((s) => `<button class="chip" data-filter="${esc(s)}" aria-pressed="${state.filter === s}">${esc(s)}${s === '전체' ? '' : ` ${counts[st.indexOf(s)]}`}</button>`).join('')}
      </div>
      ${groups || '<div class="card empty">해당하는 품목이 없어요</div>'}
      <p class="foot">예상 금액은 매장가(없으면 온라인가) 기준 합계예요</p>`;
  }

  function itemHtml(i, k) {
    const price = i.storePrice ?? i.onlinePrice;
    return `<button class="item" data-item="${esc(i.id)}">
      <div class="item-main">
        <div class="item-name">${esc(i.name)} ${i.when ? `<span class="when">${esc(i.when)}</span>` : ''}</div>
        <div class="item-pick">${esc(i.pick || i.note || '아직 조사 전이에요')}</div>
      </div>
      ${price ? `<div class="item-price">${won(price)}<small>${i.storePrice != null ? '매장가' : '온라인가'}</small></div>` : ''}
      <span class="badge s${k}">${esc(i.status)}</span>
      ${i.detail ? '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>' : ''}
    </button>`;
  }

  function openItem(id) {
    const i = state.gear.items.find((x) => x.id === id);
    if (!i) return;
    const k = Math.max(0, state.gear.statuses.indexOf(i.status));
    const d = i.detail || {};
    const opts = (d.options || []).map((o) => `
      <div class="opt"><div class="opt-head">${esc(o.name)}<span>${esc(o.price)}</span></div>
      ${o.pros ? `<p><b>장점</b> ${esc(o.pros)}</p>` : ''}${o.cons ? `<p><b>단점</b> ${esc(o.cons)}</p>` : ''}</div>`).join('');
    $('#sheet-body').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <h2 id="sheet-title">${esc(i.name)}</h2><span class="badge s${k}">${esc(i.status)}</span>
      </div>
      <p class="lead">${esc(d.summary || i.note || '아직 조사 전이에요. 조사가 끝나면 여기에 정리돼요.')}</p>
      <div class="meta-grid">
        <div><small>1순위</small><b>${esc(i.pick || '-')}</b></div>
        <div><small>필요 시점</small><b>${esc(i.when || '-')}</b></div>
        <div><small>온라인가</small><b>${won(i.onlinePrice) || '-'}</b></div>
        <div><small>매장가</small><b>${won(i.storePrice) || '-'}</b></div>
      </div>
      ${i.storeNote ? `<div class="card" style="margin-bottom:14px"><h3>매장 메모</h3><div style="color:var(--ink-2)">${esc(i.storeNote)}</div></div>` : ''}
      ${opts ? `<div class="section-title" style="margin:0 0 8px">후보 비교</div><div class="card">${opts}</div>` : ''}
      ${d.checks?.length ? `<div class="section-title" style="margin:14px 0 8px">매장에서 확인할 것</div><div class="card"><ul class="checks">${d.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${d.doc ? `<a class="btn" href="${esc(d.doc)}" target="_blank" rel="noopener">자세한 정리 문서 보기</a>` : ''}`;
    openSheet();
  }

  // ---------- finance ----------
  function renderFinance() {
    const f = state.finance;
    $('#page-sub').textContent = f.active ? `업데이트 ${f.updated}` : '태어나면 시작해요';
    const secs = f.sections.map((s) => `
      <div class="section-title">${esc(s.title)}</div>
      <div class="card">${s.items.length
        ? s.items.map((x) => `<div class="kv"><span>${esc(x.name)}</span><span>${esc(x.value)}</span></div>`).join('')
        : '<div class="empty">출생 후 정리 예정</div>'}</div>`).join('');
    $('#view-finance').innerHTML = `
      ${f.active ? '' : `<div class="card soon"><div class="emoji">🐣</div><p>${esc(f.intro)}</p></div>`}
      ${secs}`;
  }

  // ---------- sheet ----------
  function openSheet() { $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, [data-gear], [data-close]');
    if (!el) return;
    if (el.matches('[data-close]')) return closeSheet();
    if (el.dataset.view) return show(el.dataset.view);
    if (el.dataset.day) { state.selected = el.dataset.day; return renderCalendar(); }
    if (el.dataset.act) {
      const m = state.month;
      if (el.dataset.act === 'prev') state.month = new Date(m.getFullYear(), m.getMonth() - 1, 1);
      if (el.dataset.act === 'next') state.month = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      if (el.dataset.act === 'today') { const t = today(); state.month = new Date(t.getFullYear(), t.getMonth(), 1); state.selected = iso(t); }
      return renderCalendar();
    }
    if (el.dataset.filter) { state.filter = el.dataset.filter; return renderGear(); }
    if (el.dataset.item) return openItem(el.dataset.item);
    if (el.dataset.gear) { show('gear'); return openItem(el.dataset.gear); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.gear) { e.preventDefault(); e.target.click(); }
  });

  // swipe months
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

  init();
})();
