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

const DELIVERIES = [{ supplier: 'Caribe Supply' }, { supplier: 'Harbor Truck Supply' }, { supplier: 'caribe supply' }, { supplier: 'Supplier' }, { supplier: '' }, { supplier: 'Import Depot' }];
function boot({ signedIn = true, staff = true, status = [], sendReply = null, shrinkFails = false, deliveries = DELIVERIES } = {}) {
  const calls = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.test/till-stock/invoice.html',
    beforeParse(w) {
      if (signedIn) w.localStorage.setItem(STAFF_KEY, JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600000, email: 's@x.test', remember: true }));
      // The real file is loaded by a script tag a test page does not fetch; the shrinking is
      // replaced because a canvas is the one thing jsdom does not have.
      w.InvoiceSend = Object.assign({}, REAL, {
        prepare: () => (shrinkFails ? Promise.reject(new Error('That picture could not be opened.'))
          : Promise.resolve({ b64: 'QUJD', name: 'invoice-20261104-151500.jpg', preview: 'data:image/jpeg;base64,QUJD' })),
      });
      w.fetch = (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, headers: init.headers || {}, body: init.body });
        if (u.indexOf('/auth/v1/token') !== -1) return reply({ access_token: 'a', refresh_token: 'r2', expires_in: 3600, user: { email: 's@x.test' } });
        if (u.indexOf('/rpc/is_staff') !== -1) return reply(staff);
        if (u.indexOf('/rpc/invoice_test_status') !== -1) return reply(status);
        if (u.indexOf('/rpc/send_invoice_test') !== -1) return sendReply || reply(8);
        if (u.indexOf('/rest/v1/deliveries?select=supplier') !== -1) return deliveries === null ? reply({ message: 'no' }, 500) : reply(deliveries);
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
// Picking a supplier the way a person does: open the list, press the name.
const pickSupplier = async (w, name) => {
  const box = w.document.getElementById('supplierBox');
  box.dispatchEvent(new w.Event('focus'));
  const b = [...w.document.querySelectorAll('#supplierList button[data-name]')].find((x) => x.getAttribute('data-name') === name);
  if (!b) throw new Error('no such supplier in the list: ' + name);
  b.click();
  await wait(10);
};
const listed = (w) => [...w.document.querySelectorAll('#supplierList button[data-name]')].map((b) => b.getAttribute('data-name'));

(async function run() {
  console.log('\nThe invoice test page\n');

  {
    const { w, calls } = boot({ status: [SENT] });
    await wait(80);
    ok('a staff sign-in comes straight to the page', shown(w, 'appScreen') && !shown(w, 'loginScreen'));
    ok('it asks the staff question and the status, and nothing else', JSON.stringify([...new Set(rpcNames(calls))].sort()) === JSON.stringify(['invoice_test_status', 'is_staff']), rpcNames(calls));
    ok('it never asks for stock, a sale or a delivery; the one table it reads is the supplier names on the deliveries', !calls.some((c) => /\/rest\/v1\/(?!rpc\/|deliveries\?select=supplier&)/.test(c.url) || /log_sale|recount|product/i.test(c.url)), calls.map((c) => c.url));
    ok('every request is made as a signed-in caller and names the schema',
      calls.filter((c) => /\/rpc\//.test(c.url)).every((c) => /^Bearer /.test(c.headers.Authorization || '') && c.headers['Content-Profile'] === 'till_stock' && c.headers['Accept-Profile'] === 'till_stock'));
    ok('what became of a sent picture is shown', /invoice-1\.jpg/.test(visible(w)) && /Read on the desktop — 12 lines, 2 to check/.test(visible(w)), visible(w));
    ok('there is a Take photo button and a Choose photo or PDF button', /Take photo/.test(visible(w)) && /Choose photo or PDF/.test(visible(w)));
    ok('the camera button asks for the back camera', w.document.getElementById('camInput').getAttribute('capture') === 'environment');
    const accept = w.document.getElementById('fileInput').getAttribute('accept') || '';
    ok('the file picker offers PDFs as well as pictures, so a saved invoice is not greyed out', /image\/\*/.test(accept) && /application\/pdf/.test(accept) && /\.pdf/.test(accept), accept);
    ok('and it lets several be chosen', w.document.getElementById('fileInput').hasAttribute('multiple'));
    ok('the button says photo or PDF', /Choose photo or PDF/.test(visible(w)), visible(w));
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
    await pickSupplier(w, 'Caribe Supply');
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    const sent = calls.find((c) => /\/rpc\/send_invoice_test/.test(c.url));
    const body = sent && JSON.parse(sent.body);
    ok('a chosen picture is sent once, as base64 with its name', sent && body.p_image === 'QUJD' && body.p_name === 'invoice-20261104-151500.jpg||Caribe Supply', body);
    ok('the page says it was sent', /Sent\. The desktop is reading it now\./.test(visible(w)), visible(w));
    ok('a small copy of what was sent is shown', shown(w, 'thumb'));
    ok('the list is asked again right after', rpcNames(calls).filter((n) => n === 'invoice_test_status').length >= 2, rpcNames(calls));
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(60);
    await pickSupplier(w, 'Harbor Truck Supply');
    choose(w, 'camInput', [{ type: 'image/jpeg', name: 'cam.jpg' }]);
    await wait(80);
    ok('a photo taken with the camera is sent the same way', calls.some((c) => /\/rpc\/send_invoice_test/.test(c.url)));
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(60);
    await pickSupplier(w, 'Caribe Supply');
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }, { type: 'image/jpeg', name: 'b.jpg' }, { type: 'image/jpeg', name: 'c.jpg' }]);
    await wait(150);
    ok('several chosen pictures are all sent', calls.filter((c) => /\/rpc\/send_invoice_test/.test(c.url)).length === 3);
    w.close();
  }

  {
    const { w } = boot({ sendReply: reply({ message: 'Twenty pictures are already waiting for the desktop.' }, 400) });
    await wait(60);
    await pickSupplier(w, 'Caribe Supply');
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    ok('when the database refuses, its reason is shown in red and it does not claim success',
      /Twenty pictures are already waiting/.test(visible(w)) && !/Sent\./.test(visible(w)) && w.document.getElementById('note').classList.contains('bad'), visible(w));
    w.close();
  }

  {
    const { w, calls } = boot({ shrinkFails: true });
    await wait(60);
    await pickSupplier(w, 'Caribe Supply');
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    ok('a picture that cannot be opened is said so and nothing is sent',
      /could not be opened/.test(visible(w)) && !calls.some((c) => /send_invoice_test/.test(c.url)), visible(w));
    w.close();
  }

  {
    const { w, calls } = boot({ sendReply: reply({}, 401) });
    await wait(60);
    await pickSupplier(w, 'Caribe Supply');
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

  // ---- WHO IS IT FROM, 5 Nov 2026: a supplier is picked before the picture is sent ----
  {
    const { w, calls } = boot();
    await wait(80);
    ok('the supplier list is the names the deliveries already have, each once, without the placeholder or blanks', JSON.stringify((w.document.getElementById('supplierBox').dispatchEvent(new w.Event('focus')), listed(w))) === JSON.stringify(['Caribe Supply', 'Harbor Truck Supply', 'Import Depot']), listed(w));
    ok('it is a dropdown that opens on the box and shows a way to add one that is not listed', shown(w, 'supplierList') === true && /A supplier that is not listed/.test(w.document.getElementById('supplierList').textContent));
    ok('the supplier read is the one allowed read, as a signed-in caller', calls.some((c) => /deliveries\?select=supplier/.test(c.url) && /^Bearer /.test(c.headers.Authorization || '')), calls.map((c) => c.url));
    ok('no photo can be taken or chosen until a supplier is picked', w.document.getElementById('camInput').disabled && w.document.getElementById('fileInput').disabled && w.document.getElementById('camLabel').classList.contains('off'));
    ok('and the page says so', /Pick the supplier first/.test(visible(w)), visible(w));
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(60);
    ok('a picture chosen anyway is not sent', !calls.some((c) => /send_invoice_test/.test(c.url)));
    await pickSupplier(w, 'Import Depot');
    ok('picking a supplier fills the box, closes the list and frees the buttons', w.document.getElementById('supplierBox').value === 'Import Depot' && !shown(w, 'supplierList') === true && !w.document.getElementById('camInput').disabled && !w.document.getElementById('camLabel').classList.contains('off'));
    ok('and the page says whose invoice it will go as', /Sending as Import Depot/.test(visible(w)), visible(w));
    w.document.getElementById('supplierBox').value = 'Import Dep';
    w.document.getElementById('supplierBox').dispatchEvent(new w.Event('input'));
    ok('typing again takes the choice back', w.document.getElementById('camInput').disabled);
    ok('and narrows the list', JSON.stringify(listed(w)) === JSON.stringify(['Import Depot']), listed(w));
    w.close();
  }

  {
    const { w, calls } = boot();
    await wait(80);
    const box = w.document.getElementById('supplierBox');
    box.value = 'Summit Parts Depot';
    box.dispatchEvent(new w.Event('input'));
    const add = w.document.querySelector('#supplierList button[data-new]');
    ok('a name that is not in the list can be used as a new supplier', Boolean(add) && /Summit Parts Depot/.test(add.textContent), w.document.getElementById('supplierList').textContent);
    add.click();
    await wait(10);
    ok('and the page says the counter will read it the general way', /New supplier/.test(visible(w)) && !w.document.getElementById('camInput').disabled, visible(w));
    choose(w, 'fileInput', [{ type: 'image/jpeg', name: 'a.jpg' }]);
    await wait(80);
    const body = JSON.parse(calls.find((c) => /send_invoice_test/.test(c.url)).body);
    ok('it goes with the supplier named after the file, so a cut-short name still ends in the file\u2019s kind', body.p_name === 'invoice-20261104-151500.jpg||Summit Parts Depot', body);
    w.close();
  }

  {
    const { w } = boot({ deliveries: null });
    await wait(80);
    const box = w.document.getElementById('supplierBox');
    box.value = 'Some New Supplier';
    box.dispatchEvent(new w.Event('input'));
    ok('when the supplier list cannot be read, a name can still be typed and used', Boolean(w.document.querySelector('#supplierList button[data-new]')));
    w.close();
  }

  {
    const { w } = boot({ status: [{ id: 3, sent_at: '2026-11-04T20:00:00Z', name: 'invoice-1.jpg||Caribe Supply', status: 'read', note: '2 lines, nothing to check' }] });
    await wait(80);
    ok('the list of what was sent shows the supplier, not the glued name', /Caribe Supply/.test(visible(w)) && !/\|\|/.test(visible(w)), visible(w));
    w.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
