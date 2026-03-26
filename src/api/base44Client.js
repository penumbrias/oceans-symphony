import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isLocalMode } from '@/lib/storageMode';
import { createLocalDbEntities, createLocalAuth } from '@/lib/localDb';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const cloudClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Smart proxy: routes to local or cloud depending on storage mode
const localEntities = createLocalDbEntities();
const localAuth = createLocalAuth();

export const base44 = new Proxy(cloudClient, {
  get(target, prop) {
    if (isLocalMode()) {
      if (prop === 'entities') return localEntities;
      if (prop === 'auth') return localAuth;
      if (prop === 'integrations') return target.integrations; // integrations still work via cloud
      if (prop === 'functions') return target.functions;
    }
    return target[prop];
  }
});