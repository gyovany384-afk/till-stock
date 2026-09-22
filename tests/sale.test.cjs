// ============================================================
// Logging a sale from the phone — 21 Sep 2026.
//
// His ask: "new mobile app feature, allowing a sale to be logged", with a
// picture of a tire opened into − 1 + and a blue Confirm. He chose the tire's
// own price (no price box), sold by "Phone", and more than the shelf holds
// allowed, as the counter allows it.
//
// THIS PAGE WORKS OUT NO MONEY, so what is tested here is what it SENDS and
// what it SAYS: one request to till_stock.log_sale with the right tire, count,
// day, clock and a sale number in the counter's shape — and the same number
// again on Try again, which is what stops a lost answer selling twice. The
// money is the stock room's (its test/phone-sale-sql.test.js holds it against
// the counter's own functions).
//
//   node tests/sale.test.cjs
// ============================================================
const { phone, ok, finish, wait, list, row, reply } = require('./harness.cjs');

const headerOf = (call, name) => {
  const h = call.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
};
const $ = (w, sel) => w.document.querySelector(sel);
const tap = async (w, sel) => { const el = $(w, sel); if (el) el.click(); await wait(20); return Boolean(el); };
const panelQty = (w) => (($(w, '.sp-qty') || {}).textContent || '').trim();
const said = (w) => (($(w, '.salemsg') || {}).textContent || '').trim();
const countOn = (w, id) => ((($(w, '.row[data-id="' + id + '"] .count')) || {}).textContent || '').trim();
const two = () => [row({ id: 'p1', qty: 10 }), row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 4 })];

(async function run() {
  console.log('\nSelling a tire\n');

  // ---- opening and closing ------------------------------------------------
  {
    const { w } = phone({ rows: two() });
    await wait(60);
    ok('no tire is open to start with', !$(w, '.sellpanel'));
    await tap(w, '.row[data-id="p1"] .name')
    ok('a tap on a tire opens the panel under it, at one', Boolean($(w, '.sellpanel')) && panelQty(w) === '1', panelQty(w));
    ok('the panel sits right after the tire tapped', ($(w, '.row[data-id="p1"]').nextElementSibling || {}).className === 'sellpanel');
    ok('the tire says it is open', $(w, '.row[data-id="p1"]').getAttribute('aria-expanded') === 'true');
    await tap(w, '.row[data-id="p2"]')
    ok('a tap on another tire moves the panel there — one open at a time',
      w.document.querySelectorAll('.sellpanel').length === 1 && ($(w, '.row[data-id="p2"]').nextElementSibling || {}).className === 'sellpanel');
    await tap(w, '.row[data-id="p2"]')
    ok('a tap on the open tire closes it', !$(w, '.sellpanel'));
    w.close();
  }

  // ---- the count ------------------------------------------------------------
  {
    const { w, sales } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p1"]')
    ok('minus is off at one', $(w, '[data-act="minus"]').disabled === true);
    await tap(w, '[data-act="plus"]'); await tap(w, '[data-act="plus"]')
    ok('plus counts up', panelQty(w) === '3', panelQty(w));
    await tap(w, '[data-act="minus"]')
    ok('minus counts down', panelQty(w) === '2', panelQty(w));
    for (let i = 0; i < 12; i++) await tap(w, '[data-act="plus"]');
    ok('plus never stops, whatever the shelf holds — the counter\'s rule', panelQty(w) === '14', panelQty(w));
    ok('and nothing is sent until Confirm', sales.length === 0);
    w.close();
  }

  // ---- what Confirm sends ---------------------------------------------------
  {
    const { w, calls, sales } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p1"]')
    await tap(w, '[data-act="plus"]')
    const before = new Date()
    await tap(w, '[data-act="confirm"]')
    await wait(40)
    const b = sales[0] || {}
    ok('Confirm sends one sale', sales.length === 1, sales.length);
    ok('with a sale number in the counter\'s shape: s, four letters, milliseconds', /^s[a-z]{4}[0-9]{13}$/.test(b.p_id || ''), b.p_id);
    ok('for the tire tapped, the count chosen, and the count the phone was showing',
      b.p_product_id === 'p1' && b.p_qty === 2 && b.p_believed === 10, b);
    const pad = (n) => String(n).padStart(2, '0');
    const day = before.getFullYear() + '-' + pad(before.getMonth() + 1) + '-' + pad(before.getDate());
    ok('on the phone\'s own day and clock, as the counter writes them', b.p_date === day && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(b.p_when || ''), [b.p_date, b.p_when]);
    ok('and no price, cost or tax — the stock room stamps those', !('p_price' in b) && !('p_cost' in b) && !('p_tax' in b) && Object.keys(b).length === 6, Object.keys(b));
    const call = calls.find((c) => c.url.indexOf('/rpc/log_sale') !== -1) || {};
    ok('to the till_stock schema, signed in', headerOf(call, 'Content-Profile') === 'till_stock'
      && headerOf(call, 'Accept-Profile') === 'till_stock' && /^Bearer /.test(headerOf(call, 'Authorization') || ''));
    ok('the tire now shows what the stock room says is left', countOn(w, 'p1') === '8 in stock', countOn(w, 'p1'));
    ok('the panel closes', !$(w, '.sellpanel'));
    ok('and it says what was sold and what is left', said(w) === '2 × 205/55R16 Marchetti Primato 4 sold — 8 left.', said(w));
    w.close();
  }

  // ---- the same phone keeps its letters --------------------------------------
  {
    const { w, sales } = phone({ rows: two() });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    await tap(w, '.row[data-id="p2"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    const tags = sales.map((s) => (s.p_id || '').slice(1, 5))
    ok('two sales, two numbers, one phone\'s four letters', sales.length === 2 && sales[0].p_id !== sales[1].p_id && tags[0] === tags[1], sales.map((s) => s.p_id));
    ok('kept on the phone', w.localStorage.getItem('till_stock_phone_tag') === tags[0]);
    w.close();
  }

  // ---- a lost answer: Try again sends the SAME sale ---------------------------
  {
    let n = 0
    const rows = two()
    const { w, sales } = phone({
      rows,
      sale: (body) => {
        n += 1
        if (n === 1) return Promise.reject(new Error('the signal dropped'))
        return reply({ id: body.p_id, already: true, qty_before: 10, qty_left: 9 })
      },
    });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('no answer is said as no answer, not as a failure', /may or may not have gone through/.test(said(w)), said(w));
    ok('the panel stays open, offering Try again', ($(w, '[data-act="confirm"]') || {}).textContent === 'Try again');
    ok('and the count cannot be changed under it', $(w, '[data-act="plus"]').disabled && $(w, '[data-act="minus"]').disabled);
    await tap(w, '.row[data-id="p2"]')
    ok('nor can another tire be opened and lose the number', ($(w, '.row[data-id="p1"]').nextElementSibling || {}).className === 'sellpanel');
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('Try again sends the very same sale number', sales.length === 2 && sales[0].p_id === sales[1].p_id, sales.map((s) => s.p_id));
    ok('and says nothing was sold twice', /nothing was sold twice/.test(said(w)) && countOn(w, 'p1') === '9 in stock', [said(w), countOn(w, 'p1')]);
    w.close();
  }

  // ---- a refusal is an answer ----------------------------------------------
  {
    const { w, sales } = phone({
      rows: two(),
      sale: () => reply({ code: 'P0001', message: 'That tire is not on the book any more. Nothing was sold.' }, 400),
    });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('the stock room\'s own words are said', said(w) === 'That tire is not on the book any more. Nothing was sold.', said(w));
    ok('the count on the phone is left alone', countOn(w, 'p1') === '10 in stock');
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('and the next press is a new sale, since nothing was written', sales.length === 2 && sales[0].p_id !== sales[1].p_id);
    w.close();
  }

  // ---- a database without the function ----------------------------------------
  {
    const { w } = phone({ rows: two(), sale: () => reply({ code: 'PGRST202', message: 'Could not find the function' }, 404) });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('says the stock room has not been taught it yet', said(w) === 'The stock room book has not been taught to take a sale from the phone yet. Nothing was sold.', said(w));
    w.close();
  }

  // ---- one press, one sale -----------------------------------------------------
  {
    let release
    const { w, sales } = phone({ rows: two(), sale: (body) => new Promise((r) => { release = () => r(reply({ id: body.p_id, already: false, product: 'x', qty_before: 10, qty_left: 9 })) }) });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]')
    ok('while it is in the air the button says so and is off', ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…' && $(w, '[data-act="confirm"]').disabled);
    await tap(w, '[data-act="confirm"]'); await tap(w, '[data-act="confirm"]')
    ok('and more presses send nothing more', sales.length === 1, sales.length);
    release(); await wait(30)
    ok('then it lands once', countOn(w, 'p1') === '9 in stock', countOn(w, 'p1'));
    w.close();
  }

  // ---- selling more than the shelf holds, and a shelf that moved ---------------
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 1 })] });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="plus"]'); await tap(w, '[data-act="plus"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('more than the shelf holds goes through, and says to count the rack', /book is now at −2 — count this rack/.test(said(w)) && countOn(w, 'p1') === '-2 out', [said(w), countOn(w, 'p1')]);
    w.close();
  }
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 7, qty_left: 6, believed: body.p_believed }) });
    await wait(60);
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a shelf that had moved since the phone read it is said, in the counter\'s words',
      said(w) === '1 × 205/55R16 Marchetti Primato 4 sold. The shelf had 7, not 10 — it was sold somewhere else first. 6 left.', said(w));
    w.close();
  }

  // ---- the words on the page ------------------------------------------------
  {
    const { w } = phone({ rows: two() });
    await wait(60);
    const text = w.document.body.textContent;
    ok('the page no longer says it can never change anything', !/can only look/.test(text) && !/read-only/.test(text));
    ok('and says a tap logs a sale', /tap a tire to log a sale/.test(text));
    w.close();
  }

  finish('Selling a tire');
})();
