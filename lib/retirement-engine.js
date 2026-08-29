/*
 * retirement-engine.js
 * -------------------------------------------------------------------------
 * A dependency-free retirement decumulation engine: deterministic projection,
 * Monte-Carlo sustainability simulation, annuity-floor modelling, and
 * corpus-sizing by bisection.
 *
 * Pure functions, no DOM, no globals. Works in Node and the browser.
 *   Node:     const E = require('./retirement-engine');
 *   Browser:  <script src="retirement-engine.js"></script>  // window.RetirementEngine
 *
 * This is the canonical model. The interactive pages (en/, hi/) inline a copy
 * of the same math because published artifacts must be fully self-contained
 * (no external scripts). Keep the two in sync — this file is the source of truth.
 * -------------------------------------------------------------------------
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RetirementEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Verified scheme assumptions, India, as of August 2026. See docs/assumptions-2026.md.
  const RATES_2026 = Object.freeze({
    scss: 0.082,        // Senior Citizen Savings Scheme, quarterly, ₹30L/person
    pomis: 0.074,       // Post Office Monthly Income Scheme, ₹15L joint
    frsb: 0.0805,       // RBI Floating Rate Savings Bond (NSC + 0.35%)
    seniorFD: 0.07,     // indicative senior-citizen bank FD
    annuity: 0.07,      // joint-life, return-of-purchase-price immediate annuity (nominal)
    ltcgEquity: 0.125,  // long-term capital gains on equity, over ₹1.25L/yr
    stcgEquity: 0.20    // short-term capital gains on equity
  });

  // Default reasonable-case parameter set (₹ in rupees).
  const DEFAULTS = Object.freeze({
    corpus: 2.5e7,          // income corpus (Buckets 1-3)
    annuityCapital: 0,      // portion of corpus converted to a life annuity
    annuityRate: RATES_2026.annuity,
    income: 100000,         // net monthly income wanted, year 1
    stepUp: 0.20,           // raise applied every 5 years
    taxGrossUp: 0.08,       // net -> gross uplift to cover tax
    meanReturn: 0.09,       // expected blended annual return
    volatility: 0.06,       // annual std-dev of returns (Monte-Carlo)
    years: 32,              // horizon
    reserve: 4.0e6          // ring-fenced Health & Contingency reserve (Bucket 4), NOT drawn
  });

  /** Gross withdrawal needed in a given year (1-indexed), incl. 5-yearly step-ups and tax. */
  function withdrawal(year, income, stepUp, taxGrossUp) {
    const block = Math.floor((year - 1) / 5);
    return income * 12 * Math.pow(1 + stepUp, block) * (1 + taxGrossUp);
  }

  /**
   * Deterministic year-by-year projection at a constant return.
   * Withdrawals occur at the start of each year; the remainder compounds.
   * An annuity carve-out (annuityCapital) is removed from the drawdown corpus
   * and pays a level annAnnual that offsets each year's need.
   */
  function project(opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const annuityCapital = Math.min(o.annuityCapital, o.corpus);
    const draw = o.corpus - annuityCapital;
    const annAnnual = annuityCapital * o.annuityRate;

    let bal = draw, minBalance = draw, totalPaid = 0;
    const rows = [];
    for (let y = 1; y <= o.years; y++) {
      const need = withdrawal(y, o.income, o.stepUp, o.taxGrossUp);
      const corpusW = Math.max(0, need - annAnnual);
      bal -= corpusW;
      if (bal < minBalance) minBalance = bal;
      bal *= (1 + o.meanReturn);
      totalPaid += need;
      rows.push({ year: y, need: need, corpusWithdrawal: corpusW, balance: bal });
      if (bal < 0) break;
    }
    return {
      endingBalance: bal,
      minBalance: minBalance,
      totalPaid: totalPaid,
      annuityMonthly: annAnnual / 12,
      sustainable: minBalance >= 0,
      rows: rows
    };
  }

  /**
   * Monte-Carlo sustainability test. Each path draws a fresh annual return from
   * Normal(meanReturn, volatility) so a bad *sequence* (not just the average) is
   * captured. Returns the share of paths that never hit zero, plus percentiles.
   * Pass a custom rng() (0..1) for reproducible tests.
   */
  function monteCarlo(opts) {
    const o = Object.assign({}, DEFAULTS, { paths: 1000, rng: Math.random }, opts);
    const annuityCapital = Math.min(o.annuityCapital, o.corpus);
    const draw = o.corpus - annuityCapital;
    const annAnnual = annuityCapital * o.annuityRate;
    const rng = o.rng;

    function randn() {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const ends = new Array(o.paths);
    let success = 0;
    for (let p = 0; p < o.paths; p++) {
      let bal = draw, ok = true;
      for (let y = 1; y <= o.years; y++) {
        bal -= Math.max(0, withdrawal(y, o.income, o.stepUp, o.taxGrossUp) - annAnnual);
        if (bal < 0) { ok = false; bal = 0; break; }
        bal *= (1 + Math.max(o.meanReturn + o.volatility * randn(), -0.6));
      }
      if (ok) success++;
      ends[p] = bal;
    }
    ends.sort(function (a, b) { return a - b; });
    const q = function (t) { return ends[Math.min(o.paths - 1, Math.floor(t * o.paths))]; };
    return {
      successRate: success / o.paths,
      p10: q(0.10), p50: q(0.50), p90: q(0.90),
      ends: ends
    };
  }

  /**
   * Smallest income corpus such that the deterministic projection ends at `target`
   * (default 0 = deplete-to-zero). Solved by bisection.
   */
  function requiredCorpus(opts) {
    const target = (opts && opts.target) || 0;
    let lo = 0, hi = 1e11;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const end = project(Object.assign({}, opts, { corpus: mid })).endingBalance;
      if (end > target) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /** Total capital to arrange = income corpus + ring-fenced Bucket-4 reserve. */
  function totalCapital(opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    return o.corpus + o.reserve;
  }

  return {
    RATES_2026: RATES_2026,
    DEFAULTS: DEFAULTS,
    withdrawal: withdrawal,
    project: project,
    monteCarlo: monteCarlo,
    requiredCorpus: requiredCorpus,
    totalCapital: totalCapital
  };
});
