// ============================================================
// Hold a tire for its quick details — 28 Oct 2026.
//
// His option A off the mockup: hold the LEFT (Recount) half for half a second
// and a sheet rises with the profit sum, the last supplier invoice (a tap opens
// it in full) and the last four movements. His comment on the practice copy:
// no recount in it ("dont show in long press") — the recount stays what a quick
// tap opens. The right half stays the sale.
//
// What would go wrong silently: a tap swallowed or a hold that also taps, the
// recount panel creeping back into the sheet, a sheet that is rebuilt (and
// rises again) on every answer, a sheet that survives a sign-out, Back
// closing the wrong layer, and the profit drawn from anything but the desk's
// rules (health.js).
//
//   node tests/quick-details.test.cjs
// ============================================================
const fs = require('fs');
const path = require('path');
const { phone, ok, finish, wait, row, reply } = require('./harness.cjs');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'health.js'), 'utf8');
const day = (ago) => { const d = new Date(); d.setDate(d.getDate() - ago); return d.toISOString().slice(0, 10); };

const PRODUCTS = [
  row({ id: 'a', size: '225/65R17', brand: 'Lexani LX', type: 'Car', tier: 'affordable', qty: 6, cost_cents: 6600, price_cents: 10900, location: 'A6', archived: false }),
  row({ id: 'b', size: '195/65R15', brand: 'Sailun Terra', type: 'Car', tier: 'affordable', qty: 5, cost_cents: 6200, price_cents: 10400, location: 'B2', archived: false }),
];
const SALES = [
  { id: 's1', product_id: 'a', sold_on: day(5), qty: 2, unit_cents: 10900, cost_cents: 6600, tax_cents: 545, sold_by: 'Counter' },
];
const DELIVERIES = [{ id: 'd1', supplier: 'Invented Supply', ref: 'INV-1', received_on: day(45), units: 8, total_cents: 0, paid: false }];
const LINES = [{ delivery_id: 'd1', line_no: 0, product_id: 'a', qty: 8, cost_cents: 6600 }];
const HISTORY = [
  { id: 'm2', product_id: 'a', moved_at: null, day: day(5), kind: 'Sold', who: 'Counter', change: -2, qty_after: 6, refs: ['s1'] },
  { id: 'm1', product_id: 'a', moved_at: null, day: day(45), kind: 'Received', who: 'Invented Supply', change: 8, qty_after: 8, refs: ['d1'] },
];

function boot(over = {}) {
  const histAsked = [];
  const r = phone({
    rows: PRODUCTS.map((p) => ({ ...p })),
    sales: SALES,
    before: (win) => { win.eval(RULES); },
    extra: (u, method, init) => {
      if (u.indexOf('/rest/v1/rpc/stock_history') !== -1) {
        histAsked.push(JSON.parse(init.body));
        return over.historyFail ? reply({ message: 'nope' }, 500) : reply(HISTORY);
      }
      if (u.indexOf('/rest/v1/delivery_lines') !== -1) return reply(LINES, 206);
      if (u.indexOf('/rest/v1/delivery_returns') !== -1) return reply([], 206);
      if (u.indexOf('/rest/v1/deliveries') !== -1) return reply(DELIVERIES, 206);
      if (u.indexOf('/rest/v1/settings') !== -1) return reply([{ key: 'tax_rate_bp', value: '825' }], 206);
      return undefined;
    },
  });
  r.histAsked = histAsked;
  return r;
}
const $ = (w, sel) => w.document.querySelector(sel);
const all = (w, sel) => Array.from(w.document.querySelectorAll(sel));
const text = (w, sel) => (($(w, sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
const fire = (w, el, type, x = 10, y = 10) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
const left = (w, id) => $(w, '.row[data-id="' + id + '"] [data-side="count"]');
const right = (w, id) => $(w, '.row[data-id="' + id + '"] [data-side="sell"]');
const sheetUp = (w) => { const s = $(w, '#qdWrap'); return Boolean(s) && !s.hidden && Boolean($(w, '#qdWrap .qd-sheet')); };
// A press that is held, then lifted; the browser's own click follows the lift.
const hold = async (w, el, ms = 650) => {
  fire(w, el, 'pointerdown');
  await wait(ms);
  fire(w, el, 'pointerup');
  el.click();
  await wait(30);
};
const tapOnce = async (w, el) => {
  fire(w, el, 'pointerdown'); await wait(40); fire(w, el, 'pointerup'); el.click(); await wait(30);
};
const search = async (w, v) => { const q = w.document.getElementById('q'); q.value = v; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20); };

(async function run() {
  console.log('\nHold a tire for its quick details\n');

  // ---- the hold opens the sheet --------------------------------------------
  {
    const { w, recounts, sales, histAsked } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    ok('holding the left half opens the sheet', sheetUp(w));
    const head = text(w, '#qdWrap .qd-head');
    ok('it names the tire, with the brand, rack and how many are in stock', /225\/65R17/.test(head) && /Lexani LX/.test(head) && /6 in stock/.test(head), head);
    ok('NO recount in it: no count box, no Save, no panel', !$(w, '#qdWrap #rcQty') && !$(w, '#qdWrap .recount') && !$(w, '#qdWrap [data-act="csave"]') && !/Recount/i.test(text(w, '#qdWrap .qd-body')), text(w, '#qdWrap .qd-body'));
    ok('and the hold did not also tap one open in the list', !$(w, '.recount') && all(w, '#rcQty').length === 0);
    await wait(80);
    const sheet = text(w, '#qdWrap');
    ok('the profit sum is there, from the desk rules', /Sell/.test(sheet) && /Profit/.test(sheet) && /\$109/.test(sheet), sheet);
    ok('the last supplier invoice is there', /Invented Supply/.test(sheet) && /Invoice not paid yet/.test(sheet), sheet);
    ok('the movements are there (sold and received)', all(w, '#qdWrap .hp-move').length === 2, String(all(w, '#qdWrap .hp-move').length));
    ok('the stock history was asked for this tire', histAsked.length === 1 && histAsked[0].p_product_id === 'a', JSON.stringify(histAsked));
    ok('it is look-only: opening it wrote nothing', recounts.length === 0 && sales.length === 0);

    $(w, '#qdWrap .qd-scrim').click(); await wait(20);
    ok('the scrim closes the sheet', !sheetUp(w));
    ok('the list is intact', all(w, '.row[data-id]').length === 2);
    w.close();
  }

  // ---- a quick tap is still the recount ---------------------------------------
  {
    const { w } = boot();
    await wait(80);
    await tapOnce(w, left(w, 'a'));
    ok('a quick tap opens the recount panel in the list', Boolean($(w, '#list .recount')) && !sheetUp(w));
    await wait(650);
    ok('and no sheet comes up late', !sheetUp(w));
    await tapOnce(w, left(w, 'a'));
    ok('tapping again closes it, as before', !$(w, '.recount'));
    w.close();
  }

  // ---- a slide is a scroll ----------------------------------------------------
  {
    const { w } = boot();
    await wait(80);
    const el = left(w, 'a');
    fire(w, el, 'pointerdown', 10, 10);
    await wait(100);
    el.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 60 }));
    await wait(600);
    ok('a finger that slides away opens nothing', !sheetUp(w));
    ok('and the amber fill is gone', !el.classList.contains('pressing'));
    w.close();
  }

  // ---- the fill, the other half, the next tap ------------------------------------
  {
    const { w } = boot();
    await wait(80);
    fire(w, left(w, 'a'), 'pointerdown');
    await wait(100);
    ok('the left half fills while it is held', left(w, 'a').classList.contains('pressing'));
    fire(w, left(w, 'a'), 'pointerup');
    await wait(20);
    ok('and stops filling when lifted early', !left(w, 'a').classList.contains('pressing'));
    await hold(w, right(w, 'a'));
    ok('holding the RIGHT half does not open the details', !sheetUp(w));
    w.close();
  }
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    $(w, '#qdWrap [data-qd="close"].qd-x').click(); await wait(20);
    ok('the X closes the sheet', !sheetUp(w));
    await wait(200);
    await tapOnce(w, left(w, 'b'));
    ok('the next real tap on a tire is not swallowed', Boolean($(w, '#list .recount')));
    w.close();
  }

  // ---- the sheet is built once: no second rise (his phone, 28 Oct) ---------------------
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    const shell = $(w, '#qdWrap .qd-sheet'), scrim = $(w, '#qdWrap .qd-scrim');
    await wait(150); // the Health read and the history land
    await search(w, 'a'); // and the list redraws
    ok('answers and redraws change what is inside the sheet, never the sheet itself', $(w, '#qdWrap .qd-sheet') === shell && $(w, '#qdWrap .qd-scrim') === scrim);
    ok('and the profit arrived inside the same sheet', /Profit/.test(text(w, '#qdWrap')));
    $(w, '#qdWrap .qd-scrim').click(); await wait(20);
    await hold(w, left(w, 'a'));
    ok('opened again later it is a fresh sheet, so it rises once more', $(w, '#qdWrap .qd-sheet') !== shell);
    w.close();
  }

  // ---- the sheet follows a search that hides its tire -------------------------------
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    await search(w, 'zzz'); // the list takes its "No matches" early return
    ok('a search that hides the tire does not break the sheet', sheetUp(w) && /Profit/.test(text(w, '#qdWrap')));
    w.close();
  }

  // ---- the full invoice, from the Last in line (his comment on the practice copy) ----
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    await wait(120);
    const link = $(w, '#qdWrap [data-qd="invoice"]');
    ok('the Last in line is a button', Boolean(link) && /INV-1/.test(link.textContent), link && link.textContent);
    link.click(); await wait(20);
    const inv = text(w, '#qdWrap .qd-inv');
    ok('it opens the full invoice as a second sheet over the details, not a full page', /INV-1/.test(inv) && /Invented Supply/.test(inv) && /Lexani LX/.test(inv) && !$(w, '#qdWrap .hp-over'), inv);
    ok('with its lines and total', /TIRE/.test(inv) && /8/.test(inv) && /Not paid yet/.test(inv), inv);
    ok('the details sheet is still there under it', sheetUp(w) && all(w, '#qdWrap .qd-sheet').length === 2);
    const invSheet = $(w, '#qdWrap .qd-inv');
    await wait(60); await search(w, 'a');
    ok('a redraw does not make the invoice rise again', $(w, '#qdWrap .qd-inv') === invSheet);
    $(w, '#qdWrap .qd-inv [data-hp="close"].qd-x').click(); await wait(30);
    ok('its X takes the invoice away and keeps the details', !$(w, '#qdWrap .qd-inv') && sheetUp(w));
    $(w, '#qdWrap [data-qd="invoice"]').click(); await wait(20);
    $(w, '#qdWrap .qd-scrim[data-hp="close"]').click(); await wait(30);
    ok('and so does tapping the dark area above it', !$(w, '#qdWrap .qd-inv') && sheetUp(w));
    $(w, '#qdWrap [data-qd="invoice"]').click(); await wait(20);
    w.history.back(); await wait(60);
    ok('the phone Back closes the invoice first', !$(w, '#qdWrap .qd-inv') && sheetUp(w));
    w.history.back(); await wait(60);
    ok('and the next Back closes the sheet', !sheetUp(w));
    w.close();
  }

  // ---- when the numbers are not there -------------------------------------------
  {
    const { w } = boot({ historyFail: true });
    await wait(80);
    await hold(w, left(w, 'a'));
    await wait(100);
    ok('without the stock history it still shows the movements from the book', all(w, '#qdWrap .hp-move').length >= 1 && /not connected to the stock history/.test(text(w, '#qdWrap')), text(w, '#qdWrap'));
    w.close();
  }

  // ---- movements: one to a row ------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ok('the sheet draws the movement cards one to a row', /\.qd-body \.hp-chips\{\s*grid-template-columns:minmax\(0,1fr\);\s*\}/.test(src));
  }

  // ---- signing out ----------------------------------------------------------
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    ok('(the sheet is up)', sheetUp(w));
    w.document.getElementById('signOutBtn').click(); await wait(30);
    ok('signing out takes the sheet away', !sheetUp(w) && !$(w, '#qdWrap').innerHTML);
    w.close();
  }

  // ---- a count on its way does not stop a hold --------------------------------------
  {
    let release = null;
    const s = phone({
      rows: PRODUCTS.map((p) => ({ ...p })),
      sales: SALES,
      before: (win) => { win.eval(RULES); },
      recount: () => new Promise((res) => { release = () => res({ ok: true, status: 200, json: () => Promise.resolve({ product_id: 'a', already: false, qty_before: 6, qty_after: 5 }) }); }),
    }).w;
    await wait(80);
    await tapOnce(s, left(s, 'a'));
    $(s, '[data-act="cminus"]').click(); await wait(10);
    $(s, '[data-act="csave"]').click(); await wait(30);
    ok('(a count is saving)', /Saving/.test(text(s, '[data-act="csave"]')), text(s, '[data-act="csave"]'));
    await hold(s, left(s, 'b'));
    ok('holding another tire still opens its details', sheetUp(s) && /195\/65R15/.test(text(s, '#qdWrap .qd-head')), text(s, '#qdWrap .qd-head'));
    ok('and the saving count is left alone behind it', Boolean($(s, '#list .recount')) && /Saving/.test(text(s, '#list [data-act="csave"]')));
    if (release) release();
    await wait(40);
    s.close();
  }

  finish('Hold a tire for its quick details');
})().catch((e) => { console.error(e); process.exit(1); });
