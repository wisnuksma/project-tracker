(function (root) {
// Backend tiruan untuk "Mode demo" — tidak menyentuh Google Sheets.
// Isinya meniru struktur sheet "KPI dan Tracker".
const people = [
  ['ari', 'Ari'], ['ammar', 'Ammar'], ['fahmi', 'Fahmi'], ['winona', 'Winona'],
  ['dany', 'Dany'], ['arya', 'Arya'], ['wisnu', 'Wisnu']
];

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(base, n, h = 0, m = 0) {
  const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d;
}

function build() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const projects = [
    ['A1', 'Optimasi +- 48 article (144 keyword) LinovHR', 'Ari, Fahmi, Ammar, Winona', -2, 33, 'High', 'On-Progress'],
    ['A2', 'Membuat tracking AIO dan visibilitas AI untuk LinovHR', 'Arya, Wisnu', -2, 15, 'High', 'On-Progress'],
    ['A3', 'Membuat NavBar untuk frontend compro LinovHR', 'Arya', -2, 6, 'High', 'On-Progress'],
    ['A5', 'Membuat Sisa Page Solusi (Logistik, Construction, Mining, dll.)', 'Dany', -2, 11, 'High', 'On-Progress'],
    ['A6', 'Report competitor Lawencon di tender terbaru', 'Wisnu', -2, 0, 'High', 'Backlog'],
    ['A7', 'Weekly Report SEO', 'Ari', null, null, 'Medium', 'Recurring'],
    ['B2', 'Fixing Technical Issue - Page with Redirect URL', 'Wisnu, Ari', 0, 33, 'Low', 'Backlog'],
    ['B3', 'Membuat skema FAQ untuk semua possible Landing Page LinovHR', 'Wisnu', 1, 1, 'High', 'Backlog']
  ].map((p, i) => ({
    row: i + 2, code: p[0], project: p[1], pic: p[2],
    start: p[3] === null ? '' : iso(addDays(today, p[3])), startRaw: p[3] === null ? 'Recurring' : '',
    end: p[4] === null ? '' : iso(addDays(today, p[4])), endRaw: p[4] === null ? 'Recurring' : '',
    priority: p[5], status: p[6]
  }));

  const tasks = [];
  let n = 0;
  const add = (owner, code, task, sd, st, ed, et, status, extra = {}) => {
    const name = people.find((p) => p[0] === owner)[1];
    tasks.push(Object.assign({
      id: 'TDEMO' + (++n), owner, ownerName: name, sheet: name, row: n + 1, code, task,
      startDate: sd === null ? '' : iso(addDays(today, sd)), endDate: ed === null ? '' : iso(addDays(today, ed)),
      startRaw: '', endRaw: '', startTime: st, endTime: et, status, priority: 'Medium',
      startedAt: '', doneAt: '', notes: ''
    }, extra));
  };
  const stamp = (d, h, m) => addDays(today, d, h, m).toISOString();
  const now = new Date();
  const nowH = now.getHours();

  // Ari
  add('ari', 'A1', 'https://www.linovhr.com/blog/aplikasi-hr-terbaik-era-digital/', -2, '09:00', 1, '17:00', 'On-Progress', { startedAt: stamp(-2, 9, 20), priority: 'High' });
  add('ari', 'B2', 'Fixing Technical Issue - Page with Redirect URL', 0, '13:00', 33, '17:00', 'Backlog', { priority: 'Low' });
  add('ari', 'A1', 'https://www.linovhr.com/blog/talent-management-strategy/', 1, '09:00', 5, '17:00', 'Backlog');
  add('ari', 'A7', 'Weekly Report SEO', 5, '09:00', 5, '12:00', 'Backlog');
  add('ari', 'A1', 'https://www.linovhr.com/blog/hris-indonesia/', -9, '09:00', -6, '17:00', 'Done', { startedAt: stamp(-9, 9, 5), doneAt: stamp(-7, 15, 30) });
  add('ari', 'A7', 'Weekly Report SEO', -2, '09:00', -2, '12:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-2, 11, 10) });
  // Ammar
  add('ammar', 'A1', 'https://www.linovhr.com/blog/payroll-outsourcing/', -6, '09:00', -3, '17:00', 'Done', { startedAt: stamp(-6, 9, 30), doneAt: stamp(-3, 16, 40) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/aplikasi-absensi/', -3, '09:00', -1, '17:00', 'On-Progress', { startedAt: stamp(-3, 10, 0) });
  add('ammar', 'A1', 'https://www.linovhr.com/blog/kpi-karyawan/', 0, String(Math.min(nowH + 1, 22)).padStart(2, '0') + ':00', 2, '17:00', 'Backlog', { priority: 'High' });
  // Fahmi
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/employee-engagement/', -8, '09:00', -5, '17:00', 'Done', { startedAt: stamp(-8, 9, 0), doneAt: stamp(-7, 14, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/onboarding-karyawan/', -4, '09:00', -2, '17:00', 'Done', { startedAt: stamp(-4, 9, 15), doneAt: stamp(-2, 16, 0) });
  add('fahmi', 'A1', 'https://www.linovhr.com/blog/offboarding/', 0, '09:00', 3, '17:00', 'On-Progress', { startedAt: stamp(0, 9, 5) });
  // Winona
  add('winona', 'A1', 'https://www.linovhr.com/blog/hr-analytics/', -7, '09:00', -4, '17:00', 'Done', { startedAt: stamp(-7, 9, 0), doneAt: stamp(-3, 10, 30) });
  add('winona', 'A1', 'https://www.linovhr.com/blog/reimbursement/', -1, '09:00', 2, '17:00', 'On-Progress', { startedAt: stamp(-1, 9, 40) });
  // Dany
  add('dany', 'A5', 'Page Solusi — Logistik', -5, '09:00', -3, '17:00', 'Done', { startedAt: stamp(-5, 9, 0), doneAt: stamp(-4, 15, 0) });
  add('dany', 'A5', 'Page Solusi — Construction', -3, '09:00', -1, '17:00', 'Done', { startedAt: stamp(-3, 9, 0), doneAt: stamp(-1, 17, 0) });
  add('dany', 'A5', 'Page Solusi — Mining', 0, '09:00', 1, '17:00', 'On-Progress', { startedAt: stamp(0, 9, 10) });
  // Arya
  add('arya', 'A3', 'NavBar — struktur menu & mega menu', -2, '09:00', 0, '17:00', 'Done', { startedAt: stamp(-2, 9, 0), doneAt: stamp(-1, 13, 0) });
  add('arya', 'A2', 'Setup tracking visibilitas AI Overview', -2, '09:00', 4, '17:00', 'On-Progress', { startedAt: stamp(-2, 11, 0) });
  // Wisnu
  add('wisnu', 'A6', 'Discuss dengan Koh Yos terkait competitor Lawencon + report', -2, '09:00', 0, '12:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'B3', 'Skema FAQ untuk semua landing page LinovHR', 1, '09:00', 1, '17:00', 'Backlog', { priority: 'High' });
  add('wisnu', 'A2', 'Riset tools AIO tracking', -9, '09:00', -6, '17:00', 'Done', { startedAt: stamp(-9, 9, 0), doneAt: stamp(-5, 11, 0) });

  const users = [['admin', 'Administrator', 'admin', '']].concat(people.map((p) => [p[0], p[1], 'member', p[1]]))
    .map((u) => ({ username: u[0], name: u[1], role: u[2], sheetName: u[3], mustChange: false, active: true, email: u[0] === 'wisnu' ? '' : u[0] + '@contoh.com' }));
  return { projects, tasks, users };
}

let db = null;
function state() { if (!db) db = build(); return db; }
function reset() { db = null; }

function handle(action, b, session) {
  const s = state();
  const me = session && s.users.find((u) => u.username === session.username);
  switch (action) {
    case 'ping': return { ok: true };
    case 'login': {
      const u = s.users.find((x) => x.username === String(b.username || '').toLowerCase());
      if (!u || b.password !== 'demo') throw new Error('Mode demo: pakai username admin / ari / wisnu dst., password "demo"');
      return { token: 'demo.' + u.username, user: u };
    }
  }
  if (!me) throw new Error('UNAUTHORIZED');
  switch (action) {
    case 'me': return me;
    case 'changePassword': return { user: me };
    case 'setMyEmail': me.email = String(b.email || '').toLowerCase(); return { user: me };
    case 'myTasks': return { tasks: s.tasks.filter((t) => t.owner === me.username), projects: s.projects };
    case 'updateStatus': {
      const t = s.tasks.find((x) => x.id === b.taskId && (me.role === 'admin' || x.owner === me.username));
      if (!t) throw new Error('Task tidak ditemukan');
      if (b.status === 'On-Progress' && !t.startedAt) t.startedAt = new Date().toISOString();
      if (b.status === 'Done') t.doneAt = new Date().toISOString();
      else if (t.status === 'Done') t.doneAt = '';
      t.status = b.status;
      return { task: t };
    }
  }
  if (me.role !== 'admin') throw new Error('Hanya admin yang boleh melakukan ini');
  switch (action) {
    case 'getAll': return { tasks: s.tasks, projects: s.projects, users: s.users, notifications: true,
      statuses: ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'], priorities: ['High', 'Medium', 'Low'] };
    case 'saveTask': {
      const t = b.task; const owner = s.users.find((u) => u.username === t.owner);
      if (!owner) throw new Error('Penanggung jawab tidak ditemukan');
      if (t.id) Object.assign(s.tasks.find((x) => x.id === t.id), t, { ownerName: owner.name });
      else s.tasks.push(Object.assign({ startedAt: '', doneAt: '' }, t, { id: 'TDEMO' + Date.now(), ownerName: owner.name }));
      return { ok: true };
    }
    case 'deleteTask': s.tasks = s.tasks.filter((x) => x.id !== b.taskId); return { ok: true };
    case 'saveProject': {
      const p = b.project;
      if (p.row) Object.assign(s.projects.find((x) => x.row === p.row), p);
      else s.projects.push(Object.assign({}, p, { row: Math.max(...s.projects.map((x) => x.row)) + 1 }));
      return { ok: true };
    }
    case 'deleteProject': s.projects = s.projects.filter((x) => x.row !== b.row); return { ok: true };
    case 'saveUser': {
      const u = b.user; const ex = s.users.find((x) => x.username === u.username);
      if (ex) { Object.assign(ex, u); return { user: ex }; }
      const nu = { username: u.username, name: u.name, role: u.role, sheetName: u.hasTasks === false ? '' : u.name, mustChange: true, active: true, email: u.email || '' };
      s.users.push(nu); return { user: nu, password: 'demo' };
    }
    case 'resetPassword': return { password: 'demo' };
  }
  throw new Error('Aksi tidak dikenal');
}

root.PTDemo = { handle };
})(typeof self !== 'undefined' ? self : this);
