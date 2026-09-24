const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
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
  const w = dom.window, db = options.db || new Map(), appDb = options.appDb || new Map();
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
      async signInWithOAuth(input) { state.calls.push(['oauth', input]); return { error: state.oauthError || null }; },
      async resetPasswordForEmail(email, config) { state.calls.push(['reset', email, config]); return { error: null }; },
      async updateUser(input) { state.calls.push(['update', input]); emit('USER_UPDATED', state.user); return { error: null }; },
      async signOut() { emit('SIGNED_OUT', null); return { error: null }; }
    },
    from(table) {
      if(table === 'user_app_state') {
        let owner, revision, payload, inserting;
        const chain = {
          select(){return chain;},
          eq(key,value){if(key==='user_id')owner=value;else revision=value;return chain;},
          insert(value){payload=value;inserting=true;return chain;},
          update(value){payload=value;return chain;},
          async maybeSingle(){
            if(state.failDataLoad)return {error:new Error('offline')};
            return {data:appDb.get(owner)||null,error:null};
          },
          async single(){
            state.calls.push(['dataSave',payload]);
            if(state.dataSaveGate)await state.dataSaveGate;
            if(state.failDataSave)return {error:new Error('offline')};
            const existing=appDb.get(payload.user_id);
            if((inserting&&existing)||(!inserting&&existing?.revision!==revision))return {error:{code:inserting?'23505':'PGRST116'}};
            appDb.set(payload.user_id,JSON.parse(JSON.stringify(payload)));
            return {data:payload,error:null};
          }
        };
        return chain;
      }
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
  const run=code=>vm.runInContext(code,dom.getInternalVMContext());
  for (const file of ['preferences.js', 'settings-store.js', 'app-state.js','transaction-tools.js']) run(read(file));
  for (const script of w.document.querySelectorAll('script:not([src])')) run(script.textContent);
  run(read('account-data.js'));
  run(read('accounts.js'));
  const $ = id => w.document.getElementById(id);
  async function submit(email, password = 'test-password-123') {
    $('authEmail').value = email; $('authPassword').value = password;
    $('authForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await flush();
  }
  return { w, $, state, emit, db, appDb, submit };
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

test('sign-out clears visible account state before another user signs in', async t => {
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

test('Google is offered for login/signup and redirects back to the app subpath', async t => {
  const h = harness(t); await flush();
  assert.equal(h.$('googleAccess').hidden, false);
  h.$('authToggle').click();
  assert.equal(h.$('googleAccess').hidden, false);
  h.$('googleSignIn').click(); h.$('googleSignIn').click(); await flush();
  assert.equal(h.state.calls.length, 1);
  assert.equal(h.state.calls[0][1].provider, 'google');
  assert.equal(h.state.calls[0][1].options.redirectTo, 'https://example.test/financial-tracker/');
  assert.equal(h.$('app').hidden, true);
});

test('Google failure allows retry and does not interfere with email login', async t => {
  const h = harness(t); await flush();
  h.state.oauthError = new Error('provider disabled');
  h.$('googleSignIn').click(); await flush();
  assert.match(h.$('authStatus').textContent, /Google sign-in is unavailable/);
  assert.equal(h.$('googleSignIn').disabled, false);
  await h.submit(alice.email);
  assert.equal(h.$('app').hidden, false);
});

test('cancelled OAuth shows a safe message and clears callback errors from the URL', async t => {
  const h = harness(t, { url: 'https://example.test/financial-tracker/#error=access_denied&error_description=untrusted' }); await flush();
  assert.match(h.$('authStatus').textContent, /cancelled/);
  assert.doesNotMatch(h.$('authStatus').textContent, /untrusted/);
  assert.equal(h.w.location.hash, '');
  assert.equal(h.$('app').hidden, true);
});

test('Google session restores the same user preferences; recovery hides Google', async t => {
  const h = harness(t, { db: new Map([[alice.id, row(alice, 'USD')]]) }); await flush();
  h.emit('SIGNED_IN', { ...alice, app_metadata: { provider: 'google' } }); await flush();
  assert.equal(h.$('prefCurrency').textContent, 'USD');
  h.emit('PASSWORD_RECOVERY', alice);
  assert.equal(h.$('googleAccess').hidden, true);
});

test('logout flushes new transactions and restores them after login and on another device', async t => {
  const db=new Map([[alice.id,row(alice)]]),appDb=new Map();
  const h=harness(t,{user:alice,db,appDb});await flush();
  h.$('name').value='Weekly groceries';h.$('amount').value='123.45';h.w.addCustom();
  h.$('signOutBtn').click();await flush();
  assert.equal(appDb.get(alice.id).state.transactions.length,1);
  assert.equal(appDb.get(alice.id).state.transactions[0].amt,-123.45);
  await h.submit(alice.email);
  assert.match(h.$('all').textContent,/Weekly groceries/);
  const device=harness(t,{user:alice,db,appDb});await flush();
  assert.match(device.$('all').textContent,/Weekly groceries/);
});

test('scenario controls, chart, view and unfinished entry survive a fresh page', async t => {
  const db=new Map([[alice.id,row(alice)]]),appDb=new Map();
  const h=harness(t,{user:alice,db,appDb});await flush();
  h.$('inc').value='40000';h.$('exp').value='18000';h.$('inv').value='2000';h.$('evt').value='5000';
  h.w.chart(h.w.document.querySelectorAll('.tab')[1],'stress');h.w.show('scenarios');
  h.$('name').value='Draft entry';h.$('amount').value='20';h.$('type').value='Income';h.$('cat').value='Salary';
  h.w.FinTrackData.changed();await h.w.FinTrackData.flush();
  const fresh=harness(t,{user:alice,db,appDb});await flush();
  for(const [id,value] of Object.entries({inc:'40000',exp:'18000',inv:'2000',evt:'5000',name:'Draft entry',amount:'20',type:'Income',cat:'Salary'}))assert.equal(fresh.$(id).value,value);
  assert.equal(fresh.$('scenarios').classList.contains('active'),true);
  assert.equal(fresh.w.document.querySelectorAll('.tab')[1].classList.contains('active'),true);
  assert.equal(fresh.w.FinTrackData.isDirty(),false);
});

test('failed save prevents logout, keeps the transaction, and supports retry', async t => {
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)]])});await flush();
  h.state.failDataSave=true;
  h.$('name').value='Keep this entry';h.$('amount').value='50';h.w.addCustom();
  h.$('signOutBtn').click();await flush();
  assert.equal(h.$('app').hidden,false);
  assert.equal(h.w.FinTrackData.isDirty(),true);
  assert.match(h.$('all').textContent,/Keep this entry/);
  assert.equal(h.$('retryData').hidden,false);
  h.state.failDataSave=false;h.$('retryData').click();await flush();
  assert.equal(h.w.FinTrackData.isDirty(),false);
  h.$('signOutBtn').click();await flush();assert.equal(h.$('app').hidden,true);
});

test('edits during a pending save are serialized and the latest state is saved', async t => {
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)]])});await flush();
  let release;h.state.dataSaveGate=new Promise(resolve=>{release=resolve;});
  h.$('name').value='First';h.$('amount').value='10';h.w.addCustom();
  const pending=h.w.FinTrackData.flush();await flush();
  h.$('name').value='Second';h.$('amount').value='20';h.w.addCustom();
  release();await pending;
  assert.equal(h.appDb.get(alice.id).state.transactions.length,2);
  assert.equal(h.appDb.get(alice.id).revision,2);
  assert.equal(h.w.FinTrackData.isDirty(),false);
});

test('concurrent devices cannot overwrite each other’s transactions', async t => {
  const db=new Map([[alice.id,row(alice)]]),appDb=new Map();
  const a=harness(t,{user:alice,db,appDb}),b=harness(t,{user:alice,db,appDb});await flush();
  a.$('name').value='Device A';a.$('amount').value='1';a.w.addCustom();await a.w.FinTrackData.flush();
  b.$('name').value='Device B';b.$('amount').value='2';b.w.addCustom();
  await assert.rejects(b.w.FinTrackData.flush(),/Another tab or device/);
  assert.equal(appDb.get(alice.id).state.transactions[0].name,'Device A');
  assert.match(b.$('all').textContent,/Device B/);
  assert.equal(b.w.FinTrackData.isDirty(),true);
});

test('failed data load does not show defaults that could overwrite saved data', async t => {
  const h=harness(t);await flush();h.state.failDataLoad=true;h.emit('SIGNED_IN',alice);await flush();
  assert.equal(h.$('app').hidden,true);
  assert.equal(h.$('retrySettings').hidden,false);
  h.state.failDataLoad=false;h.$('retrySettings').click();await flush();
  assert.equal(h.$('app').hidden,false);
});

test('invalid transactions are rejected without saving an empty or zero entry', async t => {
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)]])});await flush();
  h.$('name').value='';h.$('amount').value='20';h.w.addCustom();
  h.$('name').value='Test';h.$('amount').value='0';h.w.addCustom();
  assert.equal(h.w.captureAccountState().transactions.length,0);
  assert.match(h.$('transactionStatus').textContent,/non-zero/);
});

test('an old user save cannot change the next user’s visible data or save status', async t => {
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)],[bob.id,row(bob)]])});await flush();
  let release;h.state.dataSaveGate=new Promise(resolve=>{release=resolve;});
  h.$('name').value='Alice only';h.$('amount').value='5';h.w.addCustom();const pending=h.w.FinTrackData.flush();await flush();
  h.emit('SIGNED_OUT',null);h.emit('SIGNED_IN',bob);await flush();release();await pending;
  assert.doesNotMatch(h.$('all').textContent,/Alice only/);
  assert.equal(h.$('accountEmail').textContent,bob.email);
  assert.equal(h.w.FinTrackData.isDirty(),false);
});

test('Add starts a save immediately and shows progress until the server confirms', async t => {
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)]])});await flush();
  let release;h.state.dataSaveGate=new Promise(resolve=>{release=resolve;});
  h.$('name').value='Visible save';h.$('amount').value='10';h.w.addCustom();await flush();
  assert.equal(h.$('addTransactionBtn').textContent,'Saving…');
  assert.equal(h.$('addTransactionBtn').disabled,true);
  assert.equal(h.$('transactionStatus').textContent,'Saving…');
  const pending=h.w.FinTrackData.flush();release();await pending;
  assert.equal(h.$('addTransactionBtn').disabled,false);
  assert.equal(h.$('transactionStatus').textContent,'All changes saved');
  assert.equal(h.appDb.get(alice.id).state.transactions[0].name,'Visible save');
});

test('balance totals reflect recorded income and every outflow, including cents',async t=>{
  const h=harness(t,{user:alice,db:new Map([[alice.id,row(alice)]])});await flush();
  assert.equal(h.$('transactionBalance').textContent,'0.00 RON');
  for(const [type,amount] of [['Income','100.25'],['Expense','10.10'],['Transfer','20'],['Investment','5']]){
    h.$('name').value=type;h.$('amount').value=amount;h.$('type').value=type;h.w.addCustom();await h.w.FinTrackData.flush();
  }
  assert.equal(h.$('transactionBalance').textContent,'65.15 RON');
  assert.equal(h.$('transactionIncome').textContent,'100.25 RON');
  assert.equal(h.$('transactionOutflow').textContent,'35.10 RON');
});

test('editing updates the existing transaction, totals and persisted state without a duplicate',async t=>{
  const db=new Map([[alice.id,row(alice)]]),appDb=new Map();const h=harness(t,{user:alice,db,appDb});await flush();
  h.$('name').value='Original';h.$('amount').value='20';h.w.addCustom();await h.w.FinTrackData.flush();
  const id=h.w.captureAccountState().transactions[0].id;
  h.w.editTransaction(id);h.$('name').value='Corrected';h.$('amount').value='35.50';h.w.addCustom();await h.w.FinTrackData.flush();
  assert.equal(h.w.captureAccountState().transactions.length,1);
  assert.equal(h.w.captureAccountState().transactions[0].id,id);
  assert.equal(h.$('transactionBalance').textContent,'-35.50 RON');
  const fresh=harness(t,{user:alice,db,appDb});await flush();
  assert.match(fresh.$('all').textContent,/Corrected/);
  assert.equal(fresh.$('transactionBalance').textContent,'-35.50 RON');
});

test('edit drafts survive refresh and cancel leaves original transaction unchanged',async t=>{
  const db=new Map([[alice.id,row(alice)]]),appDb=new Map();const h=harness(t,{user:alice,db,appDb});await flush();
  h.$('name').value='Original';h.$('amount').value='20';h.w.addCustom();await h.w.FinTrackData.flush();
  h.w.editTransaction(h.w.captureAccountState().transactions[0].id);h.$('amount').value='99';h.w.FinTrackData.changed();await h.w.FinTrackData.flush();
  const fresh=harness(t,{user:alice,db,appDb});await flush();
  assert.equal(fresh.$('transactionFormTitle').textContent,'Edit transaction');
  assert.equal(fresh.$('amount').value,'99');
  fresh.w.cancelTransactionEdit();await fresh.w.FinTrackData.flush();
  assert.equal(fresh.w.captureAccountState().transactions[0].amt,-20);
});

test('Delete and Undo persist correctly and undo cannot restore another account’s entries',async t=>{
  const db=new Map([[alice.id,row(alice)],[bob.id,row(bob)]]),appDb=new Map();const h=harness(t,{user:alice,db,appDb});await flush();
  h.$('name').value='Remove me';h.$('amount').value='12';h.w.addCustom();await h.w.FinTrackData.flush();
  const id=h.w.captureAccountState().transactions[0].id;
  h.w.deleteTransaction(id);await h.w.FinTrackData.flush();
  assert.equal(appDb.get(alice.id).state.transactions.length,0);
  assert.equal(h.$('transactionBalance').textContent,'0.00 RON');
  h.w.undoTransactionDelete();await h.w.FinTrackData.flush();
  assert.equal(appDb.get(alice.id).state.transactions[0].id,id);
  h.w.deleteTransaction(id);await h.w.FinTrackData.flush();
  h.emit('SIGNED_OUT',null);h.emit('SIGNED_IN',bob);await flush();
  h.w.undoTransactionDelete();assert.equal(h.w.captureAccountState().transactions.length,0);
  assert.equal(h.$('undoTransaction').hidden,true);
});

test('sample cards have Demo badges while the real balance does not',async t=>{
  const h=harness(t);await flush();
  for(const selector of ['#networth .card','#projection .card','#goals .card']){
    for(const card of h.w.document.querySelectorAll(selector))assert.ok(card.querySelector('.demoBadge'));
  }
  assert.equal(h.$('transactionBalance').closest('.card').querySelector('.demoBadge'),null);
});
