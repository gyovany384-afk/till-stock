// ============================================================
// Recounting a tire from the phone — 1 Oct 2026.
//
// His ask: "phone, i need to add a quick count like inventory where i can
// adjust how many of what there is". Off the mockup: each tire card split by a
// line, the LEFT half recounts, the RIGHT half sells as before; "recount
// updates the stock qty, not a sale"; and a search that finds nothing offers
// "Search out of stock/negative".
//
// What is tested here is what the page SENDS (one call to till_stock.recount
// with the tire, the count, and the count it SAW) and what it SAYS. The
// database's own rules are held in the stock room repo's
// test/phone-recount-sql.test.js.
//
//   node tests/recount.test.cjs
// ============================================================
const { phone, ok, finish, wait, list, row, reply } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const tap = async (w, sel) => { const el = $(w, sel); if (el) el.click(); await wait(20); return Boolean(el); };
const said = (w) => (($(w, '.salemsg') || {}).textContent || '').trim();
const countOn = (w, id) => ((($(w, '.row[data-id="' + id + '"] .count')) || {}).textContent || '').trim();
const box = (w) => $(w, '#rcQty');
const type = async (w, v) => { const b = box(w); b.value = v; b.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10); };
const search = async (w, v) => { const q = w.document.getElementById('q'); q.value = v; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20); };
const two = () => [row({ id: 'p1', qty: 6 }), row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 4 })];

(async function run() {
  console.log('\nRecounting a tire\n');

  // ---- the two halves ------------------------------------------------------
  {
    const { w } = phone({ rows: two() });
    await wait(60);
    ok('every card has a left and a right half', w.document.querySelectorAll('.row [data-side="count"]').length === 2
      && w.document.querySelectorAll('.row [data-side="sell"]').length === 2);
    ok('the small words stay: Recount and Sell', /Recount/.test($(w, '.row .main').textContent) && /Sell/.test($(w, '.row .prices').textContent));
    await tap(w, '.row[data-id="p1"] .main');
    ok('the left half opens a recount, not a sale', Boolean($(w, '.recount')) && !$(w, '.sellpanel:not(.recount)'));
    ok('it starts at what the book holds', (box(w) || {}).value === '6', (box(w) || {}).value);
    ok('Save is off until the number changes', $(w, '[data-act="csave"]').disabled === true);
    ok('the panel sits right under the tire', ($(w, '.row[data-id="p1"]').nextElementSibling || { classList: { contains: () => false } }).classList.contains('recount'));
    await tap(w, '.row[data-id="p1"] .prices');
    ok('the right half of the same tire swaps to the sale', Boolean($(w, '.sellpanel')) && !$(w, '.recount'));
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '.row[data-id="p1"] .main');
    ok('the left half again closes it', !$(w, '.recount') && !$(w, '.sellpanel'));
    w.close();
  }

  // ---- counting and saving --------------------------------------------------
  {
    const { w, recounts, sales } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="cminus"]'); await tap(w, '[data-act="cminus"]');
    ok('minus counts down', (box(w) || {}).value === '4', (box(w) || {}).value);
    ok('and says what will change', /Book 6 → 4 · 2 fewer/.test($(w, '#rcSaid').textContent), $(w, '#rcSaid').textContent);
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('Save sends ONE recount', recounts.length === 1);
    ok('with the tire, the count, and the count it saw',
      recounts[0].p_product_id === 'p1' && recounts[0].p_qty === 4 && recounts[0].p_seen === 6, JSON.stringify(recounts[0]));
    ok('and no sale — a recount is not a sale', sales.length === 0);
    ok('the card shows the new count', countOn(w, 'p1') === '4 in stock', countOn(w, 'p1'));
    ok('the panel closes', !$(w, '.recount'));
    ok('and says what it did', /Count saved: 4/.test(said(w)) && /was 6/.test(said(w)), said(w));
    w.close();
  }
  {
    const { w, recounts } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p2"] .main');
    await type(w, '12');
    ok('a typed number is taken', /Book 4 → 12 · 8 more/.test($(w, '#rcSaid').textContent), $(w, '#rcSaid').textContent);
    ok('typing does not redraw the list (the keyboard stays up)', box(w) && (box(w) || {}).value === '12');
    await type(w, '4');
    ok('typed back to the book, Save goes off again', $(w, '[data-act="csave"]').disabled === true);
    await type(w, '');
    ok('a blank box cannot be saved as nothing', $(w, '[data-act="csave"]').disabled === true);
    await type(w, 'a7b');
    ok('only digits count', /→ 7/.test($(w, '#rcSaid').textContent), $(w, '#rcSaid').textContent);
    const enter = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    box(w).dispatchEvent(enter); await wait(30);
    ok('Enter saves', recounts.length === 1 && recounts[0].p_qty === 7, JSON.stringify(recounts));
    w.close();
  }
  {
    const { w } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p2"] .main');
    for (let i = 0; i < 4; i += 1) await tap(w, '[data-act="cminus"]');
    ok('minus stops at nothing', (box(w) || {}).value === '0' && $(w, '[data-act="cminus"]').disabled === true);
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('a tire counted to 0 leaves the stock list', !$(w, '.row[data-id="p2"]'));
    ok('and the message is still said, above the list', /Count saved: 0/.test(said(w)), said(w));
    w.close();
  }

  // ---- a stale picture never wins --------------------------------------------
  {
    const { w, recounts } = phone({ rows: two(),
      recount: (body, n, rows) => {
        if (n === 1) { rows[0].qty = 5; return reply({ product_id: 'p1', moved: true, qty_now: 5 }); }
        const r = rows[0]; const before = r.qty; r.qty = body.p_qty;
        return reply({ product_id: 'p1', already: false, qty_before: before, qty_after: r.qty });
      } });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await type(w, '3');
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('a sale in between: told, not saved', /Not saved/.test(said(w)) && /changed to 5/.test(said(w)), said(w));
    ok('the card takes the book\'s number', countOn(w, 'p1') === '5 in stock', countOn(w, 'p1'));
    ok('the panel stays open on what was typed', Boolean($(w, '.recount')) && (box(w) || {}).value === '3', box(w) && (box(w) || {}).value);
    ok('now measured against the new book', /Book 5 → 3/.test($(w, '#rcSaid').textContent), $(w, '#rcSaid').textContent);
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('Save again sends the count it now saw', recounts[1].p_seen === 5 && recounts[1].p_qty === 3, JSON.stringify(recounts[1]));
    ok('and it goes in', countOn(w, 'p1') === '3 in stock' && /Count saved: 3/.test(said(w)), said(w));
    w.close();
  }
  {
    // No answer: the count may have gone in. Save again sends the SAME count
    // and the same picture, which the database answers "already".
    let first = true;
    const { w, recounts } = phone({ rows: two(),
      recount: (body, n, rows) => {
        if (first) { first = false; rows[0].qty = body.p_qty; return Promise.reject(new Error('dropped')); }
        return reply({ product_id: 'p1', already: true, qty_before: rows[0].qty, qty_after: rows[0].qty });
      } });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await type(w, '2');
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('no answer says so, and that Save again is safe', /may or may not have saved/.test(said(w)), said(w));
    ok('the panel is still open to press again', Boolean($(w, '.recount')) && $(w, '[data-act="csave"]').disabled === false);
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('Save again repeats the same count against the same picture',
      recounts.length === 2 && recounts[1].p_qty === 2 && recounts[1].p_seen === 6, JSON.stringify(recounts));
    ok('"already" closes it, with the book\'s number', !$(w, '.recount') && countOn(w, 'p1') === '2 in stock' && /already said so/.test(said(w)), said(w));
    w.close();
  }
  {
    const { w } = phone({ rows: two(), recount: () => reply({ code: 'PGRST202', message: 'Could not find the function' }, 404) });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main'); await type(w, '2');
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('a database not taught yet says so, and nothing changed', /not been taught to take a recount/.test(said(w)) && countOn(w, 'p1') === '6 in stock', said(w));
    w.close();
  }
  {
    const { w } = phone({ rows: two(), recount: () => reply({ code: 'P0001', message: '<b id="injected">x</b>' }, 400) });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main'); await type(w, '2');
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('the database\'s words are said as text, never as page', !w.document.getElementById('injected') && /injected/.test(said(w)));
    w.close();
  }
  {
    const { w } = phone({ rows: two(), recount: () => reply({ message: 'JWT expired' }, 401) });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main'); await type(w, '2');
    await tap(w, '[data-act="csave"]'); await wait(30);
    const msg = (w.document.getElementById('loginMsg') || {}).textContent || '';
    ok('an expired sign-in goes to the sign-in screen, saying the count was not saved', /count was not saved/.test(msg), msg);
    w.close();
  }
  {
    let release;
    const { w, recounts } = phone({ rows: two(), recount: () => new Promise((r) => { release = () => r(reply({ product_id: 'p1', already: false, qty_before: 6, qty_after: 2 })); }) });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main'); await type(w, '2');
    await tap(w, '[data-act="csave"]');
    ok('while saving the button says so and is off', $(w, '[data-act="csave"]').disabled === true && /Saving/.test($(w, '[data-act="csave"]').textContent));
    await tap(w, '.row[data-id="p2"] .prices');
    ok('another tire cannot be opened mid-save', !$(w, '.sellpanel:not(.recount)') && /still saving/.test(said(w)), said(w));
    await tap(w, '[data-act="csave"]');
    ok('and Save cannot be pressed twice', recounts.length === 1);
    release(); await wait(30);
    ok('the answer still lands', countOn(w, 'p1') === '2 in stock');
    w.close();
  }

  // ---- out of stock / negative -------------------------------------------------
  {
    const rows = [
      row({ id: 'p1', size: '205/55R16', brand: 'Marchetti Primato 4', qty: 4 }),
      row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 0 }),
      row({ id: 'p3', size: '195/65R15', brand: 'Norvell Sport', qty: -2 }),
    ];
    const { w, recounts, sales } = phone({ rows });
    await wait(60);
    ok('out of stock is still not on the list', !$(w, '.row[data-id="p2"]') && !$(w, '.row[data-id="p3"]'));
    ok('and no button with nothing searched', !$(w, '.outbtn'));
    await search(w, 'Norvell');
    ok('a search that finds nothing offers the button', Boolean($(w, '.outbtn')) && $(w, '.outbtn').textContent === 'Search out of stock/negative');
    await tap(w, '.outbtn');
    ok('pressed, the out-of-stock and negative tires show', Boolean($(w, '.row[data-id="p2"]')) && Boolean($(w, '.row[data-id="p3"]')));
    ok('under their own heading', /Out of stock \/ negative/.test(list(w)));
    ok('with the book\'s own numbers, negatives included', countOn(w, 'p3') === '-2 out' && countOn(w, 'p2') === '0 out', countOn(w, 'p3'));
    ok('the button goes once pressed', !$(w, '.outbtn'));
    await tap(w, '.row[data-id="p3"] .main');
    ok('a negative tire opens its recount at 0', (box(w) || {}).value === '0' && /Book -2 → 0 · 2 more/.test($(w, '#rcSaid').textContent), $(w, '#rcSaid').textContent);
    await type(w, '3');
    await tap(w, '[data-act="csave"]'); await wait(30);
    ok('saved against the negative it saw', recounts[0].p_seen === -2 && recounts[0].p_qty === 3, JSON.stringify(recounts[0]));
    ok('and it moves up into the stock list', /Count saved: 3/.test(said(w)) && list(w).indexOf('data-id="p3"') < list(w).indexOf('Out of stock'), said(w));
    await tap(w, '.row[data-id="p2"] .prices');
    await tap(w, '[data-act="confirm"]'); await wait(30);
    ok('an out-of-stock tire can still be sold from there', sales.length === 1 && sales[0].p_product_id === 'p2');
    w.document.getElementById('clrBtn').click(); await wait(20);
    ok('clearing the search hides out of stock again', !$(w, '.row[data-id="p2"]'));
    ok('and the tire counted back up stays on the list', Boolean($(w, '.row[data-id="p3"]')));
    await search(w, 'Norvell');
    ok('a new search starts with them hidden again', !$(w, '.row[data-id="p2"]') && Boolean($(w, '.outbtn')));
    w.close();
  }
  {
    // Some found in stock, more out: the button still sits at the bottom.
    const rows = [row({ id: 'p1', brand: 'Norvell A', qty: 4 }), row({ id: 'p2', brand: 'Norvell B', qty: 0 })];
    const { w } = phone({ rows });
    await wait(60);
    await search(w, 'Norvell');
    ok('with some found, the button is offered below them', Boolean($(w, '.row[data-id="p1"]')) && Boolean($(w, '.outbtn')));
    await search(w, 'zzz');
    ok('no button when nothing out of stock matches either', !$(w, '.outbtn'));
    w.close();
  }

  // ---- signing out ------------------------------------------------------------
  {
    const { w } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    w.document.getElementById('signOutBtn').click(); await wait(20);
    ok('signing out drops the open recount', !$(w, '.recount'));
    w.close();
  }

  finish('Recounting a tire');
})();
