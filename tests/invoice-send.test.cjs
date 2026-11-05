// ============================================================
// The phone's invoice picture rules (invoice-send.js) — 4 Nov 2026. How big a photo is
// drawn, what is sent to the database, and the words for what became of it.
//
//   node tests/invoice-send.test.cjs
// ============================================================
const IS = require('../invoice-send.js');

let failed = 0, passed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name); }
  else { failed += 1; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('\nThe phone\'s invoice picture rules\n');

// ---- the size a photo is drawn at
ok('a phone photo is brought down to the longest side allowed, keeping its shape',
  (() => { const s = IS.fitSize(4032, 3024, 2400); return s.w === 2400 && s.h === 1800; })(), IS.fitSize(4032, 3024, 2400));
ok('a tall photo is limited by its height', (() => { const s = IS.fitSize(3024, 4032, 2400); return s.w === 1800 && s.h === 2400; })());
ok('a small picture is never made bigger', (() => { const s = IS.fitSize(800, 600, 2400); return s.w === 800 && s.h === 600; })());
ok('a picture exactly at the limit is left alone', (() => { const s = IS.fitSize(2400, 1200, 2400); return s.w === 2400 && s.h === 1200; })());
ok('a picture with no size gives no size', (() => { const s = IS.fitSize(0, 0, 2400); return s.w === 0 && s.h === 0; })());
ok('a sliver never shrinks to nothing', IS.fitSize(100000, 10, 2400).h >= 1, IS.fitSize(100000, 10, 2400));

// ---- what is sent
ok('only the base64 is sent, not the "data:" part', IS.bareBase64('data:image/jpeg;base64,QUJDREVG') === 'QUJDREVG');
ok('something that is not a data address sends nothing', IS.bareBase64('QUJD') === '' && IS.bareBase64(null) === '' && IS.bareBase64(undefined) === '');
ok('the limit is under the database\'s 1,500,000 characters', IS.LIMIT < 1500000, IS.LIMIT);
ok('a picture exactly at the limit fits', IS.fits('A'.repeat(IS.LIMIT)));
ok('one character over does not', !IS.fits('A'.repeat(IS.LIMIT + 1)));
ok('nothing does not fit', !IS.fits('') && !IS.fits(null));
ok('the best quality is tried first and it only goes down', IS.QUALITIES[0] === Math.max(...IS.QUALITIES) && IS.QUALITIES.every((q, i, a) => i === 0 || q < a[i - 1]), IS.QUALITIES);

// ---- the name
ok('the name sorts by time and ends .jpg for the desktop reader',
  IS.nameFor(new Date(2026, 10, 4, 15, 30, 45)) === 'invoice-20261104-153045.jpg', IS.nameFor(new Date(2026, 10, 4, 15, 30, 45)));
ok('single digits are padded', IS.nameFor(new Date(2026, 0, 5, 1, 2, 3)) === 'invoice-20260105-010203.jpg');

// ---- a PDF from the Files app
const pdf = (bytes, name = 'inv.pdf', type = 'application/pdf') => new File([new Uint8Array(bytes)], name, { type });
ok('a PDF is known by its type', IS.isPdf(pdf(1)));
ok('a PDF with no type is known by its name', IS.isPdf(pdf(1, 'Invoice 5521.PDF', '')));
ok('a photo is not a PDF', !IS.isPdf(pdf(1, 'p.jpg', 'image/jpeg')) && !IS.isPdf(null));
ok('a PDF is named .pdf, so the desktop reads it as one', IS.nameFor(new Date(2026, 10, 4, 15, 30, 45), 'pdf') === 'invoice-20261104-153045.pdf');

// ---- the words for what became of it
ok('waiting says it is waiting', IS.describe({ status: 'waiting' }).tone === 'wait');
ok('read says so, with the desktop\'s note', (() => { const d = IS.describe({ status: 'read', note: '12 lines, 2 to check' }); return d.tone === 'ok' && /Read on the desktop — 12 lines, 2 to check/.test(d.text); })());
ok('read with no note still reads clean', IS.describe({ status: 'read' }).text === '✓ Read on the desktop');
ok('unreadable says so and asks for another photo', (() => { const d = IS.describe({ status: 'unreadable', note: 'too dark' }); return d.tone === 'bad' && /too dark/.test(d.text) && /another photo/.test(d.text); })());
ok('a status it does not know is never shown as success', IS.describe({ status: 'weird' }).tone === 'bad');

// ---- a PDF is prepared without shrinking (async, so the summary waits for it)
(async () => {
  const small = await IS.prepare(pdf(300));
  ok('a small PDF goes as it is, with no preview', small.b64 === Buffer.from(new Uint8Array(300)).toString('base64') && /\.pdf$/.test(small.name) && small.preview === '', small.name);
  let err = null;
  try { await IS.prepare(pdf(1100000)); } catch (e) { err = e; }
  ok('a PDF over the limit is refused in words, and says what to do instead', err && /too big/.test(err.message) && /photo/.test(err.message), err && err.message);
  const justUnder = Math.floor(IS.LIMIT / 4) * 3;
  const fine = await IS.prepare(pdf(justUnder));
  ok('a PDF just under the limit still goes', fine.b64.length <= IS.LIMIT && fine.b64.length > IS.LIMIT - 8, fine.b64.length);
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
