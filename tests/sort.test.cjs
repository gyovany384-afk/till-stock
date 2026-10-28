// ============================================================
// Sort the Stock tab by price — 28 Oct 2026. His ask: "sort by price in stock
// tab". One button under the search box cycles Size -> Price, low first -> Price,
// high first; the choice is kept on the phone. Only the order on screen changes.
//
//   node tests/sort.test.cjs
// ============================================================
const { phone, ok, finish, wait, row, stockCalls } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const order = (w) => Array.from(w.document.querySelectorAll('#list .row[data-id]')).map((r) => r.getAttribute('data-id'));
const rows = () => [
  row({ id: 'a', size: '195/65R15', brand: 'Aa', price_cents: 12000, qty: 3 }),
  row({ id: 'b', size: '205/55R16', brand: 'Bb', price_cents: 8000, qty: 3 }),
  row({ id: 'c', size: '215/60R16', brand: 'Cc', price_cents: 20000, qty: 3 }),
  row({ id: 'd', size: '225/65R17', brand: 'Dd', price_cents: 8000, qty: 3 }),
  row({ id: 'e', size: '235/60R18', brand: 'Ee', price_cents: 5000, qty: 0 }),
];

(async function run() {
  console.log('\nSort the Stock tab by price\n');
  {
    const { w, calls } = phone({ rows: rows() });
    await wait(80);
    ok('a sort button sits on the Stock tab, saying Size', !$(w, '#sortBtn').hidden && /Size/.test($(w, '#sortBtn').textContent), $(w, '#sortBtn').textContent);
    ok('it starts in the book\'s own order (by size)', order(w).join() === 'a,b,c,d', order(w).join());
    $(w, '#sortBtn').click(); await wait(20);
    ok('one press: price, low first', /Price, low first/.test($(w, '#sortBtn').textContent) && order(w).join() === 'b,d,a,c', order(w).join());
    ok('a tie in price falls back to size (b before d)', order(w).indexOf('b') < order(w).indexOf('d'));
    $(w, '#sortBtn').click(); await wait(20);
    ok('two presses: price, high first', /Price, high first/.test($(w, '#sortBtn').textContent) && order(w).join() === 'c,a,b,d', order(w).join());
    $(w, '#sortBtn').click(); await wait(20);
    ok('three presses: back to size', /Size/.test($(w, '#sortBtn').textContent) && order(w).join() === 'a,b,c,d');
    ok('sorting reads nothing again and writes nothing', stockCalls(calls).length <= 2 && !calls.some((c) => c.method !== 'GET' && !/is_staff/.test(c.url)), calls.length);
    $(w, '#sortBtn').click(); await wait(10);
    ok('the choice is kept on this phone', w.localStorage.getItem('till_stock_sort') === 'low');
    // search keeps the sort
    const q = w.document.getElementById('q'); q.value = 'r1'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
    q.value = ''; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
    ok('and a search keeps it', order(w).join() === 'b,d,a,c', order(w).join());
    // other tabs
    $(w, '#tabSales').click(); await wait(40);
    ok('the button is only on the Stock tab', $(w, '#sortBtn').hidden === true);
    $(w, '#tabStock').click(); await wait(40);
    ok('and comes back with it', $(w, '#sortBtn').hidden === false);
    w.close();
  }
  {
    const { w } = phone({ rows: rows(), seed: { till_stock_sort: 'high' } });
    await wait(80);
    ok('a kept choice is there when the page opens again', order(w).join() === 'c,a,b,d' && /Price, high first/.test($(w, '#sortBtn').textContent), order(w).join());
    w.close();
  }
  finish('Sort the Stock tab by price');
})().catch((e) => { console.error(e); process.exit(1); });
