/* global PTLogic, Chart */
'use strict';
const L = window.PTLogic;
const api = window.pt;

const S = {
  cfg: null, user: null, view: 'mine',
  mine: { tasks: [], projects: [] },
  all: null,
  lastSync: null,
  charts: [],
  f: {
    mineTab: 'active', mineQ: '',
    period: '30', person: 'all',
    tq: '', towner: 'all', tstatus: 'active', tcode: 'all'
  }
};

const STATUSES = ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  mine: svg('<path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="4"/>'),
  dashboard: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  tasks: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  projects: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};
const REMINDER_OPTS = [[1440, '1 hari sebelum deadline'], [180, '3 jam sebelum'], [60, '1 jam sebelum'], [30, '30 menit sebelum'], [15, '15 menit sebelum']];

// ---------- util ----------
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanErr = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const pad = (n) => String(n).padStart(2, '0');
function fmtD(d) { return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '–'; }
function fmtDT(d) { return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : '–'; }
function fmtS(d) { return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '–'; }
function fmtIso(iso, raw) { if (!iso) return raw || '–'; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
function pct(x) { return x === null || x === undefined ? '–' : Math.round(x * 100) + '%'; }
function initials(n) { return String(n || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase(); }
function isUrl(s) { return /^https?:\/\/\S+$/.test(String(s).trim()); }
function prettyTitle(s) {
  if (!isUrl(s)) return esc(s);
  const u = String(s).trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return `<a href="#" data-ext="${esc(s)}" title="${esc(s)}">${esc(u)}</a>`;
}
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}

async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Memproses…'; }
  try { return await fn(); }
  catch (e) { toast(cleanErr(e), true); throw e; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
}

// ---------- modal ----------
function modal({ title, body, actions, wide, onMount }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal" style="${wide ? 'width:720px' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(title)}</h2><button class="x" data-close aria-label="Tutup">×</button></div>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${actions || '<button class="btn" data-close>Tutup</button>'}</div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', close));
  $('.overlay', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('overlay')) close(); });
  if (onMount) onMount($('.modal', root), close);
  const first = $('input, select, textarea', root); if (first) first.focus();
  return close;
}
function confirmBox(title, text, okLabel = 'Hapus') {
  return new Promise((resolve) => {
    modal({
      title, body: `<p>${esc(text)}</p>`,
      actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="ok">${esc(okLabel)}</button>`,
      onMount: (m, close) => { $('#ok', m).onclick = () => { close(); resolve(true); }; $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => resolve(false))); }
    });
  });
}

// ---------- auth screens ----------
function showAuth(html, onMount) {
  $('#shell').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#auth-body').innerHTML = html;
  if (onMount) onMount();
  const f = $('#auth-body input'); if (f) f.focus();
}

function showSetup() {
  showAuth(`
    <h2>Hubungkan ke server</h2>
    <p>Tempel URL Web App Google Apps Script dari spreadsheet "KPI dan Tracker". Minta URL ini ke admin.</p>
    <div id="err"></div>
    <form id="f">
      <label class="field"><span>URL Web App</span><input name="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.cfg.apiUrl || '')}" required></label>
      <button class="btn primary" style="width:100%">Simpan &amp; lanjut</button>
    </form>
    <p class="small" style="margin-top:16px">Ingin melihat dulu? <button class="linkbtn" id="demo">Coba mode demo</button></p>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#f button');
      try {
        await busy(btn, () => api.setConfig({ apiUrl: e.target.url.value }));
        S.cfg = await api.config(); showLogin();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
    $('#demo').onclick = async () => { await api.setConfig({ demo: true }); S.cfg = await api.config(); showLogin(); };
  });
}

function showLogin() {
  showAuth(`
    <h2>Masuk</h2>
    <p>${S.cfg.demo ? 'Mode demo: username <b>admin</b>, <b>ari</b>, <b>wisnu</b>, dst. Password <b>demo</b>.' : 'Gunakan akun yang diberikan admin.'}</p>
    <div id="err"></div>
    <form id="f">
      <label class="field"><span>Username</span><input name="u" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" style="width:100%">Masuk</button>
    </form>
    <p class="small" style="margin-top:16px">${S.cfg.demo ? '<button class="linkbtn" id="srv">Keluar dari mode demo</button>' : S.cfg.apiLocked ? '' : '<button class="linkbtn" id="srv">Ganti alamat server</button>'}</p>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      $('#err').innerHTML = '';
      try {
        const user = await busy($('#f button'), () => api.login(e.target.u.value.trim(), e.target.p.value));
        S.user = user;
        if (user.mustChange) showChangePw(e.target.p.value); else enterApp();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
    if ($('#srv')) $('#srv').onclick = async () => {
      if (S.cfg.demo) await api.setConfig({ demo: false });
      S.cfg = await api.config();
      if (S.cfg.apiUrl) showLogin(); else showSetup();
    };
  });
}

function showChangePw(oldPw) {
  showAuth(`
    <h2>Buat password baru</h2>
    <p>Ini login pertama Anda. Ganti password sementara dengan password pribadi (minimal 8 karakter).</p>
    <div id="err"></div>
    <form id="f">
      ${oldPw ? '' : '<label class="field"><span>Password sementara</span><input name="o" type="password" required></label>'}
      <label class="field"><span>Password baru</span><input name="n" type="password" minlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>Ulangi password baru</span><input name="n2" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn primary" style="width:100%">Simpan password</button>
    </form>`, () => {
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.n.value !== f.n2.value) { $('#err').innerHTML = '<div class="error">Password baru tidak sama.</div>'; return; }
      try {
        S.user = await busy($('#f button'), () => api.changePassword(oldPw || f.o.value, f.n.value));
        enterApp();
      } catch (err) { $('#err').innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
    };
  });
}

// ---------- app shell ----------
async function enterApp() {
  $('#auth').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  $('#me-name').textContent = S.user.name;
  $('#me-role').textContent = S.user.role === 'admin' ? 'Admin' : 'Anggota tim';
  $('#me-avatar').textContent = initials(S.user.name);
  $('#demo-tag').textContent = S.cfg.demo ? 'Mode demo' : 'KPI & task tim';
  renderNav();
  $('#view').innerHTML = '<div class="loading">Memuat data…</div>';
  await loadData();
  go(S.user.role === 'admin' && !S.user.sheetName ? 'dashboard' : 'mine');
}

function renderNav() {
  const admin = S.user.role === 'admin';
  const overdue = S.mine.tasks.filter((t) => L.bucket(t) === 'overdue').length;
  const items = [];
  if (S.user.sheetName) items.push(['mine', 'Task Saya', 'Task', overdue]);
  items.push(['dashboard', 'Dashboard', 'Laporan']);
  if (admin) items.push(['sect', 'Admin'], ['tasks', 'Semua Task', 'Semua'], ['projects', 'Project', 'Project'], ['users', 'Pengguna', 'Tim']);
  items.push(['sect', ''], ['settings', 'Pengaturan', 'Setelan']);
  $('#nav').innerHTML = items.map((i) => i[0] === 'sect'
    ? `<div class="sect">${esc(i[1])}</div>`
    : `<button data-v="${i[0]}" class="${S.view === i[0] ? 'active' : ''}"><span class="ico">${ICONS[i[0]]}</span><span class="lbl-full">${i[1]}</span><span class="lbl-short">${i[2]}</span>${i[3] ? `<span class="count" title="Terlambat">${i[3]}</span>` : ''}</button>`).join('');
  $$('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
}

async function loadData(quiet) {
  try {
    const jobs = [S.user.sheetName ? api.call('myTasks') : Promise.resolve({ tasks: [], projects: [] })];
    if (S.user.role === 'admin') jobs.push(api.call('getAll'));
    const [mine, all] = await Promise.all(jobs);
    S.mine = mine;
    if (all) { S.all = all; if (!S.user.sheetName) S.mine.projects = all.projects; }
    S.lastSync = new Date();
    $('#sync-info').textContent = 'Diperbarui ' + pad(S.lastSync.getHours()) + ':' + pad(S.lastSync.getMinutes());
  } catch (e) {
    if (!quiet) toast(cleanErr(e), true);
  }
}

function go(view) {
  if (S.view !== view) { const m = $('.main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); }
  S.view = view;
  S.charts.forEach((c) => c.destroy()); S.charts = [];
  renderNav();
  const titles = {
    mine: ['Task Saya', 'Task yang menjadi tanggung jawab Anda'],
    dashboard: ['Dashboard', S.user.role === 'admin' ? 'Laporan waktu pengerjaan & performa tim' : 'Laporan performa Anda'],
    tasks: ['Semua Task', 'Kelola dan bagikan task ke anggota tim'],
    projects: ['Project', 'Daftar project dari tab Main Project'],
    users: ['Pengguna', 'Akun login anggota tim'],
    settings: ['Pengaturan', 'Notifikasi, akun, dan koneksi server']
  };
  $('#view-title').textContent = titles[view][0];
  $('#view-sub').textContent = titles[view][1];
  ({ mine: viewMine, dashboard: viewDashboard, tasks: viewTasks, projects: viewProjects, users: viewUsers, settings: viewSettings })[view]();
}

function projectName(code) {
  const list = (S.all && S.all.projects) || S.mine.projects || [];
  const p = list.find((x) => x.code === code);
  return p ? p.project : '';
}

// ---------- status helpers ----------
function statusChip(s) {
  const map = { 'Done': 'good', 'On-Progress': 'info', 'Review': 'accent', 'Hold': 'warn', 'Recurring': 'accent' };
  return `<span class="chip ${map[s] || ''}">${esc(s || 'Backlog')}</span>`;
}
function priorityChip(p) {
  if (!p) return '';
  const map = { High: 'bad', Medium: 'warn', Low: '' };
  return `<span class="chip ${map[p] || ''}">${p === 'High' ? '▲ ' : p === 'Low' ? '▽ ' : '■ '}${esc(p)}</span>`;
}
function outcomeChip(t) {
  const e = L.evaluate(t);
  switch (e.outcome) {
    case 'over': return `<span class="chip good" title="Selesai sebelum deadline dengan ≤80% waktu rencana">★ Overperforming</span>`;
    case 'ontime': return `<span class="chip info">✓ Tepat waktu</span>`;
    case 'late': return `<span class="chip bad">⚠ Terlambat ${L.humanDuration(-e.slackMs)}</span>`;
    case 'overdue': return `<span class="chip bad">⚠ Lewat ${L.humanDuration(-e.slackMs)}</span>`;
    default: return '';
  }
}
function timing(t) {
  const e = L.evaluate(t), now = new Date();
  if (L.isDone(t)) {
    return `Selesai ${fmtDT(e.doneAt)}${e.durationMs !== null ? ` · dikerjakan ${L.humanDuration(e.durationMs)}` : ''}`;
  }
  if (t.status === 'Recurring') return 'Rutin';
  if (e.plannedEnd && now > e.plannedEnd) return `<b style="color:var(--bad)">Terlambat ${L.humanDuration(now - e.plannedEnd)}</b>`;
  if (e.plannedStart && now < e.plannedStart) return `Mulai ${L.humanDuration(e.plannedStart - now)} lagi`;
  if (e.plannedEnd) {
    const left = e.plannedEnd - now;
    return left < 24 * 36e5 ? `<b style="color:var(--warn)">Deadline ${L.humanDuration(left)} lagi</b>` : `Deadline ${L.humanDuration(left)} lagi`;
  }
  return '';
}
function scheduleText(t) {
  const s = L.schedule(t);
  const a = s.start ? fmtDT(s.start) : (t.startRaw || '–');
  const b = s.end ? fmtDT(s.end) : (t.endRaw || '–');
  return `${a} → ${b}`;
}

// ---------- Task Saya ----------
function viewMine() {
  const tasks = S.mine.tasks;
  const b = (k) => tasks.filter((t) => L.bucket(t) === k);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const doneWeek = tasks.filter((t) => L.isDone(t) && t.doneAt && new Date(t.doneAt) >= weekAgo).length;
  const f = S.f;
  $('#view').innerHTML = `${banners()}
    <div class="tiles">
      ${tile('Hari ini & berjalan', b('today').length, 'deadline ≤ 24 jam atau sedang dikerjakan', css('--info'))}
      ${tile('Terlambat', b('overdue').length, 'lewat deadline, belum done', css('--bad'))}
      ${tile('Akan datang', b('upcoming').length, 'belum mulai', css('--muted'))}
      ${tile('Selesai 7 hari', doneWeek, 'task ditandai done', css('--good'))}
    </div>
    <div class="toolbar">
      <div class="seg" id="mtab">${[['active', 'Aktif'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, l]) => `<button data-k="${k}" class="${f.mineTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input type="search" id="mq" placeholder="Cari task…" value="${esc(f.mineQ)}">
    </div>
    <div id="mlist"></div>`;
  bindBanners();
  $$('#mtab button').forEach((x) => x.onclick = () => { f.mineTab = x.dataset.k; viewMine(); });
  $('#mq').oninput = (e) => { f.mineQ = e.target.value; renderMineList(); };
  renderMineList();
}

function banners() {
  const out = [];
  if (S.user.sheetName && !S.user.email) {
    out.push(`<div class="banner"><div><b>Masukkan email Anda</b> agar task otomatis masuk Google Calendar dan pengingat deadline dikirim ke email.</div><button class="btn sm primary" data-go="settings">Isi email</button></div>`);
  }
  if (S.cfg.notifPermission === 'default') {
    out.push(`<div class="banner"><div><b>Izinkan notifikasi</b> agar pengingat muncul selama Project Tracker terbuka.</div><button class="btn sm" id="ask-notif">Izinkan</button></div>`);
  }
  return out.join('');
}

function bindBanners() {
  $$('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  const n = $('#ask-notif');
  if (n) n.onclick = async () => { const p = await api.requestNotifications(); S.cfg = await api.config(); toast(p === 'granted' ? 'Notifikasi aktif' : 'Notifikasi tidak diizinkan', p !== 'granted'); go(S.view); };
}

function renderMineList() {
  const f = S.f, q = f.mineQ.toLowerCase();
  let tasks = S.mine.tasks.filter((t) => !q || (t.task + ' ' + t.code + ' ' + projectName(t.code)).toLowerCase().includes(q));
  if (f.mineTab === 'active') tasks = tasks.filter((t) => !L.isDone(t));
  if (f.mineTab === 'done') tasks = tasks.filter((t) => L.isDone(t));
  const groups = [
    ['overdue', 'Terlambat', css('--bad')], ['today', 'Hari ini & sedang berjalan', css('--info')],
    ['upcoming', 'Akan datang', css('--muted')], ['backlog', 'Tanpa jadwal', css('--muted')], ['done', 'Selesai', css('--good')]
  ];
  const byStart = (a, b) => (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity);
  const html = groups.map(([k, label, color]) => {
    let list = tasks.filter((t) => L.bucket(t) === k);
    if (!list.length) return '';
    list = k === 'done' ? list.sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0)) : list.sort(byStart);
    return `<div class="group"><div class="group-h"><span class="dot" style="background:${color}"></span>${label} <span class="n">${list.length}</span></div>
      <div class="card">${list.map(taskRow).join('')}</div></div>`;
  }).join('');
  $('#mlist').innerHTML = html || `<div class="card empty"><b>${f.mineTab === 'done' ? 'Belum ada task selesai' : 'Tidak ada task aktif'}</b>Task baru dari admin akan muncul di sini.</div>`;
  bindTaskRows($('#mlist'));
}

function taskRow(t) {
  const done = L.isDone(t);
  const pname = projectName(t.code);
  const others = STATUSES.filter((s) => s !== t.status);
  let actions = '';
  if (!done && t.status !== 'On-Progress' && t.status !== 'Recurring') actions += `<button class="btn sm" data-st="On-Progress" data-id="${esc(t.id)}">▶ Mulai</button>`;
  if (!done) actions += `<button class="btn sm done" data-st="Done" data-id="${esc(t.id)}">✓ Done</button>`;
  else actions += `<button class="btn sm" data-st="On-Progress" data-id="${esc(t.id)}">Buka lagi</button>`;
  actions += `<select data-sel="${esc(t.id)}" title="Ubah status"><option value="">Status…</option>${others.map((s) => `<option>${s}</option>`).join('')}</select>`;
  return `<div class="task" id="task-${esc(t.id)}">
    <div>
      <div class="task-proj">${t.code ? `<span class="chip code">${esc(t.code)}</span>` : ''}${esc(pname)}</div>
      <div class="task-title">${prettyTitle(t.task)}</div>
      <div class="task-meta">${statusChip(t.status)}${priorityChip(t.priority)}<span>🗓 ${scheduleText(t)}</span><span>${timing(t)}</span>${done ? outcomeChip(t) : ''}</div>
      ${t.notes ? `<div class="task-meta">📝 ${esc(t.notes)}</div>` : ''}
    </div>
    <div class="task-actions">${t.id ? actions : '<span class="muted small">Belum punya Task ID — minta admin jalankan Setup</span>'}</div>
  </div>`;
}

function bindTaskRows(root) {
  $$('[data-ext]', root).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
  $$('[data-st]', root).forEach((b) => b.onclick = () => setStatus(b.dataset.id, b.dataset.st, b));
  $$('[data-sel]', root).forEach((s) => s.onchange = () => { if (s.value) setStatus(s.dataset.sel, s.value, s); });
}

async function setStatus(id, status, el) {
  try {
    await busy(el.tagName === 'BUTTON' ? el : null, () => api.call('updateStatus', { taskId: id, status }));
    toast(status === 'Done' ? 'Mantap! Task ditandai selesai.' : `Status diubah ke ${status}`);
    await loadData(true);
    go(S.view);
  } catch (e) { /* toast sudah tampil */ }
}

function tile(label, value, sub, color) {
  return `<div class="card tile"><div class="lbl">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}</div>
    <div class="val">${value}</div><div class="sub">${sub}</div></div>`;
}

// ---------- Dashboard ----------
function periodRange(p) {
  const now = new Date();
  if (p === 'all') return { from: null, to: null };
  if (p === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59) };
  return { from: new Date(now - Number(p) * 864e5), to: null };
}

function viewDashboard() {
  const admin = S.user.role === 'admin' && S.all;
  const f = S.f;
  const users = admin ? S.all.users.filter((u) => u.sheetName) : [];
  let tasks = admin ? S.all.tasks : S.mine.tasks;
  if (admin && f.person !== 'all') tasks = tasks.filter((t) => t.owner === f.person);
  const range = periodRange(f.period);
  const sum = L.summarize(tasks, range);
  const team = admin && f.person === 'all';

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg" id="per">${[['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['all', 'Semua']].map(([k, l]) => `<button data-k="${k}" class="${f.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${admin ? `<select id="person"><option value="all">Semua orang</option>${users.map((u) => `<option value="${esc(u.username)}" ${f.person === u.username ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="tiles">
      ${tile('Penyelesaian', pct(sum.completionRate), `${sum.done} dari ${sum.total} task selesai`)}
      ${tile('Rata-rata waktu pengerjaan', L.humanDuration(sum.avgDurationMs), 'dari mulai dikerjakan hingga done')}
      ${tile('Tepat waktu', pct(sum.onTimeRate), `${sum.over + sum.ontime} dari ${sum.over + sum.ontime + sum.late} task selesai`, css('--info'))}
      ${tile('Overperforming', sum.over, 'selesai lebih cepat dari rencana', css('--good'))}
    </div>
    <div class="tiles">
      ${tile('Selesai terlambat', sum.late, 'done setelah deadline', css('--bad'))}
      ${tile('Overdue aktif', sum.overdue, 'lewat deadline, belum done', css('--warn'))}
      ${tile('Rata-rata selisih deadline', sum.avgSlackMs === null ? '–' : (sum.avgSlackMs >= 0 ? '+' : '') + L.humanDuration(sum.avgSlackMs), 'positif = lebih cepat dari deadline')}
      ${tile('Masih berjalan', sum.open, 'belum jatuh tempo')}
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-h"><h2>${team ? 'Hasil per orang' : 'Task selesai per minggu'}</h2>
        <div class="legend">${team ? legendOutcome() : ''}</div></div>
        <div class="card-b"><div class="chart-box"><canvas id="c1" aria-label="grafik"></canvas></div></div></div>
      <div class="card"><div class="card-h"><h2>Distribusi hasil</h2></div><div class="card-b" id="dist"></div></div>
    </div>
    ${team ? `<div class="card" style="margin-bottom:12px"><div class="card-h"><h2>Peringkat performa</h2><span class="muted small">diurutkan: tepat waktu, lalu overperforming</span></div><div class="card-b" style="padding-top:6px;overflow:auto" id="board"></div></div>` : ''}
    <div class="card"><div class="card-h"><h2>Riwayat task selesai</h2><span class="muted small">waktu pengerjaan per task</span></div><div class="card-b" style="padding-top:6px;overflow:auto" id="hist"></div></div>
    <p class="def">Definisi — <b>Waktu pengerjaan</b>: dari tombol "Mulai" ditekan (atau jadwal mulai bila tidak ditekan) sampai "Done". <b>Overperforming</b>: selesai sebelum deadline dan memakai ≤ ${Math.round(L.OVERPERFORM_RATIO * 100)}% durasi rencana. <b>Tepat waktu</b>: selesai sebelum/tepat deadline. Jam default bila kolom jam kosong: mulai ${L.DEFAULT_START}, deadline ${L.DEFAULT_END}.</p>`;

  $$('#per button').forEach((b) => b.onclick = () => { f.period = b.dataset.k; go('dashboard'); });
  if ($('#person')) $('#person').onchange = (e) => { f.person = e.target.value; go('dashboard'); };

  renderDist(sum);
  if (team) { renderPersonChart(tasks, range); renderBoard(tasks, range); } else renderWeeklyChart(tasks);
  renderHistory(sum, admin);
}

function legendOutcome() {
  return [['--good', 'Overperforming'], ['--info', 'Tepat waktu'], ['--bad', 'Terlambat'], ['--warn', 'Overdue']]
    .map(([c, l]) => `<span><i class="dot" style="background:${css(c)}"></i>${l}</span>`).join('');
}

function renderDist(sum) {
  const rows = [['Overperforming', sum.over, '--good'], ['Tepat waktu', sum.ontime, '--info'], ['Selesai terlambat', sum.late, '--bad'],
    ['Overdue aktif', sum.overdue, '--warn'], ['Masih berjalan', sum.open, '--muted']];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  $('#dist').innerHTML = rows.map(([l, n, c]) => `
    <div style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:5px"><span class="row" style="gap:7px"><i class="dot" style="background:${css(c)}"></i>${l}</span><b style="font-variant-numeric:tabular-nums">${n}</b></div>
      <div class="bar" style="height:8px"><i style="width:${(n / max) * 100}%;background:${css(c)}"></i></div>
    </div>`).join('') + `<p class="muted small" style="margin:6px 0 0">Total ${sum.total} task dalam periode ini.</p>`;
}

function chartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--text-2');
  Chart.defaults.borderColor = css('--border');
}

function renderPersonChart(tasks, range) {
  chartDefaults();
  const people = L.byPerson(tasks, range).sort((a, b) => a.name.localeCompare(b.name));
  const ds = [['over', 'Overperforming', '--good'], ['ontime', 'Tepat waktu', '--info'], ['late', 'Terlambat', '--bad'], ['overdue', 'Overdue', '--warn']]
    .map(([k, l, c]) => ({ label: l, data: people.map((p) => p[k]), backgroundColor: css(c), borderColor: css('--surface'), borderWidth: { right: 2 }, borderRadius: 4, borderSkipped: false, barThickness: 16 }));
  S.charts.push(new Chart($('#c1'), {
    type: 'bar', data: { labels: people.map((p) => p.name), datasets: ds },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { stacked: true, ticks: { precision: 0 }, grid: { color: css('--border') } }, y: { stacked: true, grid: { display: false } } }
    }
  }));
}

function renderWeeklyChart(tasks) {
  chartDefaults();
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 7);
  for (let i = 0; i < 8; i++) { const d = new Date(start); d.setDate(d.getDate() + i * 7); weeks.push(d); }
  const counts = weeks.map((w, i) => {
    const end = i < 7 ? weeks[i + 1] : new Date(w.getTime() + 7 * 864e5);
    return tasks.filter((t) => L.isDone(t) && t.doneAt && new Date(t.doneAt) >= w && new Date(t.doneAt) < end).length;
  });
  S.charts.push(new Chart($('#c1'), {
    type: 'bar',
    data: { labels: weeks.map((w) => fmtD(w)), datasets: [{ label: 'Task selesai', data: counts, backgroundColor: css('--series-1'), borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => 'Minggu ' + it[0].label } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: css('--border') } }, x: { grid: { display: false } } }
    }
  }));
}

function renderBoard(tasks, range) {
  const ppl = L.byPerson(tasks, range).sort((a, b) => ((b.onTimeRate || 0) - (a.onTimeRate || 0)) || (b.over - a.over) || (b.done - a.done));
  $('#board').innerHTML = `<table class="tbl"><thead><tr><th>#</th><th>Nama</th><th class="num">Task</th><th class="num">Done</th><th>Penyelesaian</th><th class="num">Tepat waktu</th><th class="num" title="Overperforming">Over&shy;perform</th><th class="num">Telat</th><th class="num">Overdue</th><th class="num">Rata² durasi</th><th class="num">Rata² selisih</th></tr></thead><tbody>
    ${ppl.map((p, i) => `<tr><td class="muted">${i + 1}</td><td><div class="row" style="gap:8px"><span class="avatar" style="width:26px;height:26px;font-size:11px">${initials(p.name)}</span><b>${esc(p.name)}</b></div></td>
      <td class="num">${p.total}</td><td class="num">${p.done}</td>
      <td><div class="row" style="gap:8px"><div class="bar" style="flex:1;min-width:60px"><i style="width:${p.completionRate * 100}%"></i></div><span class="small" style="width:34px">${pct(p.completionRate)}</span></div></td>
      <td class="num">${pct(p.onTimeRate)}</td><td class="num">${p.over ? `<span class="chip good">★ ${p.over}</span>` : '0'}</td>
      <td class="num">${p.late ? `<span class="chip bad">${p.late}</span>` : '0'}</td><td class="num">${p.overdue ? `<span class="chip warn">${p.overdue}</span>` : '0'}</td>
      <td class="num nw">${L.humanDuration(p.avgDurationMs)}</td><td class="num nw">${p.avgSlackMs === null ? '–' : (p.avgSlackMs >= 0 ? '+' : '') + L.humanDuration(p.avgSlackMs)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderHistory(sum, admin) {
  const rows = sum.rows.filter((x) => L.isDone(x.t)).sort((a, b) => (b.e.doneAt || 0) - (a.e.doneAt || 0)).slice(0, 60);
  if (!rows.length) { $('#hist').innerHTML = '<div class="empty"><b>Belum ada task selesai</b>di periode ini.</div>'; return; }
  $('#hist').innerHTML = `<table class="tbl"><thead><tr><th>Task</th>${admin ? '<th>PIC</th>' : ''}<th>Mulai kerja</th><th>Done</th><th class="num">Durasi kerja</th><th class="num">Rencana</th><th class="num">Selisih</th><th>Hasil</th></tr></thead><tbody>
    ${rows.map(({ t, e }) => `<tr><td class="clip" title="${esc(t.task)}">${t.code ? `<span class="chip code">${esc(t.code)}</span> ` : ''}${esc(t.task.replace(/^https?:\/\/(www\.)?/, ''))}</td>
      ${admin ? `<td>${esc(t.ownerName)}</td>` : ''}<td class="nw">${fmtS(e.startedAt || e.plannedStart)}</td><td class="nw">${fmtS(e.doneAt)}</td>
      <td class="num nw">${L.humanDuration(e.durationMs)}</td><td class="num nw">${L.humanDuration(e.plannedMs)}</td>
      <td class="num nw">${e.slackMs === null ? '–' : (e.slackMs >= 0 ? '+' : '') + L.humanDuration(e.slackMs)}</td><td class="nw">${outcomeChip(t)}</td></tr>`).join('')}
  </tbody></table>`;
}

// ---------- Admin: Semua Task ----------
function viewTasks() {
  const f = S.f, all = S.all;
  const people = all.users.filter((u) => u.sheetName);
  const codes = all.projects.filter((p) => p.code);
  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" id="tq" placeholder="Cari task…" value="${esc(f.tq)}">
      <select id="towner"><option value="all">Semua orang</option>${people.map((u) => `<option value="${esc(u.username)}" ${f.towner === u.username ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select id="tstatus">${[['active', 'Belum selesai'], ['overdue', 'Terlambat'], ['all', 'Semua status']].concat(STATUSES.map((s) => [s, s])).map(([k, l]) => `<option value="${k}" ${f.tstatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="tcode"><option value="all">Semua project</option>${codes.map((p) => `<option value="${esc(p.code)}" ${f.tcode === p.code ? 'selected' : ''}>${esc(p.code)} — ${esc(p.project.slice(0, 40))}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn primary" id="newtask">+ Task baru</button>
    </div>
    <div class="card" style="overflow:auto" id="tt"></div>`;
  $('#tq').oninput = (e) => { f.tq = e.target.value; renderTaskTable(); };
  ['towner', 'tstatus', 'tcode'].forEach((k) => $('#' + k).onchange = (e) => { f[k] = e.target.value; renderTaskTable(); });
  $('#newtask').onclick = () => taskModal(null);
  renderTaskTable();
}

function renderTaskTable() {
  const f = S.f, q = f.tq.toLowerCase();
  let list = S.all.tasks.filter((t) =>
    (!q || (t.task + ' ' + t.ownerName + ' ' + t.code).toLowerCase().includes(q)) &&
    (f.towner === 'all' || t.owner === f.towner) &&
    (f.tcode === 'all' || t.code === f.tcode) &&
    (f.tstatus === 'all' || (f.tstatus === 'active' ? !L.isDone(t) : f.tstatus === 'overdue' ? L.bucket(t) === 'overdue' : t.status === f.tstatus)));
  list = list.sort((a, b) => (L.schedule(a).end || Infinity) - (L.schedule(b).end || Infinity));
  if (!list.length) { $('#tt').innerHTML = '<div class="empty"><b>Tidak ada task</b>Ubah filter atau buat task baru.</div>'; return; }
  if (matchMedia('(max-width: 760px)').matches) {
    $('#tt').innerHTML = list.map((t) => `<div class="task">
      <div>
        <div class="task-proj">${t.code ? `<span class="chip code">${esc(t.code)}</span>` : ''}<b style="color:var(--text-2)">${esc(t.ownerName)}</b></div>
        <div class="task-title">${prettyTitle(t.task)}</div>
        <div class="task-meta">${statusChip(t.status)}${priorityChip(t.priority)}<span>🗓 ${scheduleText(t)}</span><span>${L.isDone(t) ? outcomeChip(t) : timing(t)}</span></div>
      </div>
      <div class="task-actions"><button class="btn sm" data-edit="${esc(t.id)}">Edit</button><button class="btn sm danger" data-del="${esc(t.id)}">Hapus</button></div>
    </div>`).join('');
  } else $('#tt').innerHTML = `<table class="tbl"><thead><tr><th>Code</th><th>Task</th><th>PIC</th><th>Mulai</th><th>Deadline</th><th>Status</th><th>Prioritas</th><th>Keterangan</th><th></th></tr></thead><tbody>
    ${list.map((t) => { const s = L.schedule(t); return `<tr>
      <td>${t.code ? `<span class="chip code">${esc(t.code)}</span>` : ''}</td>
      <td class="clip" title="${esc(t.task)}">${prettyTitle(t.task)}</td><td>${esc(t.ownerName)}</td>
      <td class="nw">${s.start ? fmtS(s.start) : esc(t.startRaw || '–')}</td><td class="nw">${s.end ? fmtS(s.end) : esc(t.endRaw || '–')}</td>
      <td class="nw">${statusChip(t.status)}</td><td class="nw">${priorityChip(t.priority)}</td><td class="small nw">${L.isDone(t) ? outcomeChip(t) : timing(t)}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-edit="${esc(t.id)}">Edit</button> <button class="btn sm danger" data-del="${esc(t.id)}">Hapus</button></td></tr>`; }).join('')}
  </tbody></table>`;
  $$('[data-ext]', $('#tt')).forEach((a) => a.onclick = (e) => { e.preventDefault(); api.openExternal(a.dataset.ext); });
  $$('[data-edit]').forEach((b) => b.onclick = () => taskModal(S.all.tasks.find((t) => t.id === b.dataset.edit)));
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    const t = S.all.tasks.find((x) => x.id === b.dataset.del);
    if (!t.id) return toast('Task belum punya Task ID. Jalankan Setup di spreadsheet.', true);
    if (!(await confirmBox('Hapus task?', `"${t.task}" milik ${t.ownerName} akan dihapus dari spreadsheet.`))) return;
    await busy(null, () => api.call('deleteTask', { taskId: t.id }));
    toast('Task dihapus'); await loadData(true); go('tasks');
  });
}

function taskModal(t) {
  const all = S.all, edit = !!t;
  t = t || { owner: S.f.towner !== 'all' ? S.f.towner : '', code: S.f.tcode !== 'all' ? S.f.tcode : '', startTime: '09:00', endTime: '17:00', priority: 'Medium', status: 'Backlog' };
  if (edit && !t.id) return toast('Task ini belum punya Task ID. Jalankan menu Setup di spreadsheet.', true);
  const people = all.users.filter((u) => u.sheetName && u.active);
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label || v)}</option>`;
  modal({
    title: edit ? 'Edit task' : 'Task baru', wide: true,
    body: `<form id="tf">
      <div class="grid2">
        <label class="field"><span>Penanggung jawab *</span><select name="owner" required><option value="">Pilih…</option>${people.map((u) => opt(u.username, t.owner, u.name)).join('')}</select></label>
        <label class="field"><span>Project</span><select name="code"><option value="">— tanpa project —</option>${all.projects.filter((p) => p.code).map((p) => opt(p.code, t.code, p.code + ' — ' + p.project.slice(0, 50))).join('')}</select></label>
      </div>
      <label class="field"><span>Nama task / URL *</span><textarea name="task" rows="2" required>${esc(t.task || '')}</textarea></label>
      <div class="grid4">
        <label class="field"><span>Tanggal mulai</span><input type="date" name="startDate" value="${esc(t.startDate || '')}"></label>
        <label class="field"><span>Jam mulai</span><input type="time" name="startTime" value="${esc(t.startTime || '09:00')}"></label>
        <label class="field"><span>Deadline</span><input type="date" name="endDate" value="${esc(t.endDate || '')}"></label>
        <label class="field"><span>Jam deadline</span><input type="time" name="endTime" value="${esc(t.endTime || '17:00')}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Prioritas</span><select name="priority">${PRIORITIES.map((p) => opt(p, t.priority || 'Medium')).join('')}</select></label>
        <label class="field"><span>Status</span><select name="status">${STATUSES.map((s) => opt(s, t.status || 'Backlog')).join('')}</select></label>
      </div>
      <label class="field"><span>Catatan</span><textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></label>
      <div id="terr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">${edit ? 'Simpan' : 'Buat task'}</button>`,
    onMount: (m, close) => {
      const f = $('#tf', m);
      f.startDate.addEventListener('change', () => { if (!f.endDate.value) f.endDate.value = f.startDate.value; });
      $('#save', m).onclick = async () => {
        if (!f.reportValidity()) return;
        const data = Object.fromEntries(new FormData(f).entries());
        const s = L.at(data.startDate, data.startTime), e = L.at(data.endDate, data.endTime);
        if (s && e && e < s) { $('#terr', m).innerHTML = '<div class="error">Deadline tidak boleh sebelum waktu mulai.</div>'; return; }
        if (edit) data.id = t.id;
        try {
          await busy($('#save', m), () => api.call('saveTask', { task: data }));
          close(); toast(edit ? 'Task diperbarui' : 'Task dibuat & dibagikan'); await loadData(true); go(S.view);
        } catch (err) { $('#terr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

// ---------- Admin: Project ----------
function viewProjects() {
  const all = S.all;
  $('#view').innerHTML = `<div class="toolbar"><span class="muted small">${all.projects.length} project</span><span class="spacer"></span><button class="btn primary" id="newp">+ Project baru</button></div>
    <div class="card" style="overflow:auto">${all.projects.length ? `<table class="tbl"><thead><tr><th>Code</th><th>Project</th><th>PIC</th><th>Mulai</th><th>Selesai</th><th>Prioritas</th><th>Status</th><th>Progres task</th><th></th></tr></thead><tbody>
    ${all.projects.map((p) => {
      const ts = all.tasks.filter((t) => t.code && t.code === p.code);
      const d = ts.filter(L.isDone).length, r = ts.length ? d / ts.length : 0;
      return `<tr><td><span class="chip code">${esc(p.code)}</span></td><td class="clip" title="${esc(p.project)}"><b>${esc(p.project)}</b></td><td class="small">${esc(p.pic)}</td>
        <td>${fmtIso(p.start, p.startRaw)}</td><td>${fmtIso(p.end, p.endRaw)}</td><td>${priorityChip(p.priority)}</td><td>${statusChip(p.status)}</td>
        <td><div class="row" style="gap:8px"><div class="bar" style="flex:1"><i style="width:${r * 100}%"></i></div><span class="small muted">${d}/${ts.length}</span></div></td>
        <td style="white-space:nowrap"><button class="btn sm" data-pe="${p.row}">Edit</button> <button class="btn sm danger" data-pd="${p.row}">Hapus</button></td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty"><b>Belum ada project</b></div>'}</div>`;
  $('#newp').onclick = () => projectModal(null);
  $$('[data-pe]').forEach((b) => b.onclick = () => projectModal(all.projects.find((p) => String(p.row) === b.dataset.pe)));
  $$('[data-pd]').forEach((b) => b.onclick = async () => {
    const p = all.projects.find((x) => String(x.row) === b.dataset.pd);
    if (!(await confirmBox('Hapus project?', `${p.code} — ${p.project} akan dihapus dari tab Main Project. Task terkait tidak ikut terhapus.`))) return;
    await busy(null, () => api.call('deleteProject', { row: p.row, code: p.code }));
    toast('Project dihapus'); await loadData(true); go('projects');
  });
}

function projectModal(p) {
  const edit = !!p;
  p = p || { priority: 'High', status: 'Backlog' };
  const opt = (v, cur) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`;
  const names = S.all.users.filter((u) => u.sheetName).map((u) => u.name).join(', ');
  modal({
    title: edit ? 'Edit project' : 'Project baru',
    body: `<form id="pf">
      <div class="grid2"><label class="field"><span>Code</span><input name="code" value="${esc(p.code || '')}" placeholder="mis. B7"></label>
      <label class="field"><span>Prioritas</span><select name="priority">${PRIORITIES.map((x) => opt(x, p.priority)).join('')}</select></label></div>
      <label class="field"><span>Nama project *</span><textarea name="project" rows="2" required>${esc(p.project || '')}</textarea></label>
      <label class="field"><span>PIC (pisahkan dengan koma)</span><input name="pic" value="${esc(p.pic || '')}" placeholder="${esc(names)}"></label>
      <div class="grid2"><label class="field"><span>Mulai</span><input type="date" name="start" value="${esc(p.start || '')}"></label>
      <label class="field"><span>Selesai</span><input type="date" name="end" value="${esc(p.end || '')}"></label></div>
      <label class="field"><span>Status</span><select name="status">${STATUSES.map((x) => opt(x, p.status)).join('')}</select></label>
      <div id="perr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      $('#save', m).onclick = async () => {
        const f = $('#pf', m); if (!f.reportValidity()) return;
        const data = Object.fromEntries(new FormData(f).entries());
        if (edit) { data.row = p.row; data.originalCode = p.code; }
        try { await busy($('#save', m), () => api.call('saveProject', { project: data })); close(); toast('Project disimpan'); await loadData(true); go('projects'); }
        catch (err) { $('#perr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

// ---------- Admin: Pengguna ----------
function viewUsers() {
  const all = S.all;
  const noEmail = all.users.filter((u) => u.sheetName && u.active && !u.email).length;
  $('#view').innerHTML = `${all.notifications === false ? `<div class="banner warn"><div><b>Pengingat Google Calendar & email belum aktif.</b> Buka spreadsheet → menu <b>Project Tracker → 2. Aktifkan Calendar &amp; email pengingat</b>, lalu deploy ulang Web App.</div></div>` : ''}
    ${noEmail ? `<div class="banner"><div><b>${noEmail} anggota belum punya email</b> — task mereka belum masuk Google Calendar. Isi lewat tombol Edit, atau minta mereka mengisinya di Pengaturan.</div></div>` : ''}
    <div class="toolbar"><span class="muted small">${all.users.length} akun</span><span class="spacer"></span><button class="btn primary" id="newu">+ Pengguna</button></div>
    <div class="card" style="overflow:auto"><table class="tbl"><thead><tr><th>Nama</th><th>Username</th><th>Email (Calendar)</th><th>Role</th><th>Tab task</th><th class="num">Task aktif</th><th>Status</th><th></th></tr></thead><tbody>
    ${all.users.map((u) => `<tr><td><div class="row" style="gap:8px"><span class="avatar" style="width:26px;height:26px;font-size:11px">${initials(u.name)}</span><b>${esc(u.name)}</b></div></td>
      <td><code>${esc(u.username)}</code></td><td class="small">${u.email ? esc(u.email) : (u.sheetName ? '<span class="chip warn">belum diisi</span>' : '<span class="muted">—</span>')}</td><td>${u.role === 'admin' ? '<span class="chip accent">Admin</span>' : 'Anggota'}</td>
      <td>${u.sheetName ? esc(u.sheetName) : '<span class="muted">—</span>'}</td>
      <td class="num">${all.tasks.filter((t) => t.owner === u.username && !L.isDone(t)).length}</td>
      <td>${!u.active ? '<span class="chip">Nonaktif</span>' : u.mustChange ? '<span class="chip warn">Belum login</span>' : '<span class="chip good">Aktif</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-ue="${esc(u.username)}">Edit</button> <button class="btn sm" data-ur="${esc(u.username)}">Reset password</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="def">Setiap anggota dengan tab task punya satu tab di spreadsheet (nama tab = kolom "Tab task"). Password tersimpan sebagai hash di tab Users dan tidak bisa dilihat siapa pun.</p>`;
  $('#newu').onclick = () => userModal(null);
  $$('[data-ue]').forEach((b) => b.onclick = () => userModal(all.users.find((u) => u.username === b.dataset.ue)));
  $$('[data-ur]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Reset password?', `Password ${b.dataset.ur} akan diganti dengan password sementara baru.`, 'Reset'))) return;
    const r = await busy(null, () => api.call('resetPassword', { username: b.dataset.ur }));
    showPassword(b.dataset.ur, r.password); await loadData(true); go('users');
  });
}

function userModal(u) {
  const edit = !!u;
  u = u || { role: 'member', active: true };
  modal({
    title: edit ? 'Edit pengguna' : 'Pengguna baru',
    body: `<form id="uf">
      <label class="field"><span>Nama *</span><input name="name" value="${esc(u.name || '')}" required placeholder="mis. Wildan"></label>
      <label class="field"><span>Username *</span><input name="username" value="${esc(u.username || '')}" ${edit ? 'readonly' : ''} required pattern="[a-zA-Z0-9._-]+" placeholder="huruf kecil tanpa spasi"></label>
      <label class="field"><span>Email (untuk Google Calendar &amp; pengingat)</span><input type="email" name="email" value="${esc(u.email || '')}" placeholder="nama@perusahaan.com"></label>
      <label class="field"><span>Role</span><select name="role"><option value="member" ${u.role !== 'admin' ? 'selected' : ''}>Anggota tim</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>
      <label class="check"><input type="checkbox" name="hasTasks" ${!edit || u.sheetName ? 'checked' : ''} ${edit && u.sheetName ? 'disabled' : ''}> Punya daftar task (membuat tab di spreadsheet)</label>
      ${edit ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Akun aktif (bisa login)</label>` : ''}
      <div id="uerr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      const f = $('#uf', m);
      if (!edit) f.name.addEventListener('input', () => { f.username.value = f.name.value.toLowerCase().replace(/[^a-z0-9._-]+/g, ''); });
      $('#save', m).onclick = async () => {
        if (!f.reportValidity()) return;
        const data = { name: f.name.value.trim(), username: f.username.value.trim().toLowerCase(), role: f.role.value,
          hasTasks: f.hasTasks.checked, active: edit ? f.active.checked : true, email: f.email.value.trim() };
        try {
          const r = await busy($('#save', m), () => api.call('saveUser', { user: data }));
          close(); await loadData(true); go('users');
          if (r.password) showPassword(data.username, r.password); else toast('Pengguna disimpan');
        } catch (err) { $('#uerr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

function showPassword(username, pw) {
  modal({
    title: 'Password sementara',
    body: `<p>Berikan ke <b>${esc(username)}</b>. Password ini hanya ditampilkan sekali dan wajib diganti saat login pertama.</p>
      <div class="pw-box">${esc(pw)}</div>`,
    actions: `<button class="btn" id="cp">Salin</button><button class="btn primary" data-close>Selesai</button>`,
    onMount: (m) => { $('#cp', m).onclick = () => { navigator.clipboard.writeText(pw); toast('Disalin'); }; }
  });
}

// ---------- Pengaturan ----------
function viewSettings() {
  const c = S.cfg;
  const perm = { granted: ['good', 'Aktif'], denied: ['bad', 'Diblokir'], default: ['warn', 'Belum diizinkan'], unsupported: ['', 'Tidak didukung'] }[c.notifPermission] || ['', c.notifPermission];
  const adminOff = S.user.role === 'admin' && S.all && S.all.notifications === false;
  let install;
  if (c.installed) install = '<p>✓ Project Tracker sudah terpasang di perangkat ini.</p>';
  else if (c.canInstall) install = '<p>Pasang sebagai aplikasi agar bisa dibuka dari desktop/home screen tanpa membuka browser.</p><button class="btn primary" id="inst">Pasang aplikasi</button>';
  else if (c.ios) install = '<p>Di iPhone/iPad: buka di <b>Safari</b>, ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas), lalu pilih <b>Tambah ke Layar Utama</b>.</p>';
  else install = '<p>Di Chrome/Edge: klik ikon <b>Install</b> di ujung kanan kolom alamat, atau menu <b>⋮ → Install Project Tracker</b>. Di Android: menu <b>⋮ → Tambahkan ke layar utama</b>.</p>';
  $('#view').innerHTML = `
    <div class="card settings-sect"><div class="card-h"><h2>Google Calendar &amp; email</h2></div><div class="card-b">
      <p>Setiap task Anda otomatis masuk Google Calendar sebagai event <b>▶ mulai</b> dan <b>⏰ deadline</b>, sehingga notifikasi muncul di HP dan laptop walau Project Tracker tidak dibuka. Email pengingat dikirim saat deadline tinggal 24 jam dan saat terlewat, plus ringkasan setiap pagi.</p>
      ${adminOff ? '<div class="banner warn"><div>Fitur ini belum diaktifkan. Admin: buka spreadsheet → menu <b>Project Tracker → 2. Aktifkan Calendar &amp; email pengingat</b>.</div></div>' : ''}
      <form id="ef" class="row" style="flex-wrap:wrap">
        <input type="email" name="email" required placeholder="nama@perusahaan.com" value="${esc(S.user.email || '')}" style="flex:1;min-width:220px">
        <button class="btn primary">Simpan email</button>
      </form>
      <p class="muted small" style="margin:10px 0 0">Gunakan email Google (Workspace/Gmail) yang Anda pakai untuk Google Calendar.</p>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Notifikasi browser</h2><span class="chip ${perm[0]}">${perm[1]}</span></div><div class="card-b">
      <p>Muncul selama Project Tracker terbuka (tab browser atau aplikasi terpasang): saat <b>jam mulai task</b>, sebelum deadline, dan saat <b>melewati deadline</b>.</p>
      ${c.notifPermission === 'denied' ? '<p class="small" style="color:var(--bad)">Notifikasi diblokir. Klik ikon gembok di kolom alamat browser → izinkan Notifikasi, lalu muat ulang.</p>' : ''}
      ${REMINDER_OPTS.map(([m, l]) => `<label class="check"><input type="checkbox" data-rem="${m}" ${c.reminders.includes(m) ? 'checked' : ''}> ${l}</label>`).join('')}
      <div class="row" style="margin-top:12px;flex-wrap:wrap">
        ${c.notifPermission === 'default' ? '<button class="btn primary" id="perm">Izinkan notifikasi</button>' : ''}
        <button class="btn" id="tn" ${c.notifPermission === 'unsupported' || c.notifPermission === 'denied' ? 'disabled' : ''}>Kirim notifikasi uji</button>
      </div>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>AILA (asisten di Mac)</h2><span class="chip" id="aila-chip">Memeriksa…</span></div><div class="card-b">
      <p>Teruskan pengingat task ke AILA di Mac ini: jam mulai, deadline 1 jam lagi, dan lewat deadline muncul sebagai kapsul AILA yang berbunyi; pengingat yang lebih jauh dibacakan sekali. Hanya berlaku di perangkat ini.</p>
      <form id="aila-f" class="row" style="flex-wrap:wrap">
        <input type="password" name="token" autocomplete="off" placeholder="${api.aila.config().adaToken ? 'Token tersimpan · tempel lagi untuk mengganti' : 'Tempel token dari AILA → Pengaturan → Aplikasi lain'}" style="flex:1;min-width:220px">
        <button class="btn primary">Simpan token</button>
      </form>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="aila-on" ${api.aila.config().aktif ? 'checked' : ''}> Teruskan pengingat ke AILA</label>
      <div class="row" style="margin-top:12px"><button class="btn" id="aila-uji">Kirim notifikasi uji ke AILA</button></div>
    </div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Pasang di perangkat</h2></div><div class="card-b">${install}</div></div>
    <div class="card settings-sect"><div class="card-h"><h2>Akun</h2></div><div class="card-b">
      <p>Masuk sebagai <b>${esc(S.user.name)}</b> (${esc(S.user.username)}).</p>
      <div class="row"><button class="btn" id="cpw">Ganti password</button><button class="btn danger" id="lo">Keluar</button></div>
    </div></div>
    ${c.apiLocked && !c.demo ? '' : `<div class="card settings-sect"><div class="card-h"><h2>Server</h2></div><div class="card-b">
      <p>${c.demo ? 'Sedang dalam <b>mode demo</b> — data tidak tersimpan ke spreadsheet.' : `Terhubung ke:<br><code class="small" style="word-break:break-all">${esc(c.apiUrl)}</code>`}</p>
      <button class="btn" id="srv">${c.demo ? 'Keluar dari mode demo' : 'Ganti alamat server'}</button>
    </div></div>`}
    <p class="def">Project Tracker v${esc(c.version)}</p>`;
  $('#ef').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await busy($('#ef button'), () => api.call('setMyEmail', { email: e.target.email.value.trim() }));
      S.user = Object.assign(S.user, r.user);
      toast(S.cfg.demo ? 'Email disimpan (mode demo)' : 'Email disimpan — task akan muncul di Google Calendar dalam beberapa menit');
    } catch (err) { /* toast sudah tampil */ }
  };
  $$('[data-rem]').forEach((x) => x.onchange = async () => {
    const r = $$('[data-rem]').filter((i) => i.checked).map((i) => Number(i.dataset.rem));
    await api.setConfig({ reminders: r }); S.cfg = await api.config(); toast('Pengingat disimpan');
  });
  if ($('#perm')) $('#perm').onclick = async () => { await api.requestNotifications(); S.cfg = await api.config(); viewSettings(); };
  $('#tn').onclick = async () => { const ok = await api.testNotification(); S.cfg = await api.config(); if (!ok) toast('Notifikasi tidak diizinkan atau tidak didukung browser ini', true); };
  const ailaChip = async () => {
    const on = await api.aila.status(), cfg = api.aila.config(), el = $('#aila-chip'); if (!el) return;
    el.className = 'chip ' + (on && cfg.aktif && cfg.adaToken ? 'good' : on ? 'warn' : '');
    el.textContent = !on ? 'AILA tidak terdeteksi' : !cfg.adaToken ? 'Token belum diisi' : cfg.aktif ? 'Tersambung' : 'Dimatikan';
  };
  ailaChip();
  $('#aila-f').onsubmit = async (e) => {
    e.preventDefault(); const t = e.target.token.value.trim(); if (!t) return;
    api.aila.simpan({ token: t, aktif: true }); e.target.token.value = ''; $('#aila-on').checked = true;
    const r = await api.aila.uji(); toast(r.ok ? 'Tersambung ke AILA' : r.galat, !r.ok); ailaChip();
  };
  $('#aila-on').onchange = (e) => { api.aila.simpan({ aktif: e.target.checked }); toast(e.target.checked ? 'Pengingat diteruskan ke AILA' : 'Tidak diteruskan ke AILA'); ailaChip(); };
  $('#aila-uji').onclick = async () => { const r = await api.aila.uji(); toast(r.ok ? 'Notifikasi uji terkirim ke AILA' : r.galat, !r.ok); ailaChip(); };
  if ($('#inst')) $('#inst').onclick = async () => { await api.install(); S.cfg = await api.config(); viewSettings(); };
  $('#lo').onclick = async () => { await api.logout(); S.user = null; S.cfg = await api.config(); showLogin(); };
  if ($('#srv')) $('#srv').onclick = async () => {
    await api.logout();
    if (c.demo) await api.setConfig({ demo: false });
    S.cfg = await api.config();
    if (S.cfg.apiUrl && c.demo) showLogin(); else showSetup();
  };
  $('#cpw').onclick = () => modal({
    title: 'Ganti password',
    body: `<form id="cf"><label class="field"><span>Password lama</span><input type="password" name="o" required></label>
      <label class="field"><span>Password baru (min. 8 karakter)</span><input type="password" name="n" minlength="8" required></label><div id="cerr"></div></form>`,
    actions: `<button class="btn" data-close>Batal</button><button class="btn primary" id="save">Simpan</button>`,
    onMount: (m, close) => {
      $('#save', m).onclick = async () => {
        const f = $('#cf', m); if (!f.reportValidity()) return;
        try { await busy($('#save', m), () => api.changePassword(f.o.value, f.n.value)); close(); toast('Password diganti'); }
        catch (err) { $('#cerr', m).innerHTML = `<div class="error">${esc(cleanErr(err))}</div>`; }
      };
    }
  });
}

// ---------- event global ----------
$('#btn-refresh').onclick = async () => { await busy($('#btn-refresh'), () => loadData()); go(S.view); };
api.on('auth:expired', () => { S.user = null; toast('Sesi berakhir, silakan login lagi', true); showLogin(); });
api.on('tasks:refreshed', async () => {
  if (!S.user || $('#modal-root').innerHTML) return;
  if (S.view === 'mine' || (S.view === 'dashboard' && S.user.role !== 'admin')) { await loadData(true); go(S.view); }
});
api.on('nav:task', async (id) => {
  if (!S.user || !S.user.sheetName) return;
  S.f.mineTab = 'all'; S.f.mineQ = '';
  go('mine');
  const el = document.getElementById('task-' + id);
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); }
});
setInterval(() => { if (S.user && S.view === 'mine' && !$('#modal-root').innerHTML) renderMineList(); }, 60000);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal-root').innerHTML = ''; });
api.on('install:available', async () => { S.cfg = await api.config(); if (S.user && S.view === 'settings') viewSettings(); });

// ---------- mulai ----------
(async function boot() {
  S.cfg = await api.config();
  if (!S.cfg.apiUrl && !S.cfg.demo) return showSetup();
  if (!S.cfg.user) return showLogin();
  S.user = S.cfg.user;
  if (S.user.mustChange) return showChangePw();
  enterApp();
})();
// ganti tampilan tabel ↔ kartu saat ukuran layar melewati batas HP
matchMedia('(max-width: 760px)').addEventListener('change', () => { if (S.user && ['tasks', 'dashboard'].includes(S.view)) go(S.view); });
