(function (root) {
  'use strict';
  function defaults() {
    return { transactions: [], scenario: { inc: 31500, exp: 15000, inv: 1200, evt: 2500 },
      chart: 'base', view: 'dashboard', draft: { name: '', amount: '', type: 'Expense', cat: 'Food' } };
  }
  const types = ['Expense', 'Income', 'Investment', 'Transfer', 'One-off'];
  const categories = ['Food', 'Home', 'Child', 'Salary', 'Investment', 'Vacation'];
  function validate(value) {
    if (!value || !Array.isArray(value.transactions) || !value.scenario || !value.draft)
      throw new Error('Invalid account data.');
    const transactions = value.transactions.map(t => {
      if (!t || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string'
        || !t.name.trim() || t.name.length > 200 || !types.includes(t.type)
        || !categories.includes(t.cat) || !Number.isFinite(t.amt) || t.amt === 0)
        throw new Error('Enter a description and a valid non-zero transaction amount.');
      return { id: t.id, name: t.name, type: t.type, cat: t.cat, amt: t.amt };
    });
    if (new Set(transactions.map(t => t.id)).size !== transactions.length) throw new Error('Duplicate transaction.');
    const scenario = {};
    for (const [key, min, max] of [['inc',18000,50000],['exp',8000,26000],['inv',0,3000],['evt',0,15000]]) {
      const n = value.scenario[key];
      if (!Number.isFinite(n) || n < min || n > max) throw new Error('Invalid scenario value.');
      scenario[key] = n;
    }
    if (!['base','stress','house'].includes(value.chart)
      || !['dashboard','transactions','networth','projection','scenarios','goals','preferences'].includes(value.view))
      throw new Error('Invalid view.');
    const d = value.draft;
    if (typeof d.name !== 'string' || d.name.length > 200 || typeof d.amount !== 'string'
      || d.amount.length > 100 || !types.includes(d.type) || !categories.includes(d.cat))
      throw new Error('Invalid transaction draft.');
    return { transactions, scenario, chart: value.chart, view: value.view,
      draft: { name: d.name, amount: d.amount, type: d.type, cat: d.cat,
        editId: typeof d.editId==='string' && transactions.some(t=>t.id===d.editId) ? d.editId : null } };
  }
  function createStore(client) {
    return {
      async load(userId) {
        if (!userId) throw new Error('Sign in first.');
        const { data, error } = await client.from('user_app_state').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!data) return { state: defaults(), revision: 0 };
        if (data.user_id !== userId || !Number.isSafeInteger(data.revision) || data.revision < 1)
          throw new Error('Invalid saved account data.');
        return { state: validate(data.state), revision: data.revision };
      },
      async save(userId, state, revision) {
        if (!userId) throw new Error('Sign in first.');
        const payload = { user_id: userId, state: validate(state), revision: revision + 1 };
        const request = revision === 0
          ? client.from('user_app_state').insert(payload)
          : client.from('user_app_state').update(payload).eq('user_id', userId).eq('revision', revision);
        const { data, error } = await request.select('*').single();
        if (error || !data) {
          const conflict = error?.code === 'PGRST116' || error?.code === '23505';
          throw new Error(conflict
            ? 'Another tab or device saved changes. Copy any unsaved entries before reloading to get the latest version.'
            : 'Couldn’t confirm the save. Check your connection and retry; keep this page open.');
        }
        if (data.user_id !== userId || data.revision !== revision + 1) throw new Error('Save was not confirmed.');
        return data.revision;
      }
    };
  }
  const api = { defaults, validate, createStore };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinTrackState = api;
})(typeof window !== 'undefined' ? window : globalThis);
