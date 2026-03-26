// Storage mode management — persisted in localStorage
// mode: 'cloud' | 'local' | null (first run)

const KEYS = {
  mode: 'symphony_storage_mode',
  encEnabled: 'symphony_enc_enabled',
  encSalt: 'symphony_enc_salt',
  localUser: 'symphony_local_user',
};

export const isFirstRun = () => !localStorage.getItem(KEYS.mode);
export const getMode = () => localStorage.getItem(KEYS.mode);
export const isLocalMode = () => getMode() === 'local';
export const setMode = (mode) => localStorage.setItem(KEYS.mode, mode);

export const isEncryptionEnabled = () => localStorage.getItem(KEYS.encEnabled) === 'true';
export const setEncryptionEnabled = (v) => localStorage.setItem(KEYS.encEnabled, v ? 'true' : 'false');

export const getEncSalt = () => localStorage.getItem(KEYS.encSalt);
export const setEncSalt = (salt) => localStorage.setItem(KEYS.encSalt, salt);

export const getLocalUser = () => {
  try { return JSON.parse(localStorage.getItem(KEYS.localUser) || 'null'); } catch { return null; }
};
export const setLocalUser = (user) => localStorage.setItem(KEYS.localUser, JSON.stringify(user));