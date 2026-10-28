'use client';

import { useSyncExternalStore } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';

let browserStore: AppStore | null = null;

function getBrowserStore(): AppStore {
  browserStore ??= makeStore();
  return browserStore;
}

const emptySubscribe = () => () => {};

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!hydrated) return <div>Loading...</div>;

  return <Provider store={getBrowserStore()}>{children}</Provider>;
}
