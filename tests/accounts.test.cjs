const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const preferences = require('../preferences.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// Drain nested initialization/auth timers rather than racing a fixed delay.
async function flush() {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
}
const alice = { id: 'alice-id', email: 'alice@example.test' };
const bob = { id: 'bob-id', email: 'bob@example.test' };
const row = (user, currency = 'RON') => ({ user_id: user.id, currency, daily_allowance: 75, daily_currency: 'EUR', baseline_burn: 3000, horizon: 24 });

function harness(t, options = {}) {
  const dom = new JSDOM(read('index.html'), { url: options.url || 'https://example.test/financial-tracker/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, db = options.db || new Map();
  const state = { user: options.user || null, callback: null, failLoad: false, failSave: false, loadGate: null, saveGate: null, calls: [] };
  const emit = (event, user) => { state.user = user; state.callback(event, user ? { user } : null); };
  const client = {
    auth: {
      onAuthStateChange(callback) { state.callback = callback; setTimeout(() => callback('INITIAL_SESSION', state.user ? { user: state.user } : null), 0); },
      async getSession() { return { data: { session: state.user ? { user: state.user } : null }, error: null }; },
      async signInWithPassword(credentials) {
        state.calls.push(['login', credentials]);
        if (credentials.password !== 'test-password-123') return { error: { code: 'invalid_credentials' } };
        emit('SIGNED_IN', credentials.email === bob.email ? bob : alice); return { error: null };
      },
      async signUp(input) { state.calls.push(['signup', input]); return { data: { session: null }, error: null }; },
      async resetPasswordForEmail(email, config) { state.calls.push(['reset', email, config]); return { error: null }; },
      async updateUser(input) { state.calls.push(['update', input]); emit('USER_UPDATED', state.user); return { error: null }; },
      async signOut() { emit('SIGNED_OUT', null); return { error: null }; }
    },
    from(table) {
      assert.equal(table, 'user_settings');
      let owner, payload;
      const chain = {
        select() { return chain; },
        eq(column, value) { assert.equal(column, 'user_id'); owner = value; return chain; },
        upsert(value) { payload = value; return chain; },
        async maybeSingle() {
          const result = db.get(owner) || null;
          if (state.loadGate) await state.loadGate;
          if (state.failLoad) return { error: new Error('offline') };
          return { data: result, error: null };
        },
        async single() {
          if (state.saveGate) await state.saveGate;
          if (state.failSave) return { error: new Error('offline') };
          db.set(payload.user_id, { ...payload }); return { data: payload, error: null };
        }
      };
      return chain;
    }
  };
  w.FINTRACK_CONFIG = options.unconfigured ? {} : { supabaseUrl: 'https://testing.supabase.co', supabasePublishableKey: 'sb_publishable_test' };
  w.supabase = { createClient: () => client };
  for (const file of ['preferences.js', 'settings-store.js']) w.eval(read(file));
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  w.eval(read('accounts.js'));
  const $ = id => w.document.getElementById(id);
  async function submit(email, password = 'test-password-123') {
    $('authEmail').value = email; $('authPassword').value = password;
    $('authForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await flush();
  }
  return { w, $, state, emit, db, submit };
}

test('preferences reject invalid currency, negative/non-finite amounts and unsupported horizon', () => {
  for (const value of [{ currency: 'GBP' }, { dailyAllowance: -1 }, { baselineBurn: Infinity }, { dailyAllowance: NaN }, { horizon: 13 }]) {
    assert.throws(() => preferences.validate({ ...preferences.defaults, ...value }));
  }
  assert.equal(preferences.validate({ ...preferences.defaults, dailyAllowance: 0 }).dailyAllowance, 0);
});

test('unconfigured deployment fails closed without a fake login', async t => {
  const h = harness(t, { unconfigured: true }); await flush();
  assert.equal(h.$('app').hidden, true);
  assert.equal(h.$('authForm').hidden, true);
  assert.match(h.$('authTitle').textContent, /coming soon/);
});

test('login rejects wrong password and loads only signed-in user settings', async t => {
  const h = harness(t, { db: new Map([[alice.id, row(alice, 'USD')], [bob.id, row(bob, 'EUR')]]) }); await flush();
  await h.submit(alice.email, 'wrong');
  assert.match(h.$('authStatus').textContent, /incorrect/);
  assert.equal(h.$('app').hidden, true);
  await h.submit(alice.email);
  assert.equal(h.$('app').hidden, false);
  assert.equal(h.$('prefCurrency').textContent, 'USD');
  assert.equal(h.$('accountEmail').textContent, alice.email);
});

test('first account saves all preferences and restores them in a fresh page instance', async t => {
  const db = new Map();
  const h = harness(t, { user: alice, db }); await flush();
  assert.equal(h.$('overlay').style.display, 'flex');
  h.w.chooseCurrency(h.w.document.querySelector('[data-currency="USD"]'));
  h.$('dailyAllowance').value = '42.5'; h.$('dailyCurrency').value = 'EUR';
  h.$('baselineBurn').value = '7800'; h.$('projectionHorizon').value = '36';
  await h.w.savePreferences();
  assert.equal(db.get(alice.id).daily_allowance, 42.5);
  assert.equal(h.$('overlay').style.display, 'none');
  const fresh = harness(t, { user: alice, db }); await flush();
  assert.equal(fresh.$('prefCurrency').textContent, 'USD');
  assert.equal(fresh.$('prefDaily').textContent, '42.5 EUR/day');
  assert.equal(fresh.$('prefBurn').textContent, '7,800 USD');
  assert.equal(fresh.$('prefHorizon').textContent, '36 months');
  assert.notEqual(fresh.$('overlay').style.display, 'flex');
});

test('Cancel discards draft settings and the wizard reopens from saved values', async t => {
  const h = harness(t, { user: alice, db: new Map([[alice.id, row(alice)]]) }); await flush();
  h.w.openWizard(); h.$('dailyAllowance').value = '999';
  h.w.chooseCurrency(h.w.document.querySelector('[data-currency="USD"]'));
  h.w.closeWizard(); h.w.openWizard();
  assert.equal(h.$('dailyAllowance').value, '75');
  assert.equal(h.$('dailyCurrency').value, 'EUR');
  assert.equal(h.$('prefCurrency').textContent, 'RON');
});

test('failed save keeps draft editable and does not claim success or overwrite current settings', async t => {
  const h = harness(t, { user: alice, db: new Map([[alice.id, row(alice)]]) }); await flush();
  h.state.failSave = true; h.w.openWizard(); h.$('dailyAllowance').value = '999';
  await h.w.savePreferences();
  assert.match(h.$('wizardStatus').textContent, /Couldn’t confirm/);
  assert.equal(h.$('dailyAllowance').value, '999');
  assert.equal(h.$('nextBtn').disabled, false);
  assert.equal(h.db.get(alice.id).daily_allowance, 75);
  assert.equal(h.$('prefDaily').textContent, '75 EUR/day');
});

test('failed load keeps dashboard locked; retry restores saved preferences', async t => {
  const h = harness(t, { db: new Map([[alice.id, row(alice)]]) }); await flush();
  h.state.failLoad = true; h.emit('SIGNED_IN', alice); await flush();
  assert.equal(h.$('app').hidden, true);
  assert.equal(h.$('retrySettings').hidden, false);
  h.state.failLoad = false; h.$('retrySettings').click(); await flush();
  assert.equal(h.$('app').hidden, false);
  assert.equal(h.$('prefDaily').textContent, '75 EUR/day');
});

test('sign-out clears account state and temporary transactions before another user signs in', async t => {
  const h = harness(t, { user: alice, db: new Map([[alice.id, row(alice, 'USD')]]) }); await flush();
  h.$('name').value = 'Private test purchase'; h.$('amount').value = '20'; h.w.addCustom();
  h.$('signOutBtn').click(); await flush();
  assert.equal(h.$('app').hidden, true);
  assert.equal(h.$('accountEmail').textContent, '');
  assert.doesNotMatch(h.$('all').textContent, /Private test purchase/);
  await h.submit(bob.email);
  assert.equal(h.$('prefCurrency').textContent, 'RON');
  assert.equal(h.$('dailyAllowance').value, '100');
});

test('stale load cannot reveal the prior account after sign-out', async t => {
  const h = harness(t, { db: new Map([[alice.id, row(alice, 'USD')]]) }); await flush();
  let release; h.state.loadGate = new Promise(resolve => { release = resolve; });
  h.emit('SIGNED_IN', alice); await flush(); h.emit('SIGNED_OUT', null);
  release(); await flush();
  assert.equal(h.$('app').hidden, true);
  assert.equal(h.$('accountEmail').textContent, '');
});

test('stale save does not apply one user’s settings to another account', async t => {
  const h = harness(t, { user: alice, db: new Map([[alice.id, row(alice)]]) }); await flush();
  let release; h.state.saveGate = new Promise(resolve => { release = resolve; });
  h.w.openWizard(); h.$('dailyAllowance').value = '999'; const pending = h.w.savePreferences();
  h.emit('SIGNED_OUT', null); h.emit('SIGNED_IN', bob); await flush();
  release(); await pending;
  assert.equal(h.$('prefDaily').textContent, '100 RON/day');
  assert.equal(h.$('accountEmail').textContent, bob.email);
});

test('signup requests confirmation and password reset preserves the GitHub Pages subpath', async t => {
  const h = harness(t); await flush(); h.$('authToggle').click();
  h.$('authConfirm').value = 'test-password-123'; await h.submit(alice.email);
  assert.match(h.$('authStatus').textContent, /confirmation link/);
  assert.equal(h.state.calls[0][1].options.emailRedirectTo, 'https://example.test/financial-tracker/');
  assert.equal(h.$('app').hidden, true);
  h.$('authForgot').click(); await h.submit(alice.email, '');
  assert.equal(h.state.calls[1][2].redirectTo, 'https://example.test/financial-tracker/?recovery=1');
});

test('recovery session requires a new confirmed password before showing the dashboard', async t => {
  const h = harness(t, { user: alice, url: 'https://example.test/financial-tracker/?recovery=1', db: new Map([[alice.id, row(alice)]]) }); await flush();
  assert.equal(h.$('app').hidden, true);
  assert.match(h.$('authTitle').textContent, /new password/);
  h.$('authConfirm').value = 'test-password-123'; await h.submit(alice.email);
  assert.equal(h.state.calls[0][0], 'update');
  assert.equal(h.$('app').hidden, false);
  assert.equal(h.w.location.search, '');
});

test('transaction input is rendered as text, preventing script injection into authenticated sessions', async t => {
  const h = harness(t, { user: alice, db: new Map([[alice.id, row(alice)]]) }); await flush();
  h.$('name').value = '<img src=x onerror=alert(1)>'; h.$('amount').value = '1'; h.w.addCustom();
  assert.equal(h.$('all').querySelector('img'), null);
  assert.match(h.$('all').textContent, /<img/);
});
