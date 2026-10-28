// ============================================================
// Hold a tire for its quick details — 28 Oct 2026.
//
// His option A off the mockup: hold the LEFT (Recount) half for half a second
// and a sheet rises with the recount, the profit sum, the last supplier invoice
// and the last four movements. A quick tap stays the recount panel it always
// was; the right half stays the sale.
//
// What would go wrong silently: a tap swallowed or a hold that also taps, two
// recount boxes on the page at once (one id, two inputs), a recount from the
// sheet that bypasses the seen-guard, a sheet that survives a sign-out, and
// the profit drawn from anything but the desk's rules (health.js).
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

(async function run() {
  console.log('\nHold a tire for its quick details\n');

  // ---- the hold opens the sheet --------------------------------------------
  {
    const { w, recounts, histAsked } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    ok('holding the left half opens the sheet', sheetUp(w));
    ok('it names the tire', /225\/65R17/.test(text(w, '#qdWrap .qd-head')) && /Lexani LX/.test(text(w, '#qdWrap .qd-head')), text(w, '#qdWrap .qd-head'));
    ok('the hold did not also tap: one recount box on the whole page', all(w, '#rcQty').length === 1 && Boolean($(w, '#qdWrap #rcQty')));
    ok('and the list has no second panel under the tire', !$(w, '#list .recount'));
    ok('the recount starts at what the book holds', $(w, '#rcQty').value === '6', $(w, '#rcQty').value);
    await wait(80);
    const sheet = text(w, '#qdWrap');
    ok('the profit sum is there, from the desk rules', /Sell/.test(sheet) && /Profit/.test(sheet) && /\$109/.test(sheet), sheet);
    ok('the last supplier invoice is there', /Invented Supply/.test(sheet) && /Invoice not paid yet/.test(sheet), sheet);
    ok('the movements are there (sold and received)', all(w, '#qdWrap .hp-move').length === 2, String(all(w, '#qdWrap .hp-move').length));
    ok('the stock history was asked for this tire', histAsked.length === 1 && histAsked[0].p_product_id === 'a', JSON.stringify(histAsked));
    ok('nothing was written by opening it', recounts.length === 0);

    // ---- a recount from the sheet is the page's own recount -----------------
    $(w, '#qdWrap [data-act="cminus"]').click(); await wait(10);
    $(w, '#qdWrap [data-act="cminus"]').click(); await wait(10);
    ok('minus counts down inside the sheet', $(w, '#rcQty').value === '4', $(w, '#rcQty').value);
    ok('and says what will change', /Book 6 → 4 · 2 fewer/.test(text(w, '#rcSaid')), text(w, '#rcSaid'));
    $(w, '#qdWrap [data-act="csave"]').click(); await wait(40);
    ok('Save sends ONE recount, with the count it saw', recounts.length === 1 && recounts[0].p_product_id === 'a' && recounts[0].p_qty === 4 && recounts[0].p_seen === 6, JSON.stringify(recounts));
    ok('the sheet says what it did', /Count saved: 4/.test(text(w, '#qdWrap .salemsg')), text(w, '#qdWrap .salemsg'));
    ok('and offers Recount again, the panel being done', !$(w, '#qdWrap #rcQty') && Boolean($(w, '#qdWrap [data-qd="recount"]')));
    ok('the card behind it shows the new count', /4 in stock/.test(text(w, '.row[data-id="a"] .count')), text(w, '.row[data-id="a"] .count'));
    ok('the movements are read again, this count being one', histAsked.length === 2, String(histAsked.length));
    $(w, '#qdWrap [data-qd="recount"]').click(); await wait(20);
    ok('Recount opens the panel again, at the new count', $(w, '#rcQty') && $(w, '#rcQty').value === '4');

    // ---- closing -------------------------------------------------------------
    $(w, '#qdWrap .qd-scrim').click(); await wait(20);
    ok('the scrim closes the sheet', !sheetUp(w));
    ok('and an unsaved recount goes with it', !$(w, '#rcQty') && !$(w, '.recount'));
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

  // ---- when the numbers are not there -------------------------------------------
  {
    const { w } = boot({ historyFail: true });
    await wait(80);
    await hold(w, left(w, 'a'));
    await wait(100);
    ok('without the stock history it still shows the movements from the book', all(w, '#qdWrap .hp-move').length >= 1 && /not connected to the stock history/.test(text(w, '#qdWrap')), text(w, '#qdWrap'));
    w.close();
  }

  // ---- the sheet follows the list's redraws (reviewer's two findings) -------------
  {
    const { w, recounts } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    // A search that matches nothing makes the list take its early return.
    const q = w.document.getElementById('q'); q.value = 'zzz'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
    $(w, '#qdWrap [data-act="cminus"]').click(); await wait(10);
    $(w, '#qdWrap [data-act="csave"]').click(); await wait(40);
    ok('a save answered while the list shows "No matches" still reaches the sheet', recounts.length === 1 && /Count saved: 5/.test(text(w, '#qdWrap .salemsg')), text(w, '#qdWrap'));
    ok('and the panel is not left on Saving…', !/Saving/.test(text(w, '#qdWrap')));
    w.close();
  }
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    const box = $(w, '#rcQty'); box.focus();
    box.value = '12'; box.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10);
    // Something redraws the page while he types (the Health read, the history, a stock read).
    const q = w.document.getElementById('q'); q.value = 'a'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
    ok('a redraw while he types leaves the box itself alone', $(w, '#rcQty') === box && box.value === '12' && w.document.activeElement === box);
    ok('and the count he typed is still the count', /Book 6 → 12/.test(text(w, '#rcSaid')), text(w, '#rcSaid'));
    w.close();
  }

  // ---- the sheet is built once: no second rise (his phone, 28 Oct) ---------------------
  {
    const { w } = boot();
    await wait(80);
    await hold(w, left(w, 'a'));
    const shell = $(w, '#qdWrap .qd-sheet'), scrim = $(w, '#qdWrap .qd-scrim');
    await wait(150); // the Health read and the history land
    const q = w.document.getElementById('q'); q.value = 'a'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
    $(w, '#qdWrap [data-act="cminus"]').click(); await wait(10);
    ok('answers and redraws change what is inside the sheet, never the sheet itself', $(w, '#qdWrap .qd-sheet') === shell && $(w, '#qdWrap .qd-scrim') === scrim);
    ok('and the contents did follow (the count went down)', $(w, '#rcQty').value === '5', $(w, '#rcQty').value);
    ok('and the profit arrived inside the same sheet', /Profit/.test(text(w, '#qdWrap')));
    $(w, '#qdWrap .qd-scrim').click(); await wait(20);
    await hold(w, left(w, 'a'));
    ok('opened again later it is a fresh sheet, so it rises once more', $(w, '#qdWrap .qd-sheet') !== shell);
    w.close();
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

  // ---- a count on its way turns another hold away -----------------------------------
  {
    let release = null;
    // The recount waits on an answer until released.
    const stuck = phone({
      rows: PRODUCTS.map((p) => ({ ...p })),
      sales: SALES,
      before: (win) => { win.eval(RULES); },
      recount: () => new Promise((res) => { release = () => res({ ok: true, status: 200, json: () => Promise.resolve({ product_id: 'a', already: false, qty_before: 6, qty_after: 5 }) }); }),
    });
    const s = stuck.w;
    await wait(80);
    await hold(s, left(s, 'a'));
    $(s, '#qdWrap [data-act="cminus"]').click(); await wait(10);
    $(s, '#qdWrap [data-act="csave"]').click(); await wait(30);
    ok('(the count is saving)', /Saving/.test(text(s, '#qdWrap [data-act="csave"]')), text(s, '#qdWrap [data-act="csave"]'));
    $(s, '#qdWrap .qd-scrim').click(); await wait(20);
    ok('closing the sheet leaves a saving count alone', !sheetUp(s) && Boolean($(s, '#list .recount')));
    await hold(s, left(s, 'b'));
    ok('another tire cannot be held open meanwhile', !sheetUp(s));
    ok('and it says why', /A count is still saving/.test(text(s, '.salemsg')), text(s, '.salemsg'));
    if (release) release();
    await wait(40);
    s.close();
  }

  finish('Hold a tire for its quick details');
})().catch((e) => { console.error(e); process.exit(1); });
