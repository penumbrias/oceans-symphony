// Local-first client — no cloud, no base44 SDK.
// All data lives in the browser's IndexedDB.

import { createLocalDbEntities, createLocalAuth } from '@/lib/localDb';

export const localEntities = createLocalDbEntities();
const localAuth = createLocalAuth();

const localFunctions = {
  invoke: async (name, _args) => {
    // Cloud functions are not available in local mode.
    // Callers that need local equivalents handle it themselves.
    throw new Error(`Cloud function "${name}" is not available in local-first mode.`);
  },
};

const localIntegrations = {
  Core: {
    UploadFile: async () => {
      throw new Error('Cloud file upload is not available in local-first mode.');
    },
  },
};

export const base44 = {
  entities: localEntities,
  auth: localAuth,
  functions: localFunctions,
  integrations: localIntegrations,
};
