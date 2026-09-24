(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let client, store, user = null, ready = false, version = 0, mode = 'login', busy = false;
  let recovering = new URLSearchParams(location.search).get('recovery') === '1';
  const form = $('authForm');
  let callbackError = [location.search.slice(1), location.hash.slice(1)]
    .some(part => new URLSearchParams(part).has('error'));
  const status = (message, kind = '') => {
    $('authStatus').textContent = message;
    $('authStatus').className = `status ${kind}`;
  };
  function setBusy(value) {
    busy = value;
    form.querySelectorAll('input,button').forEach(el => el.disabled = value);
    $('authToggle').disabled = value;
    $('authForgot').disabled = value;
    $('googleSignIn').disabled = value;
  }
  function showMode(next) {
    mode = next;
    const signup = mode === 'signup', reset = mode === 'reset', recovery = mode === 'recovery';
    $('authTitle').textContent = signup ? 'Create your account' : reset ? 'Reset your password' : recovery ? 'Choose a new password' : 'Welcome back';
    $('authDescription').textContent = signup ? 'Save your planning preferences and access them on any device.'
      : reset ? 'Enter your email to request a password reset link.'
      : recovery ? 'Use a new password with at least 12 characters.' : 'Sign in to keep your planning preferences with you.';
    $('authSubmit').textContent = signup ? 'Create account' : reset ? 'Send reset link' : recovery ? 'Save new password' : 'Sign in';
    $('emailField').hidden = recovery;
    $('authEmail').required = !recovery;
    $('passwordField').hidden = reset;
    $('authPassword').required = !reset;
    $('authPassword').minLength = signup || recovery ? 12 : 1;
    $('authPassword').autocomplete = signup || recovery ? 'new-password' : 'current-password';
    $('authPassword').value = '';
    $('authConfirm').value = '';
    $('confirmField').hidden = !(signup || recovery);
    $('authConfirm').required = signup || recovery;
    $('passwordHint').hidden = !(signup || recovery);
    $('authToggle').textContent = mode === 'login' ? 'Create an account' : 'Back to sign in';
    $('authForgot').hidden = mode !== 'login';
    $('authLinks').hidden = recovery;
    $('googleAccess').hidden = reset || recovery;
    $('authSignOut').hidden = !recovery;
    $('retrySettings').hidden = true;
    form.hidden = false;
    status('');
  }
  function lockDashboard() {
    ready = false;
    $('app').hidden = true;
    $('authScreen').hidden = false;
    $('accountEmail').textContent = '';
    $('googleAccess').hidden = true;
    resetDashboard();
  }
  async function loadSettings(ticket) {
    if (!user || ticket !== version || recovering) return;
    const owner = user;
    form.hidden = true;
    $('authLinks').hidden = true;
    $('retrySettings').hidden = true;
    $('authSignOut').hidden = false;
    $('authTitle').textContent = 'Loading your preferences';
    $('authDescription').textContent = 'Getting your saved settings ready.';
    status('Loading…');
    try {
      const preferences = await store.load(owner.id);
      if (ticket !== version || recovering) return;
      applyPreferences(preferences || FinTrackPreferences.defaults);
      ready = true;
      $('accountEmail').textContent = owner.email || 'Signed in';
      $('accountEmail').title = owner.email || '';
      $('authScreen').hidden = true;
      $('app').hidden = false;
      $('settingsStatus').textContent = preferences ? 'Loaded from your account.' : 'Default preferences — use the wizard to save your own.';
      if (!preferences) openWizard();
    } catch (error) {
      if (ticket !== version) return;
      $('authTitle').textContent = 'Couldn’t load your settings';
      $('authDescription').textContent = 'Your saved preferences have not been changed.';
      status('Check your connection and try again. If this continues, the account service may need attention.', 'error');
      $('retrySettings').hidden = false;
    }
  }
  function onSession(event, session) {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    const nextUser = session?.user || null;
    if (nextUser?.id === user?.id && event !== 'INITIAL_SESSION' && event !== 'PASSWORD_RECOVERY') return;
    user = nextUser;
    const ticket = ++version;
    lockDashboard();
    if (!user) {
      showMode('login');
      if (callbackError) {
        callbackError = false;
        status('Sign-in was cancelled or could not be completed. Please try again.', 'error');
        history.replaceState(null, '', location.pathname);
      }
      return;
    }
    if (recovering) {
      showMode('recovery');
      return;
    }
    // Keep Supabase calls out of the auth callback's lock.
    setTimeout(() => { void loadSettings(ticket); }, 0);
  }
  function redirectUrl(recovery = false) {
    return `${location.origin}${location.pathname}${recovery ? '?recovery=1' : ''}`;
  }
  function authError(error) {
    if (error?.code === 'invalid_credentials') return 'Email or password is incorrect.';
    if (error?.code === 'email_not_confirmed') return 'Confirm your email using the link in your inbox, then sign in.';
    if (error?.code === 'weak_password') return 'Choose a stronger password with at least 12 characters.';
    if (error?.status === 429) return 'Too many attempts. Please wait a little and try again.';
    if (error?.code === 'same_password') return 'Choose a password different from your current one.';
    return 'We couldn’t complete that request. Check your connection and try again.';
  }
  $('googleSignIn').addEventListener('click', async () => {
    if (busy || !client || user || (mode !== 'login' && mode !== 'signup')) return;
    setBusy(true);
    status('Opening Google sign-in…');
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl(), queryParams: { prompt: 'select_account' } }
      });
      if (error) throw error;
    } catch (error) {
      status('Google sign-in is unavailable right now. Try again or sign in with email.', 'error');
      setBusy(false);
    }
  });
  // A browser Back navigation may restore the page with its buttons disabled.
  window.addEventListener('pageshow', event => {
    if (event.persisted && !user) { setBusy(false); status(''); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !client || !form.reportValidity()) return;
    const action = mode, email = $('authEmail').value.trim(), password = $('authPassword').value;
    if ((action === 'signup' || action === 'recovery') && password !== $('authConfirm').value) {
      status('Passwords do not match.', 'error'); return;
    }
    const startVersion = version;
    setBusy(true);
    status('Please wait…');
    try {
      if (action === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
        if (error) throw error;
        if (!data.session && startVersion === version) {
          showMode('login');
          status('Check your inbox for a confirmation link. If you already have an account, sign in or reset your password.', 'success');
        }
      } else if (action === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl(true) });
        if (error) throw error;
        if (startVersion === version) status('If an account exists for that email, you’ll receive a reset link. Check your inbox.', 'success');
      } else if (action === 'recovery') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        if (startVersion !== version) return;
        recovering = false;
        history.replaceState(null, '', location.pathname);
        await loadSettings(++version);
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      if (startVersion === version) status(authError(error), 'error');
    } finally {
      $('authPassword').value = '';
      $('authConfirm').value = '';
      setBusy(false);
    }
  });
  async function signOut() {
    if (!client || busy) return;
    setBusy(true);
    $('signOutBtn').disabled = true;
    $('authSignOut').disabled = true;
    lockDashboard();
    ++version;
    form.hidden = true;
    $('authLinks').hidden = true;
    status('Signing out…');
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      user = null;
      recovering = false;
      history.replaceState(null, '', location.pathname);
      ++version;
      $('authEmail').value = '';
      showMode('login');
      status('You are signed out.', 'success');
    } catch (error) {
      $('authTitle').textContent = 'Sign out didn’t finish';
      $('authDescription').textContent = 'Your dashboard is hidden. Please try signing out again.';
      $('authSignOut').hidden = false;
      status('Check your connection and try again.', 'error');
    } finally {
      setBusy(false);
      $('signOutBtn').disabled = false;
      $('authSignOut').disabled = false;
    }
  }
  $('authToggle').addEventListener('click', () => showMode(mode === 'login' ? 'signup' : 'login'));
  $('authForgot').addEventListener('click', () => showMode('reset'));
  $('signOutBtn').addEventListener('click', signOut);
  $('authSignOut').addEventListener('click', signOut);
  $('retrySettings').addEventListener('click', () => { void loadSettings(++version); });
  window.FinTrackAccount = Object.freeze({
    isReady: () => ready,
    async savePreferences(value) {
      if (!ready || !user) throw new Error('Sign in before saving preferences.');
      const ticket = version;
      const saved = await store.save(user.id, value);
      return ticket === version && ready ? saved : null;
    }
  });
  try {
    const config = window.FINTRACK_CONFIG || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      $('authTitle').textContent = 'Accounts are coming soon';
      $('authDescription').textContent = 'FinTrack’s account service is being connected.';
      status('Please check back once setup is complete.');
      return;
    }
    const url = new URL(config.supabaseUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')
      || !config.supabasePublishableKey.startsWith('sb_publishable_')) throw new Error('Invalid public configuration');
    client = window.supabase.createClient(url.origin, config.supabasePublishableKey, {
      global: { fetch: (input, init = {}) => fetch(input, {
        ...init, signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000)
      }) },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        storageKey: `fintrack-${url.hostname}-auth` }
    });
    store = createSettingsStore(client);
    client.auth.onAuthStateChange(onSession);
    // getSession surfaces initialization errors; INITIAL_SESSION drives the UI.
    client.auth.getSession().then(({ error }) => {
      if (error && !user) { showMode('login'); status('Your sign-in link or session expired. Sign in or request a new reset link.', 'error'); }
    }).catch(() => { showMode('login'); status('Couldn’t restore your session. Please sign in again.', 'error'); });
  } catch (error) {
    $('authTitle').textContent = 'Accounts are temporarily unavailable';
    $('authDescription').textContent = 'The account service could not start.';
    status('Please try again later.', 'error');
  }
})();
