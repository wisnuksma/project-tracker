/* Logika bersama: dipakai proses utama (notifikasi) dan tampilan (dashboard).
 * Semua tanggal ditafsirkan pada zona waktu lokal komputer pengguna. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PTLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DEFAULT_START = '09:00';
  var DEFAULT_END = '17:00';
  var OVERPERFORM_RATIO = 0.8; // selesai ≤ deadline dan memakai ≤ 80% durasi rencana
  var HOUR = 36e5;

  function at(dateStr, timeStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    var p = dateStr.split('-').map(Number);
    var t = String(timeStr || '').split(':').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], t[0] || 0, t[1] || 0, 0, 0);
    return isNaN(d) ? null : d;
  }

  function stamp(s) { if (!s) return null; var d = new Date(s); return isNaN(d) ? null : d; }

  function schedule(task) {
    return {
      start: at(task.startDate, task.startTime || DEFAULT_START),
      end: at(task.endDate, task.endTime || DEFAULT_END)
    };
  }

  function isDone(t) { return String(t.status).toLowerCase() === 'done'; }

  /** Ringkasan performa satu task. */
  function evaluate(task, now) {
    now = now || new Date();
    var s = schedule(task);
    var startedAt = stamp(task.startedAt);
    var doneAt = stamp(task.doneAt);
    var actualStart = startedAt || s.start;
    var planned = s.start && s.end ? Math.max(s.end - s.start, 0) : null;
    var r = {
      plannedStart: s.start, plannedEnd: s.end, startedAt: startedAt, doneAt: doneAt,
      plannedMs: planned, durationMs: null, slackMs: null, outcome: null
    };
    if (isDone(task)) {
      if (doneAt && actualStart) r.durationMs = Math.max(doneAt - actualStart, 0);
      if (doneAt && s.end) {
        r.slackMs = s.end - doneAt; // positif = lebih cepat dari deadline
        if (doneAt > s.end) r.outcome = 'late';
        else if (planned && r.durationMs !== null && r.durationMs <= planned * OVERPERFORM_RATIO) r.outcome = 'over';
        else r.outcome = 'ontime';
      } else {
        r.outcome = 'done-nodate';
      }
    } else if (s.end && now > s.end && String(task.status) !== 'Recurring') {
      r.outcome = 'overdue';
      r.slackMs = s.end - now;
    } else {
      r.outcome = 'open';
    }
    return r;
  }

  /** Kelompok tampilan untuk daftar "Task Saya". */
  function bucket(task, now) {
    now = now || new Date();
    if (isDone(task)) return 'done';
    var s = schedule(task);
    if (s.end && now > s.end && task.status !== 'Recurring') return 'overdue';
    if (s.start && s.end && now >= s.start && now <= s.end) return 'today';
    if (s.end && s.end - now <= 24 * HOUR) return 'today';
    if (task.status === 'On-Progress') return 'today';
    if (s.start && s.start > now) return 'upcoming';
    return 'backlog';
  }

  /** Daftar notifikasi yang seharusnya sudah muncul saat ini. */
  function dueNotifications(tasks, opts, now) {
    now = now || new Date();
    var reminders = (opts && opts.reminders) || [1440, 60];
    var out = [];
    tasks.forEach(function (t) {
      if (isDone(t) || t.status === 'Recurring') return;
      var s = schedule(t);
      if (s.start && now >= s.start && now - s.start < 6 * HOUR && t.status !== 'On-Progress') {
        out.push({ key: t.id + '|start|' + s.start.toISOString(), task: t, type: 'start',
          title: 'Task dimulai sekarang', body: t.task });
      }
      if (s.end) {
        var left = s.end - now;
        reminders.forEach(function (m) {
          if (left > 0 && left <= m * 60000) {
            out.push({ key: t.id + '|due' + m + '|' + s.end.toISOString(), task: t, type: 'due', minutes: m,
              title: 'Deadline ' + humanDuration(left) + ' lagi', body: t.task });
          }
        });
        if (left <= 0 && -left < 24 * HOUR) {
          out.push({ key: t.id + '|overdue|' + s.end.toISOString(), task: t, type: 'overdue',
            title: 'Task melewati deadline', body: t.task });
        }
      }
    });
    // untuk satu task, cukup satu pengingat deadline (yang paling dekat)
    var seen = {};
    return out.sort(function (a, b) {
      if (a.type === 'due' && b.type === 'due' && a.task.id === b.task.id) return a.minutes - b.minutes;
      return a.key < b.key ? -1 : 1;
    }).filter(function (n) {
      if (n.type !== 'due') return true;
      var k = n.task.id;
      if (seen[k]) return false;
      seen[k] = true; return true;
    });
  }

  /** Statistik untuk dashboard. range: {from: Date|null, to: Date|null} */
  function summarize(tasks, range, now) {
    now = now || new Date();
    var from = range && range.from, to = range && range.to;
    var rows = tasks.map(function (t) { return { t: t, e: evaluate(t, now) }; }).filter(function (x) {
      if (!from && !to) return true;
      var ref = x.e.doneAt || x.e.plannedEnd || x.e.plannedStart;
      if (!ref) return !from; // tanpa tanggal hanya ikut di "Semua waktu"
      return (!from || ref >= from) && (!to || ref <= to);
    });
    var k = { total: rows.length, done: 0, over: 0, ontime: 0, late: 0, overdue: 0, open: 0,
      durSum: 0, durN: 0, slackSum: 0, slackN: 0 };
    rows.forEach(function (x) {
      var o = x.e.outcome;
      if (isDone(x.t)) k.done++;
      if (o === 'over') k.over++;
      else if (o === 'ontime') k.ontime++;
      else if (o === 'late') k.late++;
      else if (o === 'overdue') k.overdue++;
      else if (o === 'open') k.open++;
      if (x.e.durationMs !== null) { k.durSum += x.e.durationMs; k.durN++; }
      if (isDone(x.t) && x.e.slackMs !== null) { k.slackSum += x.e.slackMs; k.slackN++; }
    });
    var judged = k.over + k.ontime + k.late;
    return {
      rows: rows,
      total: k.total, done: k.done, over: k.over, ontime: k.ontime, late: k.late,
      overdue: k.overdue, open: k.open,
      completionRate: k.total ? k.done / k.total : 0,
      onTimeRate: judged ? (k.over + k.ontime) / judged : null,
      avgDurationMs: k.durN ? k.durSum / k.durN : null,
      avgSlackMs: k.slackN ? k.slackSum / k.slackN : null
    };
  }

  function byPerson(tasks, range, now) {
    var groups = {};
    tasks.forEach(function (t) {
      var key = t.owner || '-';
      (groups[key] = groups[key] || { owner: key, name: t.ownerName || key, tasks: [] }).tasks.push(t);
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var s = summarize(g.tasks, range, now);
      s.owner = g.owner; s.name = g.name;
      return s;
    });
  }

  function humanDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '–';
    var neg = ms < 0; ms = Math.abs(ms);
    var min = Math.round(ms / 60000), out;
    if (min < 60) out = min + ' menit';
    else if (min < 48 * 60) { var h = Math.floor(min / 60), m = min % 60; out = h + ' jam' + (m && h < 10 ? ' ' + m + ' mnt' : ''); }
    else { var d = Math.floor(min / 1440), hh = Math.round((min % 1440) / 60); out = d + ' hari' + (hh ? ' ' + hh + ' jam' : ''); }
    return (neg ? '-' : '') + out;
  }

  return {
    DEFAULT_START: DEFAULT_START, DEFAULT_END: DEFAULT_END, OVERPERFORM_RATIO: OVERPERFORM_RATIO,
    at: at, schedule: schedule, evaluate: evaluate, bucket: bucket, isDone: isDone,
    dueNotifications: dueNotifications, summarize: summarize, byPerson: byPerson,
    humanDuration: humanDuration
  };
});
