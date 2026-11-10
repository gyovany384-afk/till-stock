// ============================================================
// The opening screen on the phone — 10 Nov 2026. His ask: the counter's loading-screen change (the blue
// "Logo reveal" screen he approved on 9 Nov, held a few seconds, then faded) for the phone.
//
//   node tests/splash.test.cjs
//
// WHAT MUST HOLD: it is in the page itself (so it is up before any script runs); it stays until BOTH five
// seconds have passed AND the stock is on screen; it fades rather than snapping; and it is NEVER held over
// anything somebody has to act on — the sign-in form, "not on the staff list", a read that did not work —
// and can never trap the page whatever the network does.
// ============================================================
const { phone, ok, finish, wait, reply, list } = require('./harness.cjs');

const splash = (w) => w.document.getElementById('splash');
const shown = (w) => !!splash(w);
const fading = (w) => !!splash(w) && splash(w).classList.contains('leaving');

(async function run() {
  console.log('\nThe opening screen, on the phone\n');

  {
    const { w } = phone({ before: (win) => { win.__splashMinMs = 0; } });
    const body = w.document.body;
    const first = [...body.children].find((e) => e.tagName === 'DIV');
    ok('it is the first thing in the page, ahead of the sign-in form', first && first.id === 'splash', first && first.id);
    ok('it names the app and says what is happening', /Till Stock/.test(splash(w).getAttribute('aria-label')) && /Getting your stock ready/.test(splash(w).textContent));
    ok('the title is built letter by letter', splash(w).querySelectorAll('.splash-letter').length === 10);
    w.close();
  }
  {
    // THE REAL NUMBER: three and a half seconds, measured from the page opening, and not before the stock is there.
    const { w } = phone();
    await wait(1200);
    ok('1.2 s in: still up, not fading, and the stock is drawn behind it', shown(w) && !fading(w) && /Marchetti|data-id|class="row/.test(list(w)), list(w).slice(0, 80));
    await wait(1400);
    ok('2.6 s in: STILL up — the book arrived in a blink and the 3.5 seconds are not over', shown(w) && !fading(w));
    await wait(1400);
    ok('4.0 s in: fading, not snapped off', shown(w) && fading(w));
    await wait(1000);
    ok('5.0 s in: gone', !shown(w));
    w.close();
  }
  {
    // A SLOW BOOK keeps it up past the five seconds, then it goes.
    let release;
    const gate = new Promise((r) => { release = r; });
    const { w } = phone({
      before: (win) => { win.__splashMinMs = 300; },
      extra: (u) => (u.indexOf('/rest/v1/products') !== -1 ? gate.then(() => undefined) : undefined),
    });
    await wait(900);
    ok('past the minimum but no book yet: still up, not fading', shown(w) && !fading(w));
    release();
    await wait(300);
    ok('the book arrived: it fades', fading(w) || !shown(w));
    await wait(1000);
    ok('and it is gone', !shown(w));
    w.close();
  }
  {
    // SIGNED OUT: never held.
    const { w } = phone({ before: (win) => { win.localStorage.removeItem('till_stock_session_v2'); } });
    await wait(60);
    ok('signed out: the opening screen is gone at once, and the sign-in form is what is showing', !shown(w) && w.document.getElementById('login').style.display !== 'none');
    w.close();
  }
  {
    // NOT ON THE STAFF LIST: the words must not wait five seconds.
    const { w } = phone({ staff: false });
    await wait(400);
    ok('not on the staff list: gone at once, and the words are readable', !shown(w) && /staff list/.test(list(w)), list(w).slice(0, 80));
    w.close();
  }
  {
    // A READ THAT DID NOT WORK.
    const { w } = phone({ extra: (u) => (u.indexOf('/rest/v1/products') !== -1 ? Promise.reject(new Error('no signal')) : undefined) });
    await wait(600);
    ok('a stock read that failed: gone at once, not held over the problem', !shown(w));
    w.close();
  }
  {
    // THE PAGE IS NEVER TRAPPED: a book that never answers.
    const { w } = phone({
      before: (win) => { win.__splashMinMs = 100; win.__splashMaxMs = 500; },
      extra: (u) => (u.indexOf('/rest/v1/products') !== -1 ? new Promise(() => {}) : undefined),
    });
    await wait(1500);
    ok('a book that never answers cannot keep it up for ever', !shown(w));
    w.close();
  }
  finish('The opening screen, on the phone');
})().catch((e) => { console.error(e); process.exit(1); });
