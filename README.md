# Bucket Retirement Blueprint

A retirement **decumulation** plan for an Indian couple who need a rising monthly
income for 30+ years without ever running out — delivered as an interactive,
layman-friendly web page in **English and Hindi**, backed by a reusable,
dependency-free calculation engine.

> ⚠️ **Educational framework, not personalised investment advice.** Not from a
> SEBI-registered adviser. Rates, tax rules and scheme limits change — verify
> against current notifications and a qualified CFP/RIA before acting. See the
> disclaimer in each page and [`docs/assumptions-2026.md`](docs/assumptions-2026.md).

## What's inside — each piece works in a silo

| Path | What it is | Standalone? |
|------|-----------|-------------|
| [`en/index.html`](en/index.html) | Full interactive plan (English) — self-contained single file | ✅ open in any browser |
| [`hi/index.html`](hi/index.html) | Same plan, in Hindi | ✅ open in any browser |
| [`lib/retirement-engine.js`](lib/retirement-engine.js) | The math: projection, Monte-Carlo, annuity, corpus-sizing | ✅ Node + browser, zero deps |
| [`lib/engine.test.js`](lib/engine.test.js) | Sanity tests (`node lib/engine.test.js`) | ✅ |
| [`docs/methodology.md`](docs/methodology.md) | The model, formulas, parameters | — |
| [`docs/assumptions-2026.md`](docs/assumptions-2026.md) | Verified 2026 rates, tax rules, scheme limits + sources | — |

The two HTML pages are **fully self-contained** (all CSS/JS inline) so they can be
hosted anywhere, emailed, or published as an artifact with no build step. They
inline a copy of the engine because a distributable page can't depend on external
scripts; `lib/retirement-engine.js` is the **source of truth** for the math.

## The plan in one paragraph

Split the corpus into four buckets: **(1)** safe schemes paying monthly/quarterly
income (SCSS, POMIS, RBI Floating Rate Bonds), **(2)** low-volatility debt/hybrid
that refills Bucket 1, **(3)** equity that grows for 10+ years to fund future
step-ups, and **(4)** a *ring-fenced* Health & Contingency reserve never touched
for income. Draw monthly income via interest payouts + an SWP; rebalance yearly,
top-down; never sell equity in a crash. Target ≈ **₹2.5 Cr** income corpus (for
~90% Monte-Carlo survival) **+ ~₹40 L** reserve ≈ **₹2.9 Cr** total.

## Using the engine

```js
const E = require('./lib/retirement-engine');

// How much do I need to draw ₹1L/mo, rising 20% every 5 yrs, for 32 years?
E.requiredCorpus({ income: 100000, stepUp: 0.20, taxGrossUp: 0.08,
                   meanReturn: 0.09, years: 32 });        // ≈ ₹1.9 Cr

// Will ₹2.5 Cr survive? (1,000 randomised return paths)
const mc = E.monteCarlo({ corpus: 2.5e7, income: 100000, stepUp: 0.20,
                          taxGrossUp: 0.08, meanReturn: 0.09,
                          volatility: 0.06, years: 32 });
mc.successRate;                                            // ≈ 0.91

// Add a ₹50L joint-life annuity floor and re-test
E.monteCarlo({ corpus: 2.5e7, annuityCapital: 5e6, /* ...same... */ });
```

All amounts are in rupees. See `lib/engine.test.js` for more examples and
`docs/methodology.md` for the equations.

## Run the tests

```bash
node lib/engine.test.js
```

## License

MIT — see [`LICENSE`](LICENSE). The educational disclaimer above still applies.
