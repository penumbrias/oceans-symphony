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

export const getLocalUser = () => {
  try { return JSON.parse(localStorage.getItem(KEYS.localUser) || 'null'); } catch { return null; }
};
export const setLocalUser = (user) => localStorage.setItem(KEYS.localUser, JSON.stringify(user));
