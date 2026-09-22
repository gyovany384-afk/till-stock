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

  // ============================================================
  // The Fable audit of 92f4171 — what it found, held.
  // ============================================================

  // ---- a server that did not finish answering is NOT a refusal ----------------
  {
    let n = 0
    const { w, sales } = phone({
      rows: two(),
      sale: (body) => {
        n += 1
        if (n === 1) return Promise.resolve({ ok: false, status: 504, headers: { get: () => null }, json: () => Promise.reject(new Error('html')), text: () => Promise.resolve('<html>Gateway Timeout</html>') })
        return reply({ id: body.p_id, already: true, qty_before: 10, qty_left: 9 })
      },
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a gateway timeout is said as no clear answer, not "nothing was sold"', /may or may not have gone through/.test(said(w)) && !/Nothing was sold/.test(said(w)), said(w))
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('and Try again sends the same number', sales.length === 2 && sales[0].p_id === sales[1].p_id, sales.map((x) => x.p_id))
    w.close()
  }

  // ---- signed out in the middle of a sale ------------------------------------------
  const signIn = async (w) => {
    w.document.getElementById('email').value = 'shop@example.test'
    w.document.getElementById('password').value = 'x'
    w.document.getElementById('loginForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }))
    await wait(80)
  }
  {
    const { w, sales } = phone({ rows: two(), sale: () => reply({ message: 'JWT expired' }, 401) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(40)
    const words = (w.document.getElementById('loginMsg') || {}).textContent || ''
    ok('a first press turned away signed-out says nothing was sold', /sign in again\. Nothing was sold\./.test(words), words)
    await signIn(w)
    ok('and after signing back in the panel is not stuck on "Selling…"', ($(w, '[data-act="confirm"]') || {}).textContent === 'Confirm', ($(w, '[data-act="confirm"]') || {}).textContent)
    ok('with nothing left waiting', w.localStorage.getItem('till_stock_phone_pending') === null)
    w.close()
  }
  {
    let n = 0
    const { w, sales } = phone({
      rows: two(),
      sale: (body) => {
        n += 1
        if (n === 1) return Promise.reject(new Error('the signal dropped'))
        if (n <= 3) return reply({ message: 'JWT expired' }, 401)
        return reply({ id: body.p_id, already: true, qty_before: 10, qty_left: 9 })
      },
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    await tap(w, '[data-act="confirm"]'); await wait(40)
    const words = (w.document.getElementById('loginMsg') || {}).textContent || ''
    ok('a RETRY turned away signed-out does not claim nothing was sold', /then tap Try again\. The sale may already be in/.test(words) && !/Nothing was sold/.test(words), words)
    await signIn(w)
    ok('after signing back in it still offers Try again', ($(w, '[data-act="confirm"]') || {}).textContent === 'Try again')
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('which sends the very same number the first press made', new Set(sales.map((x) => x.p_id)).size === 1 && sales.length === 4, sales.map((x) => x.p_id))
    ok('and lands once', /nothing was sold twice/.test(said(w)), said(w))
    w.close()
  }

  // ---- a reload does not lose a sale that is waiting ------------------------------
  {
    const kept = JSON.stringify({ id: 'sabcd1758000000000', productId: 'p1', qty: 2, believed: 10 })
    const { w, sales } = phone({ rows: two(), seed: { till_stock_phone_pending: kept } })
    await wait(80)
    ok('a sale left waiting is opened again when the stock comes in', ($(w, '.row[data-id="p1"]').nextElementSibling || {}).className === 'sellpanel'
      && ($(w, '[data-act="confirm"]') || {}).textContent === 'Try again' && panelQty(w) === '2')
    ok('and says why', /never got a clear answer/.test(said(w)), said(w))
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('Try again sends the number from before the reload', (sales[0] || {}).p_id === 'sabcd1758000000000' && sales[0].p_qty === 2, sales[0])
    ok('and a clear answer lets it go', w.localStorage.getItem('till_stock_phone_pending') === null)
    w.close()
  }
  {
    const { w } = phone({ rows: two(), sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    const kept = JSON.parse(w.localStorage.getItem('till_stock_phone_pending') || 'null')
    ok('a press with no clear answer is kept on the phone', kept && /^s[a-z]{4}\d+$/.test(kept.id) && kept.productId === 'p1' && kept.qty === 1, kept)
    w.close()
  }

  // ---- a way out, and a word when another tire is tapped ----------------------------
  {
    const { w, calls } = phone({ rows: two(), sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    await tap(w, '.row[data-id="p2"]')
    ok('another tire tapped says which sale is waiting', /A sale is still waiting on 205\/55R16 Marchetti Primato 4/.test(said(w)), said(w))
    const reads = calls.filter((c) => c.url.indexOf('/rest/v1/products') !== -1).length
    await tap(w, '[data-act="leave"]'); await wait(60)
    ok('Leave it closes the sale and forgets the number', !$(w, '.sellpanel') && w.localStorage.getItem('till_stock_phone_pending') === null)
    ok('and reads the stock again, so the count says whether it went in', calls.filter((c) => c.url.indexOf('/rest/v1/products') !== -1).length > reads)
    w.close()
  }

  // ---- the stock read again while a sale is in the air --------------------------------
  {
    let release
    const { w } = phone({ rows: two(), sale: (body) => new Promise((r) => { release = () => r(reply({ id: body.p_id, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })) }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]')
    w.document.getElementById('refreshBtn').click(); await wait(60)
    release(); await wait(40)
    ok('the tire shows what is left even after the list was read again underneath it', countOn(w, 'p1') === '9 in stock' && /9 left/.test(said(w)), [countOn(w, 'p1'), said(w)])
    w.close()
  }

  // ---- whatever the database sends back is drawn as text --------------------------------
  {
    const rows = [row({ id: 'p"1', brand: '<img src=x onerror="window.__x=1">', qty: 5 })]
    const { w } = phone({ rows, sale: () => reply({ code: 'P0001', message: '<b id="injected">bold</b>' }, 400) })
    await wait(60)
    await tap(w, '.row .name'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a tire name with markup in it is drawn as text', !w.document.querySelector('.row img') && /<img/.test(($(w, '.row') || {}).textContent || ''))
    ok('and so is a message from the database', !w.document.getElementById('injected') && /<b id="injected">/.test(said(w)), said(w))
    w.close()
  }

  // ---- an answer with no figure in it ---------------------------------------------------
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: true }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('an "already" with no figure says so without one', said(w) === 'That sale was already logged — nothing was sold twice.', said(w))
    w.close()
  }
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10 }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('says it sold without making a figure up, and leaves the count as it was', said(w) === '1 \u00d7 205/55R16 Marchetti Primato 4 sold.' && countOn(w, 'p1') === '10 in stock', [said(w), countOn(w, 'p1')])
    w.close()
  }

  // ============================================================
  // The Fable audit of 3e46762 — what it found, held.
  // ============================================================
  const PENDING = 'till_stock_phone_pending'
  const topSaid = (w) => (($(w, '#list > .salemsg') || {}).textContent || '').trim()
  const sellsAgain = async (w, id) => {
    await tap(w, '.row[data-id="' + id + '"]')
    return ($(w, '.row[data-id="' + id + '"]').nextElementSibling || {}).className === 'sellpanel'
  }

  // ---- the waiting tire taken off the list at the counter --------------------------
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
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    rows.splice(0, 1)   // archived at the counter while the answer was lost
    w.document.getElementById('refreshBtn').click(); await wait(60)
    const top = $(w, '#list > .waiting')
    ok('a sale waiting on a tire taken off the list is drawn above the list',
      Boolean(top) && /no longer on the stock list/.test(top.textContent) && /1 × 205\/55R16 Marchetti Primato 4/.test(top.textContent), top && top.textContent)
    ok('with Try again and Leave it to press', ($(w, '.waiting [data-act="confirm"]') || {}).textContent === 'Try again' && Boolean($(w, '.waiting [data-act="leave"]')))
    await tap(w, '.row[data-id="p2"]')
    ok('another tire tapped still names the sale waiting', /A sale is still waiting on 205\/55R16 Marchetti Primato 4/.test(said(w)), said(w))
    await tap(w, '.waiting [data-act="confirm"]'); await wait(30)
    ok('Try again sends the same number, tire, day and clock',
      sales.length === 2 && sales[1].p_id === sales[0].p_id && sales[1].p_product_id === 'p1'
      && sales[1].p_date === sales[0].p_date && sales[1].p_when === sales[0].p_when, sales)
    ok('the answer is said above the list, not to nobody', /already logged/.test(topSaid(w)), topSaid(w))
    ok('and the waiting block is gone', !$(w, '.waiting'))
    ok('and the phone sells again', await sellsAgain(w, 'p2'))
    w.close()
  }
  {
    const rows = two()
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    rows.splice(0, 1)
    w.document.getElementById('refreshBtn').click(); await wait(60)
    await tap(w, '.waiting [data-act="leave"]'); await wait(60)
    ok('Leave it above the list lets the sale go', !$(w, '.waiting') && w.localStorage.getItem(PENDING) === null)
    ok('and says so above the list', /Left as it is/.test(topSaid(w)), topSaid(w))
    ok('and the phone sells again', await sellsAgain(w, 'p2'))
    w.close()
  }
  {
    let n = 0
    const rows = two()
    const { w } = phone({
      rows,
      sale: () => {
        n += 1
        if (n === 1) return Promise.reject(new Error('the signal dropped'))
        return reply({ code: 'P0001', message: 'That tire is not on the book any more. Nothing was sold.' }, 400)
      },
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    rows.splice(0, 1)
    w.document.getElementById('refreshBtn').click(); await wait(60)
    await tap(w, '.waiting [data-act="confirm"]'); await wait(30)
    ok('a retry refused for a tire no longer on the book says so above the list', /not on the book any more/.test(topSaid(w)), topSaid(w))
    ok('and lets the sale go', !$(w, '.waiting') && w.localStorage.getItem(PENDING) === null)
    ok('and the phone sells again', await sellsAgain(w, 'p2'))
    w.close()
  }

  // ---- a reload, with the kept sale's tire no longer on the list ------------------------
  {
    const kept = JSON.stringify({ id: 'sabcd1758000000001', productId: 'gone1', qty: 2, believed: 5,
      name: '225/45R17 Ostrava Sport', day: '2026-09-20', clock: '17:55' })
    const { w, sales } = phone({ rows: two(), seed: { [PENDING]: kept },
      sale: (body) => reply({ id: body.p_id, already: true, qty_before: 5, qty_left: 3 }) })
    await wait(80)
    const top = $(w, '#list > .waiting')
    ok('a kept sale whose tire has left the list comes back above it, not dropped in silence',
      Boolean(top) && /2 × 225\/45R17 Ostrava Sport/.test(top.textContent) && /never got a clear answer/.test(top.textContent), top && top.textContent)
    await tap(w, '.waiting [data-act="confirm"]'); await wait(30)
    const s = sales[0] || {}
    ok('Try again sends the kept number, tire, count, day and clock',
      s.p_id === 'sabcd1758000000001' && s.p_product_id === 'gone1' && s.p_qty === 2 && s.p_date === '2026-09-20' && s.p_when === '17:55', s)
    w.close()
  }

  {
    const kept = JSON.stringify({ id: 'sabcd1758000000002', productId: 'gone2', qty: 1, believed: 1,
      name: '<img id="injected2" src=x>', day: '2026-09-20', clock: '17:55' })
    const { w } = phone({ rows: two(), seed: { [PENDING]: kept } })
    await wait(80)
    ok('the waiting block draws a kept name as text', !w.document.getElementById('injected2') && /<img id="injected2"/.test(($(w, '.waiting') || {}).textContent || ''))
    w.close()
  }

  // ---- a retry the next day is still the day of the press --------------------------------
  {
    let n = 0
    const { w, sales } = phone({
      rows: two(),
      sale: (body) => {
        n += 1
        if (n === 1) return Promise.reject(new Error('the signal dropped'))
        return reply({ id: body.p_id, already: true, qty_before: 10, qty_left: 9 })
      },
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    const keptNow = JSON.parse(w.localStorage.getItem(PENDING) || 'null') || {}
    ok('the day and clock of the press are kept with the waiting sale', keptNow.day === sales[0].p_date && keptNow.clock === sales[0].p_when, keptNow)
    const Real = w.Date
    const later = Real.now() + 26 * 3600 * 1000
    w.Date = class extends Real {
      constructor(...a) { super(...(a.length ? a : [later])) }
      static now() { return later }
    }
    await tap(w, '[data-act="confirm"]'); await wait(30)
    w.Date = Real
    ok('a retry the next day sends the day and clock of the press, not of the retry',
      sales.length === 2 && sales[1].p_date === sales[0].p_date && sales[1].p_when === sales[0].p_when, sales.map((x) => [x.p_date, x.p_when]))
    w.close()
  }

  // ---- a waiting sale hidden by a search ----------------------------------------------------
  {
    const { w } = phone({ rows: two(), sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    const q = w.document.getElementById('q')
    q.value = 'Norvell'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20)
    ok('a waiting sale a search hides is drawn above the results, with its way out',
      /hidden by your search/.test(($(w, '#list > .waiting') || {}).textContent || '') && Boolean($(w, '.waiting [data-act="leave"]')))
    q.value = 'nothing like it'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20)
    ok('even when the search finds nothing', Boolean($(w, '#list > .waiting')) && /No matches/.test(list(w)))
    w.close()
  }

  // ---- signing out ------------------------------------------------------------------------------
  {
    const { w } = phone({ rows: two() })
    await wait(60)
    await tap(w, '.row[data-id="p2"]')
    w.document.getElementById('signOutBtn').click(); await wait(20)
    await signIn(w)
    ok('a tire open before signing out is not open after signing back in', !$(w, '.sellpanel'))
    w.close()
  }
  {
    const rows = two()
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    rows.splice(0, 1)
    w.document.getElementById('signOutBtn').click(); await wait(20)
    await signIn(w)
    ok('a sale still waiting comes back after signing in again, with Try again to press',
      ($(w, '#list > .waiting [data-act="confirm"]') || {}).textContent === 'Try again')
    w.close()
  }

  // ---- the answers that are not answers, and a refusal that is one -------------------------
  for (const status of [408, 409, 429]) {
    let n = 0
    const { w, sales } = phone({
      rows: two(),
      sale: (body) => {
        n += 1
        if (n === 1) return reply({ message: 'not now' }, status)
        return reply({ id: body.p_id, already: true, qty_before: 10, qty_left: 9 })
      },
    })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a ' + status + ' is said as no clear answer', /may or may not have gone through/.test(said(w)) && !/Nothing was sold/.test(said(w)), said(w))
    ok('and the sale stays kept on the phone', w.localStorage.getItem(PENDING) !== null)
    await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('and Try again sends the same number', sales.length === 2 && sales[0].p_id === sales[1].p_id, sales.map((x) => x.p_id))
    w.close()
  }
  {
    const { w } = phone({ rows: two(), sale: () => reply({ code: 'P0001', message: 'That tire is not on the book any more. Nothing was sold.' }, 400) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a refusal is an answer: nothing is kept waiting on the phone', w.localStorage.getItem(PENDING) === null && /not on the book any more/.test(said(w)), said(w))
    w.close()
  }

  // ============================================================
  // The Fable audit of 69438f3 — what it found, held.
  // ============================================================
  // Sends answered by hand, in whatever order the test says.
  const held = () => {
    const sends = []
    const sale = (body) => new Promise((resolve, reject) => { sends.push({ body, resolve, reject }) })
    return { sends, sale }
  }
  const signOutAndIn = async (w) => {
    w.document.getElementById('signOutBtn').click(); await wait(20)
    await signIn(w)
  }
  const keptId = (w) => (JSON.parse(w.localStorage.getItem(PENDING) || 'null') || {}).id || null

  // ---- signed out with a sale in the air, back in, Try again: the FIRST send's
  //      refusal must not let the number go while the second is still out ----------
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const pid = sales[0].p_id
    await signOutAndIn(w)
    ok('after signing back in, the sale still in the air is offered as Try again', ($(w, '[data-act="confirm"]') || {}).textContent === 'Try again')
    await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[0].resolve(reply({ code: 'P0001', message: 'That tire is not on the book any more. Nothing was sold.' }, 400)); await wait(30)
    ok('an older send\'s refusal leaves the latest one waiting', ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…', ($(w, '[data-act="confirm"]') || {}).textContent)
    ok('and the number kept', keptId(w) === pid)
    h.sends[1].resolve(reply({ id: pid, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    ok('the latest send\'s answer is the one said', /sold — 9 left/.test(said(w)), said(w))
    ok('and one number went out, twice — never a second number', sales.length === 2 && sales.every((x) => x.p_id === pid), sales.map((x) => x.p_id))
    w.close()
  }

  // ---- nor is an older send's lost answer -----------------------------------------------
  {
    const h = held()
    const { w } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    await signOutAndIn(w)
    await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[0].reject(new Error('the signal dropped')); await wait(30)
    ok('an older send\'s lost answer leaves the latest one on its way', ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…', ($(w, '[data-act="confirm"]') || {}).textContent)
    w.close()
  }

  // ---- an older send's 401 is not an answer about the latest ---------------------------
  // The refresh is made to fail, or the page would sign in afresh and send the
  // older one again instead of handing the 401 on.
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const pid = sales[0].p_id
    await signOutAndIn(w)
    await tap(w, '[data-act="confirm"]'); await wait(20)
    const real = w.fetch
    w.fetch = (u, init) => (String(u).indexOf('/auth/v1/token') !== -1 ? reply({ message: 'refused' }, 400) : real(u, init))
    h.sends[0].resolve(reply({ message: 'JWT expired' }, 401)); await wait(30)
    const words = () => ((w.document.getElementById('loginMsg') || {}).textContent) || ''
    ok('an older send\'s 401 whose refresh was refused asks for a sign-in, not a silent sign-out',
      w.document.getElementById('login').style.display !== 'none' && /sign in again\.$/.test(words()), words())
    ok('an older send\'s 401 does not say nothing was sold', !/Nothing was sold/.test(words()), words())
    ok('nor let the number go', keptId(w) === pid && ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…')
    h.sends[1].resolve(reply({ message: 'JWT expired' }, 401)); await wait(30)
    ok('the latest send\'s 401 asks for a sign-in and a Try again, keeping the number',
      /then tap Try again/.test(words()) && keptId(w) === pid, [words(), keptId(w)])
    w.close()
  }

  // ---- and with the session still good, an older send's 401 changes nothing ---------------
  // The refresh succeeds and the older one is sent again; that send's own 401
  // is handed on with a live session (the audit of 614bd05).
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const pid = sales[0].p_id
    await signOutAndIn(w)
    await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[0].resolve(reply({ message: 'JWT expired' }, 401)); await wait(40)
    ok('the older send is sent again after a good refresh', h.sends.length === 3 && sales[2].p_id === pid, sales.map((x) => x.p_id))
    h.sends[2].resolve(reply({ message: 'JWT expired' }, 401)); await wait(30)
    ok('an older send\'s 401 with the session still good leaves it signed in, on the stock screen',
      w.document.getElementById('login').style.display === 'none' && w.localStorage.getItem('till_stock_session_v2') !== null)
    ok('and the latest send still on its way, its number kept', ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…' && keptId(w) === pid)
    w.close()
  }

  // ---- an older send's success is news: the sale is in -----------------------------------
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const pid = sales[0].p_id
    await signOutAndIn(w)
    await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[0].resolve(reply({ id: pid, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    ok('an older send\'s success closes the sale and says so', !$(w, '.sellpanel') && /sold — 9 left/.test(said(w)) && keptId(w) === null, said(w))
    h.sends[1].resolve(reply({ id: pid, already: true, qty_before: 10, qty_left: 9 })); await wait(30)
    ok('and the second answer for the same number does not say it again', /sold — 9 left/.test(said(w)), said(w))
    w.close()
  }

  // ---- a late success for one sale leaves another sale's kept number alone -------------------
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    await signOutAndIn(w)
    await tap(w, '[data-act="leave"]'); await wait(60)
    await tap(w, '.row[data-id="p2"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const pidB = sales[1].p_id
    h.sends[0].resolve(reply({ id: sales[0].p_id, already: false, product_id: 'p1', product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    // Its own tire, named as the tire it pressed — not the tire on screen now.
    ok('the late sale\'s count goes on its own tire', countOn(w, 'p1') === '9 in stock', countOn(w, 'p1'))
    ok('the other sale keeps its number', keptId(w) === pidB, keptId(w))
    ok('and the sale left with Leave it, which landed after all, is said', /1 × 205\/55R16 Marchetti Primato 4 sold — 9 left/.test(said(w)), said(w))
    ok('and stays on its way', ($(w, '[data-act="confirm"]') || {}).textContent === 'Selling…')
    h.sends[1].reject(new Error('the signal dropped')); await wait(30)
    ok('and when its own answer is lost it offers Try again', ($(w, '[data-act="confirm"]') || {}).textContent === 'Try again' && keptId(w) === pidB)
    w.close()
  }

  // ---- a left sale landing late does not talk over the sale on screen ----------------------------
  {
    const h = held()
    const { w, sales } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    await signOutAndIn(w)
    await tap(w, '[data-act="leave"]'); await wait(60)
    await tap(w, '.row[data-id="p2"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[1].reject(new Error('the signal dropped')); await wait(30)
    h.sends[0].resolve(reply({ id: sales[0].p_id, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    ok('what the sale on screen says is kept when a left one lands late', /may or may not have gone through/.test(said(w)), said(w))
    w.close()
  }

  // ---- signed out during a send, an answer naming another tire reads nothing ----------------------
  {
    const h = held()
    const { w } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    w.document.getElementById('signOutBtn').click(); await wait(20)
    h.sends[0].resolve(reply({ id: 'x', already: true, product_id: 'p9', qty_before: 10, qty_left: 13 })); await wait(60)
    const words = ((w.document.getElementById('loginMsg') || {}).textContent) || ''
    ok('signed out during the send, the answer leaves the sign-in screen as it was', w.document.getElementById('login').style.display !== 'none' && !/expired/.test(words), words)
    w.close()
  }

  // ---- but a passing note is not the sale's own word, and a late landing is said over it --------
  {
    const h = held()
    const rows = two().concat([row({ id: 'p3', size: '225/45R17', brand: 'Kestrel Aero', qty: 6 })])
    const { w, sales } = phone({ rows, sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    await signOutAndIn(w)
    await tap(w, '[data-act="leave"]'); await wait(60)
    await tap(w, '.row[data-id="p2"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    h.sends[1].reject(new Error('the signal dropped')); await wait(30)
    await tap(w, '.row[data-id="p3"]')
    ok('(a third tire tapped says a sale is waiting)', /A sale is still waiting on/.test(said(w)), said(w))
    h.sends[0].resolve(reply({ id: sales[0].p_id, already: false, product_id: 'p1', product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    ok('a left sale landing late is said over a passing note about another tire', /sold — 9 left/.test(said(w)), said(w))
    w.close()
  }

  // ---- a count that belongs to another tire (the audit of af86044) ------------------------------
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: true, product_id: 'p9', qty_before: 10, qty_left: 13 }) })
    await wait(60)
    // The read that follows is held open, so what is on the screen is what the
    // answer wrote — not what a fresh read put over it.
    let reads = 0
    const real = w.fetch
    w.fetch = (u, init) => {
      if (String(u).indexOf('/rest/v1/products') !== -1) { reads += 1; return new Promise(() => {}) }
      return real(u, init)
    }
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(60)
    ok('a count the database says is another tire\'s is not written on the tire pressed', countOn(w, 'p1') === '10 in stock', countOn(w, 'p1'))
    ok('nor said as this tire\'s', said(w) === 'That sale was already logged — nothing was sold twice.', said(w))
    ok('and the stock is read again', reads === 1, reads)
    w.close()
  }
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: false, product_id: 'p1', product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a count the database says is this tire\'s is written on it', countOn(w, 'p1') === '9 in stock', countOn(w, 'p1'))
    w.close()
  }

  // ---- a figure the database did not send -----------------------------------------------------
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: true, qty_before: 10, qty_left: null }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('"already" with no count says no count, not "0 left"', said(w) === 'That sale was already logged — nothing was sold twice.' && countOn(w, 'p1') === '10 in stock', [said(w), countOn(w, 'p1')])
    w.close()
  }
  {
    const { w } = phone({ rows: two(), sale: (body) => reply({ id: body.p_id, already: false, product: '205/55R16 Marchetti Primato 4', qty_before: null, qty_left: 9, believed: 10 }) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    ok('a sale with no "before" figure makes no claim about the shelf', said(w) === '1 × 205/55R16 Marchetti Primato 4 sold — 9 left.', said(w))
    w.close()
  }

  // ---- an answer for a tire the search hides is said above the results ------------------------
  {
    const h = held()
    const { w } = phone({ rows: two(), sale: h.sale })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(20)
    const q = w.document.getElementById('q')
    q.value = 'Norvell'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20)
    h.sends[0].resolve(reply({ id: 'x', already: false, product: '205/55R16 Marchetti Primato 4', qty_before: 10, qty_left: 9, believed: 10 })); await wait(30)
    ok('the answer is above the results, not hidden with its tire', /sold — 9 left/.test(topSaid(w)), topSaid(w))
    w.close()
  }

  // ---- a stock read that fails leaves the way out on the screen ----------------------------------
  for (const what of ['/rest/v1/products', '/rest/v1/rpc/is_staff']) {
    const { w } = phone({ rows: two(), sale: () => Promise.reject(new Error('the signal dropped')) })
    await wait(60)
    await tap(w, '.row[data-id="p1"]'); await tap(w, '[data-act="confirm"]'); await wait(30)
    const real = w.fetch
    w.fetch = (u, init) => (String(u).indexOf(what) !== -1 ? Promise.reject(new Error('offline')) : real(u, init))
    w.document.getElementById('refreshBtn').click(); await wait(60)
    const top = $(w, '#list > .waiting')
    ok('a failed read (' + what.split('/').pop() + ') keeps the waiting sale on screen, with Try again and Leave it',
      Boolean(top) && /could not be read/.test(top.textContent) && Boolean($(w, '.waiting [data-act="leave"]')) && /Couldn.t/.test(list(w)), top && top.textContent)
    await tap(w, '.waiting [data-act="leave"]'); await wait(60)
    ok('and Leave it works offline, saying so over the error', w.localStorage.getItem(PENDING) === null && /Left as it is/.test(topSaid(w)), topSaid(w))
    w.close()
  }

  finish('Selling a tire');
})();
