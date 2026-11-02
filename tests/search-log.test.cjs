// ============================================================
// The search log, from the phone — 1 Nov 2026. A search on the Stock tab that sits
// still for five seconds goes to till_stock.log_search for the desktop's Search
// log tab. Nothing else does, and a failure must not touch the search itself.
//
//   node tests/search-log.test.cjs
// ============================================================
const { phone, ok, finish, wait, row, reply } = require('./harness.cjs');

const WAIT = 5000;
const logged = (calls) => calls.filter((c) => c.url.indexOf('/rpc/log_search') !== -1).map((c) => JSON.parse(c.body));
const type = (w, text) => {
  const q = w.document.getElementById('q');
  q.value = text;
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
};
const answer = (status) => ({ extra: (u) => (u.indexOf('/rpc/log_search') !== -1 ? reply({}, status) : undefined) });
const rows = () => [row({ id: 'a', size: '205/55R16', qty: 3 })];

(async function run() {
  console.log('\nThe search log, from the phone\n');
  {
    const { w, calls } = phone({ rows: rows(), ...answer(200) });
    await wait(80);
    type(w, '2055');
    await wait(WAIT - 1500);
    ok('nothing is sent before five seconds', logged(calls).length === 0);
    type(w, '2055516');
    await wait(WAIT - 1500);
    ok('each change starts the wait again', logged(calls).length === 0);
    await wait(1700);
    const sent = logged(calls);
    ok('the finished search is sent once, as the phone', sent.length === 1 && sent[0].p_screen === 'phone' && sent[0].p_query === '2055516', sent);
    type(w, '2055516 ');
    await wait(WAIT + 200);
    ok('the same search again is not sent again', logged(calls).length === 1);
    w.document.getElementById('clrBtn').click();
    await wait(20);
    type(w, '2055516');
    await wait(WAIT + 200);
    ok('after clearing the box it counts as a new search', logged(calls).length === 2);
    w.close();
  }
  {
    const { w, calls } = phone({ rows: rows(), ...answer(200) });
    await wait(80);
    type(w, 'gone');
    await wait(50);
    w.document.getElementById('clrBtn').click();
    type(w, '2');
    await wait(WAIT + 200);
    ok('a box cleared in time and a single letter send nothing', logged(calls).length === 0, logged(calls));
    type(w, 'moved');
    await wait(50);
    w.document.getElementById('tabSales').click();
    await wait(WAIT + 200);
    ok('leaving the Stock tab cancels a search still waiting', logged(calls).length === 0, logged(calls));
    w.close();
  }
  {
    const { w, calls } = phone({ rows: rows(), ...answer(200) });
    await wait(80);
    w.document.getElementById('tabNotes').click();
    await wait(30);
    type(w, 'a private note');
    await wait(WAIT + 200);
    ok('a search of the notes is never logged', logged(calls).length === 0, logged(calls));
    w.close();
  }
  {
    const { w, calls } = phone({ rows: rows(), ...answer(500) });
    await wait(80);
    type(w, '205/55');
    await wait(WAIT + 200);
    ok('a failed log was tried', logged(calls).length === 1);
    ok('and the search still shows its tire', w.document.querySelectorAll('#list .row[data-id]').length === 1);
    w.close();
  }
  finish('The search log, from the phone');
})().catch((e) => { console.error(e); process.exit(1); });
