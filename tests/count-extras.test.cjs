// ============================================================
// TIRES THAT DON'T BELONG ON THE RACK
//
// A count only ever asks about what Till expects on the rack being walked, which
// is right — but it left no way at all to record a tire physically on the shelf
// and outside that scope. You couldn't even search for it: the search looks
// inside the count.
//
// Two cases, and the order they're offered in is the whole design. The picker
// searches the WHOLE catalog first and only offers "add it as new" once nothing
// matches, because the common case by far is a tire Till already has, shelved
// somewhere else — and creating a second copy of it is the one outcome worse
// than not recording it at all.
//
// No price is keyed at the shelf (the owner's call, 2026-07-29): a guessed cost
// would quietly feed the profit figures, so a new tire arrives priceless.
// ============================================================
const { tablet, ok, finish, wait, screen, stored, startWalking } = require('./harness.cjs');

(async () => {
  const { w, state } = tablet();
  await wait(400);

  const need = ['tsAddOpen','tsAddClose','tsAddSearch','tsAddMode','tsAddField',
                'tsAddPick','tsAddNew','tsXBump','tsXType','tsXDel','tsRack','tsSend'];
  const missing = need.filter(n => typeof w[n] !== 'function');
  if (missing.length) { console.log('FAIL: handlers never reached window: ' + missing.join(', ')); process.exit(1); }

  startWalking(w);
  ok('the rack page offers the way in', screen(w).indexOf('Something else on this rack') !== -1);

  console.log('\nthe picker only offers tires OUTSIDE the count');
  w.tsAddOpen('RACK 1');
  w.tsAddSearch('285');
  ok('finds the tire Till has on RACK 3', screen(w).indexOf('p3') !== -1);
  ok('and says where Till thinks it is', screen(w).indexOf('Till says RACK 3') !== -1);
  w.tsAddSearch('11R22.5');
  ok('refuses one already in this count — a second line would correct it twice',
     screen(w).indexOf('tsAddPick(&quot;p1&quot;)') === -1 && screen(w).indexOf("tsAddPick('p1')") === -1);

  console.log('\nadding a tire Till HAS, found on the wrong rack');
  w.tsAddSearch('285');
  w.tsAddPick('p3');
  const saved = stored(w, 'till_stock_count_extra', '[]');
  ok('one leftover recorded', saved.length === 1, saved);
  ok('not flagged as new', saved[0] && saved[0].isNew === false);
  ok('starts at what Till holds — the shop reports one total per tire',
     saved[0] && saved[0].counted === 4 && saved[0].expected === 4, saved[0]);
  ok('remembers where Till thought it was', saved[0] && saved[0].was === 'RACK 3', saved[0]);
  ok('the sheet closes and the shelf comes back', screen(w).indexOf('Something else on this rack') !== -1);
  ok('it lands in its own group', screen(w).indexOf('Also found here') !== -1);
  ok('reading as the wrong rack', screen(w).indexOf('Wrong rack') !== -1);

  console.log('\nadding a tire Till has NEVER had');
  w.tsAddOpen('RACK 1');
  w.tsAddSearch('315/80/22.5');
  ok('says plainly that nothing matched', screen(w).indexOf('No tire in Till matches') !== -1);
  w.tsAddMode('new');
  ok('the size you searched carries into the form', screen(w).indexOf('value="315/80/22.5"') !== -1);
  // Asserted on the FIELDS, not the words — the note deliberately mentions cost
  // to explain where it does get set.
  const boxes = Array.from(w.document.querySelectorAll('#countList input')).map(i => i.id);
  ok('the form asks only size, brand and how many', boxes.length === 3
     && boxes.indexOf('ax_size') !== -1 && boxes.indexOf('ax_brand') !== -1 && boxes.indexOf('ax_qty') !== -1, boxes);
  w.tsAddField('brand', 'Amulet');
  w.tsAddField('qty', '6');
  w.tsAddNew();
  const saved2 = stored(w, 'till_stock_count_extra', '[]');
  ok('two leftovers now', saved2.length === 2, saved2.length);
  ok('flagged new, with size, brand and count', saved2[1] && saved2[1].isNew === true
     && saved2[1].size === '315/80/22.5' && saved2[1].brand === 'Amulet' && saved2[1].counted === 6, saved2[1]);
  ok('and shows as a new tire on the shelf', screen(w).indexOf('New tire') !== -1);

  console.log('\na blank size is refused');
  w.tsAddOpen('RACK 1');
  w.tsAddMode('new');
  w.tsAddField('size', '   ');
  w.tsAddNew();
  ok('nothing added', stored(w, 'till_stock_count_extra', '[]').length === 2);
  w.tsAddClose();

  console.log('\nadjusting and removing');
  const at = (i) => stored(w, 'till_stock_count_extra', '[]')[i];
  const keyOf = (i) => at(i).key;
  w.tsXBump(keyOf(1), 1);
  ok('bump raises it', at(1).counted === 7, at(1).counted);
  w.tsXType(keyOf(1), '3');
  ok('typing sets it', at(1).counted === 3, at(1).counted);
  w.tsXBump(keyOf(1), -99);
  ok('never below zero', at(1).counted === 0, at(1).counted);
  w.tsXType(keyOf(1), '6');

  // Counting a rack is interrupted constantly — a customer walks in, the tablet
  // sleeps. Leftovers have to survive that like the rest of the session.
  console.log('\nit survives the tablet sleeping');
  ok('leftovers live on the device, not just on screen',
     stored(w, 'till_stock_count_extra', '[]').length === 2);

  console.log('\nthe payload the shop computer actually receives');
  w.tsSame('p1');                 // one ordinary counted line, so the mix is realistic
  w.tsSend();
  await wait(250);

  const lines = (state.posted && state.posted.lines) || [];
  ok('three lines: one counted, two leftovers', lines.length === 3, lines);

  const relo = lines.filter(l => l.id === 'p3')[0];
  ok('the wrong-rack tire goes as an ORDINARY line', relo && !relo.isNew, relo);
  ok('...carrying the rack it turned up on', relo && relo.location === 'RACK 1', relo);
  ok('...counted and expected equal, so only the place moves',
     relo && relo.counted === 4 && relo.expected === 4, relo);

  const fresh = lines.filter(l => l.isNew)[0];
  ok('the new tire is flagged isNew', !!fresh, lines);
  ok('...with a null id — there is nothing to correct', fresh && fresh.id === null, fresh);
  ok('...size, brand, count and rack all present', fresh && fresh.size === '315/80/22.5'
     && fresh.brand === 'Amulet' && fresh.counted === 6 && fresh.location === 'RACK 1', fresh);
  ok('...and carries no price of any kind',
     fresh && !('buyPrice' in fresh) && !('cost' in fresh) && !('sellPrice' in fresh), fresh);

  const ids = lines.map(l => l.id).filter(Boolean);
  ok('no tire appears twice', new Set(ids).size === ids.length, ids);
  ok('the walked rack travels too', (state.posted.racks || []).indexOf('RACK 1') !== -1, state.posted.racks);

  finish('COUNT EXTRAS');
})();
