import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// All data reads hit IndexedDB — run regardless of network status
			networkMode: 'always',
		},
		mutations: {
			// All data writes hit IndexedDB — never gate on navigator.onLine
			networkMode: 'always',
		},
	},
});