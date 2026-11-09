// ============================================================
// The off-computer backup warning on the phone — 9 Nov 2026. His ask: "24 hours and all 3, better safe
// than sorry". The counter computer writes the moment its newest off-computer backup landed into the
// shop database (settings row `offsite_last_copy`); the phone reads that one row and shows an amber strip
// when it is 24 hours old or more — the case that matters most, because then the counter has stopped and
// nobody is standing at it to see its own warning.
//
//   node tests/backup-warning.test.cjs
// ============================================================
const { phone, ok, finish, wait, reply } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const HOUR = 3600 * 1000;
// The database writes a timestamp with SIX decimal places; Safari will not read more than three.
const iso = (hoursAgo, six) => {
  const d = new Date(Date.now() - hoursAgo * HOUR).toISOString();   // 2026-11-09T19:17:12.123Z
  return six ? d.replace(/\.(\d{3})Z$/, '.$1456+00:00') : d;
};

// Answers the one settings read; `answer` is what it says, or 'fail' / 'none'.
function withSetting(state) {
  const seen = [];
  const extra = (u, method, init, headers) => {
    if (u.indexOf('/rest/v1/settings') === -1) return undefined;
    seen.push({ u, method, headers });
    if (state.answer === 'fail') return Promise.reject(new Error('no signal'));
    if (state.answer === 'none') return reply([]);
    if (state.answer === '503') return reply({ message: 'service unavailable' }, 503);
    return reply([{ value: state.answer }]);
  };
  return { extra, seen };
}
// jsdom reports the page as not visible; the page only looks again when it comes to the front.
const recheck = async (w) => {
  Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await wait(80);
};

(async function run() {
  console.log('\nThe off-computer backup warning, on the phone\n');

  {
    const state = { answer: iso(5) };
    const { extra, seen } = withSetting(state);
    const { w, calls } = phone({ extra });
    await wait(120);
    ok('it reads the one setting, as a read, with the schema header', seen.length >= 1 && seen[0].method === 'GET'
      && /key=eq\.offsite_last_copy/.test(seen[0].u) && !!seen[0].headers['Accept-Profile'], JSON.stringify(seen[0]));
    ok('a copy 5 hours old says nothing', $(w, '#backupStrip').hidden === true && $(w, '#backupStrip').textContent === '');
    ok('the strip lives inside the sticky top bar, so it stays on screen', !!$(w, '#backupStrip').closest('.topbar'));

    state.answer = iso(26); await recheck(w);
    ok('26 hours old shows the strip, saying so', $(w, '#backupStrip').hidden === false && /was 26 hours ago/.test($(w, '#backupStrip').textContent), $(w, '#backupStrip').textContent);
    ok('and tells whoever reads it what to do', /Check the counter computer/.test($(w, '#backupStrip').textContent));

    state.answer = iso(23); await recheck(w);
    ok('23 hours old is fine', $(w, '#backupStrip').hidden === true);

    state.answer = iso(24.5); await recheck(w);
    ok('24 and a half hours is over the line', $(w, '#backupStrip').hidden === false);

    state.answer = iso(80); await recheck(w);
    ok('from two days on it counts in days', /was 3 days ago/.test($(w, '#backupStrip').textContent), $(w, '#backupStrip').textContent);

    state.answer = 'fail'; await recheck(w);
    ok('A READ THAT FAILS LEAVES A TRUE WARNING WHERE IT WAS (no signal must not clear it)', $(w, '#backupStrip').hidden === false);

    state.answer = iso(80); await recheck(w);
    state.answer = '503'; await recheck(w);
    ok('A SERVER ERROR LEAVES IT WHERE IT WAS TOO', $(w, '#backupStrip').hidden === false);

    state.answer = iso(2); await recheck(w);
    ok('a fresh copy clears it by itself', $(w, '#backupStrip').hidden === true && $(w, '#backupStrip').textContent === '');

    ok('nothing was ever written', !calls.some((c) => c.method !== 'GET' && !/is_staff/.test(c.url)), calls.filter((c) => c.method !== 'GET').map((c) => c.url).join());
    w.close();
  }
  {
    const { extra } = withSetting({ answer: iso(30, true) });
    const { w } = phone({ extra });
    await wait(120);
    ok('a six-decimal timestamp (how the database writes it) is read, and still warns', $(w, '#backupStrip').hidden === false, $(w, '#backupStrip').textContent);
    w.close();
  }
  {
    const { extra } = withSetting({ answer: 'none' });
    const { w } = phone({ extra });
    await wait(120);
    ok('no setting yet (the counter has not published one) says nothing', $(w, '#backupStrip').hidden === true);
    w.close();
  }
  {
    const { extra } = withSetting({ answer: 'not a date' });
    const { w } = phone({ extra });
    await wait(120);
    ok('a value that is not a date says nothing rather than guessing', $(w, '#backupStrip').hidden === true);
    w.close();
  }
  {
    // Signed in but not on the staff list: the setting is not theirs to see, and the page must not ask.
    const { extra, seen } = withSetting({ answer: iso(30) });
    const { w } = phone({ extra, staff: false });
    await wait(120);
    ok('an account that is not staff shows nothing', $(w, '#backupStrip').hidden === true, String(seen.length));
    w.close();
  }
  finish('The off-computer backup warning, on the phone');
})().catch((e) => { console.error(e); process.exit(1); });
