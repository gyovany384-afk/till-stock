// ============================================================
// Stock Health on the phone, attention only — 22 Nov 2026.
//
// Replaces tests/health.test.cjs, which pinned the old tier view of this tab (the code for it stays for the Stock tab's quick details, but the tab no
// longer draws it).
//
// What would go wrong silently: the tab listing products that do not need attention; a write sneaking out before Confirm; a write that the database
// matched to nothing (row security answers 200 with an empty list) being called a save; the star moved to the new product AFTER the old one let
// go (a failure in between would leave none); the colours or the order drifting from the desk's (those come from attention.js, the desk's own functions).
//
//   node tests/attention.test.cjs
// ============================================================
const fs = require('fs');
const path = require('path');
const { phone, ok, finish, wait, row, reply } = require('./harness.cjs');

const RULES = fs.readFileSync(path.join(__dirname, '..', 'attention.js'), 'utf8');
const OLD_RULES = fs.readFileSync(path.join(__dirname, '..', 'health.js'), 'utf8'); // the old tier read still runs behind the Stock tab's quick details
const PIN_OLD = 'health_pin:product#out1';
const headerOf = (call, name) => {
  const h = call.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
};
const P = (id, over = {}) => row({ id, brand: 'Brand ' + id, size: '205/55R16', type: 'Car', product_code: 'C-' + id, qty: 5, target_qty: 4, price_cents: 12000, cost_cents: 7000, location: 'RACK 1', section: '', archived: false, must_have: false, ...over });
// 23 Nov 2026, his pick "Starred only": the phone lists STARRED products only, as the desk's Starred view. loose1 is empty and unstarred, so it must
// never show.
const PRODUCTS = [
  P('out1', { qty: 0, size: '195/65R15', must_have: true, price_cents: 12600 }),
  P('alt-cheap', { size: '195/65R15', price_cents: 9000 }),
  P('alt-dear', { size: '195/65R15', price_cents: 20000 }),
  P('short1', { qty: 1, size: '205/55R16', must_have: true }),
  P('seen1', { qty: 0, size: '225/65R17', must_have: true }),
  P('ok1', { qty: 6, size: '235/75R15', must_have: true }),
  P('none1', { qty: 3, target_qty: null, size: '245/70R16' }),
  P('loose1', { qty: 0, size: '265/70R17' }),
];

// The book is KEPT: a write lands in it and the next read sees it, as the database would (the phone now reads again after every Confirm).
function boot(over = {}) {
  const writes = [];
  const store = (over.settings || [{ key: 'health_pin:ack#seen1', value: '1790000000000' }]).map((s) => ({ ...s }));
  const book = (over.products || PRODUCTS).map((p) => ({ ...p }));
  const r = phone({
    rows: book,
    before: (win) => { win.eval(RULES); if (over.oldRules) win.eval(OLD_RULES); },
    extra: (u, method, init) => {
      if (u.indexOf('/rest/v1/settings') !== -1) {
        if (method === 'GET') return reply(store.map((s) => ({ ...s })), 206);
        const body = JSON.parse(init.body);
        writes.push({ kind: 'settings', url: u, method, body, headers: init.headers });
        if (over.settingsWrite) return over.settingsWrite(body, writes.length);
        body.forEach((b) => { const had = store.find((s) => s.key === b.key); if (had) had.value = b.value; else store.push({ ...b }); });
        return reply(body, 201);
      }
      if (u.indexOf('/rest/v1/products') !== -1 && method === 'PATCH') {
        const id = decodeURIComponent(/[?&]id=eq\.([^&]*)/.exec(u)[1]);
        const body = JSON.parse(init.body);
        writes.push({ kind: 'star', id, url: u, method, body, headers: init.headers });
        if (over.starWrite) return over.starWrite(id, body, writes.length);
        book.forEach((p) => { if (p.id === id) p.must_have = body.must_have; });
        return reply([{ id, must_have: body.must_have }], 200);
      }
      return undefined;
    },
  });
  r.writes = writes;
  r.store = store;
  r.book = book;
  return r;
}
const reads = (calls, from, table) => calls.slice(from).filter((c) => c.method === 'GET' && c.url.indexOf('/rest/v1/' + table + '?') !== -1).length;
const $ = (w, sel) => w.document.querySelector(sel);
const $$ = (w, sel) => [...w.document.querySelectorAll(sel)];
const text = (w, sel) => (($(w, sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
const click = (w, sel) => { const el = $(w, sel); if (el) el.dispatchEvent(new w.Event('click', { bubbles: true })); return Boolean(el); };
const ids = (w) => $$(w, '#healthList [data-hid]').map((e) => e.getAttribute('data-hid'));
const half = (id, side) => `#healthList [data-hid="${id}"] [data-hside="${side}"]`;
async function open(over) {
  const r = boot(over);
  await wait(80);
  click(r.w, '#tabHealth');
  await wait(150);
  return r;
}

(async function run() {
  console.log('\nStock Health on the phone, attention only\n');

  {
    const { w, calls } = boot();
    await wait(80);
    const tab = $(w, '#tabHealth');
    ok('the Health tab is open (not hidden)', Boolean(tab) && !tab.hidden);
    const before = calls.length;
    click(w, '#tabHealth');
    await wait(150);
    ok('tapping it opens Stock Health', $(w, '#tabHealth').getAttribute('aria-selected') === 'true' && !$(w, '#healthList').hidden && $(w, '#list').hidden);
    const reads = calls.slice(before);
    ok('it reads the products and the settings, and nothing else of the book',
      reads.some((c) => c.url.indexOf('/rest/v1/products?') !== -1) && reads.some((c) => c.url.indexOf('/rest/v1/settings?') !== -1)
      && !reads.some((c) => /\/rest\/v1\/(sales|deliveries|delivery_lines|delivery_returns)/.test(c.url)));
    ok('every read asks for the till_stock schema, a page range and a fixed order',
      reads.filter((c) => c.method === 'GET' && /\/rest\/v1\/(products|settings)\?/.test(c.url)).every((c) =>
        headerOf(c, 'Accept-Profile') === 'till_stock' && /^\d+-\d+$/.test(headerOf(c, 'Range') || '') && /[?&]order=/.test(c.url)));
    ok('it writes nothing just by being opened', calls.slice(before).every((c) => c.method === 'GET' || /rpc\/is_staff/.test(c.url)));
    ok('the search bar is not here: only the cards that need attention', $(w, '#searchWrap').hidden === true && $(w, '#healthBar').hidden === true);
    click(w, '#tabStock'); await wait(30);
    ok('and it is back on the other tabs', $(w, '#searchWrap').hidden === false);
  }

  {
    const { w } = await open();
    ok('only out and short products are listed, red first, yellow next, the acknowledged blue one last',
      ids(w).join(',') === 'out1,short1,seen1', ids(w));
    ok('at target and no target are left out', !ids(w).includes('ok1') && !ids(w).includes('none1'));
    ok('STARRED ONLY: a product that is not starred is left out, even at 0 in stock', !ids(w).includes('loose1') && !ids(w).includes('alt-cheap'), ids(w));
    ok('the colours are the desk\'s: red, yellow, blue', $(w, '[data-hid="out1"]').classList.contains('hc-out') && $(w, '[data-hid="short1"]').classList.contains('hc-short') && $(w, '[data-hid="seen1"]').classList.contains('hc-ack'));
    ok('the header counts the starred products, leaves the acknowledged out and says how many there are', /1 out/.test(text(w, '.hcounts')) && /1 short/.test(text(w, '.hcounts')) && /2 of 4 starred products need attention\. 1 acknowledged\./.test(text(w, '.hhead')), text(w, '.hhead'));
    ok('a card says its halves', text(w, half('out1', 'find')).indexOf('Find replacement') !== -1 && text(w, half('out1', 'ack')).indexOf('Acknowledge') !== -1 && /Remove acknowledged/.test(text(w, half('seen1', 'ack'))));
    ok('every card shows its star', ids(w).every((id) => Boolean($(w, `[data-hid="${id}"] .hstar`))));
  }

  {
    const { w } = await open({ products: PRODUCTS.map((p) => ({ ...p, must_have: false })) });
    ok('with nothing starred it says so, and lists nothing', ids(w).length === 0 && /Nothing starred yet/.test(text(w, '#healthList')), text(w, '#healthList'));
  }

  {
    // Opus review 23 Nov 2026, finding 1: the tab must not live on one old read.
    const r = await open();
    const { w, calls } = r;
    let from = calls.length;
    click(w, '#tabStock'); await wait(30);
    r.store.push({ key: 'health_pin:ack#short1', value: '1790000000001' }); // the desk acknowledges short1 meanwhile
    click(w, '#tabHealth'); await wait(150);
    ok('opening the tab again reads the book again', reads(calls, from, 'products') >= 1 && reads(calls, from, 'settings') >= 1);
    ok('and shows what the desk did meanwhile', $(w, '[data-hid="short1"]').classList.contains('hc-ack'), ids(w));
    from = calls.length;
    r.book.find((p) => p.id === 'out1').qty = 2; // 2 delivered on the desk: short of its target 4 now, not out
    Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await wait(150);
    ok('the phone coming back out of the pocket on Health reads it again', reads(calls, from, 'products') >= 1 && $(w, '[data-hid="out1"]').classList.contains('hc-short'), ids(w));
  }

  {
    const { w, writes } = await open();
    click(w, half('out1', 'ack'));
    await wait(20);
    ok('the right half opens the Acknowledge panel under the card, with Confirm', Boolean($(w, '.hpanel')) && /Acknowledge/.test(text(w, '.hp-title')) && Boolean($(w, '[data-hact="confirm"]')));
    ok('nothing is written until Confirm', writes.length === 0);
    click(w, '[data-hact="cancel"]'); await wait(10);
    ok('Cancel closes it and writes nothing', !$(w, '.hpanel') && writes.length === 0);
    click(w, half('out1', 'ack')); await wait(10);
    click(w, half('out1', 'ack')); await wait(10);
    ok('pressing the same half again closes the panel', !$(w, '.hpanel'));
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]');
    await wait(80);
    ok('Confirm sends ONE settings row: the product\'s acknowledged mark with a moment in it', writes.length === 1 && writes[0].kind === 'settings'
      && writes[0].body.length === 1 && writes[0].body[0].key === 'health_pin:ack#out1' && /^\d{10,}$/.test(writes[0].body[0].value), writes);
    ok('as an upsert on key, in the till_stock schema, merging duplicates', /on_conflict=key/.test(writes[0].url) && writes[0].method === 'POST'
      && headerOf(writes[0], 'Content-Profile') === 'till_stock' && /merge-duplicates/.test(headerOf(writes[0], 'Prefer') || ''), writes[0]);
    ok('the card turns blue and moves to the bottom, the panel closes, and the counts follow',
      ids(w).join(',') === 'short1,out1,seen1' && $(w, '[data-hid="out1"]').classList.contains('hc-ack') && !$(w, '.hpanel') && /0 out/.test(text(w, '.hcounts')), ids(w));
    ok('it says what it did', /acknowledged/.test(text(w, '.hsaid')));
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(80);
    ok('on a blue card the same press takes it off with a blank row, and it goes back to its place',
      writes.length === 2 && writes[1].body[0].key === 'health_pin:ack#out1' && writes[1].body[0].value === '' && ids(w).join(',') === 'out1,short1,seen1', writes[1]);
  }

  {
    const { w, writes } = await open({ settingsWrite: () => reply([], 201) });
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(80);
    ok('a write the database matched to nothing is a failure, not a save: the card stays as it was and the panel says why',
      ids(w).join(',') === 'out1,short1,seen1' && $(w, '[data-hid="out1"]').classList.contains('hc-out') && /did not take it/.test(text(w, '.hp-err')) && Boolean($(w, '.hpanel')), text(w, '#healthList'));
  }

  {
    const { w, writes } = await open({ settingsWrite: () => reply({ message: 'no' }, 403) });
    click(w, half('short1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(80);
    ok('a refusal is said, with its number, and changes nothing', /refused it \(403\)/.test(text(w, '.hp-err')) && $(w, '[data-hid="short1"]').classList.contains('hc-short'));
  }

  {
    const { w, writes } = await open();
    click(w, half('out1', 'find')); await wait(20);
    ok('the left half opens Find replacement: only the other products of that size, in stock first then cheapest',
      $$(w, '.hopt').map((b) => b.getAttribute('data-hpick')).join(',') === 'alt-cheap,alt-dear', $$(w, '.hopt').map((b) => b.getAttribute('data-hpick')));
    ok('Confirm is off until one is picked', $(w, '[data-hact="confirm"]').disabled === true);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    ok('picking one says what Confirm will move, and turns Confirm on', /moves the star from Brand out1 to Brand alt-cheap/.test(text(w, '.hpanel')) && $(w, '[data-hact="confirm"]').disabled === false, text(w, '.hpanel'));
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    ok('picking it again lets go of it', $(w, '[data-hact="confirm"]').disabled === true);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    ok('nothing is written until Confirm', writes.length === 0);
    click(w, '[data-hact="confirm"]'); await wait(120);
    ok('Confirm stars the NEW product first and only then takes the star off the old one',
      writes.length === 2 && writes[0].kind === 'star' && writes[0].id === 'alt-cheap' && writes[0].body.must_have === true
      && writes[1].kind === 'star' && writes[1].id === 'out1' && writes[1].body.must_have === false, writes.map((x) => x.kind + ':' + x.id + ':' + JSON.stringify(x.body)));
    ok('each is a PATCH in the till_stock schema', writes.every((x) => x.method === 'PATCH' && headerOf(x, 'Content-Profile') === 'till_stock'));
    ok('the panel closes and the card loses its star', !$(w, '.hpanel') && !$(w, '[data-hid="out1"] .hstar') && /star moved from Brand out1 to Brand alt-cheap/.test(text(w, '.hsaid')), text(w, '.hsaid'));
  }

  {
    const { w, writes } = await open({ settings: [{ key: 'health_pin:ack#seen1', value: '1790000000000' }, { key: PIN_OLD, value: '1700000000000' }] });
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    ok('a pinned product says the pin goes across too', /star and the pin/.test(text(w, '.hpanel')), text(w, '.hpanel'));
    click(w, '[data-hact="confirm"]'); await wait(150);
    const pins = writes.filter((x) => x.kind === 'settings');
    ok('the star goes first, then the pin rows: the old one blanked, the new one given a moment',
      writes[0].kind === 'star' && writes[1].kind === 'star' && pins.length === 1
      && pins[0].body.some((r) => r.key === PIN_OLD && r.value === '') && pins[0].body.some((r) => r.key === 'health_pin:product#alt-cheap' && /^\d{10,}$/.test(r.value)), writes.map((x) => x.kind));
  }

  {
    // Opus review 23 Nov 2026, finding 1: Confirm works from the book as it is NOW. The panel was opened with out1 pinned; the desk took the pin
    // off before Confirm. An old read would pin it again (on the new product) — the fresh read must write the star only.
    const r = await open({ settings: [{ key: 'health_pin:ack#seen1', value: '1790000000000' }, { key: PIN_OLD, value: '1700000000000' }] });
    const { w, writes, calls } = r;
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    ok('(the panel, from the old read, still says the pin would go across)', /star and the pin/.test(text(w, '.hpanel')));
    r.store.find((s) => s.key === PIN_OLD).value = '';
    const from = calls.length;
    click(w, '[data-hact="confirm"]'); await wait(200);
    const first = calls.slice(from).findIndex((c) => c.method !== 'GET');
    ok('Confirm reads the products and the settings BEFORE it writes anything', first > 0
      && calls.slice(from, from + first).some((c) => c.url.indexOf('/rest/v1/products?') !== -1) && calls.slice(from, from + first).some((c) => c.url.indexOf('/rest/v1/settings?') !== -1));
    ok('and so moves only the star: no pin is written back', writes.length === 2 && writes.every((x) => x.kind === 'star'), writes.map((x) => x.kind));
    ok('then reads the book again after', reads(calls, from + first, 'products') >= 1);
  }

  {
    // Opus re-review 23 Nov 2026: the star moves (so the card leaves the starred list) and THEN the pin write fails. Its panel is gone with the card,
    // so the failure must be said above the list, never swallowed.
    const { w, writes } = await open({ settings: [{ key: 'health_pin:ack#seen1', value: '1790000000000' }, { key: PIN_OLD, value: '1700000000000' }], settingsWrite: () => reply({ message: 'no' }, 500) });
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(200);
    ok('a pin that fails after the star moved is said above the list, in red',
      writes.filter((x) => x.kind === 'star').length === 2 && !ids(w).includes('out1')
      && /The star moved but the pin did not/.test(text(w, '.hsaid')) && Boolean($(w, '.hsaid.bad')), text(w, '.hsaid'));
  }

  {
    // The desk moved the star away before Confirm: the fresh read finds nothing to carry and writes nothing.
    const r = await open();
    const { w, writes } = r;
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    r.book.find((p) => p.id === 'out1').must_have = false;
    click(w, '[data-hact="confirm"]'); await wait(200);
    ok('a star the desk already moved is not moved again', writes.length === 0 && /Nothing to carry over/.test(text(w, '.hsaid')), text(w, '.hsaid'));
  }

  {
    // If that first read fails, nothing is written.
    const r = await open();
    const { w, writes } = r;
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    const realFetch = w.fetch;
    w.fetch = (u, init) => ((!init || !init.method || init.method === 'GET') && /\/rest\/v1\/products\?/.test(String(u)) ? Promise.reject(new Error('offline')) : realFetch(u, init));
    click(w, '[data-hact="confirm"]'); await wait(200);
    ok('a failed read before Confirm writes nothing and says so', writes.length === 0 && /nothing was changed/.test(text(w, '.hp-err')) && $(w, '[data-hact="confirm"]').disabled === false, text(w, '.hp-err'));
  }

  {
    // Opus review 23 Nov 2026, finding 3: no answer at all is not "nothing changed" — the write may have landed.
    const { w } = await open({ settingsWrite: () => Promise.reject(new Error('offline')) });
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(80);
    ok('a dropped connection says it cannot tell, never that nothing changed', /can’t tell if it went through/.test(text(w, '.hp-err')) && !/Nothing was changed/i.test(text(w, '.hp-err')), text(w, '.hp-err'));
  }

  {
    // A product nobody has starred or pinned carries nothing: confirming writes nothing at all.
    const { w, writes } = await open();
    click(w, half('short1', 'find')); await wait(10);
    ok('a size nobody else has says so, and Confirm stays off', /No other products in this size/.test(text(w, '.hpanel')) && $(w, '[data-hact="confirm"]').disabled === true);
  }

  {
    const { w, writes } = await open({ starWrite: (id, body, n) => (n === 1 ? reply([], 200) : reply([{ id }], 200)) });
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(120);
    ok('if the first star write is not taken, the second is never sent and the card keeps its star', writes.length === 1 && $(w, '[data-hid="out1"] .hstar') && /did not take it/.test(text(w, '.hp-err')) && /The star was not moved/.test(text(w, '.hp-err')), writes.length);
  }

  {
    const { w, writes } = await open({ starWrite: (id, body, n) => (n === 1 ? reply([{ id }], 200) : reply({ message: 'no' }, 500)) });
    click(w, half('out1', 'find')); await wait(10);
    click(w, '[data-hpick="alt-cheap"]'); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(120);
    ok('if only the second fails the phone says both products now hold the star, never that it worked',
      /reached Brand alt-cheap but the old one still has it too/.test(text(w, '.hp-err')) && Boolean($(w, '[data-hid="out1"] .hstar')), text(w, '.hp-err'));
  }

  {
    const { w, writes } = await open();
    click(w, half('out1', 'find')); await wait(10);
    click(w, half('short1', 'ack')); await wait(10);
    ok('one panel at a time: opening another half moves it', $$(w, '.hpanel').length === 1 && /Acknowledge/.test(text(w, '.hp-title')));
    ok('and none of that wrote anything', writes.length === 0);
  }

  {
    const { w } = await open({ settings: [{ key: 'health_pin:ack#out1', value: '1' }, { key: 'health_pin:ack#short1', value: '1' }, { key: 'health_pin:ack#seen1', value: '1' }] });
    ok('when everything is acknowledged it says nothing needs attention, and still lists the blue cards', /Nothing needs attention/.test(text(w, '#healthList')) && ids(w).length === 3);
  }

  {
    // Review finding 1: the old tier read (started by a hold on the Stock tab) must never draw over the attention cards when it lands.
    const { w } = boot({ oldRules: true });
    await wait(80);
    const rowEl = $(w, '.row[data-id="short1"] [data-side="count"]');
    // the old read's own tables answer slowly, so it lands AFTER the cards are drawn
    const realFetch1 = w.fetch;
    w.fetch = (u, init) => (/\/rest\/v1\/(sales|deliveries|delivery_lines)/.test(String(u)) ? new Promise((res) => setTimeout(() => res(realFetch1(u, init)), 400)) : realFetch1(u, init));
    const fire = (el, type) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 }));
    fire(rowEl, 'pointerdown'); await wait(650); fire(rowEl, 'pointerup'); rowEl.click(); await wait(10);
    click(w, '#tabHealth');
    await wait(900);
    ok('the old tier read landing later leaves the attention cards alone', ids(w).join(',') === 'out1,short1,seen1' && $(w, '#healthBar').hidden === true, text(w, '#healthList').slice(0, 120));
  }

  {
    // Review finding 2: a read that began before a Confirm must not undo it on screen when it lands after.
    let gets = 0;
    const r = boot({ settings: [{ key: 'health_pin:ack#seen1', value: '1790000000000' }] });
    const { w } = r;
    await wait(80);
    click(w, '#tabHealth'); await wait(150);
    // from here the NEXT settings read is slow and answers with the book as it was before the Confirm (the read after the Confirm is a true one)
    const realFetch = w.fetch;
    let slowOnce = true;
    w.fetch = (u, init) => {
      if (slowOnce && String(u).indexOf('/rest/v1/settings') !== -1 && (!init || !init.method || init.method === 'GET')) {
        slowOnce = false;
        return new Promise((res) => setTimeout(() => res(reply([{ key: 'health_pin:ack#seen1', value: '1790000000000' }], 206)), 300));
      }
      return realFetch(u, init);
    };
    await require('./harness.cjs').pull(w, 120);
    await wait(20);
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(60);
    ok('the Confirm landed: the card is blue', $(w, '[data-hid="out1"]').classList.contains('hc-ack'));
    await wait(450);
    ok('the slow read from before it does not turn the card back', $(w, '[data-hid="out1"]').classList.contains('hc-ack'), ids(w));
  }

  {
    // Review finding 3: signing out while a Confirm is in the air must not throw or leave stale cards.
    const errors = [];
    let release;
    const { w } = await open({ settingsWrite: () => new Promise((res) => { release = () => res({ ok: true, status: 201, headers: { get: () => null }, json: () => Promise.resolve([{ key: 'health_pin:ack#out1', value: '1' }]), text: () => Promise.resolve('') }); }) });
    w.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
    w.addEventListener('error', (e) => errors.push(String(e.message)));
    click(w, half('out1', 'ack')); await wait(10);
    click(w, '[data-hact="confirm"]'); await wait(20);
    click(w, '#signOutBtn'); await wait(60);
    release(); await wait(80);
    ok('a save landing after a sign-out throws nothing', errors.length === 0, errors);
  }

  finish('Stock Health on the phone, attention only');
})();
