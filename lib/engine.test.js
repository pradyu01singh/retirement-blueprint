/*
 * Sanity tests for retirement-engine.js — run with:  node lib/engine.test.js
 * No test framework; plain asserts so the silo has zero dependencies.
 */
const E = require('./retirement-engine');
let passed = 0, failed = 0;

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
function approx(a, b, tolPct) { return Math.abs(a - b) <= Math.abs(b) * tolPct; }

// Deterministic floor: ₹1L/mo, 20%/5yr, R=9%, 32yr should deplete near a known corpus.
const floor = E.requiredCorpus({ income: 100000, stepUp: 0.20, taxGrossUp: 0, meanReturn: 0.09, years: 32 });
ok('requiredCorpus in ₹1.7-2.0Cr band', floor > 1.7e7 && floor < 2.0e7, (floor / 1e7).toFixed(2) + ' Cr');

// A corpus at its own required level should be ~sustainable (ends ~0).
const p = E.project({ corpus: floor, income: 100000, stepUp: 0.20, taxGrossUp: 0, meanReturn: 0.09, years: 32 });
ok('project ends near zero at required corpus', approx(p.endingBalance, 0, 0.02) || Math.abs(p.endingBalance) < 5e5,
   (p.endingBalance / 1e7).toFixed(3) + ' Cr');

// Deterministic monotonicity: more corpus -> higher ending balance.
const lo = E.project({ corpus: 2.0e7, income: 100000, stepUp: 0.2, taxGrossUp: 0.08, meanReturn: 0.09, years: 32 }).endingBalance;
const hi = E.project({ corpus: 2.5e7, income: 100000, stepUp: 0.2, taxGrossUp: 0.08, meanReturn: 0.09, years: 32 }).endingBalance;
ok('more corpus -> higher ending balance', hi > lo);

// Monte-Carlo determinism with a seeded rng (mulberry32).
function seeded(seed) { return function () {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; }
const mcArgs = { corpus: 2.5e7, income: 100000, stepUp: 0.2, taxGrossUp: 0.08, meanReturn: 0.09, volatility: 0.06, years: 32, paths: 3000 };
const a = E.monteCarlo(Object.assign({ rng: seeded(42) }, mcArgs));
const b = E.monteCarlo(Object.assign({ rng: seeded(42) }, mcArgs));
ok('monteCarlo reproducible with seeded rng', a.successRate === b.successRate, a.successRate + ' vs ' + b.successRate);
ok('₹2.5Cr base case survives ~85-97%', a.successRate > 0.85 && a.successRate < 0.97, (a.successRate * 100).toFixed(0) + '%');
ok('percentiles ordered p10<=p50<=p90', a.p10 <= a.p50 && a.p50 <= a.p90);

// Annuity carve-out lowers median ending balance (growth given up) at R>annuityRate.
const noAnn = E.monteCarlo(Object.assign({ rng: seeded(7) }, mcArgs)).p50;
const withAnn = E.monteCarlo(Object.assign({ rng: seeded(7), annuityCapital: 5e6 }, mcArgs)).p50;
ok('annuity trims median ending balance at R=9%', withAnn < noAnn,
   (withAnn / 1e7).toFixed(2) + ' < ' + (noAnn / 1e7).toFixed(2) + ' Cr');

// Total capital = corpus + reserve.
ok('totalCapital adds reserve', E.totalCapital({ corpus: 2.5e7, reserve: 4e6 }) === 2.9e7);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
