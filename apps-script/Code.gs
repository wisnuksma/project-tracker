/**
 * Project Tracker — backend Google Apps Script
 * Spreadsheet: "KPI dan Tracker"
 *
 * Cara pasang: lihat README.md (bagian "1. Pasang backend di Google Sheets").
 * Ringkasnya: Extensions > Apps Script > tempel file ini > jalankan setup dari
 * menu "Project Tracker" di spreadsheet > Deploy sebagai Web app.
 */

// ===================== Konfigurasi =====================
var CFG = {
  USERS_SHEET: 'Users',
  MAIN_SHEET: 'Main Project',
  LOG_SHEET: 'Activity Log',
  TOKEN_DAYS: 14,
  HASH_ROUNDS: 300,
  MAX_LOGIN_FAIL: 5,
  LOCK_MINUTES: 15,
  // --- Notifikasi (aktif setelah menu "2. Aktifkan Calendar & email") ---
  CAL_NAME: 'Project Tracker',
  SEND_INVITES: false,      // true = kirim email undangan Calendar setiap event dibuat/diubah
  START_EVENT_MIN: 30,      // durasi blok event "mulai" di Calendar
  DUE_EVENT_MIN: 30,        // durasi blok event "deadline" (berakhir tepat di jam deadline)
  EMAIL_DUE_HOURS: 24,      // email pengingat dikirim saat deadline tinggal ≤ 24 jam
  DIGEST_HOUR: 7            // jam ringkasan pagi (Senin–Jumat)
};

var TASK_HEADERS = ['Code', 'Task', 'Start Date', 'End Date', 'Status',
  'Start Time', 'End Time', 'Priority', 'Task ID', 'Started At', 'Done At', 'Notes',
  'Cal Start ID', 'Cal Due ID', 'Cal Sync', 'Reminded'];
var USER_HEADERS = ['Username', 'Name', 'Role', 'Sheet Name', 'Password Hash',
  'Salt', 'Must Change', 'Active', 'Created At', 'Email'];
var MAIN_HEADERS = ['Code', 'Project', 'PIC', 'Start', 'End', 'Priority', 'Status'];
var LOG_HEADERS = ['Timestamp', 'User', 'Action', 'Task ID', 'Detail'];

var STATUSES = ['Backlog', 'On-Progress', 'Review', 'Hold', 'Done', 'Recurring'];
var PRIORITIES = ['High', 'Medium', 'Low'];

// ===================== Menu & setup =====================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Project Tracker')
    .addItem('1. Setup / perbarui struktur', 'setup')
    .addItem('2. Aktifkan Calendar & email pengingat', 'installNotifications')
    .addSeparator()
    .addItem('Sinkronkan Calendar sekarang', 'runReminders')
    .addItem('Matikan Calendar & email pengingat', 'disableNotifications')
    .addItem('Reset password pengguna…', 'menuResetPassword')
    .addToUi();
}

/**
 * Menyiapkan struktur tanpa menghapus data:
 * - menambah kolom baru (Start Time, End Time, Priority, Task ID, Started At, Done At, Notes)
 *   di akhir setiap tab orang
 * - membuat tab Users & Activity Log
 * - membuat akun untuk setiap tab orang + akun admin, dengan password sementara
 */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  var users = getOrCreateSheet_(CFG.USERS_SHEET, USER_HEADERS);
  ensureHeaders_(users, USER_HEADERS);
  ensureHeaders_(getOrCreateSheet_(CFG.LOG_SHEET, LOG_HEADERS), LOG_HEADERS);
  ensureHeaders_(getOrCreateSheet_(CFG.MAIN_SHEET, MAIN_HEADERS), MAIN_HEADERS);

  var existing = {};
  readUsers_().forEach(function (u) { existing[u.username] = u; });
  var created = [];

  var system = [CFG.USERS_SHEET, CFG.MAIN_SHEET, CFG.LOG_SHEET];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (system.indexOf(name) >= 0 || name.charAt(0) === '_') return;
    ensureHeaders_(sh, TASK_HEADERS);
    assignMissingIds_(sh);
    var uname = slug_(name);
    var taken = readUsers_().some(function (u) { return u.sheetName === name; });
    if (!existing[uname] && !taken) {
      var pw = tempPassword_();
      appendUser_(uname, name, 'member', name, pw);
      created.push([uname, name, 'member', pw]);
    }
  });

  if (!existing['admin']) {
    var apw = tempPassword_();
    appendUser_('admin', 'Administrator', 'admin', '', apw);
    created.push(['admin', 'Administrator', 'admin', apw]);
  }

  var html = '<div style="font-family:Arial;font-size:13px">' +
    '<p>Struktur sudah siap. Langkah berikutnya: <b>Deploy &gt; New deployment &gt; Web app</b> ' +
    '(Execute as: <b>Me</b>, Who has access: <b>Anyone</b>), lalu salin URL-nya ke aplikasi.</p>';
  if (created.length) {
    html += '<p><b>Akun baru (password sementara, wajib diganti saat login pertama).</b><br>' +
      'Salin sekarang — password tidak ditampilkan lagi.</p>' +
      '<table border="1" cellpadding="5" style="border-collapse:collapse">' +
      '<tr><th>Username</th><th>Nama</th><th>Role</th><th>Password sementara</th></tr>';
    created.forEach(function (r) {
      html += '<tr><td>' + esc_(r[0]) + '</td><td>' + esc_(r[1]) + '</td><td>' + r[2] +
        '</td><td><code>' + esc_(r[3]) + '</code></td></tr>';
    });
    html += '</table>';
  } else {
    html += '<p>Tidak ada akun baru yang dibuat.</p>';
  }
  html += '</div>';
  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(html).setWidth(560).setHeight(420), 'Project Tracker');
  } catch (e) {
    Logger.log(JSON.stringify(created));
  }
}

function menuResetPassword() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Reset password', 'Username yang direset:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = resetPassword_(res.getResponseText().trim().toLowerCase());
  ui.alert('Password sementara baru: ' + pw + '\nPengguna wajib menggantinya saat login.');
}

// ===================== HTTP =====================
function doGet() {
  return json_({ ok: true, app: 'project-tracker', version: 2 });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Request tidak valid' });
  }
  try {
    return json_({ ok: true, data: route_(body) });
  } catch (err) {
    var msg = String(err && err.message || err);
    return json_({ ok: false, error: msg, code: msg === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : undefined });
  }
}

function route_(b) {
  var a = b.action;
  if (a === 'ping') return { ok: true };
  rememberAppUrl_(b.appUrl);
  if (a === 'login') return login_(b.username, b.password);

  var me = auth_(b.token);
  if (a === 'changePassword') return changePassword_(me, b.oldPassword, b.newPassword);
  if (me.mustChange) throw new Error('Ganti password terlebih dahulu');

  switch (a) {
    case 'me': return publicUser_(me);
    case 'myTasks': return { tasks: me.sheetName ? readTasksOf_(me) : [], projects: readProjects_() };
    case 'updateStatus': return updateStatus_(me, b.taskId, b.status);
    case 'setMyEmail': return setMyEmail_(me, b.email);
  }

  if (me.role !== 'admin') throw new Error('Hanya admin yang boleh melakukan ini');
  switch (a) {
    case 'getAll': return getAll_();
    case 'saveTask': return saveTask_(me, b.task);
    case 'deleteTask': return deleteTask_(me, b.taskId);
    case 'saveProject': return saveProject_(me, b.project);
    case 'deleteProject': return deleteProject_(me, b.row, b.code);
    case 'saveUser': return saveUser_(me, b.user);
    case 'resetPassword': return { password: resetPassword_(b.username) };
  }
  throw new Error('Aksi tidak dikenal: ' + a);
}

// ===================== Auth =====================
function login_(username, password) {
  username = String(username || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= CFG.MAX_LOGIN_FAIL) {
    throw new Error('Terlalu banyak percobaan. Coba lagi dalam ' + CFG.LOCK_MINUTES + ' menit.');
  }
  var u = findUser_(username);
  if (!u || !u.active || hash_(String(password || ''), u.salt) !== u.hash) {
    cache.put(failKey, String(fails + 1), CFG.LOCK_MINUTES * 60);
    throw new Error('Username atau password salah');
  }
  cache.remove(failKey);
  return { token: makeToken_(u.username), user: publicUser_(u) };
}

function changePassword_(me, oldPw, newPw) {
  if (hash_(String(oldPw || ''), me.salt) !== me.hash) throw new Error('Password lama salah');
  newPw = String(newPw || '');
  if (newPw.length < 8) throw new Error('Password baru minimal 8 karakter');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh), salt = Utilities.getUuid();
    sh.getRange(me.row, col['salt'] + 1).setValue(salt);
    sh.getRange(me.row, col['password hash'] + 1).setValue(hash_(newPw, salt));
    sh.getRange(me.row, col['must change'] + 1).setValue(false);
  } finally { lock.releaseLock(); }
  me.mustChange = false;
  return { user: publicUser_(me) };
}

function makeToken_(username) {
  var exp = Date.now() + CFG.TOKEN_DAYS * 864e5;
  var payload = username + '|' + exp;
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}

function auth_(token) {
  if (!token) throw new Error('UNAUTHORIZED');
  var parts = String(token).split('.');
  if (parts.length !== 2) throw new Error('UNAUTHORIZED');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); }
  catch (e) { throw new Error('UNAUTHORIZED'); }
  if (sign_(payload) !== parts[1]) throw new Error('UNAUTHORIZED');
  var p = payload.split('|');
  if (Number(p[1]) < Date.now()) throw new Error('UNAUTHORIZED');
  var u = findUser_(p[0]);
  if (!u || !u.active) throw new Error('UNAUTHORIZED');
  return u;
}

function sign_(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) throw new Error('Backend belum di-setup. Jalankan menu Project Tracker > Setup.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

function hash_(password, salt) {
  var h = salt + '::' + password;
  for (var i = 0; i < CFG.HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + password, Utilities.Charset.UTF_8));
  }
  return h;
}

function tempPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ===================== Users =====================
function readUsers_() {
  var sh = sheet_(CFG.USERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    var username = String(r[col['username']] || '').trim().toLowerCase();
    if (!username) return;
    out.push({
      row: i + 2,
      username: username,
      name: String(r[col['name']] || username),
      role: String(r[col['role']] || 'member').toLowerCase() === 'admin' ? 'admin' : 'member',
      sheetName: String(r[col['sheet name']] || ''),
      hash: String(r[col['password hash']] || ''),
      salt: String(r[col['salt']] || ''),
      mustChange: bool_(r[col['must change']]),
      active: r[col['active']] === '' ? true : bool_(r[col['active']]),
      email: col['email'] === undefined ? '' : String(r[col['email']] || '').trim()
    });
  });
  return out;
}

function findUser_(username) {
  return readUsers_().filter(function (u) { return u.username === username; })[0] || null;
}

function publicUser_(u) {
  return { username: u.username, name: u.name, role: u.role, sheetName: u.sheetName,
    mustChange: u.mustChange, active: u.active, email: u.email || '' };
}

function appendUser_(username, name, role, sheetName, password) {
  var salt = Utilities.getUuid();
  appendObj_(sheet_(CFG.USERS_SHEET), {
    'username': username, 'name': name, 'role': role, 'sheet name': sheetName,
    'password hash': hash_(password, salt), 'salt': salt, 'must change': true,
    'active': true, 'created at': new Date()
  });
}

function resetPassword_(username) {
  var u = findUser_(String(username || '').toLowerCase());
  if (!u) throw new Error('Pengguna tidak ditemukan');
  var pw = tempPassword_(), salt = Utilities.getUuid();
  var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh);
  sh.getRange(u.row, col['salt'] + 1).setValue(salt);
  sh.getRange(u.row, col['password hash'] + 1).setValue(hash_(pw, salt));
  sh.getRange(u.row, col['must change'] + 1).setValue(true);
  CacheService.getScriptCache().remove('fail_' + u.username);
  return pw;
}

function saveUser_(me, data) {
  data = data || {};
  var username = slug_(data.username || data.name || '');
  if (!username) throw new Error('Username wajib diisi');
  var role = data.role === 'admin' ? 'admin' : 'member';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    ensureHeaders_(sheet_(CFG.USERS_SHEET), USER_HEADERS);
    var existing = findUser_(username);
    var sh = sheet_(CFG.USERS_SHEET), col = colMap_(sh);
    if (existing) {
      if (existing.username === me.username && (role !== 'admin' || data.active === false)) {
        throw new Error('Anda tidak bisa menurunkan role atau menonaktifkan akun sendiri');
      }
      sh.getRange(existing.row, col['name'] + 1).setValue(data.name || existing.name);
      sh.getRange(existing.row, col['role'] + 1).setValue(role);
      sh.getRange(existing.row, col['active'] + 1).setValue(data.active !== false);
      if (data.email !== undefined) sh.getRange(existing.row, col['email'] + 1).setValue(cleanEmail_(data.email));
      if (data.hasTasks && !existing.sheetName) {
        var sn = ensurePersonSheet_(data.name || existing.name);
        sh.getRange(existing.row, col['sheet name'] + 1).setValue(sn);
      }
      log_(me, 'update-user', '', username);
      afterChange_(function () { var u2 = findUser_(username); if (u2.sheetName) syncSheet_(u2); });
      return { user: publicUser_(findUser_(username)) };
    }
    var sheetName = data.hasTasks === false ? '' : ensurePersonSheet_(data.name || username);
    var pw = tempPassword_();
    appendUser_(username, data.name || username, role, sheetName, pw);
    if (data.email) {
      var nu = findUser_(username);
      sh.getRange(nu.row, colMap_(sh)['email'] + 1).setValue(cleanEmail_(data.email));
    }
    log_(me, 'create-user', '', username);
    return { user: publicUser_(findUser_(username)), password: pw };
  } finally { lock.releaseLock(); }
}

function ensurePersonSheet_(name) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh, TASK_HEADERS);
  return sh.getName();
}

// ===================== Projects =====================
function readProjects_() {
  var sh = sheet_(CFG.MAIN_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn());
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  var out = [];
  vals.forEach(function (r, i) {
    var code = String(r[col['code']] || '').trim();
    var name = String(r[col['project']] || '').trim();
    if (!code && !name) return;
    out.push({
      row: i + 2, code: code, project: name,
      pic: String(r[col['pic']] || ''),
      start: normDate_(r[col['start']]), startRaw: disp[i][col['start']],
      end: normDate_(r[col['end']]), endRaw: disp[i][col['end']],
      priority: String(r[col['priority']] || ''),
      status: String(r[col['status']] || '')
    });
  });
  return out;
}

function saveProject_(me, p) {
  p = p || {};
  if (!String(p.project || '').trim()) throw new Error('Nama project wajib diisi');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_(CFG.MAIN_SHEET), col = colMap_(sh);
    var obj = {
      'code': p.code || '', 'project': p.project, 'pic': p.pic || '',
      'start': toDateCell_(p.start), 'end': toDateCell_(p.end),
      'priority': p.priority || 'Medium', 'status': p.status || 'Backlog'
    };
    var row;
    if (p.row) {
      row = Number(p.row);
      var cur = String(sh.getRange(row, col['code'] + 1).getValue()).trim();
      if (cur !== String(p.originalCode || '').trim()) {
        throw new Error('Data project berubah di spreadsheet. Muat ulang lalu coba lagi.');
      }
      writeObj_(sh, row, obj);
    } else {
      row = appendObj_(sh, obj);
    }
    formatDateCells_(sh, row, [col['start'], col['end']]);
    log_(me, p.row ? 'update-project' : 'create-project', '', (p.code || '') + ' ' + p.project);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function deleteProject_(me, row, code) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_(CFG.MAIN_SHEET), col = colMap_(sh);
    var cur = String(sh.getRange(Number(row), col['code'] + 1).getValue()).trim();
    if (cur !== String(code || '').trim()) throw new Error('Data project berubah. Muat ulang lalu coba lagi.');
    sh.deleteRow(Number(row));
    log_(me, 'delete-project', '', code);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// ===================== Tasks =====================
function personSheets_() {
  var ss = SpreadsheetApp.getActive();
  var seen = {}, out = [];
  readUsers_().forEach(function (u) {
    if (!u.sheetName || seen[u.sheetName]) return;
    var sh = ss.getSheetByName(u.sheetName);
    if (sh) { seen[u.sheetName] = 1; out.push({ sheet: sh, user: u }); }
  });
  return out;
}

function readTasksOf_(user) {
  var sh = SpreadsheetApp.getActive().getSheetByName(user.sheetName);
  return sh ? readTaskSheet_(sh, user) : [];
}

function readTaskSheet_(sh, user) {
  if (sh.getLastRow() < 2) return [];
  var col = colMap_(sh);
  if (col['task'] === undefined) return [];
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn());
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  var out = [];
  vals.forEach(function (r, i) {
    var t = rowTask_(r, disp[i], col, sh, user, i + 2);
    if (t) out.push(t);
  });
  return out;
}

function rowTask_(r, disp, col, sh, user, row) {
  var title = String(r[col['task']] || '').trim();
  if (!title) return null;
  var g = function (k) { return col[k] === undefined ? '' : r[col[k]]; };
  var d = function (k) { return col[k] === undefined || !disp ? '' : disp[col[k]]; };
  return {
    id: String(g('task id') || ''),
    owner: user.username, ownerName: user.name, sheet: sh.getName(), row: row,
    code: String(g('code') || '').trim(),
    task: title,
    startDate: normDate_(g('start date')), startRaw: d('start date'),
    endDate: normDate_(g('end date')), endRaw: d('end date'),
    startTime: normTime_(g('start time')), endTime: normTime_(g('end time')),
    status: String(g('status') || 'Backlog').trim(),
    priority: String(g('priority') || '').trim(),
    startedAt: normStamp_(g('started at')),
    doneAt: normStamp_(g('done at')),
    notes: String(g('notes') || '')
  };
}

function getAll_() {
  var tasks = [];
  personSheets_().forEach(function (p) { tasks = tasks.concat(readTaskSheet_(p.sheet, p.user)); });
  return { tasks: tasks, projects: readProjects_(), users: readUsers_().map(publicUser_),
    statuses: STATUSES, priorities: PRIORITIES, notifications: calEnabled_() };
}

/** Cari baris task berdasarkan Task ID. Member hanya boleh di tab miliknya. */
function locateTask_(me, taskId) {
  if (!taskId) throw new Error('Task ID kosong');
  var list = me.role === 'admin' ? personSheets_()
    : personSheets_().filter(function (p) { return p.user.username === me.username; });
  for (var i = 0; i < list.length; i++) {
    var sh = list[i].sheet, col = colMap_(sh);
    if (col['task id'] === undefined || sh.getLastRow() < 2) continue;
    var cell = sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1)
      .createTextFinder(String(taskId)).matchEntireCell(true).findNext();
    if (cell) return { sheet: sh, row: cell.getRow(), col: col, user: list[i].user };
  }
  throw new Error('Task tidak ditemukan (mungkin sudah dihapus). Muat ulang data.');
}

function updateStatus_(me, taskId, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Status tidak valid');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var loc = locateTask_(me, taskId), sh = loc.sheet, col = loc.col, row = loc.row;
    var prev = String(sh.getRange(row, col['status'] + 1).getValue());
    sh.getRange(row, col['status'] + 1).setValue(status);
    syncStamps_(sh, row, status, true);
    log_(me, 'status', taskId, prev + ' → ' + status);
    afterChange_(function () { syncRow_(sh, row, loc.user); });
    return { task: readTaskSheet_(sh, loc.user).filter(function (t) { return t.id === taskId; })[0] };
  } finally { lock.releaseLock(); }
}

function saveTask_(me, t) {
  t = t || {};
  if (!String(t.task || '').trim()) throw new Error('Nama task wajib diisi');
  var owner = findUser_(String(t.owner || '').toLowerCase());
  if (!owner) throw new Error('Penanggung jawab tidak ditemukan');
  if (!owner.sheetName) throw new Error(owner.name + ' belum punya tab task. Aktifkan "punya task" di menu Pengguna.');
  if (t.status && STATUSES.indexOf(t.status) < 0) throw new Error('Status tidak valid');

  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActive();
    var target = ss.getSheetByName(owner.sheetName);
    ensureHeaders_(target, TASK_HEADERS);
    var obj = {
      'code': t.code || '', 'task': t.task,
      'start date': toDateCell_(t.startDate), 'end date': toDateCell_(t.endDate),
      'start time': t.startTime || '', 'end time': t.endTime || '',
      'status': t.status || 'Backlog', 'priority': t.priority || 'Medium',
      'notes': t.notes || ''
    };
    var id = t.id;
    if (id) {
      var loc = locateTask_(me, id);
      if (loc.sheet.getName() !== target.getName()) {
        // pindah penanggung jawab: salin timestamp lalu hapus baris lama
        obj['started at'] = loc.sheet.getRange(loc.row, loc.col['started at'] + 1).getValue();
        obj['done at'] = loc.sheet.getRange(loc.row, loc.col['done at'] + 1).getValue();
        obj['task id'] = id;
        afterChange_(function () { deleteRowEvents_(loc.sheet, loc.row); });
        loc.sheet.deleteRow(loc.row);
        var nr = appendObj_(target, obj);
        formatTaskRow_(target, nr);
      } else {
        writeObj_(target, loc.row, obj);
        formatTaskRow_(target, loc.row);
      }
      syncStamps_(target, findRowById_(target, id), obj.status, false);
      log_(me, 'update-task', id, t.task + ' → ' + owner.username);
      afterChange_(function () { syncRow_(target, findRowById_(target, id), owner); });
    } else {
      id = newId_();
      obj['task id'] = id;
      if (obj.status === 'Done') obj['done at'] = new Date();
      if (obj.status === 'On-Progress') obj['started at'] = new Date();
      var row = appendObj_(target, obj);
      formatTaskRow_(target, row);
      log_(me, 'create-task', id, t.task + ' → ' + owner.username);
      afterChange_(function () { syncRow_(target, row, owner); });
    }
    return { id: id };
  } finally { lock.releaseLock(); }
}

/** Menjaga Started At / Done At konsisten dengan status.
 *  stampDoneNow=true: tombol Done ditekan → waktu selesai = sekarang. */
function syncStamps_(sh, row, status, stampDoneNow) {
  if (!row) return;
  var col = colMap_(sh), now = new Date();
  var started = sh.getRange(row, col['started at'] + 1);
  var done = sh.getRange(row, col['done at'] + 1);
  if ((status === 'On-Progress' || status === 'Review') && !started.getValue()) {
    started.setValue(now).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  if (status === 'Done') {
    if (stampDoneNow || !done.getValue()) done.setValue(now).setNumberFormat('yyyy-mm-dd hh:mm');
  } else if (done.getValue()) {
    done.clearContent();
  }
}

function findRowById_(sh, id) {
  var col = colMap_(sh);
  if (sh.getLastRow() < 2) return 0;
  var cell = sh.getRange(2, col['task id'] + 1, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function deleteTask_(me, taskId) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var loc = locateTask_(me, taskId);
    var title = loc.sheet.getRange(loc.row, loc.col['task'] + 1).getValue();
    afterChange_(function () { deleteRowEvents_(loc.sheet, loc.row); });
    loc.sheet.deleteRow(loc.row);
    log_(me, 'delete-task', taskId, title);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function assignMissingIds_(sh) {
  var col = colMap_(sh);
  if (sh.getLastRow() < 2 || col['task'] === undefined) return;
  var n = sh.getLastRow() - 1;
  var titles = sh.getRange(2, col['task'] + 1, n, 1).getValues();
  var idRange = sh.getRange(2, col['task id'] + 1, n, 1);
  var ids = idRange.getValues();
  var changed = false;
  for (var i = 0; i < n; i++) {
    if (String(titles[i][0]).trim() && !String(ids[i][0]).trim()) { ids[i][0] = newId_(); changed = true; }
  }
  if (changed) idRange.setValues(ids);
  ['start time', 'end time'].forEach(function (k) {
    sh.getRange(1, col[k] + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function formatTaskRow_(sh, row) {
  var col = colMap_(sh);
  formatDateCells_(sh, row, [col['start date'], col['end date']]);
  sh.getRange(row, col['start time'] + 1).setNumberFormat('@');
  sh.getRange(row, col['end time'] + 1).setNumberFormat('@');
  [col['started at'], col['done at']].forEach(function (c) {
    sh.getRange(row, c + 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
}

function formatDateCells_(sh, row, cols) {
  cols.forEach(function (c) {
    if (c !== undefined) sh.getRange(row, c + 1).setNumberFormat('d mmmm yyyy');
  });
}

function newId_() {
  return 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ===================== Normalisasi tanggal/jam =====================
var MONTHS_ = {
  jan: 0, january: 0, januari: 0, feb: 1, february: 1, februari: 1, mar: 2, march: 2, maret: 2,
  apr: 3, april: 3, may: 4, mei: 4, jun: 5, june: 5, juni: 5, jul: 6, july: 6, juli: 6,
  aug: 7, august: 7, agu: 7, agustus: 7, agt: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11, des: 11, desember: 11
};

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }

/** Mengembalikan 'yyyy-MM-dd' atau '' (untuk 'TBD', 'Recurring', kosong). */
function normDate_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?$/);
  if (m && MONTHS_[m[2]] !== undefined) {
    var y = m[3] || Utilities.formatDate(new Date(), tz_(), 'yyyy');
    return y + '-' + pad_(MONTHS_[m[2]] + 1) + '-' + pad_(m[1]);
  }
  return '';
}

function normTime_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), 'HH:mm');
  var m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? pad_(m[1]) + ':' + m[2] : '';
}

function normStamp_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  return '';
}

function toDateCell_(iso) {
  var s = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // biarkan teks seperti "TBD" / "Recurring"
  return Utilities.parseDate(s, tz_(), 'yyyy-MM-dd');
}

// ===================== Helper sheet =====================
function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Tambah header yang belum ada di akhir baris 1 — tidak menggeser kolom lama. */
function ensureHeaders_(sh, headers) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var missing = headers.filter(function (h) { return row.indexOf(h.toLowerCase()) < 0; });
  if (!missing.length) return;
  var start = row.join('') === '' ? 1 : sh.getLastColumn() + 1;
  if (start + missing.length - 1 > sh.getMaxColumns()) {
    sh.insertColumnsAfter(sh.getMaxColumns(), start + missing.length - 1 - sh.getMaxColumns());
  }
  sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

function colMap_(sh) {
  var row = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var map = {};
  row.forEach(function (h, i) {
    var k = String(h).trim().toLowerCase();
    if (k && map[k] === undefined) map[k] = i;
  });
  return map;
}

function appendObj_(sh, obj) {
  var col = colMap_(sh);
  var arr = [];
  for (var i = 0; i < sh.getLastColumn(); i++) arr.push('');
  Object.keys(obj).forEach(function (k) { if (col[k] !== undefined) arr[col[k]] = obj[k]; });
  // cari baris kosong pertama berdasarkan kolom pertama yang terisi (hindari baris format kosong)
  var row = lastDataRow_(sh) + 1;
  sh.getRange(row, 1, 1, arr.length).setValues([arr]);
  return row;
}

function writeObj_(sh, row, obj) {
  var col = colMap_(sh);
  Object.keys(obj).forEach(function (k) {
    if (col[k] !== undefined) sh.getRange(row, col[k] + 1).setValue(obj[k]);
  });
}

function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var vals = sh.getRange(1, 1, last, Math.min(sh.getLastColumn(), 3)).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i].join('').trim() !== '') return i + 1;
  }
  return 1;
}

function log_(me, action, taskId, detail) {
  try {
    var sh = getOrCreateSheet_(CFG.LOG_SHEET, LOG_HEADERS);
    sh.appendRow([new Date(), me.username, action, taskId || '', detail || '']);
  } catch (e) { /* log tidak boleh menggagalkan aksi */ }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1; }
function pad_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function slug_(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ''); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

// ===================== Google Calendar & email pengingat =====================
// Setiap task (yang punya tanggal dan penanggung jawab ber-email) dibuat 2 event
// di kalender "Project Tracker" milik pemilik script, dengan penanggung jawab
// sebagai tamu — sehingga muncul di Google Calendar orang itu beserta notifikasinya:
//   ▶ <task>          di jam mulai
//   ⏰ Deadline: <task> berakhir tepat di jam deadline
// Ditambah email: pengingat deadline ≤ 24 jam, email saat lewat deadline,
// dan ringkasan pagi (Senin–Jumat).

function calEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIF_ON') === '1';
}

/** Jalankan efek samping Calendar tanpa pernah menggagalkan aksi utama. */
function afterChange_(fn) {
  if (!calEnabled_()) return;
  try { fn(); } catch (e) { Logger.log('Calendar: ' + e); }
}

function installNotifications() {
  var props = PropertiesService.getScriptProperties();
  getCalendar_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runReminders', 'sendDailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runReminders').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(CFG.DIGEST_HOUR).everyDays(1).inTimezone(tz_()).create();
  props.setProperty('NOTIF_ON', '1');
  readUsers_().forEach(function (u) { if (u.sheetName) ensureHeaders_(sheet_(u.sheetName), TASK_HEADERS); });
  runReminders();
  var missing = readUsers_().filter(function (u) { return u.sheetName && u.active && !u.email; })
    .map(function (u) { return u.name; });
  var msg = 'Calendar & email pengingat aktif.\n\nSinkron berjalan tiap 15 menit dan setiap kali task diubah dari aplikasi. ' +
    'Ringkasan pagi dikirim pukul ' + CFG.DIGEST_HOUR + ':00 (Senin–Jumat).\n\n' +
    'PENTING: Deploy ulang Web App (Deploy > Manage deployments > Edit > New version) agar izin baru berlaku.';
  if (missing.length) msg += '\n\nBelum punya email (isi di aplikasi > Pengguna, atau kolom Email di tab Users):\n• ' + missing.join('\n• ');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function disableNotifications() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runReminders', 'sendDailyDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().setProperty('NOTIF_ON', '0');
  try { SpreadsheetApp.getUi().alert('Pengingat dimatikan. Event yang sudah ada di Calendar tidak dihapus.'); } catch (e) { /* trigger */ }
}

function getCalendar_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CAL_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar(CFG.CAL_NAME, {
      summary: 'Jadwal task dari Project Tracker — dibuat otomatis, jangan diedit manual.',
      color: CalendarApp.Color.TEAL
    });
    props.setProperty('CAL_ID', cal.getId());
  }
  return cal;
}

function rememberAppUrl_(url) {
  if (!url || !/^https:\/\/[^\s]+$/.test(url)) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('APP_URL') !== url) props.setProperty('APP_URL', url);
}
function appUrl_() { return PropertiesService.getScriptProperties().getProperty('APP_URL') || ''; }

function cleanEmail_(e) {
  e = String(e || '').trim().toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Format email tidak valid: ' + e);
  return e;
}

function setMyEmail_(me, email) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_(CFG.USERS_SHEET);
    ensureHeaders_(sh, USER_HEADERS);
    sh.getRange(me.row, colMap_(sh)['email'] + 1).setValue(cleanEmail_(email));
    var u = findUser_(me.username);
    afterChange_(function () { if (u.sheetName) syncSheet_(u); });
    return { user: publicUser_(u) };
  } finally { lock.releaseLock(); }
}

/** Waktu mulai & deadline (Date) sesuai zona waktu spreadsheet; jam default 09:00 / 17:00. */
function taskTimes_(t) {
  var tz = tz_();
  var at = function (d, time, def) {
    return d ? Utilities.parseDate(d + ' ' + (time || def), tz, 'yyyy-MM-dd HH:mm') : null;
  };
  return { start: at(t.startDate, t.startTime, '09:00'), end: at(t.endDate, t.endTime, '17:00') };
}

function wantsReminders_(t) {
  return ['Done', 'Hold', 'Recurring'].indexOf(t.status) < 0;
}

function syncRow_(sh, row, user) {
  if (!row) return;
  var col = colMap_(sh);
  var r = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  syncValues_(sh, row, r, col, user, getCalendar_());
}

function syncSheet_(user) {
  var sh = sheet_(user.sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  ensureHeaders_(sh, TASK_HEADERS);
  var col = colMap_(sh), cal = getCalendar_();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  vals.forEach(function (r, i) { syncValues_(sh, i + 2, r, col, user, cal); });
}

/** Membuat/menghapus event Calendar untuk satu baris bila datanya berubah. */
function syncValues_(sh, row, r, col, user, cal) {
  if (col['cal sync'] === undefined) return;
  var t = rowTask_(r, null, col, sh, user, row);
  var curSig = String(r[col['cal sync']] || '');
  var ids = [String(r[col['cal start id']] || ''), String(r[col['cal due id']] || '')];
  var tm = t ? taskTimes_(t) : {};
  var want = t && user.active && user.email && wantsReminders_(t) && (tm.start || tm.end);
  var sig = want ? [user.email, t.code, t.task, tm.start ? tm.start.getTime() : '', tm.end ? tm.end.getTime() : ''].join('|') : '';
  if (sig === curSig) return;

  ids.forEach(function (id) { deleteEvent_(cal, id); });
  var newIds = ['', ''];
  if (want) {
    var label = (t.code ? '[' + t.code + '] ' : '') + t.task;
    var desc = 'Penanggung jawab: ' + user.name +
      (tm.start ? '\nMulai: ' + Utilities.formatDate(tm.start, tz_(), 'EEE, d MMM yyyy HH:mm') : '') +
      (tm.end ? '\nDeadline: ' + Utilities.formatDate(tm.end, tz_(), 'EEE, d MMM yyyy HH:mm') : '') +
      (t.notes ? '\nCatatan: ' + t.notes : '') +
      (appUrl_() ? '\n\nTandai selesai di Project Tracker: ' + appUrl_() : '');
    var opts = { description: desc, guests: user.email, sendInvites: CFG.SEND_INVITES };
    if (tm.start && (!tm.end || tm.start < tm.end)) {
      var se = new Date(tm.start.getTime() + CFG.START_EVENT_MIN * 60000);
      if (tm.end && se > tm.end) se = tm.end;
      var ev1 = cal.createEvent('▶ ' + label, tm.start, se, opts);
      ev1.removeAllReminders(); // pengingat di kalender pemilik script tidak perlu
      newIds[0] = ev1.getId();
    }
    if (tm.end) {
      var ds = new Date(tm.end.getTime() - CFG.DUE_EVENT_MIN * 60000);
      var ev2 = cal.createEvent('⏰ Deadline: ' + label, ds, tm.end, opts);
      ev2.removeAllReminders();
      newIds[1] = ev2.getId();
    }
  }
  sh.getRange(row, col['cal start id'] + 1).setValue(newIds[0]);
  sh.getRange(row, col['cal due id'] + 1).setValue(newIds[1]);
  sh.getRange(row, col['cal sync'] + 1).setValue(sig);
}

function deleteEvent_(cal, id) {
  if (!id) return;
  try { var ev = cal.getEventById(id); if (ev) ev.deleteEvent(); } catch (e) { /* sudah terhapus */ }
}

function deleteRowEvents_(sh, row) {
  var col = colMap_(sh);
  if (col['cal start id'] === undefined) return;
  var cal = getCalendar_();
  deleteEvent_(cal, String(sh.getRange(row, col['cal start id'] + 1).getValue() || ''));
  deleteEvent_(cal, String(sh.getRange(row, col['cal due id'] + 1).getValue() || ''));
}

/** Trigger 15 menit: sinkron Calendar (termasuk edit langsung di sheet) + email pengingat. */
function runReminders() {
  if (!calEnabled_()) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var cal = getCalendar_(), now = new Date();
    personSheets_().forEach(function (p) {
      var sh = p.sheet;
      if (sh.getLastRow() < 2) return;
      ensureHeaders_(sh, TASK_HEADERS);
      var col = colMap_(sh);
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      vals.forEach(function (r, i) {
        try {
          syncValues_(sh, i + 2, r, col, p.user, cal);
          emailReminder_(sh, i + 2, r, col, p.user, now);
        } catch (e) { Logger.log(sh.getName() + ' baris ' + (i + 2) + ': ' + e); }
      });
    });
  } finally { lock.releaseLock(); }
}

function emailReminder_(sh, row, r, col, user, now) {
  if (!user.email || !user.active || col['reminded'] === undefined) return;
  var t = rowTask_(r, null, col, sh, user, row);
  if (!t || !wantsReminders_(t)) return;
  var end = taskTimes_(t).end;
  if (!end) return;
  var endKey = Utilities.formatDate(end, tz_(), "yyyy-MM-dd'T'HH:mm");
  var left = end.getTime() - now.getTime();
  var key = null, subject = null, intro = null;
  if (left > 0 && left <= CFG.EMAIL_DUE_HOURS * 36e5) {
    key = 'due|' + endKey;
    subject = '⏰ Deadline ' + humanLeft_(left) + ' lagi: ' + shortTitle_(t.task);
    intro = 'Task berikut akan mencapai deadline dalam <b>' + humanLeft_(left) + '</b>.';
  } else if (left <= 0 && -left < 48 * 36e5) {
    key = 'overdue|' + endKey;
    subject = '⚠️ Lewat deadline: ' + shortTitle_(t.task);
    intro = 'Task berikut sudah <b>melewati deadline</b> dan belum ditandai Done.';
  }
  if (!key) return;
  var sent = String(r[col['reminded']] || '').split(',').filter(String);
  if (sent.indexOf(key) >= 0) return;
  MailApp.sendEmail({
    to: user.email, subject: subject, name: 'Project Tracker',
    htmlBody: emailShell_('Halo ' + esc_(user.name) + ',', intro + taskTableHtml_([t]))
  });
  sent.push(key);
  sh.getRange(row, col['reminded'] + 1).setValue(sent.slice(-6).join(','));
}

/** Trigger harian: ringkasan pagi untuk setiap orang + rekap tim untuk admin. */
function sendDailyDigest() {
  if (!calEnabled_()) return;
  var tz = tz_(), now = new Date();
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1=Senin … 7=Minggu
  if (dow >= 6) return;
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var teamOverdue = [];
  personSheets_().forEach(function (p) {
    var open = readTaskSheet_(p.sheet, p.user).filter(wantsReminders_);
    var overdue = open.filter(function (t) { var e = taskTimes_(t).end; return e && e < now; });
    var dueToday = open.filter(function (t) { return t.endDate === today && overdue.indexOf(t) < 0; });
    var startToday = open.filter(function (t) { return t.startDate === today && t.endDate !== today && t.status !== 'On-Progress'; });
    teamOverdue = teamOverdue.concat(overdue);
    if (!p.user.email || !p.user.active || !(overdue.length + dueToday.length + startToday.length)) return;
    var body = '';
    if (overdue.length) body += '<h3 style="color:#c93636;margin:18px 0 6px">Terlambat (' + overdue.length + ')</h3>' + taskTableHtml_(overdue);
    if (dueToday.length) body += '<h3 style="margin:18px 0 6px">Deadline hari ini (' + dueToday.length + ')</h3>' + taskTableHtml_(dueToday);
    if (startToday.length) body += '<h3 style="margin:18px 0 6px">Mulai hari ini (' + startToday.length + ')</h3>' + taskTableHtml_(startToday);
    MailApp.sendEmail({
      to: p.user.email, name: 'Project Tracker',
      subject: '☀️ Task hari ini: ' + dueToday.length + ' deadline' + (overdue.length ? ', ' + overdue.length + ' terlambat' : ''),
      htmlBody: emailShell_('Selamat pagi, ' + esc_(p.user.name) + '!', body)
    });
  });
  if (!teamOverdue.length) return;
  readUsers_().filter(function (u) { return u.role === 'admin' && u.email && u.active; }).forEach(function (a) {
    MailApp.sendEmail({
      to: a.email, name: 'Project Tracker',
      subject: '📋 Rekap tim: ' + teamOverdue.length + ' task terlambat',
      htmlBody: emailShell_('Rekap pagi tim', 'Task yang melewati deadline dan belum Done:' + taskTableHtml_(teamOverdue, true))
    });
  });
}

function taskTableHtml_(tasks, withOwner) {
  var td = 'style="padding:8px 10px;border-bottom:1px solid #e3e4df;vertical-align:top"';
  var rows = tasks.map(function (t) {
    var tm = taskTimes_(t);
    return '<tr>' + (withOwner ? '<td ' + td + '><b>' + esc_(t.ownerName) + '</b></td>' : '') +
      '<td ' + td + '>' + (t.code ? '<span style="font-family:monospace;background:#f1f2ef;padding:1px 6px;border-radius:8px">' + esc_(t.code) + '</span> ' : '') +
      (/^https?:\/\//.test(t.task) ? '<a href="' + esc_(t.task) + '">' + esc_(t.task.replace(/^https?:\/\/(www\.)?/, '')) + '</a>' : esc_(t.task)) + '</td>' +
      '<td ' + td + ' nowrap>' + (tm.end ? Utilities.formatDate(tm.end, tz_(), 'd MMM, HH:mm') : '–') + '</td></tr>';
  }).join('');
  return '<table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:8px">' +
    '<tr style="color:#8a8c90;font-size:12px;text-align:left">' + (withOwner ? '<th style="padding:6px 10px">PIC</th>' : '') +
    '<th style="padding:6px 10px">Task</th><th style="padding:6px 10px">Deadline</th></tr>' + rows + '</table>';
}

function emailShell_(greeting, body) {
  var url = appUrl_();
  return '<div style="font-family:Segoe UI,Arial,sans-serif;color:#17181a;max-width:620px">' +
    '<p style="font-size:15px">' + greeting + '</p>' + body +
    (url ? '<p style="margin-top:22px"><a href="' + esc_(url) + '" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Buka Project Tracker</a></p>' : '') +
    '<p style="color:#8a8c90;font-size:12px;margin-top:22px">Email otomatis dari Project Tracker.</p></div>';
}

function humanLeft_(ms) {
  var min = Math.round(ms / 60000);
  if (min < 60) return min + ' menit';
  if (min < 48 * 60) return Math.round(min / 60) + ' jam';
  return Math.round(min / 1440) + ' hari';
}
function shortTitle_(s) {
  s = String(s).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return s.length > 70 ? s.slice(0, 67) + '…' : s;
}
