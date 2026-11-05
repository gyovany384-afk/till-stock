// ============================================================
// The invoice test page (invoice.html) — 4 Nov 2026. Staff only: it sends a photo to the
// desktop and shows what became of it, and it asks the database for nothing else.
//
//   node tests/invoice-page.test.cjs
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
const HTML = fs.readFileSync(path.join(__dirname, '..', 'invoice.html'), 'utf8');
const REAL = require('../invoice-send.js');

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
const STAFF_KEY = 'till_stock_session_v2';
const SENT = { id: 7, sent_at: '2026-11-04T20:15:00Z', name: 'invoice-1.jpg', status: 'read', note: '12 lines, 2 to check' };

function boot({ signedIn = true, staff = true, status = [], sendReply = null, shrinkFails = false } = {}) {
  const calls = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.test/till-stock/invoice.html',
    beforeParse(w) {
      if (signedIn) w.localStorage.setItem(STAFF_KEY, JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600000, email: 's@x.test', remember: true }));
      // The real file is loaded by a script tag a test page does not fetch; the shrinking is
      // replaced because a canvas is the one thing jsdom does not have.
      w.InvoiceSend = Object.assign({}, REAL, {
        shrink: () => (shrinkFails ? Promise.reject(new Error('That picture could not be opened.'))
          : Promise.resolve({ b64: 'QUJD', name: 'invoice-20261104-151500.jpg', preview: 'data:image/jpeg;base64,QUJD' })),
      });
      w.fetch = (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, headers: init.headers || {}, body: init.body });
        if (u.indexOf('/auth/v1/token') !== -1) return reply({ access_token: 'a', refresh_token: 'r2', expires_in: 3600, user: { email: 's@x.test' } });
        if (u.indexOf('/rpc/is_staff') !== -1) return reply(staff);
        if (u.indexOf('/rpc/invoice_test_status') !== -1) return reply(status);
        if (u.indexOf('/rpc/send_invoice_test') !== -1) return sendReply || reply(8);
        return reply({ message: 'unexpected request' }, 404);
      };
    },
  });
  return { w: dom.window, calls };
}
const visible = (w) => { const b = w.document.body.cloneNode(true); b.querySelectorAll('script').forEach((e) => e.remove()); return b.textContent.replace(/\s+/g, ' '); };
const rpcNames = (calls) => calls.map((c) => (c.url.match(/\/rpc\/([a-z_]+)/) || [])[1]).filter(Boolean);
const choose = (w, inputId, files) => {
  const input = w.document.getElementById(inputId);
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const shown = (w, id) => !w.document.getElementById(id).hidden;

(async function run() {
  console.log('\nThe invoice test page\n');

  {
    const { w, calls } = boot({ status: [SENT] });
    await wait(80);
    ok('a staff sign-in comes straight to the page', shown(w, 'appScreen') && !shown(w, 'loginScreen'));
    ok('it asks the staff question and the status, and nothing else', JSON.stringify([...new Set(rpcNames(calls))].sort()) === JSON.stringify(['invoice_test_status', 'is_staff']), rpcNames(calls));
    ok('it never asks for a table, stock, a sale or a delivery', !calls.some((c) => /\/rest\/v1\/(?!rpc\/)/.test(c.url) || /log_sale|recount|delivery|product/i.test(c.url)), calls.map((c) => c.url));
    ok('every request is made as a signed-in caller and names the schema',
      calls.filter((c) => /\/rpc\//.test(c.url)).every((c) => /^Bearer /.test(c.headers.Authorization || '') && c.headers['Content-Profile'] === 'till_stock' && c.headers['Accept-Profile'] === 'till_stock'));
    ok('what became of a sent picture is shown', /invoice-1\.jpg/.test(visible(w)) && /Read on the desktop — 12 lines, 2 to check/.test(visible(w)), visible(w));
    ok('there is a Take photo and a Choose from phone button', /Take photo/.test(visible(w)) && /Choose from phone/.test(visible(w)));
    ok('the camera button asks for the back camera', w.document.getElementById('camInput').getAttribute('capture') === 'environment');
    w.close();
  }

  {
    const { w } = boot({ status: [{ id: 1, sent_at: '2026-11-04T20:00:00Z', name: '<b>x</b>.jpg', status: 'waiting', note: null }, { id: 2, sent_at: '2026-11-04T19:00:00Z', name: 'b.jpg', status: 'unreadable', note: 'too dark' }] });
    await wait(80);
    const t = visible(w);
    ok('a waiting picture says it is waiting', /Waiting for the desktop/.test(t), t);
    ok('an unreadable one says so and why', /Could not be read — too dark/.test(t), t);
    ok('a name is drawn as text, never as markup', !w.document.querySelector('.item b') && /<b>x<\/b>\.jpg/.test(t), t);
    w.close();
  }

  {
    const { w, calls } = boot({ staff: false });
    await wait(80);
    ok('a login that is not staff is turned away with its reason', shown(w, 'loginScreen') && /can.t send invoices/.test(visible(w)), visible(w));
    ok('and its sign-in is removed, so the staff page cannot pick it up', w.localStorage.getItem(STAFF_KEY) === null);
    ok('it asks nothing about invoices', !rpcNames(calls).some((n) => /invoice_test/.test(n)), rpcNames(calls));
    w.close();
  }

  {
    const { w, calls } = boot({ signedIn: false });
    await wait(60);
    ok('signed out: the sign-in form shows and nothing is asked', shown(w, 'loginScreen') && calls.length === 0, calls.length);
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(60);
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    const sent = calls.find((c) => /\/rpc\/send_invoice_test/.test(c.url));
    const body = sent && JSON.parse(sent.body);
    ok('a chosen picture is sent once, as base64 with its name', sent && body.p_image === 'QUJD' && body.p_name === 'invoice-20261104-151500.jpg', body);
    ok('the page says it was sent', /Sent\. The desktop is reading it now\./.test(visible(w)), visible(w));
    ok('a small copy of what was sent is shown', shown(w, 'thumb'));
    ok('the list is asked again right after', rpcNames(calls).filter((n) => n === 'invoice_test_status').length >= 2, rpcNames(calls));
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(60);
    choose(w, 'camInput', [{ type: 'image/jpeg', name: 'cam.jpg' }]);
    await wait(80);
    ok('a photo taken with the camera is sent the same way', calls.some((c) => /\/rpc\/send_invoice_test/.test(c.url)));
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(60);
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }, { type: 'image/jpeg', name: 'b.jpg' }, { type: 'image/jpeg', name: 'c.jpg' }]);
    await wait(150);
    ok('several chosen pictures are all sent', calls.filter((c) => /\/rpc\/send_invoice_test/.test(c.url)).length === 3);
    w.close();
  }

  {
    const { w } = boot({ sendReply: reply({ message: 'Twenty pictures are already waiting for the desktop.' }, 400) });
    await wait(60);
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    ok('when the database refuses, its reason is shown in red and it does not claim success',
      /Twenty pictures are already waiting/.test(visible(w)) && !/Sent\./.test(visible(w)) && w.document.getElementById('note').classList.contains('bad'), visible(w));
    w.close();
  }

  {
    const { w, calls } = boot({ shrinkFails: true });
    await wait(60);
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    ok('a picture that cannot be opened is said so and nothing is sent',
      /could not be opened/.test(visible(w)) && !calls.some((c) => /send_invoice_test/.test(c.url)), visible(w));
    w.close();
  }

  {
    const { w, calls } = boot({ sendReply: reply({}, 401) });
    await wait(60);
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(120);
    ok('a session that has ended sends you back to sign in', shown(w, 'loginScreen'), visible(w));
    w.close();
  }

  {
    const page = HTML.replace(/<script[\s\S]*?<\/script>/g, '');
    ok('nothing on the page can sell, recount, move stock or open a delivery', !/Recount|Sell<|Confirm|Receive delivery/i.test(page));
    const code = HTML.slice(HTML.indexOf('<script>'));
    const names = [...code.matchAll(/rpc\('([a-z_]+)'/g)].map((m) => m[1]);
    ok('the page\'s code calls only is_staff, invoice_test_status and send_invoice_test',
      JSON.stringify([...new Set(names)].sort()) === JSON.stringify(['invoice_test_status', 'is_staff', 'send_invoice_test'].sort()), names);
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
