# Till Stock — stock lookup on your phone

One page, `index.html`, served from GitHub Pages. Open it on a phone, sign in
once, and look up what the **stock room** holds: size, brand, rack, code, what it
cost and what it sells for.

**It can only look.** There is nothing in this page that writes to anything. No
counting, no corrections, no sales — just the lookup.

## Which book it shows

It reads the **stock room computer's own book** — the one the Till Stock desktop
app keeps. That is not the shop's live till.

**So a tire sold at the counter does not change the number on here.** The banner
at the top of the screen says so, because it matters: the figure on this page is
the stock room's record, not today's shelf.

Repointed 12 September 2026. Before that it read the shop's cloud, which is the
one regular Till syncs to.

## Signing in

Use the **same email and password as the stock room computer**. That account also
has to be on the stock room's staff list — if it is not, the page says so in as
many words rather than showing an empty shop.

Three different empty screens, three different messages:

| What you see | What it means |
|---|---|
| "This account is not on the stock room's staff list" | The sign-in worked. The door is shut — add the account on the stock room computer |
| "Your session expired — sign in again" | Just sign in again |
| "The stock room book has no tires in it" | The door is open and the book really is empty |

## Is the key in this page a problem

No. The key in `index.html` is the **publishable** kind — it is meant to ship
inside a page, and this repo is public, so it is on the open internet. On its own
it opens nothing: every table refuses a caller who is not signed in **and** on
the staff list. That list is the lock, not the address of the file.

## Putting a change on the phone

There is no build step. Commit and push to `main`, and GitHub Pages serves the
new file. Allow about ten minutes for GitHub's own cache, then **hard reload** on
the phone — the browser and any home-screen shortcut can hold the old page.

To undo a change, `git revert` the commit and push. Same ten minutes.

## Tests

    node tests/stock-read.test.cjs

Thirty-odd checks on the one thing that can silently go wrong here: the read.
Paging past the database's 1,000-row limit, the schema header, a fixed row order,
archived tires filtered out, cents turned into dollars exactly once, the token
refresh keeping its headers, and the three empty screens above.

They borrow `jsdom` from the Till desktop repo (or set `TILL_REPO`). If it cannot
find one, the run prints **SKIPPED** — read that line rather than the exit code.
