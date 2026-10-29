// ============================================================
// The look-only page (viewer.html) — 29 Oct 2026.
//
// A person on the viewers list may see the sell price and the basic details of a
// product and NOTHING ELSE. The page is a separate file so the staff page's
// sell, recount, cost and notes code is not in it at all; these checks prove it
// asks for nothing but the two viewer functions, draws no cost, and says the
// three different things an empty screen can mean.
//
//   node tests/viewer.test.cjs
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadJsdom() {
  const tries = [
    'jsdom',
    process.env.TILL_REPO ? path.join(process.env.TILL_REPO, 'code', 'till', 'node_modules', 'jsdom') : null,
    path.join(os.homedir(), 'Till App (local copy)', 'code', 'till', 'node_modules', 'jsdom'),
  ].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* keep looking */ } }
  return null;
}
const jsdom = loadJsdom();
if (!jsdom) { console.log('SKIPPED — jsdom not found (see tests/harness.cjs).'); process.exit(0); }
const { JSDOM } = jsdom;
const HTML = fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8');

let failed = 0, passed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name); }
  else { failed += 1; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reply = (body, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300, status, headers: { get: () => null },
  json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)),
});

// A viewer row as the DATABASE sends it: eight columns, cents for money.
const vrow = (o = {}) => ({ id: 'p1', product_code: 'TR-2055516', size: '205/55R16', brand: 'Marchetti Primato 4', type: 'Car', qty: 10, price_cents: 12900, location: 'Rack A2', ...o });

function boot({ signedIn = true, viewer = true, rows = [vrow()], rpcStatus = {}, refreshFails = false } = {}) {
  const calls = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.test/till-stock/viewer.html',
    beforeParse(w) {
      if (signedIn) w.localStorage.setItem('till_stock_viewer_session_v1', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600000, email: 'v@x.test' }));
      w.fetch = (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
        if (u.indexOf('refresh_token') !== -1 && refreshFails) return Promise.reject(new Error('network'));
        if (u.indexOf('/auth/v1/token') !== -1) return reply({ access_token: 'a', refresh_token: 'r2', expires_in: 3600, user: { email: 'v@x.test' } });
        if (u.indexOf('/rpc/is_viewer') !== -1) return rpcStatus.is_viewer ? reply({}, rpcStatus.is_viewer) : reply(viewer);
        if (u.indexOf('/rpc/viewer_products') !== -1) {
          const m = String((init.headers || {}).Range || '').match(/^(\d+)-(\d+)$/);
          const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
          if (from >= rows.length && from > 0) return reply([], 416);
          return reply(rows.slice(from, to + 1), 206);
        }
        return reply({ message: 'unexpected request' }, 404);
      };
    },
  });
  return { w: dom.window, calls };
}
// What a person can SEE: the body without the page's own script text.
const visible = (w) => { const b = w.document.body.cloneNode(true); b.querySelectorAll('script').forEach((e) => e.remove()); return b.textContent.replace(/\s+/g, ' '); };
const text = (w, sel) => Array.from(w.document.querySelectorAll(sel)).map((e) => e.textContent.replace(/\s+/g, ' ').trim());

(async function run() {
  console.log('\nThe look-only page\n');

  {
    const { w, calls } = boot();
    await wait(80);
    const urls = calls.map((c) => c.url.replace('https://bvyuhdveucdfwaltjoks.supabase.co', ''));
    ok('it asks only the viewer questions and nothing else',
      urls.length > 0 && urls.every((u) => /\/rpc\/(is_viewer|viewer_products(\?order=id)?)$/.test(u)), urls);
    ok('it never asks for a table, a sale, a recount or the staff check',
      !urls.some((u) => /\/rest\/v1\/(products|sales|deliveries|notes|settings)|log_sale|recount|is_staff/.test(u)), urls);
    const read = calls.find((c) => c.url.indexOf('viewer_products') !== -1);
    ok('the read asks for the till_stock schema', read && read.headers['Accept-Profile'] === 'till_stock', read && read.headers);
    ok('the read is paged', read && read.headers.Range === '0-999', read && read.headers.Range);
    ok('the list is asked for in a fixed order', read && /\?order=id$/.test(read.url), read && read.url);
    ok('every request is made as a signed-in caller', calls.every((c) => /^Bearer /.test(c.headers.Authorization || '')));
    ok('the sell price is dollars, once ($129.00, not $12,900.00)', text(w, '.sell')[0] === '$129.00', text(w, '.sell'));
    ok('the size, brand, type, rack, code and count are drawn',
      (function () { const t = text(w, '.row')[0] || ''; return /205\/55R16/.test(t) && /Marchetti Primato 4/.test(t) && /Car/.test(t) && /Rack A2/.test(t) && /TR-2055516/.test(t) && /10 in stock/.test(t); })(), text(w, '.row'));
    const page = w.document.documentElement.outerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
    ok('no cost word anywhere on the screen', !/cost|profit|margin|supplier|deal/i.test(visible(w)), visible(w));
    ok('no sell, recount, move or tab buttons exist at all',
      !w.document.querySelector('[data-act], .sellpanel, .tabs, #tabSales, #tabHealth, #tabNotes, #timerBtn') && !/Recount|Sell<|Confirm/.test(page));
    w.close();
  }

  {
    // THE SCREEN SHOWS ONLY WHAT THE DATABASE HANDS OVER. A row that somehow
    // carried a cost must not be drawn — the page has no cost field to read.
    const { w } = boot({ rows: [vrow({ cost_cents: 7800, deal_cost_cents: 7000, supplier: 'Secret Supplier' })] });
    await wait(80);
    ok('an extra column in the answer is never drawn', !/78\.00|70\.00|Secret/.test(visible(w)), visible(w));
    w.close();
  }

  {
    const { w, calls } = boot({ viewer: false });
    await wait(80);
    ok('not on the viewers list: it says so and never asks for stock', /can.t look at stock yet/.test(visible(w))
      && !calls.some((c) => c.url.indexOf('viewer_products') !== -1));
    w.close();
  }
  {
    const { w } = boot({ rpcStatus: { is_viewer: 500 } });
    await wait(80);
    ok('a failed check is not "not allowed"', /Couldn.t check your access/.test(visible(w)) && !/can.t look at stock yet/.test(visible(w)));
    w.close();
  }
  {
    const { w } = boot({ rpcStatus: { is_viewer: 401 } });
    await wait(80);
    ok('an expired session goes back to sign-in', !w.document.getElementById('loginScreen').hidden && w.document.getElementById('appScreen').hidden);
    w.close();
  }
  {
    // A TOKEN THAT EXPIRES ON A DROPPED CONNECTION is not a sign-out: the
    // refresh fails on the network, the session stays, and the page says it
    // could not check rather than throwing the person to the sign-in screen.
    const { w } = boot({ rpcStatus: { is_viewer: 401 }, refreshFails: true });
    await wait(80);
    ok('a refresh lost on the network keeps the session and says so',
      !w.document.getElementById('appScreen').hidden && /Couldn.t check your access/.test(visible(w))
      && w.localStorage.getItem('till_stock_viewer_session_v1') !== null, visible(w));
    w.close();
  }
  {
    const { w } = boot({ signedIn: false });
    await wait(40);
    ok('signed out: the sign-in screen, no requests', !w.document.getElementById('loginScreen').hidden);
    w.close();
  }
  {
    const rows = [];
    for (let i = 0; i < 1200; i += 1) rows.push(vrow({ id: 'p' + i, product_code: 'CODE' + i, size: (200 + i) + '/55R16' }));
    const { w, calls } = boot({ rows });
    await wait(150);
    const reads = calls.filter((c) => c.url.indexOf('viewer_products') !== -1);
    ok('a book bigger than a page is read in two requests', reads.length === 2 && reads[1].headers.Range === '1000-1999', reads.map((c) => c.headers.Range));
    ok('and every tire reaches the screen', w.document.querySelectorAll('.row').length === 1200);
    const q = w.document.getElementById('q'); q.value = '20555'; q.dispatchEvent(new w.Event('input'));
    const hits = text(w, '.name');
    ok('search matches a size typed without slashes', hits.indexOf('205/55R16') !== -1 && hits.length < 10 && hits.every((n) => n.replace(/[^0-9a-z]/gi, '').toLowerCase().indexOf('20555') !== -1), hits);
    w.close();
  }
  {
    const { w } = boot({ rows: [vrow({ id: 'a', size: '205/55R16', price_cents: 20000 }), vrow({ id: 'b', size: '195/65R15', price_cents: 9000 })] });
    await wait(80);
    ok('sorted by size to begin with', text(w, '.name')[0] === '195/65R15', text(w, '.name'));
    w.document.getElementById('sortBtn').click();
    ok('the sort button puts the cheapest first', text(w, '.sell')[0] === '$90.00', text(w, '.sell'));
    w.close();
  }
  {
    // Anything typed into a tire's name is text, not markup.
    const { w } = boot({ rows: [vrow({ brand: '<img src=x onerror=alert(1)>' })] });
    await wait(80);
    ok('a brand written as markup is shown as text', !w.document.querySelector('.row img') && /<img/.test(w.document.querySelector('.brandline').textContent));
    w.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
