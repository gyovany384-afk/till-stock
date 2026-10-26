// ============================================================
// Tech time on the phone — 26 Oct 2026.
//
// His ask: "I need a way to log tech times per job", mockup approved, and
// "phone link ... to the live app". A stopwatch in the header opens the Timers
// screen from any tab; New timer, Manual entry, Done and Delete are each a sheet
// that asks first. What is tested here is what the page SENDS and what it SAYS;
// the database's own rules (the clock, the day check, who may write, a delete
// keeping the line) are held in the stock room repo's test/tech-time-sql.test.js.
//
//   node tests/tech-time.test.cjs
// ============================================================
const { phone, ok, finish, wait, reply } = require('./harness.cjs');

const $ = (w, sel) => w.document.querySelector(sel);
const text = (w, sel) => ($(w, sel) || {}).textContent || '';
const tap = async (w, sel) => { const el = $(w, sel); if (el) el.dispatchEvent(new w.Event('click', { bubbles: true })); await wait(30); return Boolean(el); };
const tapText = async (w, sel, words) => {
  const el = [...w.document.querySelectorAll(sel)].find((b) => b.textContent.indexOf(words) !== -1);
  if (el) el.dispatchEvent(new w.Event('click', { bubbles: true }));
  await wait(30);
  return Boolean(el);
};
const focus = async (w, id) => { const b = w.document.getElementById(id); b.dispatchEvent(new w.Event('focusin', { bubbles: true })); await wait(10); };
const type = async (w, id, v) => { const b = w.document.getElementById(id); b.value = v; b.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10); };
const key = async (w, id, k) => { const b = w.document.getElementById(id); b.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await wait(20); };
const bodyOf = (c) => JSON.parse(c.body || '{}');
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = dayOf(new Date());
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

// A stand-in for the stock room's tech tables and functions, answering the page's
// own questions the way PostgREST would: the four reads, and the four calls.
function room(over = {}) {
  const st = {
    techs: over.techs || ['Marco', 'Dre', 'Luis'],
    jobs: over.jobs || [
      { id: 1, title: 'Mount and balance x4', vehicle: 'Silver sedan, 225/65R17', done: false },
      { id: 2, title: 'Flat repair', vehicle: 'White pickup, 265/70R16', done: false },
      { id: 3, title: 'Sensor swap x2', vehicle: '', done: false },
      { id: 4, title: 'Rotation', vehicle: '', done: true },
    ],
    timers: over.timers || [{ job_id: 1, tech: 'Dre', started_at: ago(14), started_where: 'Phone' }],
    log: over.log || [{ id: 11, job_id: 4, tech: 'Luis', minutes: 22, worked_on: TODAY, entered_at: ago(300), source: 'timer', started_where: 'Counter', capped: false }],
  };
  const sent = [], reads = [];
  let nextEntry = 100, nextJob = 10;
  const extra = (u, method, init, headers) => {
    const rest = /\/rest\/v1\/(techs|tech_jobs|tech_timers|tech_time_standing)\b/.exec(u);
    if (rest && method === 'GET') {
      reads.push({ table: rest[1], url: u, headers });
      if (over.readFail) return reply({ message: 'nope' }, over.readFail);
      if (rest[1] === 'techs') return reply(st.techs.map((name) => ({ name })), 206);
      if (rest[1] === 'tech_jobs') return reply(st.jobs.map((j) => ({ ...j })), 206);
      if (rest[1] === 'tech_timers') return reply(st.timers.map((t) => ({ ...t })), 206);
      const day = /worked_on=eq\.([0-9-]+)/.exec(u);
      return reply(st.log.filter((e) => !day || e.worked_on === day[1]).map((e) => ({ ...e })), 206);
    }
    const call = /\/rest\/v1\/rpc\/(tech_[a-z_]+)/.exec(u);
    if (!call) return undefined;
    const fn = call[1], body = JSON.parse(init.body);
    sent.push({ fn, body, headers });
    if (over.rpc) { const own = over.rpc(fn, body, st); if (own !== undefined) return own; }
    if (fn === 'tech_start_timer') {
      let job = st.jobs.find((j) => j.id === body.p_job_id);
      if (body.p_job_id != null && !job) return reply({ message: 'That job is not in the book any more.' }, 400);
      if (job && job.done) return reply({ message: 'That job is already finished.' }, 400);
      if (job && st.timers.find((t) => t.job_id === job.id)) return reply({ message: 'That job already has a timer running.' }, 400);
      if (!job) { job = { id: nextJob++, title: body.p_title, vehicle: '', done: false }; st.jobs.unshift(job); }
      if (st.techs.map((t) => t.toLowerCase()).indexOf(String(body.p_tech).toLowerCase()) === -1) st.techs.push(body.p_tech);
      st.timers.push({ job_id: job.id, tech: body.p_tech, started_at: new Date().toISOString(), started_where: body.p_where });
      return reply(job.id);
    }
    if (fn === 'tech_stop_timer') {
      const t = st.timers.find((x) => x.job_id === Number(body.p_job_id));
      if (!t) return reply({ message: 'There is no timer running on that job.' }, 400);
      st.timers = st.timers.filter((x) => x !== t);
      const id = nextEntry++;
      st.log.push({ id, job_id: t.job_id, tech: t.tech, minutes: 14, worked_on: body.p_day, entered_at: new Date().toISOString(), source: 'timer', started_where: t.started_where, capped: false });
      if (body.p_finish) st.jobs.find((j) => j.id === t.job_id).done = true;
      return reply(id);
    }
    if (fn === 'tech_add_time') {
      let job = st.jobs.find((j) => j.id === body.p_job_id);
      if (!job) { job = { id: nextJob++, title: body.p_title, vehicle: '', done: true }; st.jobs.unshift(job); }
      const id = nextEntry++;
      st.log.push({ id, job_id: job.id, tech: body.p_tech, minutes: body.p_minutes, worked_on: body.p_day, entered_at: new Date().toISOString(), source: 'typed', started_where: body.p_where, capped: false });
      return reply(id);
    }
    if (fn === 'tech_remove_entry') {
      const at = st.log.findIndex((e) => e.id === Number(body.p_entry_id));
      if (at === -1) return reply({ message: 'That entry is already gone.' }, 400);
      st.log.splice(at, 1);
      return reply(null, 204);
    }
    return reply({ message: 'unknown' }, 404);
  };
  return { extra, st, sent, reads };
}

const timersScreen = (w) => text(w, '#timeList');

(async function run() {
  console.log('\nTech time on the phone\n');

  // ---- the stopwatch, the badge and the screen ---------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    const tabs = [...w.document.querySelectorAll('.tabs .tab')].map((b) => b.textContent);
    ok('the tab row is still four tabs, with no Time tab', tabs.join(',') === 'Stock,Sales,Notes,Health', tabs);
    ok('there is a stopwatch button in the header', Boolean($(w, '#timerBtn')) && $(w, '#timerBtn').getAttribute('aria-label') === 'Timers');
    ok('the badge counts the timers running, before the screen is ever opened', text(w, '#timerBadge') === '1' && !$(w, '#timerBadge').hidden, text(w, '#timerBadge'));
    ok('the timers screen is not showing yet', $(w, '#timeList').hidden);

    await tap(w, '#timerBtn');
    ok('the stopwatch opens the Timers screen', !$(w, '#timeList').hidden && text(w, '#screenTitle') === 'Timers');
    ok('the stock list is hidden behind it', $(w, '#list').hidden);
    ok('the stopwatch shows it is open, and no tab is picked', $(w, '#timerBtn').classList.contains('on') && !$(w, '.tabs .tab.on'));
    ok('the search box goes, because the timers have none', $(w, '#searchWrap').hidden);
    ok('a running timer shows the job, the tech and the time', /Mount and balance x4/.test(timersScreen(w)) && /Dre/.test(timersScreen(w)) && /14 min/.test(timersScreen(w)), timersScreen(w).slice(0, 200));
    ok('the vehicle is under the job', /Silver sedan/.test(timersScreen(w)));
    ok('the log shows what was logged today, with where it started', /Rotation/.test(timersScreen(w)) && /Luis/.test(timersScreen(w)) && /Counter/.test(timersScreen(w)));
    ok('and the total under it', /22 min/.test(text(w, '.tttotal')), text(w, '.tttotal'));
    ok('the tech filter pills are All and each tech', [...w.document.querySelectorAll('[data-ttf]')].map((b) => b.textContent).join(',') === 'All,Marco,Dre,Luis');
    ok('and carry no numbers', ![...w.document.querySelectorAll('[data-ttf]')].some((b) => /\d/.test(b.textContent)));

    // reads: right place, right names, today only
    const t = r.reads.map((x) => x.table);
    ok('it reads the techs, the jobs, the timers and the standing log', ['techs', 'tech_jobs', 'tech_timers', 'tech_time_standing'].every((n) => t.indexOf(n) !== -1), t);
    ok('every read looks in the stock room schema', r.reads.every((x) => x.headers['Accept-Profile'] === 'till_stock'));
    const logRead = r.reads.find((x) => x.table === 'tech_time_standing');
    ok('the log is read from the standing view (deleted lines left out), for today only', /worked_on=eq\.\d{4}-\d{2}-\d{2}/.test(logRead.url) && logRead.url.indexOf(TODAY) !== -1, logRead.url);

    // the other tabs, and back
    await tap(w, '#tabStock');
    ok('Stock brings back the stock list and its search box', !$(w, '#list').hidden && $(w, '#timeList').hidden && !$(w, '#searchWrap').hidden && text(w, '#screenTitle') === 'Stock');
    ok('and the stopwatch goes back to plain', !$(w, '#timerBtn').classList.contains('on') && $(w, '#tabStock').classList.contains('on'));
    ok('the badge is still there on the stock screen', text(w, '#timerBadge') === '1');
    await tap(w, '#tabNotes');
    await tap(w, '#timerBtn');
    ok('the stopwatch works from the Notes tab too', !$(w, '#timeList').hidden && $(w, '#notesList').hidden);
  }

  // ---- New timer ---------------------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn');
    await tap(w, '[data-tt="new"]');
    ok('New timer opens a sheet with Tech and Job', $(w, '#ttWrap').classList.contains('on') && /Start a timer/.test(text(w, '#ttSheet')) && Boolean($(w, '#ttin_tech')) && Boolean($(w, '#ttin_job')));
    ok('the sheet starts with nothing chosen', $(w, '#ttin_tech').value === '' && $(w, '#ttin_job').value === '');

    await tap(w, '#ttin_tech');
    await focus(w, 'ttin_tech');
    ok('tapping the Tech box opens the list under it', !$(w, '#ttlist_tech').hidden && /Marco/.test(text(w, '#ttlist_tech')) && /Luis/.test(text(w, '#ttlist_tech')));
    ok('and there is no second search box', w.document.querySelectorAll('#ttSheet input').length === 2, w.document.querySelectorAll('#ttSheet input').length);
    await type(w, 'ttin_tech', 'lu');
    ok('typing in the box itself narrows the list', /Luis/.test(text(w, '#ttlist_tech')) && !/Marco/.test(text(w, '#ttlist_tech')));
    ok('a name it has not seen offers “Use”, with the new-tech note', /Use “lu”/.test(text(w, '#ttlist_tech')) && /added as a new tech/.test(text(w, '#ttlist_tech')));
    // A real finger: the tap on the box ends on the wrapper around it, because opening the
    // list moved the box. That is not a tap outside, and the list stays.
    await type(w, 'ttin_tech', '');
    w.document.querySelector('#ttSheet .fld').dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(20);
    ok('a tap that ends on the field around the box leaves the list open', !$(w, '#ttlist_tech').hidden);
    await type(w, 'ttin_tech', 'lu');
    await key(w, 'ttin_tech', 'Enter');
    ok('Enter takes the first match', $(w, '#ttin_tech').value === 'Luis' && $(w, '#ttlist_tech').hidden, $(w, '#ttin_tech').value);

    // The first letter can arrive before the list has opened, and must not be lost.
    {
      const jb = w.document.getElementById('ttin_job');
      jb.value = 'f';
      jb.dispatchEvent(new w.Event('input', { bubbles: true }));
      await wait(20);
      ok('a first letter typed before the list opens is kept, and the list opens on it', jb.value === 'f' && !$(w, '#ttlist_job').hidden && /Flat repair/.test(text(w, '#ttlist_job')) && !/Sensor swap/.test(text(w, '#ttlist_job')), jb.value);
      await type(w, 'ttin_job', '');
      await tap(w, '#ttSheet h2');
      ok('a tap on the sheet outside any field closes an open list', $(w, '#ttlist_job').hidden);
    }
    await focus(w, 'ttin_job');
    ok('the Job list does not offer a job that already has a timer, or a finished one', !/Mount and balance x4/.test(text(w, '#ttlist_job')) && !/Rotation/.test(text(w, '#ttlist_job')) && /Flat repair/.test(text(w, '#ttlist_job')), text(w, '#ttlist_job'));
    await type(w, 'ttin_job', 'Brake job for the van');
    ok('a new job offers “Use” and says it will be filed as new', /Use “Brake job for the van”/.test(text(w, '#ttlist_job')) && /filed as a new job/.test(text(w, '#ttlist_job')));
    await tapText(w, '#ttlist_job .ttopt.add', 'Use');
    ok('picking Use fills the box and closes the list', $(w, '#ttin_job').value === 'Brake job for the van' && $(w, '#ttlist_job').hidden);

    r.sent.length = 0;
    await tap(w, '[data-tt="send"]');
    await wait(60);
    ok('Start timer sends one call to the database', r.sent.length === 1 && r.sent[0].fn === 'tech_start_timer', r.sent);
    ok('naming the tech, the new job, and that it was started on the Phone', JSON.stringify(r.sent[0].body) === JSON.stringify({ p_job_id: null, p_title: 'Brake job for the van', p_tech: 'Luis', p_where: 'Phone' }), r.sent[0].body);
    ok('the call goes to the stock room schema', r.sent[0].headers['Content-Profile'] === 'till_stock');
    ok('the sheet closes and the screen says what happened', !$(w, '#ttWrap').classList.contains('on') && /Timer started for Luis on Brake job for the van/.test(timersScreen(w)), timersScreen(w).slice(0, 120));
    ok('the new timer is on the screen, read back from the database', /Brake job for the van/.test(timersScreen(w)) && /Timers running · 2/.test(timersScreen(w)));
    ok('and the badge says two', text(w, '#timerBadge') === '2', text(w, '#timerBadge'));
  }
  {
    // an existing job is sent by its number, not retyped
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    ok('picking a listed job shows it in the box, with its number', /J-2 · Flat repair/.test($(w, '#ttin_job').value), $(w, '#ttin_job').value);
    r.sent.length = 0;
    await tap(w, '[data-tt="send"]'); await wait(60);
    ok('a listed job is sent by its id with no title', r.sent[0] && r.sent[0].body.p_job_id === 2 && r.sent[0].body.p_title === null && r.sent[0].body.p_tech === 'Marco', r.sent[0]);
  }
  {
    // refusals that the page can see for itself send nothing
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    r.sent.length = 0;
    await tap(w, '[data-tt="send"]');
    ok('Start with nothing chosen says to pick a tech, and sends nothing', /Pick a tech\./.test(text(w, '#ttSheet')) && r.sent.length === 0);
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Dre');
    await tap(w, '[data-tt="send"]');
    ok('then says to pick a job', /Pick a job\./.test(text(w, '#ttSheet')) && r.sent.length === 0);
    await focus(w, 'ttin_job'); await type(w, 'ttin_job', 'J-1 · Mount and balance x4');
    await key(w, 'ttin_job', 'Enter');
    await tap(w, '[data-tt="send"]');
    ok('a job that already has a timer is refused before anything is sent', /already has a timer running/.test(text(w, '#ttSheet')) && r.sent.length === 0, text(w, '#ttSheet'));
    await tap(w, '[data-tt="close"]');
    ok('Cancel closes the sheet and starts nothing', !$(w, '#ttWrap').classList.contains('on') && r.sent.length === 0);
  }
  {
    // an answer from the database that says no is shown, and the sheet stays
    const r = room({ rpc: (fn) => (fn === 'tech_start_timer' ? reply({ message: 'That job already has a timer running.' }, 400) : undefined) });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Dre');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    await tap(w, '[data-tt="send"]'); await wait(60);
    ok('the database’s own words are shown and the sheet stays open', $(w, '#ttWrap').classList.contains('on') && /That job already has a timer running\./.test(text(w, '#ttSheet')));
    ok('and no “started” message is claimed', !/Timer started/.test(timersScreen(w)));
  }
  {
    // a dropped signal is not a yes and not a no
    const r = room({ rpc: (fn) => (fn === 'tech_start_timer' ? Promise.reject(new Error('offline')) : undefined) });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Dre');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    await tap(w, '[data-tt="send"]'); await wait(60);
    ok('no answer says so, and does not claim it worked', /No clear answer from the stock room/.test(text(w, '#ttSheet')) && !/Timer started/.test(timersScreen(w)));
  }

  // ---- Done, always asking first --------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn');
    await tap(w, '[data-tt="done"]');
    ok('Done asks "Finish this job?" and says what it will do', /Finish this job\?/.test(text(w, '#ttSheet')) && /stops Dre’s timer on Mount and balance x4/.test(text(w, '#ttSheet')) && /marks the job done/.test(text(w, '#ttSheet')), text(w, '#ttSheet'));
    ok('and says "about" for the minutes, since the phone’s clock only shows a picture', /running about \d+ min/.test(text(w, '#ttSheet')));
    ok('nothing has been sent just by asking', r.sent.length === 0);
    await tapText(w, '#ttSheet button', 'Keep it running');
    ok('Keep it running closes it and sends nothing', !$(w, '#ttWrap').classList.contains('on') && r.sent.length === 0 && r.st.timers.length === 1);
    await tap(w, '#ttScrim');
    await tap(w, '[data-tt="done"]');
    await tap(w, '#ttScrim');
    ok('tapping the dark part also closes a Done question', !$(w, '#ttWrap').classList.contains('on') && r.sent.length === 0);
    await tap(w, '[data-tt="done"]');
    await tapText(w, '#ttSheet button', 'Yes, it’s done'); await wait(80);
    ok('Yes sends one stop, for that job, finishing it, for today', r.sent.length === 1 && r.sent[0].fn === 'tech_stop_timer' && String(r.sent[0].body.p_job_id) === '1', r.sent);
    ok('with today’s local day and p_finish true', r.sent[0].body.p_day === TODAY && r.sent[0].body.p_finish === true, r.sent[0].body);
    ok('the minutes said afterwards are the database’s own (14), read back from the log', /Logged 14 min for Dre on Mount and balance x4\. Job done\./.test(timersScreen(w)), timersScreen(w).slice(0, 160));
    ok('the timer is gone and the badge with it', !/Timers running · 1/.test(timersScreen(w)) && $(w, '#timerBadge').hidden);
    ok('and the entry is in today’s log', /14 min/.test(text(w, '.ttlogcard')) && /Phone/.test(text(w, '.ttlogcard')));
  }

  // ---- Manual entry ----------------------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="manual"]');
    ok('Manual entry opens the same two boxes plus a Time field', /Log time by hand/.test(text(w, '#ttSheet')) && Boolean($(w, '#ttin_tech')) && Boolean($(w, '#ttin_job')) && Boolean($(w, '#ttMin')));
    ok('the time starts at 30', $(w, '#ttMin').value === '30');
    await tap(w, '[data-tt="more"]');
    ok('+ adds five minutes', $(w, '#ttMin').value === '35', $(w, '#ttMin').value);
    await tap(w, '[data-tt="less"]'); await tap(w, '[data-tt="less"]');
    ok('− takes five off', $(w, '#ttMin').value === '25', $(w, '#ttMin').value);
    await tapText(w, '.ttq button', '45');
    ok('the quick buttons set the time and light up', $(w, '#ttMin').value === '45' && $(w, '.ttq button.on').textContent === '45');
    await type(w, 'ttMin', '50');
    r.sent.length = 0;
    await tap(w, '[data-tt="send"]');
    ok('with nothing chosen it asks for a tech first', /Pick a tech\./.test(text(w, '#ttSheet')) && r.sent.length === 0);
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await type(w, 'ttin_job', 'Brake inspection');
    await key(w, 'ttin_job', 'Enter');
    ok('the time typed before is still there after the boxes were filled', $(w, '#ttMin').value === '50', $(w, '#ttMin').value);
    await type(w, 'ttMin', '');
    await tap(w, '[data-tt="send"]');
    ok('an empty time is refused, and nothing is sent', /between 1 minute and 24 hours/.test(text(w, '#ttSheet')) && r.sent.length === 0);
    await type(w, 'ttMin', '1500');
    await tap(w, '[data-tt="send"]');
    ok('more than a day is refused too', r.sent.length === 0 && /between 1 minute and 24 hours/.test(text(w, '#ttSheet')), r.sent.length);
    await type(w, 'ttMin', '50');
    await tap(w, '[data-tt="send"]'); await wait(80);
    ok('Add time sends one call with the minutes, today, a new job, and Phone', r.sent.length === 1 && r.sent[0].fn === 'tech_add_time'
      && JSON.stringify(r.sent[0].body) === JSON.stringify({ p_job_id: null, p_title: 'Brake inspection', p_tech: 'Marco', p_minutes: 50, p_day: TODAY, p_where: 'Phone' }), r.sent);
    ok('it lands in the log, and the screen says so', /Added 50 min for Marco on Brake inspection\./.test(timersScreen(w)) && /Brake inspection/.test(text(w, '.ttlogcard')) && /50 min/.test(text(w, '.ttlogcard')));
    ok('and no timer was started by it', /Timers running · 1/.test(timersScreen(w)));
  }

  // ---- Delete, always asking first ---------------------------------------------------
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn');
    await tap(w, '[data-tt="del"]');
    ok('Delete asks first, and names the line', /Delete this entry\?/.test(text(w, '#ttSheet')) && /Luis · Rotation · 22 min/.test(text(w, '#ttSheet')), text(w, '#ttSheet'));
    ok('nothing is sent by asking', r.sent.length === 0);
    await tapText(w, '#ttSheet button', 'Keep it');
    ok('Keep it leaves the line where it was', r.sent.length === 0 && r.st.log.length === 1 && /Rotation/.test(timersScreen(w)));
    await tap(w, '[data-tt="del"]');
    await tapText(w, '#ttSheet button', 'Yes, delete'); await wait(80);
    ok('Yes sends one remove, for that line', r.sent.length === 1 && r.sent[0].fn === 'tech_remove_entry' && String(r.sent[0].body.p_entry_id) === '11', r.sent);
    ok('the line goes from the screen, and the screen says what was deleted', !/Rotation/.test(text(w, '.ttlogcard')) && /Deleted 22 min for Luis on Rotation\./.test(timersScreen(w)), timersScreen(w).slice(0, 160));
  }

  // ---- the filter and the empty log ---------------------------------------------------
  {
    const r = room({ log: [
      { id: 21, job_id: 4, tech: 'Luis', minutes: 22, worked_on: TODAY, entered_at: ago(300), source: 'timer', started_where: 'Counter', capped: false },
      { id: 22, job_id: 2, tech: 'Marco', minutes: 90, worked_on: TODAY, entered_at: ago(200), source: 'typed', started_where: 'Phone', capped: false },
      { id: 23, job_id: 2, tech: 'Marco', minutes: 1440, worked_on: TODAY, entered_at: ago(100), source: 'timer', started_where: 'Phone', capped: true },
    ] });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn');
    ok('the total adds up every tech', /All techs, today/.test(text(w, '.tttotal')) && /25 h 52 min/.test(text(w, ".tttotal")), text(w, '.tttotal'));
    await tapText(w, '[data-ttf]', 'Marco');
    ok('a tech pill narrows the log and the total', /Marco, today/.test(text(w, '.tttotal')) && !/Luis/.test(text(w, '.ttlogcard')));
    ok('the pill that is picked is lit', $(w, '[data-ttf="Marco"]').classList.contains('on'));
    ok('a timer left on for days says it was capped', /capped/.test(text(w, '.ttlogcard')));
  }
  {
    const r = room({ log: [], timers: [] });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    ok('with nothing running, the badge stays hidden', $(w, '#timerBadge').hidden || text(w, '#timerBadge') === '');
    await tap(w, '#timerBtn');
    ok('an empty screen says so, in words', /No timers running\. Press New timer to start one\./.test(timersScreen(w)) && /Nothing logged today\./.test(timersScreen(w)));
  }

  // ---- a read that fails, a session that ends, signing out ------------------------------
  {
    const r = room({ readFail: 500 });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    ok('a failed quiet read (the badge) shows nothing wrong on the stock screen', !$(w, '#list').hidden);
    await tap(w, '#timerBtn'); await wait(40);
    ok('opening the screen over a failed read says it could not read, and offers refresh', /Couldn’t read the timers/.test(timersScreen(w)), timersScreen(w));
  }
  {
    const r = room({ rpc: (fn) => (fn === 'tech_add_time' ? reply({ message: 'JWT expired' }, 401) : undefined) });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="manual"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    await tap(w, '[data-tt="send"]'); await wait(120);
    ok('a session that ends mid-send goes to the sign-in screen and says nothing was saved', w.document.getElementById('login').style.display !== 'none' && /Nothing was saved/.test(text(w, '#loginMsg')), text(w, '#loginMsg'));
    ok('and the timers sheet goes with it', !$(w, '#ttWrap').classList.contains('on'));
  }
  {
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn');
    await tap(w, '#signOutBtn'); await wait(40);
    ok('signing out clears the badge and the screen', $(w, '#timerBadge').hidden && $(w, '#timeList').innerHTML === '');
    ok('and puts the app back on Stock for the next sign-in', !$(w, '#timerBtn').classList.contains('on'));
  }

  // ---- the review's findings, 26 Oct (a real browser found the first) ---------------------
  {
    // A tap on a row focuses the row in Chrome and Android. The list used to close
    // on that focus and the row was gone before the tap landed.
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech');
    const row = [...w.document.querySelectorAll('#ttlist_tech .ttopt')].find((b) => b.textContent.indexOf('Luis') !== -1);
    row.dispatchEvent(new w.Event('focusin', { bubbles: true })); await wait(10);
    ok('a row that takes focus is still in the list', row.isConnected && !$(w, '#ttlist_tech').hidden);
    const down = new w.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    ok('and a press on the list does not pull focus off the box', down.defaultPrevented);
    row.dispatchEvent(new w.Event('click', { bubbles: true })); await wait(30);
    ok('so the tap picks it', $(w, '#ttin_tech').value === 'Luis', $(w, '#ttin_tech').value);
  }
  {
    // Enter never guesses.
    const r = room({ techs: ['Andre', 'Dre', 'Joe'] });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await key(w, 'ttin_tech', 'Enter');
    ok('Enter on an empty box picks nothing', $(w, '#ttin_tech').value === '' && !$(w, '#ttlist_tech').hidden);
    await type(w, 'ttin_tech', 'Dre'); await key(w, 'ttin_tech', 'Enter');
    ok('the exact name wins over a longer one that comes first (Dre, not Andre)', $(w, '#ttin_tech').value === 'Dre', $(w, '#ttin_tech').value);
    await focus(w, 'ttin_tech'); await type(w, 'ttin_tech', 'dr'); await key(w, 'ttin_tech', 'Enter');
    ok('several partial matches pick nothing', !$(w, '#ttlist_tech').hidden && $(w, '#ttin_tech').value === 'dr', $(w, '#ttin_tech').value);
    await type(w, 'ttin_tech', 'jo'); await key(w, 'ttin_tech', 'Enter');
    ok('one partial match is taken', $(w, '#ttin_tech').value === 'Joe', $(w, '#ttin_tech').value);
    await focus(w, 'ttin_tech'); await type(w, 'ttin_tech', 'Sam'); await key(w, 'ttin_tech', 'Enter');
    ok('a name nothing fits is taken as a new one', $(w, '#ttin_tech').value === 'Sam', $(w, '#ttin_tech').value);
  }
  {
    // A bare title is a NEW job, not the oldest job with that title.
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await type(w, 'ttin_job', 'Rotation'); await key(w, 'ttin_job', 'Enter');
    r.sent.length = 0;
    await tap(w, '[data-tt="send"]'); await wait(80);
    const s1 = r.sent.find((x) => x.fn === 'tech_start_timer');
    ok('a title that a FINISHED job also has starts a new job', Boolean(s1) && s1.body.p_job_id === null && s1.body.p_title === 'Rotation', JSON.stringify(s1 && s1.body));
    await tap(w, '[data-tt="manual"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await type(w, 'ttin_job', 'Flat repair'); await tap(w, '#ttlist_job [data-tt="add"]');
    await tap(w, '[data-tt="send"]'); await wait(80);
    const s2 = r.sent.find((x) => x.fn === 'tech_add_time');
    ok('hand-logged time under a repeated title goes to a new job, not the old one', Boolean(s2) && s2.body.p_job_id === null && s2.body.p_title === 'Flat repair', JSON.stringify(s2 && s2.body));
  }
  {
    // A name typed and not picked, then Start: an exact match is kept; anything else is said.
    const r = room();
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="new"]');
    await focus(w, 'ttin_tech'); await type(w, 'ttin_tech', 'luis');
    await focus(w, 'ttin_job'); await type(w, 'ttin_job', 'Wheel swap');
    const send = $(w, '[data-tt="send"]');
    send.dispatchEvent(new w.Event('focusin', { bubbles: true })); await wait(10);
    ok('an exact name typed and not picked is kept when Start is pressed', $(w, '#ttin_tech').value === 'Luis', $(w, '#ttin_tech').value);
    r.sent.length = 0;
    await tap(w, '[data-tt="send"]');
    ok('and the unpicked job says what to do, and nothing is sent', /Tap .Use .Wheel swap.. to file a new job\./.test(text(w, '#ttSheet')) && r.sent.length === 0, text(w, '#ttSheet'));
  }
  {
    // A gateway's answer is not a refusal.
    const r = room({ rpc: (fn) => (fn === 'tech_add_time' ? reply('<html>Gateway Time-out</html>', 504) : undefined) });
    const { w } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="manual"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    await tap(w, '[data-tt="send"]'); await wait(80);
    const said = text(w, '#ttSheet');
    ok('a 504 says there is no clear answer', /No clear answer from the stock room/.test(said), said);
    ok('and never claims nothing was saved', !/Nothing was saved/.test(said));
  }

  // ---- what it never sends ---------------------------------------------------------------
  {
    const r = room();
    const { w, calls } = phone({ extra: r.extra });
    await wait(80);
    await tap(w, '#timerBtn'); await tap(w, '[data-tt="manual"]');
    await focus(w, 'ttin_tech'); await tapText(w, '#ttlist_tech .ttopt', 'Marco');
    await focus(w, 'ttin_job'); await tapText(w, '#ttlist_job .ttopt', 'Flat repair');
    await tap(w, '[data-tt="send"]'); await wait(80);
    const writes = calls.filter((c) => c.method !== 'GET' && c.url.indexOf('/auth/') === -1 && c.url.indexOf('/rpc/is_staff') === -1);
    ok('every write is a call to a tech function, never a direct write to a table', writes.length > 0 && writes.every((c) => /\/rest\/v1\/rpc\/tech_/.test(c.url)), writes.map((c) => c.method + ' ' + c.url));
    ok('and the page never names a minute count it did not read or was not told to send', r.sent.every((s) => s.fn !== 'tech_stop_timer' || !('p_minutes' in s.body)));
  }

  finish('Tech time on the phone');
}()).catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(1); });
