// ============================================================
// From the phone, for the counter to review — 5 Oct 2026.
//
// His ask: a quick sale of a tire not in the book, a tire found on the shelf
// while counting, the notes on the phone, and a search that starts on the
// number pad. What is tested here is what the page SENDS and what it SAYS; the
// database's own rules are held in the stock room repo's
// test/phone-review-sql.test.js.
//
//   node tests/phone-review.test.cjs
// ============================================================
const { phone, ok, finish, wait, list, row, reply, salesList, sheet, sheetOpen } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const tap = async (w, sel) => { const el = $(w, sel); if (el) el.click(); await wait(30); return Boolean(el); };
const search = async (w, v) => { const q = w.document.getElementById('q'); q.value = v; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20); };
const type = async (w, id, v) => { const b = w.document.getElementById(id); b.value = v; b.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10); };
const bodyOf = (c) => JSON.parse(c.body || '{}');

// A stand-in for the stock room: what was sent for review, and the notes.
function room(over = {}) {
  const sent = [], pending = over.pending || [], notes = over.notes || [], writes = [];
  const extra = (u, method, init) => {
    if (u.indexOf('/rest/v1/rpc/phone_pending_add') !== -1) {
      const b = JSON.parse(init.body);
      sent.push(b);
      if (over.add) return over.add(b, sent.length);
      if (!pending.find((p) => p.id === b.p_id)) {
        pending.push({ id: b.p_id, kind: b.p_kind, size: b.p_size, name: b.p_name, qty: b.p_qty,
          price_cents: b.p_price_cents, rack: b.p_rack, sold_on: b.p_date, when_label: b.p_when });
      }
      return reply({ id: b.p_id, already: false });
    }
    if (u.indexOf('/rest/v1/phone_pending') !== -1) return reply(pending.slice(), 206);
    if (u.indexOf('/rest/v1/notes') !== -1) {
      if (method === 'GET') return reply(notes.slice(), 206);
      writes.push({ method, url: u, body: JSON.parse(init.body) });
      if (over.note) return over.note(method, u, JSON.parse(init.body));
      return reply([{ id: 'x', title: '', body: '', updated_at: '2026-10-05T10:00:00+00:00' }], 201);
    }
    return undefined;
  };
  return { extra, sent, pending, notes, writes };
}

(async function run() {
  console.log('\nFrom the phone, for the counter to review\n');

  // ---- the search keyboard -------------------------------------------------
  {
    const { w } = phone({ seed: {} });
    await wait(60);
    const q = $(w, '#q');
    ok('the search opens on the number pad', q.getAttribute('inputmode') === 'numeric', q.getAttribute('inputmode'));
    ok('with ABC to switch to letters', $(w, '#kbBtn').textContent === 'ABC');
    await tap(w, '#kbBtn');
    ok('ABC switches to letters, and the key reads 123', q.getAttribute('inputmode') === 'text' && $(w, '#kbBtn').textContent === '123');
    ok('and the choice is remembered on this phone', w.localStorage.getItem('till_stock_search_kb') === 'text');
    await tap(w, '#kbBtn');
    ok('123 goes back to the number pad', q.getAttribute('inputmode') === 'numeric');
  }

  // ---- digits find a size --------------------------------------------------
  {
    const { w } = phone({ rows: [row({ id: 'p1', size: '205/55R16', product_code: 'CODE1' }), row({ id: 'p2', size: '245/45/18', brand: 'Castellan S4', product_code: 'CODE2' })] });
    await wait(60);
    await search(w, '2055516');
    ok('2055516 typed on the number pad finds 205/55R16', /205\/55R16/.test(list(w)) && !/245\/45\/18/.test(list(w)), list(w).slice(0, 300));
    await search(w, '2454518');
    ok('2454518 finds 245/45/18', /245\/45\/18/.test(list(w)) && !/205\/55R16/.test(list(w)));
  }

  // ---- the two buttons -----------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(60);
    ok('no Quick sale before anything is searched', !$(w, '[data-act="quick"]'));
    await search(w, '2454518');
    ok('a search with nothing in stock offers Quick sale and Add to stock',
      Boolean($(w, '[data-act="quick"]')) && Boolean($(w, '[data-act="addstock"]')));
    await search(w, '205');
    ok('and so does a search that finds tires, under them', Boolean($(w, '[data-act="quick"]')) && /205\/55R16/.test(list(w)));
  }

  // ---- a quick sale --------------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await search(w, '2454518');
    await tap(w, '[data-act="quick"]');
    ok('Quick sale opens a form in the sheet', sheetOpen(w) && /Quick sale/.test(sheet(w)));
    ok('the size typed in the search is already in it', $(w, '#fSize').value === '2454518');
    ok('and it says what it will be stored as', /245\/45\/18/.test($(w, '#fSee').textContent), $(w, '#fSee').textContent);
    ok('the size box starts on the number pad', $(w, '#fSize').getAttribute('inputmode') === 'numeric');
    await tap(w, '[data-act="fsend"]');
    ok('nothing is sent without a brand', r.sent.length === 0 && /brand and model/.test(sheet(w)));
    await type(w, 'fName', 'Ironman iMove Gen3');
    await type(w, 'fPrice', '12');
    await tap(w, '[data-act="fplus"]');
    await type(w, 'fPrice', 'abc');
    await tap(w, '[data-act="fsend"]');
    ok('nothing is sent with a price that is not one', r.sent.length === 0 && /price each/.test(sheet(w)));
    await type(w, 'fPrice', '$129.95');
    await tap(w, '[data-act="fsend"]');
    await wait(40);
    const b = r.sent[0] || {};
    ok('one call to phone_pending_add', r.sent.length === 1);
    ok('a phone-made number', /^p[a-z]{4}\d+$/.test(b.p_id), b.p_id);
    ok('the size in the book\'s spelling, the brand, how many', b.p_size === '245/45/18' && b.p_name === 'Ironman iMove Gen3' && b.p_qty === 2, b);
    ok('the price in cents, by string: $129.95 is 12995', b.p_price_cents === 12995, b.p_price_cents);
    ok('a sale carries the phone\'s day and clock', /^\d{4}-\d\d-\d\d$/.test(b.p_date) && /^\d\d:\d\d$/.test(b.p_when), b);
    ok('the sheet closes and the list says what happened', !sheetOpen(w) && /Quick sale logged/.test(list(w)) && /counter reviews it/.test(list(w)), list(w).slice(0, 400));
  }

  // ---- no clear answer: Try again sends the SAME number --------------------
  {
    let n = 0;
    const r = room({ add: (b, i) => { n = i; return i === 1 ? Promise.reject(new Error('offline')) : reply({ id: b.p_id, already: true }); } });
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await search(w, '2454518');
    await tap(w, '[data-act="quick"]');
    await type(w, 'fName', 'Ironman');
    await type(w, 'fPrice', '100');
    await tap(w, '[data-act="fsend"]');
    await wait(40);
    ok('a lost answer says it may have gone through, and offers Try again', /may have gone through/.test(sheet(w)) && /Try again/.test(sheet(w)));
    ok('and the boxes are locked so Try again is the same row', $(w, '#fName').disabled === true);
    await tap(w, '[data-act="fsend"]');
    await wait(40);
    ok('Try again sends the same number, day and clock', n === 2 && r.sent[1].p_id === r.sent[0].p_id
      && r.sent[1].p_date === r.sent[0].p_date && r.sent[1].p_when === r.sent[0].p_when, r.sent.map((x) => x.p_id));
    ok('and lands', !sheetOpen(w));
  }

  // ---- a clear refusal saves nothing and lets go of the number ------------
  {
    const r = room({ add: () => reply({ message: 'Type the size or number. Nothing was saved.' }, 400) });
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await search(w, 'zz');
    await tap(w, '[data-act="addstock"]');
    await type(w, 'fSize', 'LT245/75R16');
    await tap(w, '[data-act="fsend"]');
    await wait(40);
    ok('the database\'s own words are shown', /Nothing was saved/.test(sheet(w)), sheet(w).slice(0, 300));
    await tap(w, '[data-act="fsend"]');
    await wait(40);
    ok('and the next press is a new row', r.sent.length === 2 && r.sent[0].p_id !== r.sent[1].p_id);
  }

  // ---- add to stock --------------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await search(w, 'ironman');
    await tap(w, '[data-act="addstock"]');
    ok('words typed in the search land in Brand / model', $(w, '#fName').value === 'ironman' && $(w, '#fSize').value === '');
    ok('no price box on a tire found while counting', !$(w, '#fPrice') && Boolean($(w, '#fRack')));
    await type(w, 'fSize', '2357515');
    await type(w, 'fRack', 'E2');
    await tap(w, '[data-act="fplus"]'); await tap(w, '[data-act="fplus"]'); await tap(w, '[data-act="fplus"]');
    await tap(w, '[data-act="fsend"]');
    await wait(60);
    const b = r.sent[0] || {};
    ok('sends an add with the count and the rack, no price and no day',
      b.p_kind === 'add' && b.p_qty === 4 && b.p_rack === 'E2' && b.p_price_cents === null && b.p_date === null && b.p_size === '235/75/15', b);
    ok('it shows on the stock list straight away, marked NEW', /NEW/.test(list(w)) && /235\/75\/15/.test(list(w)) && /not for sale yet/.test(list(w)), list(w).slice(0, 500));
    ok('with nothing to tap: no halves to sell or recount', !$(w, '.row.pend [data-side]'));
    await tap(w, '.row.pend');
    ok('a tap on it opens nothing', !$(w, '.sellpanel'));
  }

  // ---- waiting quick sales on the Sales tab -------------------------------
  {
    const r = room({ pending: [{ id: 'pabcd1', kind: 'sale', size: '31x10.50R15', name: 'Perrelli AT', qty: 1, price_cents: 9500, rack: '', sold_on: '2026-10-05', when_label: '08:52' }] });
    const { w } = phone({ extra: r.extra, sales: [] });
    await wait(60);
    await tap(w, '#tabSales');
    await wait(60);
    ok('the Sales tab shows a quick sale waiting for the counter', /Waiting for the counter/.test(salesList(w)) && /31x10.50R15/.test(salesList(w)), salesList(w).slice(0, 400));
    ok('and says it is not in the totals', /not in the totals/.test(salesList(w)));
    ok('with no money on the list', !/\$95/.test(salesList(w)));
  }

  // ---- the notes -----------------------------------------------------------
  {
    const r = room({ notes: [{ id: 'note-1', title: 'Call back Ray', body: '4x 275/55R20\nafter 3', updated_at: '2026-10-05T10:12:00.123456+00:00' }] });
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await tap(w, '#tabNotes');
    await wait(60);
    const box = (w.document.getElementById('notesList') || {}).innerHTML || '';
    ok('the Notes tab lists the counter\'s notes', /Call back Ray/.test(box) && /4x 275\/55R20/.test(box), box.slice(0, 300));
    ok('the search box goes to letters for notes', $(w, '#q').getAttribute('inputmode') === 'text');
    ok('there is no delete on the phone', !/[Dd]elete/.test(box.replace(/Delete them there/, '')));
    await tap(w, '[data-note="note-1"]');
    ok('a tap opens it to edit', sheetOpen(w) && $(w, '#nTitle').value === 'Call back Ray');
    await type(w, 'nBody', '4x 275/55R20\nafter 4');
    await tap(w, '[data-act="nsave"]');
    await wait(40);
    const wr = r.writes[0] || {};
    ok('an edit is a PATCH of that note only while it is as it was read',
      wr.method === 'PATCH' && /id=eq\.note-1/.test(wr.url) && wr.url.indexOf('updated_at=eq.' + encodeURIComponent('2026-10-05T10:12:00.123456+00:00')) !== -1, wr.url);
    ok('carrying what was typed', wr.body && wr.body.body === '4x 275/55R20\nafter 4');
  }
  {
    // The counter changed it meanwhile: nothing comes back, and nothing is lost.
    const r = room({ notes: [{ id: 'note-1', title: 'Ray', body: 'a', updated_at: '2026-10-05T10:12:00+00:00' }], note: () => reply([], 200) });
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await tap(w, '#tabNotes'); await wait(60);
    await tap(w, '[data-note="note-1"]');
    await type(w, 'nBody', 'mine');
    await tap(w, '[data-act="nsave"]');
    await wait(40);
    ok('a note changed on the counter since is not overwritten, and says so', sheetOpen(w) && /changed on the counter/.test(sheet(w)) && $(w, '#nBody').value === 'mine');
  }
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(60);
    await tap(w, '#tabNotes'); await wait(60);
    await tap(w, '[data-act="newnote"]');
    await tap(w, '[data-act="nsave"]');
    ok('an empty new note is not saved', r.writes.length === 0 && /Type something/.test(sheet(w)));
    await type(w, 'nTitle', 'Order Monday');
    await tap(w, '[data-act="nsave"]');
    await wait(40);
    const wr = r.writes[0] || {};
    ok('a new note is a POST with the counter\'s kind of number', wr.method === 'POST' && /^note-[a-z0-9]+-[a-z0-9]+$/.test(wr.body.id) && wr.body.title === 'Order Monday', wr);
  }

  finish('From the phone, for the counter to review');
})();
