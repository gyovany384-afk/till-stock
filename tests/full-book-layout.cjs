// ============================================================
// The list with the WHOLE book in it, in a real browser — 1 Oct 2026.
//
// His phone showed every tire card squeezed to a thin line. The list is a
// fixed-height flex column; four tires fit and looked perfect, 1,600 did not,
// and jsdom draws no layout at all, so no other test here could see it. This
// one loads the page in Chromium at phone size with 1,600 invented tires and
// asks how tall the cards are.
//
// Playwright is borrowed from the till-react checkout, as the stock room's
// screen harness does. Without it this prints SKIPPED and exits 0.
//
//   node tests/full-book-layout.cjs
// ============================================================
const path = require('path');
let chromium;
for (const t of ['playwright', 'C:/Users/aball/till-react/node_modules/playwright']) {
  try { ({ chromium } = require(t)); break; } catch (e) { /* keep looking */ }
}
if (!chromium) { console.log('SKIPPED — playwright not found.'); process.exit(0); }

const rows = [];
for (let i = 0; i < 1600; i += 1) {
  rows.push({ id: 'p' + i, product_code: 'C' + i, size: (200 + (i % 60)) + '/65R17', brand: 'Brand ' + i,
    type: 'Car', ply: '', qty: (i % 7) + 1, cost_cents: 10000, price_cents: 15000, location: 'A' + (i % 9), section: '' });
}

(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const [w, h] of [[390, 844], [375, 667], [820, 1180]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: true });
    const p = await ctx.newPage();
    await p.addInitScript((rows) => {
      localStorage.setItem('till_stock_session_v2', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600e3, email: 'x', remember: true }));
      const rep = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
      window.fetch = (u, init) => {
        u = String(u);
        if (u.includes('is_staff')) return rep(true);
        if (u.includes('/rest/v1/products')) {
          const [a, z] = ((init && init.headers && init.headers.Range) || '0-999').split('-').map(Number);
          return rep(rows.slice(a, z + 1), 206);
        }
        return rep([]);
      };
    }, rows);
    await p.goto('file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/'));
    await p.waitForTimeout(800);
    const heights = await p.$$eval('#list .row', (els) => els.slice(0, 20).map((e) => e.getBoundingClientRect().height));
    const short = heights.filter((x) => x < 60).length;
    const pass = heights.length === 20 && short === 0;
    if (!pass) bad += 1;
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + w + 'x' + h + ': cards keep their height with the whole book in the list'
      + (pass ? '' : '  -> ' + heights.slice(0, 5).map(Math.round).join(',')));
    await ctx.close();
  }
  await b.close();
  console.log(bad ? 'Full-book layout FAILED (' + bad + ')' : 'Full-book layout PASSED');
  process.exit(bad ? 1 : 0);
})();
