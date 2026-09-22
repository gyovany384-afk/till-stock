// ============================================================
// Test harness for the stock lookup.
//
// till-stock is one hand-written index.html with its code sealed inside an IIFE,
// and that is worth keeping — so nothing here reaches inside it. The tests drive
// the app the way a thumb does: through the handlers the buttons call, reading
// the rendered screen, and watching the REAL requests it tries to send.
//
// REWRITTEN 12 SEP 2026, when the page was repointed from the shop's cloud to
// the stock room computer's own book and the count screen was deleted. The old
// harness stubbed the shop's `shop_data` blob and the two tests on it drove the
// count screen, so both would have gone green against a page that had lost the
// whole stock list. What matters now is the read: paging, the schema header, the
// order, cents, and the three reasons a screen can be empty.
//
// There is no package.json here on purpose (the app ships as a single file to a
// static host). jsdom is borrowed from the Till desktop repo, which already has
// it for its own tests.
// ============================================================
const path = require('path');
const fs = require('fs');
const os = require('os');

function loadJsdom() {
  const tries = [
    'jsdom',
    process.env.TILL_REPO ? path.join(process.env.TILL_REPO, 'code', 'till', 'node_modules', 'jsdom') : null,
    path.join(os.homedir(), 'Till App (local copy)', 'code', 'till', 'node_modules', 'jsdom'),
    path.join(__dirname, '..', '..', 'Till App (local copy)', 'code', 'till', 'node_modules', 'jsdom'),
  ].filter(Boolean);
  for (const t of tries) {
    try { return require(t); } catch (e) { /* keep looking */ }
  }
  return null;
}

const jsdom = loadJsdom();
if (!jsdom) {
  // A SKIP IS PRINTED LOUDLY AND STILL EXITS 0, which is the honest trade: these
  // tests cannot run without a borrowed jsdom, and a red suite on a machine that
  // simply does not have one teaches nobody anything. Read the line.
  console.log('SKIPPED — jsdom not found.\n' +
    'These tests borrow it from the Till desktop repo. Either run `npm install` in\n' +
    '<Till repo>/code/till, or set TILL_REPO to point at that checkout.');
  process.exit(0);
}
const { JSDOM } = jsdom;

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Rows in the shape the STOCK ROOM's database hands them over: snake_case
// columns, and money as an integer number of cents. $40.75 is 4075. Getting this
// wrong in either direction is silent on screen, which is why the rows in the
// tests look like this rather than like the objects the page draws.
function row(over = {}) {
  return {
    id: 'p1', product_code: 'TR-2055516', size: '205/55R16', brand: 'Marchetti Primato 4',
    type: 'Car', ply: '91V', qty: 10, cost_cents: 7800, price_cents: 12900,
    location: 'Rack A2', section: 'Front floor',
    ...over,
  };
}

// A book of `n` tires, each one distinguishable.
function book(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(row({ id: 'p' + i, product_code: 'CODE' + i, size: (200 + i) + '/55R16' }));
  }
  return out;
}

function reply(body, status = 200, headers = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] || null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function parseRange(headers) {
  const h = (headers && (headers.Range || headers.range)) || '';
  const m = String(h).match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]) };
}

/**
 * Boot a signed-in phone against a fake stock room.
 *
 * Both the session and the fetch stub have to be in place BEFORE the page's own
 * script runs — it reads the session at load and only then asks anything. Set
 * them afterwards and the app boots to the sign-in screen, which is a test of
 * nothing.
 *
 * opts:
 *   rows        the book (rows in database shape). Default: one tire.
 *   staff       true | false | 401 | 'fail'   what is_staff answers.
 *   pageFail    { at, status }  make the page starting at `at` answer `status`.
 *   emptyRange  true  -> answer 416 for any page past the end, rather than []
 *   seed        extra localStorage planted before the page runs.
 *
 * Returns { w, calls } where `calls` is every request the page made, in order,
 * as { url, method, headers, body }.
 */
function phone(opts = {}) {
  const rows = opts.rows || [row()];
  const staff = opts.staff === undefined ? true : opts.staff;
  const calls = [];
  let staffAsked = 0;
  let pageFailedOnce = false;
  // Every sale the page sent, in order, and the numbers already sold.
  const sales = [];
  const soldIds = new Map();

  function stub(url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    const headers = (init && init.headers) || {};
    calls.push({ url: u, method, headers, body: init && init.body });

    if (u.indexOf('/auth/v1/token') !== -1) {
      return reply({ access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600, user: { email: 'shop@example.test' } });
    }

    if (u.indexOf('/rest/v1/rpc/is_staff') !== -1) {
      staffAsked += 1;
      if (staff === 'fail') return Promise.reject(new Error('offline'));
      if (staff === 401) return reply({ message: 'JWT expired' }, 401);
      return reply(staff === true);
    }

    // A SALE — 21 Sep 2026. `opts.sale(body, n)` answers it when given, as a
    // promise of reply() or a rejection for a dropped signal; otherwise a
    // stand-in for till_stock.log_sale that takes the tires off `rows`, and
    // finds a sale number it has seen before and sells nothing twice.
    if (u.indexOf('/rest/v1/rpc/log_sale') !== -1) {
      const body = JSON.parse((init && init.body) || '{}');
      sales.push(body);
      if (opts.sale) return opts.sale(body, sales.length);
      const r = rows.find((x) => x.id === body.p_product_id);
      if (!r) return reply({ message: 'That tire is not on the book any more. Nothing was sold.' }, 400);
      const was = soldIds.get(body.p_id);
      if (was) return reply({ id: body.p_id, already: true, qty_before: was.before, qty_left: r.qty });
      const before = r.qty;
      r.qty -= body.p_qty;
      soldIds.set(body.p_id, { before });
      return reply({ id: body.p_id, already: false, product: r.size + ' ' + r.brand, qty_before: before, qty_left: r.qty, believed: body.p_believed });
    }

    if (u.indexOf('/rest/v1/products') !== -1) {
      const range = parseRange(headers);
      const from = range ? range.from : 0;
      const to = range ? range.to : rows.length - 1;

      if (opts.pageFail && opts.pageFail.at === from && !pageFailedOnce) {
        pageFailedOnce = true;
        return reply({ message: 'nope' }, opts.pageFail.status);
      }
      if (opts.emptyRange && from >= rows.length && from > 0) {
        return reply({ message: 'Requested Range Not Satisfiable' }, 416);
      }
      const slice = rows.slice(from, to + 1);
      // A ranged request answers 206, not 200 — the page has to accept both.
      return reply(slice, range ? 206 : 200);
    }

    return reply([]);
  }

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.test/',
    beforeParse(win) {
      win.localStorage.setItem('till_stock_session_v2',
        JSON.stringify({ access_token: 'tok', refresh_token: 'ref', remember: true }));
      if (opts.seed) Object.keys(opts.seed).forEach((k) => win.localStorage.setItem(k, opts.seed[k]));
      win.fetch = stub;
      win.confirm = () => true;
    },
  });

  return { w: dom.window, calls, staffAsked: () => staffAsked, sales };
}

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); return true; }
  console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  failures += 1;
  return false;
}
function finish(label) {
  console.log(failures ? '\n' + label + ' FAILED (' + failures + ')' : '\n' + label + ' PASSED');
  process.exit(failures ? 1 : 0);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (w) => (w.document.getElementById('list') || {}).innerHTML || '';
const fresh = (w) => (w.document.getElementById('freshText') || {}).textContent || '';
const onScreen = (w, id) => {
  const el = w.document.getElementById(id);
  return !!el && el.style.display !== 'none';
};
const stockCalls = (calls) => calls.filter((c) => c.url.indexOf('/rest/v1/products') !== -1);

module.exports = { phone, ok, finish, wait, list, fresh, onScreen, stockCalls, row, book, reply };
