const assert = require('assert');
const L = require('../web/js/logic.js');

const now = new Date(2026, 9, 28, 12, 0); // Rab 28 Okt 2026 12:00
const t = (o) => Object.assign({ id: 'X', task: 'Tes', status: 'Backlog', startTime: '', endTime: '' }, o);
let pass = 0;
const it = (name, fn) => { fn(); pass++; console.log('  ✓ ' + name); };

it('jam default 09:00 / 17:00 bila kolom jam kosong', () => {
  const s = L.schedule(t({ startDate: '2026-10-26', endDate: '2026-10-29' }));
  assert.strictEqual(s.start.getHours(), 9); assert.strictEqual(s.end.getHours(), 17);
});

it('overperforming: selesai cepat (≤80% durasi rencana)', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-24', status: 'Done',
    startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 15).toISOString() }), now);
  assert.strictEqual(e.outcome, 'over');
  assert.strictEqual(e.durationMs, 30 * 36e5);
});

it('tepat waktu: selesai sebelum deadline tapi > 80% durasi', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done',
    startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 16).toISOString() }), now);
  assert.strictEqual(e.outcome, 'ontime');
});

it('terlambat: done setelah deadline', () => {
  const e = L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done',
    doneAt: new Date(2026, 9, 22, 10).toISOString() }), now);
  assert.strictEqual(e.outcome, 'late');
  assert.ok(e.slackMs < 0);
});

it('overdue: belum done & lewat deadline; Recurring tidak dihitung', () => {
  assert.strictEqual(L.evaluate(t({ startDate: '2026-10-20', endDate: '2026-10-27' }), now).outcome, 'overdue');
  assert.strictEqual(L.evaluate(t({ status: 'Recurring', startDate: '2026-10-20', endDate: '2026-10-27' }), now).outcome, 'open');
});

it('task tanpa tanggal (TBD) tidak error', () => {
  const e = L.evaluate(t({ startDate: '', endDate: '', startRaw: 'TBD' }), now);
  assert.strictEqual(e.outcome, 'open');
  assert.strictEqual(L.bucket(t({}), now), 'backlog');
});

it('notifikasi jam mulai muncul sekali per jadwal', () => {
  const n = L.dueNotifications([t({ id: 'A', startDate: '2026-10-28', startTime: '11:30', endDate: '2026-10-30' })], {}, now);
  assert.strictEqual(n.length, 1); assert.strictEqual(n[0].type, 'start');
  const n2 = L.dueNotifications([t({ id: 'A', status: 'On-Progress', startDate: '2026-10-28', startTime: '11:30', endDate: '2026-10-30' })], {}, now);
  assert.strictEqual(n2.length, 0, 'tidak perlu notifikasi mulai bila sudah On-Progress');
});

it('pengingat deadline: hanya yang paling dekat, kunci berubah bila deadline diubah', () => {
  const task = t({ id: 'B', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '12:45', status: 'On-Progress' });
  const n = L.dueNotifications([task], { reminders: [1440, 60] }, now);
  assert.strictEqual(n.length, 1); assert.ok(n[0].key.includes('due60'));
  const moved = L.dueNotifications([Object.assign({}, task, { endTime: '12:50' })], { reminders: [1440, 60] }, now);
  assert.notStrictEqual(moved[0].key, n[0].key);
});

it('notifikasi overdue & task Done tidak dinotifikasi', () => {
  const n = L.dueNotifications([t({ id: 'C', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '10:00' }),
    t({ id: 'D', status: 'Done', startDate: '2026-10-27', endDate: '2026-10-28', endTime: '10:00' })], {}, now);
  assert.deepStrictEqual(n.map((x) => x.type), ['overdue']);
});

it('ringkasan & per orang', () => {
  const tasks = [
    t({ owner: 'a', ownerName: 'A', startDate: '2026-10-20', endDate: '2026-10-24', status: 'Done', startedAt: new Date(2026, 9, 20, 9).toISOString(), doneAt: new Date(2026, 9, 21, 9).toISOString() }),
    t({ owner: 'a', ownerName: 'A', startDate: '2026-10-20', endDate: '2026-10-21', status: 'Done', doneAt: new Date(2026, 9, 22, 9).toISOString() }),
    t({ owner: 'b', ownerName: 'B', startDate: '2026-10-20', endDate: '2026-10-27' })
  ];
  const s = L.summarize(tasks, { from: null, to: null }, now);
  assert.strictEqual(s.total, 3); assert.strictEqual(s.done, 2); assert.strictEqual(s.over, 1);
  assert.strictEqual(s.late, 1); assert.strictEqual(s.overdue, 1); assert.strictEqual(s.onTimeRate, 0.5);
  const p = L.byPerson(tasks, null, now);
  assert.strictEqual(p.find((x) => x.owner === 'a').done, 2);
});

it('format durasi', () => {
  assert.strictEqual(L.humanDuration(45 * 60000), '45 menit');
  assert.strictEqual(L.humanDuration(3 * 36e5 + 15 * 60000), '3 jam 15 mnt');
  assert.strictEqual(L.humanDuration(3 * 864e5), '3 hari');
});

console.log(`\n${pass} uji lulus`);
