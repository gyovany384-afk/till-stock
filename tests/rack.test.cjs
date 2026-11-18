// ============================================================
// Moving a tire to another rack from the phone — 6 Oct 2026.
//
// His ask: "a way to change location, clicking on count, maybe placed below
// count". Off the mockup he chose B, move it: under the count, Rack opens a
// list to scroll (no search) — RACK 1, RACK 2 … first, then the rest A to Z —
// and the tire leaves its old rack for the one tapped. One Save for both.
//
//   node tests/rack.test.cjs
// ============================================================
const { phone, ok, finish, wait, row, reply } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const $$ = (w, sel) => Array.from(w.document.querySelectorAll(sel));
const tap = async (w, sel) => { const el = $(w, sel); if (el) el.click(); await wait(20); return Boolean(el); };
const said = (w) => (($(w, '.salemsg') || {}).textContent || '').trim();
// One tap on a rack in the list: ticks it, or unticks it.
const toggle = async (w, name) => {
  const b = $$(w, '[data-act="rackpick"]').find((x) => x.getAttribute('data-rack') === name);
  if (b) b.click();
  await wait(20);
  return Boolean(b);
};
const ticked = (w) => $$(w, '.rc-opt.cur').map((x) => x.getAttribute('data-rack'));
const done = (w) => tap(w, '[data-act="rackdone"]');
// "Put it on this rack and no other" — the old single pick, now spelled out as
// untick everything else, tick this one, Done.
const pick = async (w, name) => {
  for (const n of ticked(w)) if (n !== name) await toggle(w, n);
  if (!ticked(w).includes(name)) await toggle(w, name);
  await done(w);
};
const rows = () => [
  row({ id: 'p1', qty: 6, location: 'RACK 3' }),
  row({ id: 'p2', size: '195/65R15', qty: 4, location: 'SHOP, RACK 10' }),
  row({ id: 'p3', size: '215/60R16', qty: 2, location: 'BAR 2' }),
  row({ id: 'p4', size: '225/65R17', qty: 5, location: 'RACK 1' }),
  row({ id: 'p5', size: '235/75R15', qty: 1, location: 'Back storage' }),
];

(async function run() {
  console.log('\nMoving a tire to another rack\n');

  {
    const { w } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    ok('the recount shows the rack under the count', /Rack/.test(($(w, '.rc-rackbtn') || {}).textContent || '') && /RACK 3/.test($(w, '.rc-rackbtn').textContent));
    ok('Save stays off with nothing changed', $(w, '[data-act="csave"]').disabled === true);
    await tap(w, '[data-act="rackopen"]');
    const names = $$(w, '[data-act="rackpick"]').map((b) => b.getAttribute('data-rack'));
    ok('the list is numbered racks first, in number order, then A to Z',
      JSON.stringify(names) === JSON.stringify(['RACK 1', 'RACK 3', 'RACK 10', 'Back storage', 'BAR 2', 'SHOP']), JSON.stringify(names));
    ok('there is no search box in it', !$(w, '.rc-pick input'));
    ok('the rack it is on starts ticked and says so', JSON.stringify(ticked(w)) === '["RACK 3"]' && /picked/.test($$(w, '.rc-opt.cur').map((x) => x.textContent).join()));
    ok('the others say the tires on the shelf there', /4 tires/.test($$(w, '.rc-opt').find((x) => /SHOP/.test(x.textContent)).textContent));
    await toggle(w, 'RACK 3');
    ok('unticking the last rack turns Done off (a tire is never left on no rack)', $(w, '[data-act="rackdone"]').disabled === true && ticked(w).length === 0);
    await done(w);
    ok('and pressing it anyway closes nothing', Boolean($(w, '.rc-pick')));
    await toggle(w, 'RACK 3');
    await done(w);
    ok('Done on the same rack changes nothing', !$(w, '.rc-pick') && !$(w, '.rc-move') && $(w, '[data-act="csave"]').disabled === true);
    await tap(w, '[data-act="rackopen"]');
    await tap(w, '[data-act="rackclose"]');
    ok('Cancel closes the list', !$(w, '.rc-pick'));
    w.close();
  }

  // ---- several racks at once (18 Nov 2026) ------------------------------------
  {
    const { w, moves } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="rackopen"]');
    await toggle(w, 'SHOP');
    await toggle(w, 'RACK 1');
    ok('every tap ticks one more, the old one stays', JSON.stringify(ticked(w)) === JSON.stringify(['RACK 1', 'RACK 3', 'SHOP']) && /Done \(3\)/.test($(w, '[data-act="rackdone"]').textContent), JSON.stringify(ticked(w)));
    ok('a ticked rack says so for a screen reader', $$(w, '[data-act="rackpick"]').every((b) => (b.getAttribute('aria-pressed') === 'true') === ticked(w).includes(b.getAttribute('data-rack'))));
    await done(w);
    ok('it says what will change: the old rack kept, the new ones added after it',
      /Moves from\s*RACK 3\s*to RACK 3, SHOP, RACK 1/.test(($(w, '.rc-move') || {}).textContent || ''), ($(w, '.rc-move') || {}).textContent);
    await tap(w, '[data-act="rackopen"]');
    ok('opening it again starts from what was picked, not what it was', JSON.stringify(ticked(w)) === JSON.stringify(['RACK 1', 'RACK 3', 'SHOP']), JSON.stringify(ticked(w)));
    await tap(w, '[data-act="rackclose"]');
    ok('Cancel keeps the earlier pick', /RACK 3, SHOP, RACK 1/.test(($(w, '.rc-move') || {}).textContent || ''));
    await tap(w, '[data-act="csave"]'); await wait(40);
    ok('ONE guarded write over the rack it opened on', moves.length === 1 && moves[0].url.indexOf('location=eq.' + encodeURIComponent('RACK 3')) !== -1, moves[0] && moves[0].url);
    ok('setting all the racks, joined the way the counter joins them', moves[0].body.location === 'RACK 3, SHOP, RACK 1', JSON.stringify(moves[0].body));
    ok('the card shows all of them', /RACK 3, SHOP, RACK 1/.test($(w, '.row[data-id="p1"] .sub').textContent), $(w, '.row[data-id="p1"] .sub').textContent);
    w.close();
  }
  {
    const { w, moves } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p2"] .main');
    await tap(w, '[data-act="rackopen"]');
    await toggle(w, 'SHOP'); await toggle(w, 'SHOP');
    await done(w);
    ok('ticking and unticking back to the same racks is no move', !$(w, '.rc-move') && $(w, '[data-act="csave"]').disabled === true);
    await tap(w, '[data-act="rackopen"]');
    await toggle(w, 'SHOP');
    await done(w);
    await tap(w, '[data-act="csave"]'); await wait(40);
    ok('dropping one of two racks keeps the other', moves.length === 1 && moves[0].body.location === 'RACK 10'
      && moves[0].url.indexOf('location=eq.' + encodeURIComponent('SHOP, RACK 10')) !== -1, moves[0] && JSON.stringify(moves[0].body));
    w.close();
  }
  {
    const { w } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="rackopen"]');
    $(w, '#rcList').scrollTop = 96;
    await toggle(w, 'SHOP');
    ok('ticking one does not throw the list back to the top', $(w, '#rcList').scrollTop === 96, String($(w, '#rcList').scrollTop));
    await tap(w, '[data-act="rackclose"]');
    await tap(w, '[data-act="rackopen"]');
    ok('Cancel drops the ticks', JSON.stringify(ticked(w)) === '["RACK 3"]' && !$(w, '.rc-move'));
    w.close();
  }
  {
    // The review of 18 Nov: Save with the list still open dropped the ticks and said "Count saved".
    const { w, moves, recounts } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="cminus"]');
    ok('with the count changed, Save is on', $(w, '[data-act="csave"]').disabled === false);
    await tap(w, '[data-act="rackopen"]');
    await toggle(w, 'SHOP');
    ok('with the rack list open, Save is off', $(w, '[data-act="csave"]').disabled === true);
    await tap(w, '[data-act="csave"]'); await wait(40);
    ok('and pressing it sends nothing', recounts.length === 0 && moves.length === 0 && Boolean($(w, '.rc-pick')));
    await done(w);
    ok('Done turns Save back on, with the rack in it', $(w, '[data-act="csave"]').disabled === false && /RACK 3, SHOP/.test(($(w, '.rc-move') || {}).textContent || ''));
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('and one Save then sends the count and the rack', recounts.length === 1 && moves.length === 1 && moves[0].body.location === 'RACK 3, SHOP');
    w.close();
  }
  {
    // A rack written twice is one row and one tick.
    const rs = rows(); rs.push(row({ id: 'p8', size: '265/70R17', qty: 2, location: 'RACK 3, RACK 3' }));
    const { w } = phone({ rows: rs });
    await wait(60);
    await tap(w, '.row[data-id="p8"] .main');
    await tap(w, '[data-act="rackopen"]');
    ok('one tick for a rack written twice', /Done \(1\)/.test($(w, '[data-act="rackdone"]').textContent));
    await toggle(w, 'RACK 3');
    ok('and one tap unticks it', ticked(w).length === 0);
    w.close();
  }
  {
    // The same racks written without the space, or in another order, are the same racks.
    const rs = rows(); rs.push(row({ id: 'p7', size: '255/55R18', qty: 3, location: 'SHOP,RACK 10' }));
    const { w, moves } = phone({ rows: rs });
    await wait(60);
    await tap(w, '.row[data-id="p7"] .main');
    await tap(w, '[data-act="rackopen"]');
    await done(w);
    ok('a location the counter wrote without a space is not "changed" by opening and closing the list', !$(w, '.rc-move') && moves.length === 0);
    w.close();
  }

  // ---- the rack alone -------------------------------------------------------
  {
    const { w, moves, recounts } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p2"] .main');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'BAR 2');
    ok('it says what will change', /Moves from\s*SHOP, RACK 10\s*to BAR 2/.test(($(w, '.rc-move') || {}).textContent || ''), ($(w, '.rc-move') || {}).textContent);
    ok('and Save comes on', $(w, '[data-act="csave"]').disabled === false);
    await tap(w, '[data-act="csave"]'); await wait(40);
    ok('no recount is sent for a rack alone', recounts.length === 0);
    ok('ONE guarded write', moves.length === 1 && /id=eq\.p2/.test(moves[0].url)
      && moves[0].url.indexOf('location=eq.' + encodeURIComponent('SHOP, RACK 10')) !== -1, moves[0] && moves[0].url);
    ok('setting the one rack picked', JSON.stringify(moves[0].body) === JSON.stringify({ location: 'BAR 2' }));
    ok('the card shows the new rack', /BAR 2/.test($(w, '.row[data-id="p2"] .sub').textContent) && !/SHOP/.test($(w, '.row[data-id="p2"] .sub').textContent));
    ok('the panel closes and says so', !$(w, '.recount') && /Moved to BAR 2/.test(said(w)), said(w));
    w.close();
  }

  // ---- count and rack, one Save ----------------------------------------------
  {
    const { w, moves, recounts } = phone({ rows: rows() });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="cminus"]');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'RACK 1');
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('the count goes first', recounts.length === 1 && recounts[0].p_qty === 5);
    ok('then the rack', moves.length === 1 && moves[0].body.location === 'RACK 1');
    ok('and it says both', /Count saved: 5/.test(said(w)) && /Moved to RACK 1/.test(said(w)), said(w));
    w.close();
  }

  // ---- a count refused keeps the rack for the next Save ------------------------
  {
    const { w, moves } = phone({ rows: rows(), recount: (body, n, rs) => reply({ product_id: body.p_product_id, moved: true, qty_now: 3 }) });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="cminus"]');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'SHOP');
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('a count the book moved past writes no rack', moves.length === 0);
    ok('and the panel stays open with the rack still picked', Boolean($(w, '.recount')) && /SHOP/.test(($(w, '.rc-move') || {}).textContent || ''));
    w.close();
  }

  // ---- changed at the counter meanwhile ---------------------------------------
  {
    const rs = rows();
    const { w, moves } = phone({ rows: rs });
    await wait(60);
    await tap(w, '.row[data-id="p3"] .main');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'RACK 10');
    rs.find((x) => x.id === 'p3').location = 'OFFICE';
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('nothing written over the counter\'s rack', rs.find((x) => x.id === 'p3').location === 'OFFICE' && moves.length === 1);
    ok('it says what the counter changed it to', /changed to OFFICE at the counter/.test(said(w)), said(w));
    ok('the panel stays open to Save again', Boolean($(w, '.recount')) && $(w, '[data-act="csave"]').disabled === false);
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('and Save again moves it from where it is now', rs.find((x) => x.id === 'p3').location === 'RACK 10'
      && moves[1].url.indexOf('location=eq.OFFICE') !== -1, moves[1] && moves[1].url);
    w.close();
  }

  // ---- a dropped answer, sent again ------------------------------------------
  {
    const rs = rows();
    let n = 0;
    const { w } = phone({ rows: rs, rack: (u, body, all) => {
      n += 1;
      const r = all.find((x) => x.id === 'p5');
      if (n === 1){ r.location = body.location; return Promise.reject(new Error('dropped')); }
      return reply([]);
    } });
    await wait(60);
    await tap(w, '.row[data-id="p5"] .main');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'RACK 1');
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('no answer says it may or may not have moved', /may or may not have moved/.test(said(w)), said(w));
    ok('and leaves Save on', Boolean($(w, '.recount')) && $(w, '[data-act="csave"]').disabled === false);
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('Save again finds it already in, and says so', /Moved to RACK 1/.test(said(w)) && /already gone in/.test(said(w)), said(w));
    w.close();
  }

  // ---- a tire with no rack ----------------------------------------------------
  {
    const rs = rows(); rs.push(row({ id: 'p6', size: '245/70R16', qty: 2, location: '' }));
    const { w, moves } = phone({ rows: rs });
    await wait(60);
    await tap(w, '.row[data-id="p6"] .main');
    ok('a tire with no rack says No rack', /No rack/.test($(w, '.rc-rackbtn').textContent));
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'SHOP');
    await tap(w, '[data-act="csave"]'); await wait(60);
    ok('and can be given one', rs.find((x) => x.id === 'p6').location === 'SHOP' && /location=eq\.(&|$)/.test(moves[0].url), moves[0] && moves[0].url);
    w.close();
  }

  // ---- count saved, rack refused: the panel stays for the rack alone ---------
  {
    const rs = rows();
    const { w, moves, recounts } = phone({ rows: rs });
    await wait(60);
    await tap(w, '.row[data-id="p1"] .main');
    await tap(w, '[data-act="cminus"]');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'SHOP');
    rs.find((x) => x.id === 'p1').location = 'OFFICE';
    await tap(w, '[data-act="csave"]'); await wait(80);
    ok('the count went in', recounts.length === 1 && rs.find((x) => x.id === 'p1').qty === 5);
    ok('the rack was refused and it says both', /Count saved: 5/.test(said(w)) && /changed to OFFICE/.test(said(w)), said(w));
    ok('the panel stays open, the count now the book\'s, the rack still picked', Boolean($(w, '.recount'))
      && ($(w, '#rcQty') || {}).value === '5' && /SHOP/.test(($(w, '.rc-move') || {}).textContent || ''));
    await tap(w, '[data-act="csave"]'); await wait(80);
    ok('Save again sends the rack alone, never the count twice', recounts.length === 1 && moves.length === 2
      && rs.find((x) => x.id === 'p1').location === 'SHOP');
    w.close();
  }

  // ---- a check that fails is no answer, not a tire gone ----------------------
  {
    const rs = rows();
    const { w } = phone({ rows: rs, rack: () => reply([]), extra: (u, method) =>
      (method === 'GET' && /\/rest\/v1\/products\?select=location&id=eq\./.test(u) ? reply({ message: 'busy' }, 503) : undefined) });
    await wait(60);
    await tap(w, '.row[data-id="p3"] .main');
    await tap(w, '[data-act="rackopen"]');
    await pick(w, 'SHOP');
    await tap(w, '[data-act="csave"]'); await wait(80);
    ok('a failed read says it may or may not have moved', /may or may not have moved/.test(said(w)) && !/not on the book/.test(said(w)), said(w));
    ok('and the panel stays to Save again', Boolean($(w, '.recount')) && $(w, '[data-act="csave"]').disabled === false);
    w.close();
  }

  finish('rack');
})();
