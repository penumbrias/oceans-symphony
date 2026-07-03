// Storage mode — always local-first.
// Cloud mode has been removed; all data lives in the browser's IndexedDB.

const KEYS = {
  mode: 'symphony_storage_mode',
  encEnabled: 'symphony_enc_enabled',
  encSalt: 'symphony_enc_salt',
  localUser: 'symphony_local_user',
};

export const isFirstRun = () => !localStorage.getItem(KEYS.mode);

export const getMode = () => 'local';
export const isLocalMode = () => true;
export const setMode = () => localStorage.setItem(KEYS.mode, 'local');

export const isEncryptionEnabled = () => localStorage.getItem(KEYS.encEnabled) === 'true';
export const setEncryptionEnabled = (v) => localStorage.setItem(KEYS.encEnabled, v ? 'true' : 'false');

export const getEncSalt = () => localStorage.getItem(KEYS.encSalt);
export const setEncSalt = (salt) => localStorage.setItem(KEYS.encSalt, salt);

// Session-held encryption password. With multi-system + "one password for the
// whole app", switching systems reloads the page (clearing the in-memory key),
// so we stash the password in sessionStorage for the life of the app session.
// Boot auto-unlocks the next system from it, so you only enter the password
// once. sessionStorage is wiped when the app/process is killed (cold launch
// re-prompts) and is cleared on lock/logout — so at-rest protection holds.
const SESSION_PW_KEY = 'symphony_session_pw';
export const getSessionPassword = () => {
  try { return sessionStorage.getItem(SESSION_PW_KEY) || null; } catch { return null; }
};
export const setSessionPassword = (pw) => {
  try { if (pw) sessionStorage.setItem(SESSION_PW_KEY, pw); } catch { /* storage off */ }
};
export const clearSessionPassword = () => {
  try { sessionStorage.removeItem(SESSION_PW_KEY); } catch { /* ignore */ }
};

export const getLocalUser = () => {
  try { return JSON.parse(localStorage.getItem(KEYS.localUser) || 'null'); } catch { return null; }
};
export const setLocalUser = (user) => localStorage.setItem(KEYS.localUser, JSON.stringify(user));
