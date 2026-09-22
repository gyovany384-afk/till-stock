# Till Stock — stock lookup on your phone

One page, `index.html`, served from GitHub Pages. Open it on a phone, sign in
once, and look up what the **stock room** holds: size, brand, rack, code, what it
cost and what it sells for.

**Two screens: Stock and Sales.** Stock looks things up and can log a sale;
Sales is the stock room's log of every tire that left the shop, and a sale can be
taken back out of it from here.

**It looks, and since 21 September 2026 it can log a sale.** Tap a tire, pick
how many, press Confirm: the sale goes into the stock room's book at the tire's
own price, marked as sold by "Phone", and the stock room computer shows it in
its Sales log within about ten seconds. The page works out no money — the stock
room's database stamps the price, cost and tax the way the counter does
(`till_stock.log_sale`). No counting and no corrections — those stay on the
computer.

**A sale that never gets a clear answer** (a dropped signal) says so and offers
**Try again**, which sends the same sale again — the stock room finds it and
never sells it twice. It is remembered on the phone until it gets an answer, even
if the page is closed. **Leave it** forgets it and re-reads the stock, so the
count shows whether it went in.

## The Sales log

Brought back on 22 September 2026, redrawn to the owner's own mockup. It had
been deleted on 12 September with the count screen; the count screen must stay
deleted and the comment in `index.html` says why, but the sales log's reason was
the smaller one — a sale row in this book carries a product id and no size or
brand — and that is answered by reading the tires the sales name.

**No money anywhere on the list.** His rule: *"no other numbers exist (as far as
money goes) outside of the card, clicking shows those details".* So a card
carries the dot (blue for the phone, green for the counter), the size, the brand,
the clock and **how many** went out. The day headings carry the day and no total.
Every figure is inside the sale you tap.

**Today, Yesterday and Month** are one read, not three: the page reads from the
earlier of the first of the month and yesterday, and the pills slice what it
already holds.

**Nothing here polls.** The counter sees a phone sale within about ten seconds
because it asks every ten seconds. This page asks when the Sales tab is first
opened, when the refresh button is tapped, and when you come back to it — and the
empty screen says so rather than leaving somebody waiting for a line that is
never going to arrive on its own.

## Taking a sale back out

Open a sale and press **Remove this sale**. It is the same act the stock room
computer has offered since 3 September and it does the same two things: the line
goes completely, and the tires go back on the shelf. The confirm says both
before anything moves — and over a sale that is not today's it adds the
counter's own warning that the day has already been counted.

It says what the removal DOES, not what the shelf will then read. The counter's
confirm says "6 becomes 10" and is entitled to: its count is never more than ten
seconds old. Nothing on this page polls, so the count here can be hours old, and
a promise about a shelf made out of an old number is the kind of thing somebody
acts on. What the shelf actually holds is said the moment it is done, out of the
database's own answer. It is a warning, not a refusal; the owner lifted that rule on
5 September.

**A Remove whose answer is lost is safe to send again.** The number sent is the
sale's own, so `till_stock.remove_sale` finds the sale already gone and its
tombstone under that number, and answers "already" having moved nothing. That is
why the phone offers to try again instead of the kept-number machinery a sale
needs.

**The counter hears about it within ten seconds.** A deleted row is not a changed
row, so the removal leaves a tombstone in `till_stock.removed_sales` that the
counter's poll asks for. It needs
`db/2026-09-22-remove-a-sale-from-the-phone.sql` in the stock room repo; until
that is run, Remove says the stock room has not been taught this yet and nothing
moves.

## Which book it shows

It reads the **stock room computer's own book** — the one the Till Stock desktop
app keeps. That is not the shop's live till.

**So a tire sold on the shop's Till does not change the number on here.** (A sale
logged on this page, or on the stock room computer, does.) The banner
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
    node tests/sale.test.cjs
    node tests/sales-log.test.cjs

Around 270 checks, and every one of them is on something that goes wrong in
silence here.

The read: paging past the database's 1,000-row limit, the schema header, a fixed
row order, archived tires filtered out, cents turned into dollars exactly once,
the token refresh keeping its headers, and the three empty screens above.

The sale: the number minted once and sent again on a retry, a dropped signal that
is not a refusal, and a session that expires mid-send.

The sales log: the two reads and their order, no money anywhere on the list, the
day worked out without a Date (which would put every heading a day out west of
Greenwich), and what Remove says and sends.

They borrow `jsdom` from the Till desktop repo (or set `TILL_REPO`). If it cannot
find one, the run prints **SKIPPED** — read that line rather than the exit code.
