// ============================================================
// CALLING A COUNT OFF — both directions
//
// The bug pinned here: the tablet's request poll bailed out entirely once a count
// had been started ("a count already open is never re-scoped underneath the
// counter"), which also swallowed the shop CANCELLING it — while the computer's
// own dialog promised "the tablet will go back to saying no count is needed".
// Someone could carry on walking racks nobody was waiting on.
//
// Being called off is not a re-scope. It is shown, the numbers are kept, and the
// counter decides — because someone walked those racks and a count already done
// is still worth having.
//
// The other half: starting a count was one-way by design, which only ever meant
// there is no quiet exit. A job genuinely called off needs a door, and it has to
// tell the computer or the shop sits waiting for a walk nobody is doing.
// ============================================================
const { tablet, ok, finish, wait, screen, stored, startWalking } = require('./harness.cjs');

(async () => {
  // ---------------------------------------------------------------
  console.log('the shop calls off a count that is already being walked\n');
  {
    const { w, state } = tablet();
    await wait(400);
    startWalking(w);
    w.tsSame('p1');                       // real work done before it's called off
    ok('a count is under way', screen(w).indexOf('Count in progress') !== -1);
    ok('and it offers a way out', screen(w).indexOf('tsCallOff()') !== -1);

    state.requestOpen = false;            // <-- the desktop's "Call it off"
    w.document.getElementById('countRefreshBtn').click();
    await wait(300);

    ok('the tablet now says so', screen(w).indexOf('called this count off') !== -1);
    ok('it does NOT throw the work away', stored(w, 'till_stock_count', '{}').p1 === 8);
    ok('and offers both honest choices',
       screen(w).indexOf('tsOffSend()') !== -1 && screen(w).indexOf('tsOffDrop()') !== -1);
    ok('the notice survives the tablet sleeping',
       stored(w, 'till_stock_count_session', '{}').calledOff === true);
  }

  // ---------------------------------------------------------------
  console.log('\nthe shop changes its mind back\n');
  {
    const { w, state } = tablet();
    await wait(400);
    startWalking(w);
    w.tsSame('p1');
    state.requestOpen = false;
    w.document.getElementById('countRefreshBtn').click();
    await wait(300);
    ok('called off', screen(w).indexOf('called this count off') !== -1);

    state.requestOpen = true;             // a fresh request lands
    w.document.getElementById('countRefreshBtn').click();
    await wait(300);
    ok('it stops shouting about it', screen(w).indexOf('called this count off') === -1);
    ok('and the count carries on where it was', stored(w, 'till_stock_count', '{}').p1 === 8);
  }

  // ---------------------------------------------------------------
  console.log('\nthe counter throws away a called-off count\n');
  {
    const { w, state } = tablet();
    await wait(400);
    startWalking(w);
    w.tsSame('p1');
    state.requestOpen = false;
    w.document.getElementById('countRefreshBtn').click();
    await wait(300);
    w.tsOffDrop();
    ok('the numbers are cleared', w.localStorage.getItem('till_stock_count') === '{}');
    ok('the screen goes back to nothing needed', screen(w).indexOf('No count needed') !== -1);
  }

  // ---------------------------------------------------------------
  console.log('\nthe counter calls it off from the tablet\n');
  {
    const { w, state } = tablet();
    await wait(400);
    startWalking(w);
    w.tsSame('p1');
    w.tsCallOff();
    await wait(200);

    ok('the computer is told to stop waiting', state.patched.length === 1, state.patched);
    ok('...on the right request', state.patched[0] && state.patched[0].url.indexOf('id=eq.42') !== -1,
       state.patched[0] && state.patched[0].url);
    ok('...as cancelled, not answered',
       state.patched[0] && state.patched[0].body.status === 'cancelled',
       state.patched[0] && state.patched[0].body);
    ok('the count is cleared off the device', w.localStorage.getItem('till_stock_count') === '{}');
    ok('the leftovers go with it', w.localStorage.getItem('till_stock_count_extra') === '[]');
    ok('and the screen says nothing is needed', screen(w).indexOf('No count needed') !== -1);
  }

  // ---------------------------------------------------------------
  console.log('\nsending is not mistaken for being called off\n');
  {
    const { w, state } = tablet();
    await wait(400);
    startWalking(w);
    w.tsSame('p1');
    w.tsSend();
    await wait(250);
    ok('the count was sent', !!state.posted);
    // Sending answers the request, so the mailbox legitimately goes empty. That
    // must never come back to the counter as "the shop called it off".
    state.requestOpen = false;
    w.document.getElementById('countRefreshBtn').click();
    await wait(300);
    ok('no false call-off notice', stored(w, 'till_stock_count_session', '{}').calledOff !== true);
  }

  finish('CALL-OFF');
})();
