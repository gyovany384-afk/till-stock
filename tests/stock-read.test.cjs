// ============================================================
// The read itself — 12 Sep 2026, the day this page was repointed from the shop's
// cloud to the stock room computer's own book.
//
// EVERY CHECK IN HERE IS A FAULT THAT WOULD BE SILENT ON SCREEN. That is why
// they exist: a missing schema header, an unpaged read, a wrong order, cents
// wired straight through — each of them draws a page that looks completely
// normal and is wrong. The plan for this change listed them under "what would
// quietly ship wrong"; this file is that list, executable.
//
//   node tests/stock-read.test.cjs
// ============================================================
const { phone, ok, finish, wait, list, fresh, onScreen, stockCalls, row, book } = require('./harness.cjs');

const headerOf = (call, name) => {
  const h = call.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
};

(async function run() {
  console.log('\nThe stock read\n');

  // ---- the schema header ------------------------------------------------
  // Every table over there lives in `till_stock`, not `public`. Without this
  // header the read looks in the wrong schema and comes back with nothing — and
  // nothing draws as an empty shop, not as an error.
  {
    const { w, calls } = phone({ rows: book(3) });
    await wait(60);
    const reads = stockCalls(calls);
    ok('the stock read asks for the till_stock schema',
      reads.length > 0 && reads.every((c) => headerOf(c, 'Accept-Profile') === 'till_stock'),
      reads.map((c) => headerOf(c, 'Accept-Profile')));
    ok('and so does the staff question, on both profile headers', (function () {
      const rpc = calls.filter((c) => c.url.indexOf('/rpc/is_staff') !== -1);
      return rpc.length === 1
        && headerOf(rpc[0], 'Accept-Profile') === 'till_stock'
        && headerOf(rpc[0], 'Content-Profile') === 'till_stock';
    })());
    w.close();
  }

  // ---- paging -----------------------------------------------------------
  // PostgREST hands back at most 1,000 rows and says NOTHING about the ones it
  // left behind. The book is about 1,595 tires: unpaged, a third of the shop
  // answers "No matches", which at a counter reads as "we don't stock it".
  {
    const { w, calls } = phone({ rows: book(1200) });
    await wait(160);
    const reads = stockCalls(calls);
    ok('a book bigger than one page is read in more than one request', reads.length === 2, reads.length);
    ok('the second request asks for the rows after the first', (function () {
      const r = reads.map((c) => headerOf(c, 'Range'));
      return r[0] === '0-999' && r[1] === '1000-1999';
    })(), reads.map((c) => headerOf(c, 'Range')));
    ok('and every tire past the thousand reaches the screen',
      list(w).indexOf('CODE1150') !== -1, list(w).length);
    w.close();
  }

  {
    // Range paging with no order leaves the order to the database's planner, so
    // two pages can overlap or skip between them — 1,595 tires come back as 1,590
    // with two of them twice, and nothing says so.
    const { w, calls } = phone({ rows: book(3) });
    await wait(60);
    const reads = stockCalls(calls);
    ok('every page is asked for in a fixed order', reads.every((c) => c.url.indexOf('order=id') !== -1));
    ok('archived tires are filtered by the database, not by this page',
      reads.every((c) => c.url.indexOf('archived=eq.false') !== -1));
    ok('and only the columns this page draws are asked for', (function () {
      const u = reads[0].url;
      return u.indexOf('select=id,product_code,size,brand,type,ply,qty,cost_cents,price_cents,location,section') !== -1
        && u.indexOf('select=*') === -1
        && u.indexOf('notes') === -1 && u.indexOf('supplier') === -1;
    })(), reads[0].url);
    w.close();
  }

  {
    // A book that is an exact multiple of a thousand rows makes one request too
    // many, and 416 is not `res.ok` — so this read would throw after having
    // successfully fetched every tire in the shop.
    const { w } = phone({ rows: book(1000), emptyRange: true });
    await wait(160);
    ok('a book of exactly one page does not end in an error',
      list(w).indexOf('Couldn') === -1 && list(w).indexOf('CODE999') !== -1);
    w.close();
  }

  // ---- cents ------------------------------------------------------------
  // cost_cents and price_cents are integers. Wire them straight through and a
  // $40 tire prints $4,075.00; do not wire them at all and every row prints
  // $0.00, because the properties this page draws do not exist over there. Both
  // look completely normal. This project has already turned $78 into $7,800 once.
  {
    const { w } = phone({ rows: [row({ price_cents: 4075, cost_cents: 2250 })] });
    await wait(60);
    const html = list(w);
    ok('a price stored as 4075 cents prints as $40.75', html.indexOf('$40.75') !== -1, html.slice(0, 400));
    ok('and not as $4,075.00', html.indexOf('$4,075.00') === -1);
    ok('and not as $0.00', html.indexOf('$0.00') === -1);
    ok('the cost is turned the same way', html.indexOf('$22.50') !== -1);
    w.close();
  }

  // ---- what the phone searches on ---------------------------------------
  // The page searches on productCode and prints "#CODE" from it. Miss the rename
  // and the code half of the search matches nothing — type a code the shop uses
  // daily and the screen says "No matches", which is a confident wrong answer.
  {
    const { w } = phone({ rows: [row({ product_code: 'TR-2055516' }), row({ id: 'p2', product_code: 'BT-N70Z', size: '70Ah' })] });
    await wait(60);
    ok('the product code is drawn on the row', list(w).indexOf('#TR-2055516') !== -1);
    const input = w.document.getElementById('q');
    input.value = 'bt-n70z';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(20);
    ok('and a code can be searched for', list(w).indexOf('70Ah') !== -1 && list(w).indexOf('205/55R16') === -1,
      list(w).slice(0, 300));
    w.close();
  }

  // ---- the three reasons a screen can be empty --------------------------
  // They used to print one message — "Has your shop computer uploaded to the
  // cloud?" — which sends him to check a machine that is working fine.
  {
    const { w, calls } = phone({ staff: false, rows: book(3) });
    await wait(80);
    ok('an account that is not on the staff list is told so', list(w).indexOf('staff list') !== -1, list(w).slice(0, 300));
    ok('and no stock is asked for at all', stockCalls(calls).length === 0);
    ok('and it is not sent to the shop computer', list(w).indexOf('uploaded to the cloud') === -1);
    w.close();
  }

  {
    const { w } = phone({ staff: 401 });
    await wait(80);
    ok('an expired sign-in asks for a sign-in, not for a staff list',
      onScreen(w, 'login') && (w.document.getElementById('loginMsg') || {}).textContent.indexOf('expired') !== -1,
      (w.document.getElementById('loginMsg') || {}).textContent);
    w.close();
  }

  {
    const { w } = phone({ staff: 'fail' });
    await wait(80);
    ok('a dropped connection says it could not check, and blames nothing else',
      list(w).indexOf('check your access') !== -1, list(w).slice(0, 300));
    w.close();
  }

  {
    const { w } = phone({ rows: [] });
    await wait(80);
    ok('a genuinely empty book says the book is empty',
      list(w).indexOf('no tires in it') !== -1, list(w).slice(0, 300));
    w.close();
  }

  // ---- what is out of stock is not on the phone at all — 22 Sep 2026 -----
  // His ask: "DONT SHOW OUT OF STOCK OR NEGATIVES IN PHONE". Hidden at the
  // read, so a search cannot turn one up either, and so the sale panel cannot
  // be opened on a tire there is none of.
  {
    const rows = [
      row({ id: 'p1', size: '205/55R16', brand: 'Marchetti Primato 4', qty: 4 }),
      row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 0 }),
      row({ id: 'p3', size: '215/60R16', brand: 'Perrelli Cinturo P7', qty: -2 }),
      row({ id: 'p4', size: '225/45R17', brand: 'Kestrel Aero', qty: 1 }),
    ];
    const { w } = phone({ rows });
    await wait(80);
    const html = list(w);
    ok('a tire at nothing is not drawn', html.indexOf('data-id="p2"') === -1, html.indexOf('data-id="p2"'));
    ok('nor one below nothing', html.indexOf('data-id="p3"') === -1);
    ok('and what is in stock still is', html.indexOf('data-id="p1"') !== -1 && html.indexOf('data-id="p4"') !== -1);
    ok('nothing on the screen says "out"', html.indexOf('out</div>') === -1 && html.indexOf('−2') === -1, html.slice(0, 200));
    // A search is over what is shown, not over the book.
    const q = w.document.getElementById('q');
    q.value = 'Norvell'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(20);
    ok('a search cannot turn one up either', list(w).indexOf('No matches') !== -1, list(w).slice(0, 200));
    ok('and says why nothing came back', list(w).indexOf('out of stock and not shown') !== -1, list(w).slice(0, 400));
    w.close();
  }
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 4 }), row({ id: 'p2', qty: 2 })] });
    await wait(80);
    const q = w.document.getElementById('q');
    q.value = 'nothing like it'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(20);
    ok('with nothing left out, a search that finds nothing says only that',
      list(w).indexOf('No matches') !== -1 && list(w).indexOf('not shown') === -1, list(w).slice(0, 300));
    w.close();
  }
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 0 }), row({ id: 'p2', qty: -1 })] });
    await wait(80);
    ok('a book with nothing in stock says that, not that the book is empty',
      list(w).indexOf('Nothing is in stock') !== -1 && list(w).indexOf('no tires in it') === -1, list(w).slice(0, 300));
    w.close();
  }
  // The tire the phone itself sells down to nothing keeps its row until the
  // next read, so the count it just moved can be seen.
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 1 })] });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(40);
    ok('a tire sold down to nothing stays on screen with its new count',
      list(w).indexOf('data-id="p1"') !== -1 && list(w).indexOf('0') !== -1 && /sold/.test(list(w)), list(w).slice(0, 300));
    w.document.getElementById('refreshBtn').click();
    await wait(60);
    ok('and is gone at the next read', list(w).indexOf('data-id="p1"') === -1 && list(w).indexOf('Nothing is in stock') !== -1, list(w).slice(0, 300));
    w.close();
  }

  // ---- out of stock is not the same as gone (the audit of dc60061) -------
  // The phone sold the last one and the answer was lost. The read that follows
  // leaves the tire out — which is not the counter deleting it, and must not
  // be said as though it were.
  {
    const rows = [row({ id: 'p1', qty: 1 }), row({ id: 'p2', size: '195/65R15', qty: 3 })];
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(30);
    rows[0].qty = 0;                       // the sale went in after all
    w.document.getElementById('refreshBtn').click();
    await wait(60);
    const head = (w.document.querySelector('.waiting .w-head') || {}).textContent || '';
    ok('a waiting sale on a tire now out of stock says so', /out of stock and not shown/.test(head), head);
    ok('and does not say the tire is off the book', head.indexOf('no longer on the stock list') === -1, head);
    // …and the way out says where the count is.
    w.document.querySelector('.waiting [data-act="leave"]').click();
    await wait(60);
    const msg = (w.document.querySelector('.salemsg') || {}).textContent || '';
    ok('Leave it does not send him to a count that is not on the phone',
      /out of stock now/.test(msg) && msg.indexOf('check this tire') === -1, msg);
    w.close();
  }
  // Where the tire really has gone, the words are still the old ones.
  {
    const rows = [row({ id: 'p1', qty: 1 }), row({ id: 'p2', size: '195/65R15', qty: 3 })];
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(30);
    rows.splice(0, 1);                     // archived at the counter
    w.document.getElementById('refreshBtn').click();
    await wait(60);
    const head = (w.document.querySelector('.waiting .w-head') || {}).textContent || '';
    ok('a waiting sale on a tire taken off the book still says that', /no longer on the stock list/.test(head), head);
    w.close();
  }

  // ---- and what Leave it says is decided again on every read -------------
  // The audit of dc9d873: chosen once, it went on saying "out of stock now"
  // under a row the counter had since put four back on.
  const leftOn = async (rows, after) => {
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(30);
    rows[0].qty = 0;                            // the sale went in after all
    w.document.querySelector('.waiting [data-act="leave"], [data-act="leave"]').click();
    await wait(60);
    const first = (w.document.querySelector('.salemsg') || {}).textContent || '';
    after(rows);
    w.document.getElementById('refreshBtn').click();
    await wait(60);
    return { w, first, then: (w.document.querySelector('.salemsg') || {}).textContent || '' };
  };
  {
    const rows = [row({ id: 'p1', qty: 1 }), row({ id: 'p2', size: '195/65R15', qty: 3 })];
    const r = await leftOn(rows, (rs) => { rs[0].qty = 4 });   // the counter received four
    ok('it said the tire was out of stock', /out of stock now/.test(r.first), r.first);
    ok('and stops saying so once there are four on the shelf', !/out of stock now/.test(r.then) && /check this tire/.test(r.then), r.then);
    ok('with the tire back on the list', (r.w.document.querySelector('.row[data-id="p1"]') || {}).outerHTML !== undefined);
    r.w.close();
  }
  {
    const rows = [row({ id: 'p1', qty: 1 }), row({ id: 'p2', size: '195/65R15', qty: 3 })];
    const r = await leftOn(rows, (rs) => { rs.splice(0, 1) });  // deleted at the counter
    ok('a tire taken off the book is said as that, not as out of stock',
      /not on the stock list any more/.test(r.then) && !/out of stock now/.test(r.then), r.then);
    r.w.close();
  }
  // A message that is NOT Leave it's is never rewritten by a read.
  {
    const rows = [row({ id: 'p1', qty: 1 }), row({ id: 'p2', size: '195/65R15', qty: 3 })];
    const { w } = phone({ rows, sale: () => Promise.reject(new Error('the signal dropped')) });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(30);
    rows[0].qty = 0;
    w.document.getElementById('refreshBtn').click();
    await wait(60);
    const msg = (w.document.querySelector('.salemsg') || {}).textContent || '';
    ok('a waiting sale keeps its own words through a read', /may or may not have gone through/.test(msg), msg);
    w.close();
  }
  // Signed out, coming back to the app reads nothing.
  {
    const { w, calls } = phone({ rows: [row({ id: 'p1', qty: 2 })] });
    await wait(80);
    w.document.getElementById('signOutBtn').click();
    await wait(20);
    Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
    const reads = stockCalls(calls).length;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await wait(60);
    ok('coming back to the app while signed out reads nothing', stockCalls(calls).length === reads, [reads, stockCalls(calls).length]);
    w.close();
  }

  // ---- a read that lands after Sign out shows nobody the stock -----------
  // The audit of 8eb441d: a read started by Leave it, the refresh button or
  // coming back to the app landed afterwards and put the list, prices and all,
  // over the sign-in screen.
  {
    let release = null;
    const rows = [row({ id: 'p1', qty: 4 })];
    const { w } = phone({ rows });
    await wait(80);
    // Hold the next stock read open, then sign out while it is in the air.
    const real = w.fetch;
    w.fetch = (u, init) => (String(u).indexOf('/rest/v1/products') !== -1
      ? new Promise((res) => { release = () => res(real(u, init)) })
      : real(u, init));
    w.document.getElementById('refreshBtn').click();
    await wait(30);
    w.document.getElementById('signOutBtn').click();
    await wait(20);
    release();
    await wait(60);
    ok('the sign-in screen stays up', onScreen(w, 'login') && !onScreen(w, 'app'));
    ok('and no stock is drawn behind it', list(w).indexOf('data-id="p1"') === -1, list(w).slice(0, 200));
    ok('and it does not claim to have checked just now', fresh(w).indexOf('checked') === -1, fresh(w));
    w.close();
  }
  // Signing out clears the line that says when the stock was last checked.
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 4 })] });
    await wait(80);
    ok('(the line is there while signed in)', fresh(w).indexOf('checked') !== -1, fresh(w));
    w.document.getElementById('signOutBtn').click();
    await wait(20);
    ok('signing out clears it', fresh(w) === '', fresh(w));
    w.close();
  }
  // An id that happens to be the name of something every object has.
  {
    const { w } = phone({ rows: [row({ id: 'constructor', qty: 5 }), row({ id: 'p2', size: '195/65R15', qty: 2 })],
      sale: () => Promise.reject(new Error('the signal dropped')) });
    await wait(80);
    ok('a tire whose id is a word every object knows is still drawn', list(w).indexOf('data-id="constructor"') !== -1, list(w).slice(0, 200));
    w.document.querySelector('.row[data-id="constructor"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(30);
    w.document.querySelector('[data-act="leave"]').click();
    await wait(60);
    const msg = (w.document.querySelector('.salemsg') || {}).textContent || '';
    ok('and is not called out of stock', /check this tire/.test(msg) && !/out of stock/.test(msg), msg);
    w.close();
  }

  // ---- the note counts what was left out, and says it in English ---------
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 4 }), row({ id: 'p2', qty: 0 })] });
    await wait(80);
    const q = w.document.getElementById('q');
    q.value = 'nothing like it'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(20);
    ok('one tire left out is said as one tire', list(w).indexOf('1 tire is out of stock and not shown') !== -1, list(w).slice(0, 300));
    w.close();
  }
  {
    const { w } = phone({ rows: [row({ id: 'p1', qty: 4 }), row({ id: 'p2', qty: 0 }), row({ id: 'p3', qty: -1 })] });
    await wait(80);
    const q = w.document.getElementById('q');
    q.value = 'nothing like it'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(20);
    ok('two are said as two', list(w).indexOf('2 tires are out of stock and not shown') !== -1, list(w).slice(0, 300));
    w.close();
  }
  // Coming back to the app looks again even when there is nothing on screen.
  // (jsdom calls a page it has never shown "prerender", so the state the page
  // actually reads is set here rather than assumed.)
  {
    const { w, calls } = phone({ rows: [row({ id: 'p1', qty: 0 })] });
    await wait(80);
    Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
    const reads = stockCalls(calls).length;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await wait(60);
    ok('coming back to the app reads again with everything out of stock', stockCalls(calls).length > reads,
      [reads, stockCalls(calls).length]);
    w.close();
  }

  // ---- the retry that used to drop its headers --------------------------
  // The page refreshes its token once on a 401 and reads again. If that retry
  // does not carry the schema header and the range, the phone works perfectly
  // first thing and comes back with an empty shop an hour later when the token
  // rolls over — and it will not reproduce on the bench.
  {
    const { w, calls } = phone({ rows: book(3), pageFail: { at: 0, status: 401 } });
    await wait(160);
    const reads = stockCalls(calls);
    ok('a 401 on a page is retried after the token is refreshed', reads.length === 2, reads.length);
    ok('and the retry still carries the schema header and the range', (function () {
      const r = reads[reads.length - 1];
      return headerOf(r, 'Accept-Profile') === 'till_stock' && headerOf(r, 'Range') === '0-999';
    })(), reads.map((c) => [headerOf(c, 'Accept-Profile'), headerOf(c, 'Range')]));
    ok('and the stock lands on screen anyway', list(w).indexOf('CODE2') !== -1);
    w.close();
  }

  // ---- a tire the book says is oversold ---------------------------------
  // The desktop dropped its "not below nought" constraint on purpose on 4 Sep, so
  // a tire can legitimately sit at -3. This screen used to draw it, as it was
  // stored; since 22 Sep 2026 it is not offered at all ("DONT SHOW OUT OF STOCK
  // OR NEGATIVES IN PHONE"). Nothing is rounded up to nought to do it — the book
  // still says -3, and the desktop still shows it.
  {
    const { w } = phone({ rows: [row({ qty: -3 })] });
    await wait(60);
    ok('a tire the book has at -3 is not offered on the phone',
      list(w).indexOf('data-id="p1"') === -1 && list(w).indexOf('-3') === -1, list(w).slice(0, 300));
    ok('and the screen says that is why it is empty', list(w).indexOf('Nothing is in stock') !== -1, list(w).slice(0, 300));
    w.close();
  }
  // Where a count below nought IS still drawn: the phone sold the last of them
  // and more. It keeps its row until the next read, and says what the book says.
  {
    const { w } = phone({ rows: [row({ qty: 1 })] });
    await wait(60);
    w.document.querySelector('.row[data-id="p1"]').click();
    await wait(20);
    w.document.querySelector('[data-act="plus"]').click();
    await wait(20);
    w.document.querySelector('[data-act="plus"]').click();
    await wait(20);
    w.document.querySelector('[data-act="confirm"]').click();
    await wait(40);
    ok('a tire sold past nothing shows the count the book now holds', list(w).indexOf('−2') !== -1, list(w).slice(0, 400));
    w.close();
  }

  // ---- the freshness line -----------------------------------------------
  // There is no updated_at column over there. Left as it was, this line silently
  // drew an empty string and the phone lost its only staleness signal.
  {
    const { w } = phone({ rows: book(2) });
    await wait(60);
    ok('the line says when this phone last checked', fresh(w).indexOf('checked') !== -1, fresh(w));
    ok('and does not claim the book was updated then', fresh(w).indexOf('updated') === -1, fresh(w));
    w.close();
  }

  // ---- this page cannot write -------------------------------------------
  // The count screen's POST went into the SHOP cloud's mailbox. Left reachable
  // while the list read the stock room's book, it would have sent the shop
  // computer real corrections built on a stale copy's baselines.
  {
    const { w, calls } = phone({ rows: book(3) });
    await wait(120);
    const writes = calls.filter((c) => c.method !== 'GET'
      && c.url.indexOf('/auth/v1/') === -1
      && c.url.indexOf('/rpc/is_staff') === -1);
    ok('nothing is written anywhere, by anything, on a normal open', writes.length === 0,
      writes.map((c) => c.method + ' ' + c.url));
    ok('and the old mailbox is never addressed', (function () {
      return calls.every((c) => c.url.indexOf('stock_counts') === -1
        && c.url.indexOf('count_requests') === -1
        && c.url.indexOf('shop_data') === -1);
    })(), calls.map((c) => c.url));
    w.close();
  }

  // ---- the old device's leftovers ---------------------------------------
  {
    const { w } = phone({
      rows: book(2),
      seed: {
        till_stock_session: '{"access_token":"old"}',
        till_stock_count: '{"p1":4}',
        till_stock_count_request: '{"id":42}',
      },
    });
    await wait(80);
    ok('the old session key is swept away on first open',
      w.localStorage.getItem('till_stock_session') === null);
    ok('and so are the old count keys',
      w.localStorage.getItem('till_stock_count') === null
      && w.localStorage.getItem('till_stock_count_request') === null);
    ok('while this page keeps its own', w.localStorage.getItem('till_stock_session_v2') !== null);
    w.close();
  }

  finish('The stock read');
})();
