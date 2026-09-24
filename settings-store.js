(function (root) {
  'use strict';
  const preferences = typeof module === 'object' && module.exports
    ? require('./preferences.js') : root.FinTrackPreferences;
  function createSettingsStore(client) {
    function requireUser(userId) {
      if (!userId) throw new Error('Sign in to access your preferences.');
    }
    function fromRow(row) {
      return preferences.validate({
        currency: row.currency, dailyAllowance: row.daily_allowance,
        dailyCurrency: row.daily_currency, baselineBurn: row.baseline_burn,
        horizon: row.horizon
      });
    }
    return {
      async load(userId) {
        requireUser(userId);
        const { data, error } = await client.from('user_settings').select('*')
          .eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (data && data.user_id !== userId) throw new Error('Unexpected settings owner.');
        return data ? fromRow(data) : null;
      },
      async save(userId, value) {
        requireUser(userId);
        const p = preferences.validate(value);
        const { data, error } = await client.from('user_settings').upsert({
          user_id: userId, currency: p.currency, daily_allowance: p.dailyAllowance,
          daily_currency: p.dailyCurrency, baseline_burn: p.baselineBurn, horizon: p.horizon
        }, { onConflict: 'user_id' }).select('*').single();
        if (error) throw error;
        if (!data || data.user_id !== userId) throw new Error('Settings were not confirmed saved.');
        return fromRow(data);
      }
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = createSettingsStore;
  else root.createSettingsStore = createSettingsStore;
})(typeof window !== 'undefined' ? window : globalThis);
