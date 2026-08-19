import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// The "server" is the in-memory DB: data can only change through
			// our own writes, and every write path invalidates its key. With
			// the default staleTime of 0, EVERY remount re-ran list() — an
			// Object.values + full sort of the whole collection — on the main
			// thread, per consumer, per navigation. For a user with thousands
			// of journal entries / sessions that was a visible hitch on every
			// page change for data that could not have changed. Fresh for
			// 30s; invalidation still refetches immediately.
			staleTime: 30_000,
			gcTime: 5 * 60_000,
			// All data reads hit IndexedDB — run regardless of network status
			networkMode: 'always',
		},
		mutations: {
			// All data writes hit IndexedDB — never gate on navigator.onLine
			networkMode: 'always',
		},
	},
});