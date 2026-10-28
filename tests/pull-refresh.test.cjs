// ============================================================
// Pull down to refresh — 28 Oct 2026.
//
// His comment on the practice copy: "pull down to refresh instead of button".
// The header's refresh button is gone. Drag the list down from its very top and
// let go past the line; the screen in front is read again.
//
// What would go wrong silently: a pull that refreshes on every little drag, a
// scroll back up the list that counts as a pull, a pull on one tab reading
// another's data, and a button left behind that does nothing.
//
//   node tests/pull-refresh.test.cjs
// ============================================================
const { phone, ok, finish, wait, pull, row, stockCalls, salesCalls } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const touch = (w, el, type, y) => {
  const ev = new w.Event(type, { bubbles: true, cancelable: true });
  ev.touches = type === 'touchend' ? [] : [{ clientY: y }];
  el.dispatchEvent(ev);
};
const two = () => [row({ id: 'p1', qty: 6 }), row({ id: 'p2', size: '195/65R15', brand: 'Norvell Turanto T5', qty: 4 })];

(async function run() {
  console.log('\nPull down to refresh\n');

  {
    const { w, calls } = phone({ rows: two() });
    await wait(80);
    ok('the header has no refresh button any more', !w.document.getElementById('refreshBtn'));
    ok('and still has the stopwatch and sign out', Boolean($(w, '#timerBtn')) && Boolean($(w, '#signOutBtn')));

    let n = stockCalls(calls).length;
    await pull(w, 120);
    await wait(40);
    ok('pulling the stock list down past the line reads the stock again', stockCalls(calls).length > n, [n, stockCalls(calls).length]);
    ok('and shows a spinner as the receipt', $(w, '#ptr').classList.contains('on') && Boolean($(w, '#ptr .spin')));

    n = stockCalls(calls).length;
    await pull(w, 40);
    await wait(40);
    ok('a short drag does not refresh', stockCalls(calls).length === n);

    // a list that is scrolled down is a scroll, not a pull
    const list = $(w, '#list');
    Object.defineProperty(list, 'scrollTop', { value: 120, configurable: true, writable: true });
    await pull(w, 160);
    await wait(40);
    ok('a drag down on a list that is not at its top does not refresh', stockCalls(calls).length === n);
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true, writable: true });

    // scrolled off the top in the middle of the drag
    touch(w, list, 'touchstart', 100);
    touch(w, list, 'touchmove', 140);
    Object.defineProperty(list, 'scrollTop', { value: 30, configurable: true, writable: true });
    touch(w, list, 'touchmove', 260);
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true, writable: true });
    touch(w, list, 'touchmove', 280);
    touch(w, list, 'touchend', 280);
    await wait(40);
    ok('a drag that scrolled the list at any point is never a pull', stockCalls(calls).length === n);

    // a cancelled touch (the phone took the gesture)
    touch(w, list, 'touchstart', 100); touch(w, list, 'touchmove', 260); touch(w, list, 'touchcancel', 260);
    await wait(40);
    ok('a cancelled touch does not refresh', stockCalls(calls).length === n);

    // begun in the search box
    touch(w, $(w, '#q'), 'touchstart', 100); touch(w, $(w, '#q'), 'touchmove', 260); touch(w, $(w, '#q'), 'touchend', 260);
    await wait(40);
    ok('a drag that starts in the search box does not refresh', stockCalls(calls).length === n);

    // a mouse drags the same way on a computer
    const down = new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 100 });
    list.dispatchEvent(down);
    w.document.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientY: 220 }));
    w.document.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0, clientY: 220 }));
    await wait(40);
    ok('a mouse drag down refreshes too', stockCalls(calls).length > n);
    w.close();
  }

  {
    const { w, calls } = phone({ rows: two(), sales: [] });
    await wait(80);
    $(w, '#tabSales').click(); await wait(80);
    const n = salesCalls(calls).length, s = stockCalls(calls).length;
    await pull(w, 120);
    await wait(40);
    ok('on the Sales tab the pull reads the sales, not the stock', salesCalls(calls).length > n && stockCalls(calls).length === s, [n, salesCalls(calls).length, s, stockCalls(calls).length]);
    w.close();
  }

  finish('Pull down to refresh');
})().catch((e) => { console.error(e); process.exit(1); });
