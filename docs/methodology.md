# Methodology & Model

The model is a **real decumulation**: withdrawals are taken at the *start* of each
year, and the remaining balance compounds for that year.

## Parameters

| Symbol | Meaning | Base | Range |
|--------|---------|------|-------|
| `C` | Couple's self-funded income corpus | ₹2.10 Cr | ₹1.5–3 Cr |
| `P` | Parents' pooled capital (family scenario) | ₹40 L | ₹0–1.5 Cr |
| `A` | Annuity carve-out (converted to a life annuity) | ₹0 | ₹0–1.2 Cr |
| `I` | Initial net monthly income (year 1) | ₹1,00,000 | ₹75k–2L |
| `S` | Step-up applied every 5 years | 20% | 15–34% |
| `R` | Expected (mean) blended annual return | 9% | 8–10% |
| `σ` | Return volatility (Monte-Carlo) | 6% | 4–14% |
| `N` | Horizon in years | 32 | 30–35 |
| `T` | Net→gross tax uplift | 8% | 5–15% |
| `H` | Ring-fenced Health & Contingency reserve (Bucket 4) | ₹40 L | ₹30–50 L |

`Ceff = C + P` is the working income corpus. `H` is **not** part of the drawdown —
it is additional capital, so **total capital to arrange = Ceff + H**.

## Equations

**Withdrawal in year _y_** (1-indexed), with 5-yearly step-ups and tax gross-up:

```
W(y) = I × 12 × (1 + S)^floor((y−1)/5) × (1 + T)
```

**Deterministic recursion** (Bal₀ = Ceff − A, where A is the annuity carve-out):

```
corpusNeed(y) = max(0, W(y) − A×annuityRate)      // annuity covers part of the need
Bal(y)        = ( Bal(y−1) − corpusNeed(y) ) × (1 + R)
```

**Monte-Carlo:** repeat 1,000× drawing a fresh return each year from a normal
distribution, so a bad *sequence* (not just the average) is captured:

```
r_y    = R + σ × randn()          // randn ~ Normal(0,1) via Box–Muller
Bal(y) = ( Bal(y−1) − corpusNeed(y) ) × (1 + max(r_y, −0.6))
success = share of paths with min_y Bal(y) ≥ 0
```

Aim for **success ≥ 90%**. A single annual draw is floored at −60% to avoid an
unrealistic wipeout in one year.

**Required corpus** = the smallest `Ceff` such that `Bal(N) = 0`, solved by
bisection.

## Modelling notes & honest caveats

- **Sequence risk.** The deterministic view (constant `R`) is optimistic; the
  Monte-Carlo is the honest gauge. ₹1.79 Cr survives ~20% of paths, ₹2.25 Cr ~76%,
  ₹2.5 Cr ~90%.
- **Single-pool conservatism.** The simulation draws proportionally from one pool.
  The real bucket strategy — never selling equity in a down year — does *better*
  than this sim, so the numbers are a conservative floor.
- **Annuity is nominal.** The annuity pays a level rupee amount; it does not rise
  with the step-ups. At `R > annuityRate` it lowers the *median* ending balance —
  its value is longevity/behavioural insurance (income past age `N`, through bad
  decades, one less thing for the surviving spouse), which a horizon-capped success
  metric cannot fully credit.
- **Normal returns.** Real markets have fatter tails and mild autocorrelation; treat
  the probability as a robustness gauge, not a guarantee. A production plan should
  also run a bootstrap/historical-sequence stress test.
