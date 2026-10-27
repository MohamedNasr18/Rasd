import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import uiReducer from './slices/uiSlice';
import chatReducer from './slices/chatSlice';

export const makeStore = () =>
  configureStore({
    reducer: {
  [api.reducerPath]: api.reducer,
  ui: uiReducer,
  chat: chatReducer,
},
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];