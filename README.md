# Till Stock

Mobile stock lookup and rack counting for the Till app. Sign in with your Till
cloud account to look up stock on a phone, or walk a count on a tablet.

This page **cannot change stock**. A count it sends is posted to a mailbox and
waits there — the shop computer is the only thing in the system that applies one.

## Tests

The app is a single hand-written `index.html` with its code sealed inside an
IIFE, so the tests don't reach inside it. They drive it the way a thumb does —
through the handlers the buttons call — and check the rendered screen, what lands
in `localStorage`, and the real request bodies it tries to send.

```
node tests/count-extras.test.cjs     # adding tires that don't belong on a rack
node tests/count-calloff.test.cjs    # calling a count off, from either end
```

They borrow `jsdom` from the Till desktop repo rather than adding a
`package.json` here (this ships as one file to a static host). If it isn't found
they print `SKIPPED` and explain — run `npm install` in `<Till repo>/code/till`,
or set `TILL_REPO` to that checkout.
