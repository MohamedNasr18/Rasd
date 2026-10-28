'use client';

import { useSyncExternalStore } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';

// Created once on the client so switching locale (which remounts the [lang]
// layout) reuses the same store and its cached queries instead of losing them.
let browserStore: AppStore | null = null;

function getBrowserStore(): AppStore {
  browserStore ??= makeStore();
  return browserStore;
}

const emptySubscribe = () => () => {};

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  // false on the server, true after hydration: keeps the store client-only.
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!hydrated) return <div>Loading...</div>;

  return <Provider store={getBrowserStore()}>{children}</Provider>;
}
