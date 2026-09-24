(function (root) {
  'use strict';
  const defaults = Object.freeze({
    currency: 'RON', dailyAllowance: 100, dailyCurrency: 'RON',
    baselineBurn: 15000, horizon: 12
  });
  function validate(value) {
    const currencies = ['RON', 'EUR', 'USD'];
    if (!value || !currencies.includes(value.currency) || !currencies.includes(value.dailyCurrency)
      || ![6, 12, 24, 36].includes(value.horizon)
      || !Number.isFinite(value.dailyAllowance) || value.dailyAllowance < 0
      || !Number.isFinite(value.baselineBurn) || value.baselineBurn < 0) {
      throw new Error('Choose a supported currency and planning horizon, and enter valid non-negative amounts.');
    }
    return {
      currency: value.currency, dailyAllowance: value.dailyAllowance,
      dailyCurrency: value.dailyCurrency, baselineBurn: value.baselineBurn,
      horizon: value.horizon
    };
  }
  const api = Object.freeze({ defaults, validate });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinTrackPreferences = api;
})(typeof window !== 'undefined' ? window : globalThis);
