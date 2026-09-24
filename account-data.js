(() => {
  'use strict';
  let store, owner = null, revision = 0, generation = 0, changes = 0, saved = 0;
  let timer = null, pending = null;
  const message = (text, failed = false) => {
    document.getElementById('dataStatus').textContent = text;
    document.getElementById('dataStatus').className = `status ${failed ? 'error' : ''}`;
    document.getElementById('retryData').hidden = !failed;
    const transactionStatus = document.getElementById('transactionStatus');
    transactionStatus.textContent = text;
    transactionStatus.className = `status ${failed ? 'error' : ''}`;
    const button = document.getElementById('addTransactionBtn');
    const saving = text === 'Saving…';
    button.disabled = saving;
    button.textContent = saving ? 'Saving…' : 'Add';
    button.setAttribute('aria-busy', String(saving));
  };
  function clear() {
    ++generation; owner = null; revision = 0; changes = 0; saved = 0; pending = null;
    clearTimeout(timer); timer = null; message('');
  }
  async function load(userId) {
    clear();
    const ticket = generation;
    const result = await store.load(userId);
    if (ticket !== generation) return;
    revision = result.revision;
    applyAccountState(result.state);
    owner = userId;
    message('All changes saved');
  }
  function changed() {
    if (!owner) return;
    ++changes;
    message('Unsaved changes…');
    clearTimeout(timer);
    timer = setTimeout(() => { void flush().catch(() => {}); }, 400);
  }
  async function flush() {
    clearTimeout(timer); timer = null;
    if (pending) return pending;
    if (!owner || saved === changes) return;
    const ticket = generation, userId = owner;
    pending = Promise.resolve().then(async () => {
      try {
        while (ticket === generation && saved !== changes) {
          const target = changes;
          const state = FinTrackState.validate(captureAccountState());
          message('Saving…');
          const nextRevision = await store.save(userId, state, revision);
          if (ticket !== generation) return;
          revision = nextRevision; saved = target;
        }
        if (ticket === generation) message('All changes saved');
      } catch (error) {
        if (ticket === generation) message(error.message, true);
        throw error;
      } finally {
        if (ticket === generation) pending = null;
      }
    });
    return pending;
  }
  window.FinTrackData = { connect: client => { store = FinTrackState.createStore(client); }, load, clear, changed, flush,
    isDirty: () => saved !== changes };
  document.getElementById('retryData').addEventListener('click', () => { void flush().catch(() => {}); });
  window.addEventListener('beforeunload', event => {
    if (saved !== changes) { event.preventDefault(); event.returnValue = ''; }
  });
})();
