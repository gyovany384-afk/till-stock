// ============================================================
// Stock Health on the phone — 21 Oct 2026. Look only.
//
// What would go wrong silently: a read missing its schema header or its paging
// (an empty or a third-missing Stock Health that looks normal), a write sneaking
// in (he asked for look only), the screen drawing something other than what
// the desk's rules (health.js) answer, and a sale's price drawn wrong.
//
//   node tests/health.test.cjs
// ============================================================
const fs = require('fs');
const path = require('path');
const { phone, ok, finish, wait, row, reply } = require('./harness.cjs');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'health.js'), 'utf8');
const day = (ago) => { const d = new Date(); d.setDate(d.getDate() - ago); return d.toISOString().slice(0, 10); };
const headerOf = (call, name) => {
  const h = call.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
};

// An invented book: two brands of one size and tier, the starred one short.
const PRODUCTS = [
  row({ id: 'a', size: '225/65R17', brand: 'Lexani LX', type: 'Car', tier: 'affordable', must_have: true, qty: 1, cost_cents: 6600, price_cents: 10900, location: 'A6', archived: false }),
  row({ id: 'b', size: '225/65R17', brand: 'Sailun Terra', type: 'Car', tier: 'affordable', must_have: false, qty: 5, cost_cents: 6200, price_cents: 10400, location: 'A6', archived: false }),
  row({ id: 'c', size: '', brand: 'TPMS sensor', type: 'Parts', tier: null, must_have: false, qty: 0, cost_cents: 2200, price_cents: 4500, location: 'P1', archived: false }),
];
const SALES = [
  { id: 's1', product_id: 'a', sold_on: day(40), qty: 2, unit_cents: 10900, cost_cents: 6600, tax_cents: 545, sold_by: 'Counter' },
  { id: 's2', product_id: 'a', sold_on: day(20), qty: 2, unit_cents: 10900, cost_cents: 6600, tax_cents: 545, sold_by: 'Phone' },
  { id: 's3', product_id: 'a', sold_on: day(5), qty: 2, unit_cents: 11400, cost_cents: 6600, tax_cents: 545, sold_by: 'Counter' },
  { id: 's4', product_id: 'c', sold_on: day(8), qty: 1, unit_cents: 4500, cost_cents: 2200, tax_cents: 181, sold_by: 'Counter' },
];
const DELIVERIES = [{ id: 'd1', supplier: 'Invented Supply', ref: 'INV-1', received_on: day(45), units: 7, total_cents: 0, paid: false }];
const LINES = [{ delivery_id: 'd1', line_no: 0, product_id: 'a', qty: 7, cost_cents: 6600 }];
const HISTORY = [
  { id: 'm3', product_id: 'a', moved_at: null, day: day(5), kind: 'Sold', who: 'Counter', change: -2, qty_after: 1, refs: ['s3'] },
  { id: 'm2', product_id: 'a', moved_at: null, day: day(20), kind: 'Sold', who: 'Phone', change: -2, qty_after: 3, refs: ['s2'] },
  { id: 'm1', product_id: 'a', moved_at: null, day: day(45), kind: 'Received', who: 'Invented Supply', change: 7, qty_after: 7, refs: ['d1'] },
];

function boot(over = {}) {
  const histAsked = [];
  const r = phone({
    rows: PRODUCTS.map((p) => ({ ...p })),
    sales: SALES,
    before: (win) => { if (!over.noRules) win.eval(RULES); },
    extra: (u, method, init) => {
      if (u.indexOf('/rest/v1/rpc/stock_history') !== -1) {
        histAsked.push(JSON.parse(init.body));
        return over.historyFail ? reply({ message: 'nope' }, 500) : reply(HISTORY);
      }
      if (u.indexOf('/rest/v1/delivery_lines') !== -1) return reply(LINES, 206);
      if (u.indexOf('/rest/v1/delivery_returns') !== -1) return reply(over.returns || [], 206);
      if (u.indexOf('/rest/v1/deliveries') !== -1) return reply(DELIVERIES, 206);
      if (u.indexOf('/rest/v1/settings') !== -1) return reply([{ key: 'tax_rate_bp', value: '825' }, { key: 'health_pin:car|affordable#225/65/17', value: '1790000000000' }], 206);
      return undefined;
    },
  });
  r.histAsked = histAsked;
  return r;
}
const $ = (w, sel) => w.document.querySelector(sel);
const text = (w, sel) => (($(w, sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
const tap = (w, sel) => { const el = $(w, sel); if (el) el.click(); return Boolean(el); };

(async function run() {
  console.log('\nStock Health on the phone\n');

  {
    const { w, calls, histAsked } = boot();
    await wait(80);
    ok('there is a Health tab', Boolean($(w, '#tabHealth')));
    const before = calls.length;
    tap(w, '#tabHealth');
    await wait(120);
    const reads = calls.slice(before);
    const tables = ['products', 'sales', 'deliveries', 'delivery_lines', 'delivery_returns', 'settings'];
    ok('it reads the whole book: every table Stock Health is worked out from',
      tables.every((t) => reads.some((c) => c.url.indexOf('/rest/v1/' + t + '?') !== -1)), reads.map((c) => c.url));
    ok('every one of those reads asks for the till_stock schema and a page range',
      reads.filter((c) => c.method === 'GET').every((c) => headerOf(c, 'Accept-Profile') === 'till_stock' && /^\d+-\d+$/.test(headerOf(c, 'Range') || '')));
    ok('and every one is in a fixed order, so pages cannot overlap',
      reads.filter((c) => c.method === 'GET').every((c) => /[?&]order=/.test(c.url)));

    // The list is what the desk's rules say — asked of the same rules directly.
    const TH = w.TillHealth;
    ok('the type chips are the rules\' tabs', text(w, '#healthBar').indexOf('Car') !== -1 && text(w, '#healthBar').indexOf('Parts') !== -1);
    const size = $(w, '[data-hkey="225/65/17"]') && $(w, '[data-hkey="225/65/17"]').closest('.hsize');
    ok('the size is listed', Boolean(size), w.document.getElementById('healthList').innerHTML.slice(0, 300));
    ok('it is pinned, from the shared pins the desk writes (kept under the old per-tier list)', Boolean(size && size.querySelector('.hpin')));
    // THE TIER BUTTONS — 29 Oct 2026: three across, no pills, no tier switch above the list.
    const labels = size ? [...size.querySelectorAll('.tb')].map((p) => p.textContent) : [];
    ok('three tier buttons, each saying what the rules answer', labels.length === 3 && labels.join('|') === (function () {
      const m = TH.open({ products: PRODUCTS, sales: SALES, deliveries: DELIVERIES, delivery_lines: LINES, delivery_returns: [], settings: [] },
        { tax_rate_bp: '825' }, (function(){ const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })());
      const l = TH.lists(m, 'car')[0];
      return TH.sizeRows(m, l, {}).rows.find((x) => x.key === '225/65/17').buttons.map((b) => b.label + b.words).join('|');
    })(), labels);
    ok('the Mid and Premium buttons are empty and cannot be pressed (no tire on those tiers)', size && size.querySelectorAll('.tb.st-empty[disabled]').length === 2);
    ok('the old pills and the tier switch are gone', !$(w, '#healthList .pill') && !$(w, '#healthBar .htiers'));
    ok('a size opens from a tier button only — the size name opens nothing', !$(w, '[data-hsize]') && !size.querySelector('.hs-body'));

    tap(w, '[data-hkey="225/65/17"][data-htb="affordable"]');
    await wait(20);
    ok('the pressed button is marked open and its band takes the state colour of the tier', Boolean($(w, '.tb.on')) && /^st-(short|out|ok|none|alt)$/.test([...$(w, '.hband').classList].find((c) => c.indexOf('st-') === 0) || ''));
    // Press the same button: it closes. A button with no tire behind it does nothing.
    tap(w, '[data-hkey="225/65/17"][data-htb="mid"]'); await wait(10);
    ok('an empty tier button does nothing', Boolean($(w, '.tb.on[data-htb="affordable"]')) && w.document.querySelectorAll('.hs-body').length === 1);
    tap(w, '[data-hkey="225/65/17"][data-htb="affordable"]'); await wait(10);
    ok('the same button again closes the size', !$(w, '.hs-body') && !$(w, '.tb.on'));
    tap(w, '[data-hkey="225/65/17"][data-htb="affordable"]'); await wait(10);
    const tires = [...w.document.querySelectorAll('[data-htire]')].map((b) => b.getAttribute('data-htire'));
    ok('opening the size lists its tires, cheapest first', tires.join(',') === 'b,a', tires);
    ok('the star is drawn, never a button: look only', Boolean($(w, '[data-htire="a"] .hstar.on')) && !$(w, '[data-htire="a"] .hstar button'));

    tap(w, '[data-htire="a"]');
    await wait(60);
    ok('a tire opens its own page', !$(w, '#hpWrap').hidden && text(w, '#hpWrap').indexOf('Lexani LX') !== -1);
    ok('it asks the stock history for that tire', histAsked.length === 1 && histAsked[0].p_product_id === 'a', histAsked);
    const page = text(w, '#hpWrap');
    ok('the profit is the rules\' figure (sell − cost − tax)', page.indexOf('$109.00') !== -1 && page.indexOf('$5.45') !== -1 && page.indexOf('$37.55') !== -1, page.slice(0, 400));
    ok('a sale of two shows both added up, then each', page.indexOf('Sold at $228.00') !== -1 && page.indexOf('$114.00 each') !== -1);
    ok('a delivery shows what was paid for it', page.indexOf('Cost $462.00') !== -1 && page.indexOf('$66.00 each') !== -1);
    ok('the supplier and the invoice it came in on', page.indexOf('Invented Supply') !== -1 && page.indexOf('INV-1') !== -1 && page.indexOf('Invoice not paid yet') !== -1);
    ok('and there is nothing to type into anywhere on the page', !$(w, '#hpWrap input') && !$(w, '#hpWrap select') && !$(w, '#hpWrap textarea'));

    tap(w, '[data-hp="invoice"]');
    await wait(10);
    ok('the invoice opens over it', text(w, '.hp-over').indexOf('INV-1') !== -1 && text(w, '.hp-over').indexOf('$462.00') !== -1);
    tap(w, '.hp-over [data-hp="close"]');
    await wait(10);
    ok('Close takes the invoice away and leaves the tire', !$(w, '.hp-over') && !$(w, '#hpWrap').hidden);
    tap(w, '.hp-back');
    await wait(10);
    ok('the back arrow closes the tire', $(w, '#hpWrap').hidden);

    const writes = calls.filter((c) => c.method !== 'GET' && !/\/rpc\/(is_staff|stock_history)/.test(c.url) && c.url.indexOf('/auth/') === -1);
    ok('NOTHING WAS WRITTEN — look only, his word', writes.length === 0, writes.map((c) => c.method + ' ' + c.url));
    w.close();
  }

  // A history that will not answer: the page says it is the book's, as the desk does.
  {
    const { w } = boot({ historyFail: true });
    await wait(80);
    tap(w, '#tabHealth'); await wait(120);
    tap(w, '[data-hkey="225/65/17"][data-htb="affordable"]'); await wait(20);
    tap(w, '[data-htire="a"]'); await wait(60);
    ok('a failed history read falls back to the book, and says so',
      text(w, '#hpWrap').indexOf('From the book') !== -1 && text(w, '#hpWrap').indexOf('Sold at $228.00') !== -1);
    w.close();
  }

  // The rules did not load: only the Health tab says so; the rest works.
  {
    const { w } = boot({ noRules: true });
    await wait(80);
    ok('the Stock tab still works without them', w.document.getElementById('list').innerHTML.indexOf('Lexani') !== -1);
    tap(w, '#tabHealth'); await wait(40);
    ok('and Health says it could not load', text(w, '#healthList').indexOf('could not load') !== -1);
    w.close();
  }

  // Parts are their own tab, with their pills.
  {
    const { w } = boot();
    await wait(80);
    tap(w, '#tabHealth'); await wait(120);
    tap(w, '[data-htype="parts"]'); await wait(20);
    ok('Parts lists the part with its Out of stock pill', text(w, '#healthList').indexOf('TPMS sensor') !== -1 && text(w, '#healthList').indexOf('Out of stock') !== -1);
    w.close();
  }

  // HIS RULING, 21 Oct 2026: returns stay as lines, the total is what was charged.
  {
    const { w } = boot({ returns: [{ id: 'r1', delivery_id: 'd1', product_id: 'a', qty: 2, cost_cents: 6600, returned_on: day(30) }] });
    await wait(80);
    tap(w, '#tabHealth'); await wait(120);
    tap(w, '[data-hkey="225/65/17"][data-htb="affordable"]'); await wait(20);
    tap(w, '[data-htire="a"]'); await wait(60);
    tap(w, '[data-hp="invoice"]'); await wait(10);
    const inv = text(w, '.hp-over');
    ok('the returned tires are still a line on the invoice', inv.indexOf('RETURNED') !== -1 && inv.indexOf('−$132.00') !== -1, inv);
    ok('and the total is only what was charged', inv.indexOf('Charged, after returns$330.00') !== -1 && inv.indexOf('Lines added up $462.00') !== -1, inv);
    w.close();
  }

  finish('Stock Health');
})();
