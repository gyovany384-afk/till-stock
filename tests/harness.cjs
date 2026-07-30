// ============================================================
// Test harness for the tablet app.
//
// till-stock is one hand-written index.html with its code sealed inside an IIFE,
// and that is worth keeping — so nothing here reaches inside it. The tests drive
// the app the way a thumb does: through the handlers the buttons call, reading
// the rendered screen, what lands in localStorage, and the REAL request bodies it
// tries to send. The payload is the thing that matters — the shop computer is the
// only thing in the system that can change stock, so a malformed line is the only
// way this device can do damage.
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
  console.log('SKIPPED — jsdom not found.\n' +
    'These tests borrow it from the Till desktop repo. Either run `npm install` in\n' +
    '<Till repo>/code/till, or set TILL_REPO to point at that checkout.');
  process.exit(0);
}
const { JSDOM } = jsdom;

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// A small catalog with the shapes that matter: two tires on the rack being
// walked, one filed somewhere else, one with no location on file at all.
const PRODUCTS = [
  { id: 'p1', size: '11R22.5',     brand: 'Roadmaster', qty: 8, location: 'RACK 1',     buyPrice: 100 },
  { id: 'p2', size: '295/75/22.5', brand: 'Amulet',     qty: 6, location: 'RACK 1 · B', buyPrice: 120 },
  { id: 'p3', size: '285/75/24.5', brand: 'Kumho',      qty: 4, location: 'RACK 3 · A', buyPrice: 140 },
  { id: 'p4', size: '385/65/22.5', brand: 'Amulet',     qty: 2, location: '',           buyPrice: 160 },
];

function reply(body, status = 200) {
  return Promise.resolve({
    ok: status < 300, status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

/**
 * Boot a signed-in tablet against a fake shop.
 *
 * Both the session and the fetch stub have to be in place BEFORE the page's own
 * script runs — it reads the session at load and only then asks for the shop
 * data. Set them afterwards and the app boots to the login screen with an empty
 * catalog, which is a test of nothing.
 *
 * Returns { w, state } where state.requestOpen is the computer's side of the
 * mailbox: flipping it to false IS the desktop calling a count off.
 *
 * `seed` is extra localStorage to plant BEFORE the page runs — how you stand up a
 * tablet that already has a count on it. Setting those keys after boot proves
 * nothing: the app reads them once, at load.
 */
function tablet(products = PRODUCTS, seed = null) {
  const state = { requestOpen: true, patched: [], posted: null, products };
  function stub(url, opts) {
    const u = String(url), method = (opts && opts.method) || 'GET';
    if (u.indexOf('/auth/v1/token') !== -1) return reply({ access_token: 'tok', refresh_token: 'ref' });
    if (u.indexOf('/rest/v1/shop_data') !== -1) {
      return reply([{ updated_at: '2026-07-30T00:00:00Z', products: state.products, salesLog: [] }]);
    }
    if (u.indexOf('/rest/v1/count_requests') !== -1) {
      if (method === 'PATCH') { state.patched.push({ url: u, body: JSON.parse(opts.body) }); return reply({}, 204); }
      return reply(state.requestOpen
        ? [{ id: 42, created_at: '2026-07-30T00:00:00Z', note: 'Front racks', racks: ['RACK 1'] }]
        : []);
    }
    if (u.indexOf('/rest/v1/stock_counts') !== -1 && method === 'POST') {
      state.posted = JSON.parse(opts.body);
      return reply({}, 201);
    }
    return reply([]);
  }
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.test/',
    beforeParse(win) {
      win.localStorage.setItem('till_stock_session',
        JSON.stringify({ access_token: 'tok', refresh_token: 'ref', remember: true }));
      if (seed) Object.keys(seed).forEach(k => win.localStorage.setItem(k, seed[k]));
      win.fetch = stub;
      win.confirm = () => true;     // prompts are accepted; refusing is tested by not calling
    },
  });
  return { w: dom.window, state };
}

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); return true; }
  console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  failures++;
  return false;
}
function finish(label) {
  console.log(failures ? '\n' + label + ' FAILED (' + failures + ')' : '\n' + label + ' PASSED');
  process.exit(failures ? 1 : 0);
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const screen = (w) => (w.document.getElementById('countList') || {}).innerHTML || '';
const stored = (w, key, dflt) => { try { return JSON.parse(w.localStorage.getItem(key) || dflt); } catch (e) { return null; } };

// Put a request in place and open the rack, the way the computer plus one tap would.
function startWalking(w, rack = 'RACK 1') {
  w.tsSetRequest({ id: 42, racks: [rack], note: 'Front racks' });
  w.tsStart();
  w.tsRack(rack);
}

module.exports = { tablet, ok, finish, wait, screen, stored, startWalking, PRODUCTS };
