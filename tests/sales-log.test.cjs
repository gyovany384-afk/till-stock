// ============================================================
// THE SALES LOG ON THE PHONE — 22 Sep 2026.
//
// His ask, with a mockup he approved: one card per sale, narrow enough that
// more of the day fits on a screen, the quantity where the price used to be,
// and — the rule that shapes the whole screen — "no other numbers exist (as far
// as money goes) outside of the card, clicking shows those details". Plus a
// Remove button inside the opened sale.
//
// What these hold, in the order it can go wrong silently:
//   the READ: two of them now, the sales and the tires those sales name, both
//   paged, both ordered, both with the schema header;
//   the RULE: no money anywhere on the list, day headings included;
//   the MONEY inside the sale: cents turned into dollars exactly once, and a
//   line of four multiplied in cents the way the counter multiplies it;
//   the DAY: grouped by the day the book stored, never shifted by a time zone;
//   and REMOVE: what it says before it moves anything, what it sends, and that
//   the same press twice cannot take two sales out.
// ============================================================
const { phone, ok, finish, wait, row, reply, salesCalls, salesList, sheet, sheetOpen, tap } = require('./harness.cjs');

// Today and yesterday as the phone works them out — the same local day the page
// stamps a sale with, so these tests do not go red at midnight or in another
// time zone.
const pad = (n) => (n < 10 ? '0' : '') + n;
const localDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = localDay(new Date());
const shift = (iso, by) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
};
const YESTERDAY = shift(TODAY, -1);
// A day earlier in the same month, for the Month pill. On the 1st and 2nd there
// is no such day, so it falls back to yesterday and the month test still holds.
const EARLIER = Number(TODAY.slice(8)) > 2 ? TODAY.slice(0, 8) + '01' : YESTERDAY;

const sale = (over = {}) => ({
  id: 'sphon1757000000100', product_id: 'p1', sold_on: TODAY, when_label: '14:20',
  qty: 4, used: 0, unit_cents: 12900, sold_by: 'Phone', shelf_before: 10, ...over,
});

const BOOK = [
  row({ id: 'p1', size: '205/55R16', brand: 'Marchetti Primato 4', qty: 6 }),
  row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 8 }),
];

// A phone booted on the Sales tab, with the sales read done.
async function onSales(opts = {}) {
  const p = phone({ rows: opts.rows || BOOK.map((r) => ({ ...r })), ...opts });
  await wait(40);
  tap(p.w, '#tabSales');
  await wait(40);
  return p;
}

(async () => {
  // ----------------------------------------------------------
  console.log('\nThe two reads');
  {
    const p = await onSales({ sales: [sale(), sale({ id: 'sabcd1757000000090', product_id: 'p2', sold_by: 'Counter', qty: 2, unit_cents: 10400, shelf_before: null })] });
    const reads = salesCalls(p.calls);
    ok('the sales are read once when the tab is opened', reads.length === 1, reads.length);
    const u = reads[0] ? reads[0].url : '';
    ok('named columns, not *', u.indexOf('select=id,product_id,sold_on,when_label,qty,used,unit_cents,sold_by,shelf_before') !== -1, u);
    ok('bounded by a day, so a year of sales is never asked for', /sold_on=gte\.\d{4}-\d{2}-\d{2}/.test(u), u);
    ok('ordered on the request — day down, then the sale number down', u.indexOf('order=sold_on.desc,id.desc') !== -1, u);
    ok('asks in the till_stock schema', (reads[0].headers['Accept-Profile'] || '') === 'till_stock', reads[0].headers);
    ok('and asks for a page, so a busy month cannot silently stop at 1,000',
      /^\d+-\d+$/.test(String(reads[0].headers.Range || '')), reads[0].headers);

    const byId = p.calls.filter((c) => c.url.indexOf('id=in.') !== -1);
    ok('the tires those sales name are read too', byId.length === 1, byId.length);
    ok('by id, quoted, so a comma in one cannot fetch the wrong tire',
      byId[0] && byId[0].url.indexOf(encodeURIComponent('"p1","p2"')) !== -1, byId[0] && byId[0].url);
    ok('and that read does NOT filter out archived tires — a sold tire is often one',
      byId[0] && byId[0].url.indexOf('archived') === -1, byId[0] && byId[0].url);
  }

  // ----------------------------------------------------------
  console.log('\nThe card');
  {
    const p = await onSales({ sales: [sale()] });
    const h = salesList(p.w);
    ok('the size is on it', h.indexOf('205/55R16') !== -1, h.slice(0, 300));
    ok('the brand is on it', h.indexOf('Marchetti Primato 4') !== -1);
    ok('how many went out, where the price used to be', h.indexOf('>×4<') !== -1, h.slice(0, 400));
    ok('the clock, in 12-hour with am/pm like the counter', h.indexOf('2:20 PM') !== -1, h.slice(0, 400));
    ok('a phone sale carries the phone dot', h.indexOf('class="from phone"') !== -1);
    ok('one card per sale', (h.match(/class="srow"/g) || []).length === 1, h);
  }
  {
    const p = await onSales({ sales: [sale({ sold_by: 'Counter' })] });
    ok('a counter sale carries the counter dot', salesList(p.w).indexOf('class="from"') !== -1);
  }
  {
    const p = await onSales({ sales: [sale({ used: 4 }), sale({ id: 'sphon1757000000099', used: 2 })] });
    const h = salesList(p.w);
    ok('a used line says so', h.indexOf('>used<') !== -1, h);
    ok('and a part-used one says how many', h.indexOf('2 used') !== -1, h);
  }

  // ----------------------------------------------------------
  console.log('\nHis rule: no money outside the card');
  {
    const p = await onSales({ sales: [sale(), sale({ id: 'sphon1757000000080', product_id: 'p2', unit_cents: 10400, qty: 2 })] });
    const h = salesList(p.w);
    ok('not one dollar sign anywhere in the list', h.indexOf('$') === -1, h);
    ok('and the day heading carries the day and no total',
      h.indexOf('class="dayhead"') !== -1 && !/dayhead[\s\S]*?\$/.test(h), h);
  }

  // ----------------------------------------------------------
  console.log('\nThe days');
  {
    const p = await onSales({ sales: [
      sale({ id: 's3', sold_on: TODAY }),
      sale({ id: 's2', sold_on: YESTERDAY }),
      sale({ id: 's1', sold_on: EARLIER }),
    ] });
    // Month first, so all three are on screen at once.
    tap(p.w, '[data-range="Month"]');
    await wait(10);
    const h = salesList(p.w);
    ok('today is headed Today, not the day before', h.indexOf('Today ·') !== -1, h.slice(0, 400));
    ok('yesterday is headed Yesterday', h.indexOf('Yesterday ·') !== -1);
    ok('a day gets ONE heading, not one per sale', (h.match(/class="dayhead"/g) || []).length === 3, h);
    ok('newest day first', h.indexOf('Today ·') < h.indexOf('Yesterday ·'));
    // THE DAY IS NAMED, and named right. Worked out here from the LOCAL clock
    // ('Tue Sep 22 2026'), which is a different road to the answer than the
    // page's: it shifts a plain date in UTC on purpose, because handing
    // '2026-09-22' to new Date() gives midnight UTC — the evening of the 21st
    // in this shop — and every heading would be a day out with nothing saying
    // so. One of the two has to be independent or neither proves anything.
    var local = new Date().toDateString().split(' ');   // ['Tue','Sep','22','2026']
    var want = local[0] + ' ' + Number(local[2]) + ' ' + local[1];
    ok('and the heading names the right weekday and date', h.indexOf('Today · ' + want) !== -1, want + ' | ' + h.slice(0, 300));
  }

  // ----------------------------------------------------------
  console.log('\nToday / Yesterday / Month');
  {
    const p = await onSales({ sales: [
      sale({ id: 's3', sold_on: TODAY }),
      sale({ id: 's2', sold_on: YESTERDAY, product_id: 'p2' }),
    ] });
    ok('Today shows today only', (salesList(p.w).match(/class="srow"/g) || []).length === 1, salesList(p.w));
    const before = salesCalls(p.calls).length;
    tap(p.w, '[data-range="Yesterday"]');
    await wait(10);
    const h = salesList(p.w);
    ok('Yesterday shows yesterday only', (h.match(/class="srow"/g) || []).length === 1 && h.indexOf('195/65R15') !== -1, h);
    ok('and switching asks the database for nothing', salesCalls(p.calls).length === before, salesCalls(p.calls).length);
    tap(p.w, '[data-range="Month"]');
    await wait(10);
    ok('Month shows both', (salesList(p.w).match(/class="srow"/g) || []).length === 2, salesList(p.w));
  }

  // ----------------------------------------------------------
  console.log('\nSearching, and the empty screens');
  {
    const p = await onSales({ sales: [sale(), sale({ id: 's9', product_id: 'p2' })] });
    const box = p.w.document.getElementById('q');
    box.value = 'norvell';
    box.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    await wait(10);
    ok('the box searches the sales while the Sales tab is in front',
      (salesList(p.w).match(/class="srow"/g) || []).length === 1, salesList(p.w));
    box.value = 'nothing like this';
    box.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    await wait(10);
    ok('and says so when nothing matches', salesList(p.w).indexOf('No matches for') !== -1, salesList(p.w));
    // Back to Stock: the stock list must not have been searched for 'norvell'.
    tap(p.w, '#tabStock');
    await wait(10);
    ok('the two boxes are kept apart', p.w.document.getElementById('q').value === '', p.w.document.getElementById('q').value);
  }
  {
    const p = await onSales({ sales: [] });
    const h = salesList(p.w);
    ok('nothing sold today says so', h.indexOf('Nothing sold yet today.') !== -1, h);
    ok('and does NOT promise a sale will appear by itself — nothing here polls',
      h.indexOf('ten seconds') === -1 && h.indexOf('refresh button') !== -1, h);
  }
  {
    const p = await onSales({ sales: [], staff: false });
    ok('an account that is not on the staff list is told that, not "nothing sold"',
      salesList(p.w).indexOf('staff list') !== -1, salesList(p.w));
  }
  {
    const p = await onSales({ sales: [sale()], salesFail: 500 });
    ok('a read that failed says so rather than drawing an empty day',
      salesList(p.w).indexOf('Couldn’t read the sales') !== -1, salesList(p.w));
  }

  // ----------------------------------------------------------
  console.log('\nOne sale, opened — the only place money appears');
  {
    const p = await onSales({ sales: [sale()] });
    tap(p.w, '.srow');
    await wait(10);
    ok('the sheet opens', sheetOpen(p.w));
    const h = sheet(p.w);
    ok('it says how many of what', h.indexOf('4 × 205/55R16') !== -1, h.slice(0, 300));
    ok('each one, in dollars — 12900 cents is $129.00 and not $12,900.00',
      h.indexOf('$129.00') !== -1 && h.indexOf('$12,900.00') === -1, h);
    ok('and the line total, multiplied in cents like the counter', h.indexOf('$516.00') !== -1, h);
    ok('it says where it was rung up', h.indexOf('Sold on the phone') !== -1, h);
    ok('and what the rack held at the time', h.indexOf('The rack held 10') !== -1 && h.indexOf('6 left after it') !== -1, h);
  }
  {
    const p = await onSales({ sales: [sale({ qty: 1, shelf_before: null })] });
    tap(p.w, '.srow');
    await wait(10);
    const h = sheet(p.w);
    ok('a single tire draws one figure, not "each one" twice', h.indexOf('Each one') === -1 && h.indexOf('$129.00') !== -1, h);
    ok('and a sale with no reading on it invents none', h.indexOf('The rack held') === -1, h);
  }

  // ----------------------------------------------------------
  console.log('\nRemove — what it says before it moves anything');
  {
    const p = await onSales({ sales: [sale()] });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    const h = sheet(p.w);
    ok('it says what goes back on the shelf', h.indexOf('Puts <b>4</b> back on the shelf.') !== -1, h);
    // NOT WHAT THE SHELF WILL READ. Nothing on this page polls, so the count
    // beside these sales can be hours old; the counter's own confirm says
    // "6 becomes 10" and is entitled to, because its count is ten seconds old.
    ok('and does NOT promise what the shelf will read out of a count it read hours ago',
      h.indexOf('becomes') === -1, h);
    ok('it names the day whose total drops, and by how much',
      h.indexOf('drops by <b>$516.00</b>') !== -1, h);
    ok('it says the line goes completely', h.indexOf('goes completely') !== -1, h);
    ok('nothing has been sent yet', p.removals.length === 0, p.removals);
    tap(p.w, '[data-act="no"]');
    await wait(10);
    ok('Cancel puts it back without sending anything',
      sheet(p.w).indexOf('Remove this sale') !== -1 && p.removals.length === 0, p.removals);
  }
  {
    const p = await onSales({ sales: [sale({ sold_on: YESTERDAY })] });
    tap(p.w, '[data-range="Yesterday"]');
    await wait(10);
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    ok('an older sale carries the counter\'s own warning, and is still allowed',
      sheet(p.w).indexOf('That day has already been counted') !== -1
      && sheet(p.w).indexOf('data-act="yes"') !== -1, sheet(p.w));
  }

  // ----------------------------------------------------------
  console.log('\nRemove — what it sends, and what happens after');
  {
    const p = await onSales({ sales: [sale()] });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    ok('it sends the sale\'s OWN number, not one minted here',
      p.removals.length === 1 && p.removals[0].p_id === 'sphon1757000000100', p.removals);
    ok('and says the phone did it', p.removals[0].p_by === 'Phone', p.removals[0]);
    ok('the sheet closes', !sheetOpen(p.w));
    ok('the line is gone from the log', salesList(p.w).indexOf('class="srow"') === -1, salesList(p.w));
    ok('it says what went back on the shelf', salesList(p.w).indexOf('Taken out of the log: 4 × 205/55R16') !== -1, salesList(p.w));
    ok('and reads the sales again, because the book moved', salesCalls(p.calls).length === 2, salesCalls(p.calls).length);
    ok('and the stock with them, because the count moved',
      p.calls.filter((c) => c.url.indexOf('archived=eq.false') !== -1).length === 2,
      p.calls.filter((c) => c.url.indexOf('archived=eq.false') !== -1).length);
  }

  // ----------------------------------------------------------
  console.log('\nRemove — when the answer is lost');
  {
    // THE FIRST SEND LANDS AND ITS ANSWER IS LOST — the wifi going as the phone
    // sends. The stock room has the sale out and the tires back; the phone
    // knows none of it. So the fake takes the line out on the first call and
    // ANSWERS NOTHING, and answers the second the way the real function does:
    // already, having moved nothing more.
    const log = [sale()];
    let n = 0;
    const p = await onSales({
      sales: log,
      remove: () => {
        n += 1;
        if (n === 1){ log.length = 0; return Promise.reject(new Error('Failed to fetch')); }
        return reply({ id: 'sphon1757000000100', already: true, product_id: 'p1', qty_back: 4, qty_left: 10 });
      },
    });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    const h = sheet(p.w);
    ok('it does not claim the sale went', h.indexOf('No clear answer') !== -1, h);
    ok('it does not put the browser\'s own words on screen as a refusal', h.indexOf('Failed to fetch') === -1, h);
    ok('it says the same sale cannot go out twice, so trying again is safe',
      h.indexOf('cannot take the same sale out twice') !== -1, h);
    ok('and the button is live again', h.indexOf('data-act="yes"') !== -1 && h.indexOf('disabled') === -1, h);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    ok('a second press is answered "already" and the line still goes',
      salesList(p.w).indexOf('class="srow"') === -1, salesList(p.w));
    ok('and it sent the same number both times, so nothing else can be taken out',
      p.removals.length === 2 && p.removals[0].p_id === p.removals[1].p_id, p.removals);
  }
  {
    const p = await onSales({ sales: [sale()], remove: () => reply({ message: 'JWT expired' }, 401) });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    ok('a session that expired sends the phone back to the sign-in',
      p.w.document.getElementById('login').style.display !== 'none', p.w.document.getElementById('login').style.display);
    ok('and says nothing was taken out',
      (p.w.document.getElementById('loginMsg').textContent || '').indexOf('Nothing was taken out') !== -1,
      p.w.document.getElementById('loginMsg').textContent);
    ok('with the sheet closed behind it', !sheetOpen(p.w));
  }
  {
    const p = await onSales({ sales: [sale()], remove: () => reply({ message: 'That sale is not in the log. Nothing changed — check the Sales log.' }, 400) });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    ok('a refusal is said in the stock room\'s own words',
      sheet(p.w).indexOf('That sale is not in the log') !== -1, sheet(p.w));
    // AND THE SCREEN GOES AND LOOKS. The refusal that actually happens is the
    // counter having taken the line out first, and the line is sitting on the
    // screen behind the message. Left alone, the phone goes on drawing a sale
    // the book does not hold — the one thing the 5 Sep rule forbids outright.
    ok('and the log is read again, so the screen stops disagreeing with the book',
      salesCalls(p.calls).length === 2, salesCalls(p.calls).length);
  }

  {
    // A PAGE NEWER THAN THE DATABASE. The phone is live on GitHub Pages the
    // moment it is pushed; the SQL is pasted by hand. PostgREST answers a
    // function it has never heard of with 404 / PGRST202.
    const p = await onSales({ sales: [sale()], remove: () => reply({ code: 'PGRST202', message: 'Could not find the function' }, 404) });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(60);
    const h = sheet(p.w);
    ok('a database that has not had the file says so in plain words',
      h.indexOf('has not been taught to take a sale out from the phone yet') !== -1, h);
    ok('and does not put PostgREST\'s own words in front of the counter',
      h.indexOf('Could not find the function') === -1, h);
    ok('the line stays in the log, because nothing moved',
      salesList(p.w).indexOf('class="srow"') !== -1, salesList(p.w));
    // It is not news about any sale, so it does not go and read the log again.
    ok('and it does not read the log again over it', salesCalls(p.calls).length === 1, salesCalls(p.calls).length);
  }

  // ----------------------------------------------------------
  console.log('\nSigning out');
  {
    const p = await onSales({ sales: [sale()] });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '#signOutBtn');
    await wait(20);
    ok('the sheet goes, rather than sitting over the sign-in screen', !sheetOpen(p.w));
    ok('and the sales with it', salesList(p.w) === '', salesList(p.w));
    ok('back on the Stock tab, where a sign-in lands', p.w.document.getElementById('tabStock').className.indexOf('on') !== -1);
  }

  // ----------------------------------------------------------
  console.log('\nSigning out with a Remove still in the air');
  {
    // The answer lands after the sign-out. Every line of the success path draws
    // on a screen that is not there any more — and loadStock's own showLoading
    // calls only('app') BEFORE it checks anything, so the app came up saying
    // "Loading stock…" over the password box and stayed there.
    let land;
    const p = await onSales({
      sales: [sale()],
      remove: () => new Promise((res) => { land = () => res(reply({ id: 'sphon1757000000100', already: false, product_id: 'p1', qty_back: 4, qty_left: 10 })); }),
    });
    tap(p.w, '.srow');
    await wait(10);
    tap(p.w, '[data-act="kill"]');
    await wait(10);
    tap(p.w, '[data-act="yes"]');
    await wait(20);
    tap(p.w, '#signOutBtn');
    await wait(20);
    land();
    await wait(60);

    ok('the sign-in screen is still the one in front',
      p.w.document.getElementById('login').style.display !== 'none'
      && p.w.document.getElementById('app').style.display === 'none',
      p.w.document.getElementById('app').style.display);
    ok('nothing is said about the sale to whoever signs in next', salesList(p.w) === '', salesList(p.w));
    ok('and the sheet did not come back', !sheetOpen(p.w));
  }

  // ----------------------------------------------------------
  console.log('\nA session that expires under the Sales tab');
  {
    // The read comes back 401. Signing in afterwards runs the STOCK read, so
    // the Sales tab left in front would draw the sales from before the session
    // went — with "checked just now" under them.
    const p = await onSales({ sales: [sale()], salesFail: 401 });
    ok('it says the session expired', p.w.document.getElementById('login').style.display !== 'none',
      p.w.document.getElementById('login').style.display);
    ok('the sales are let go of', salesList(p.w) === '', salesList(p.w));
    ok('and the Stock tab is back in front, which is where a sign-in lands',
      p.w.document.getElementById('tabStock').className.indexOf('on') !== -1
      && p.w.document.getElementById('salesList').hasAttribute('hidden'),
      p.w.document.getElementById('tabStock').className);
  }

  finish('The sales log');
})();
