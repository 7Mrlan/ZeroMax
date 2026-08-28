import {configureStore} from '@reduxjs/toolkit';
import {persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER} from 'redux-persist';
import rootReducer from './rootReducer';
import mmkvStorage from './mmkvStorage';

// Hybrid persistence strategy:
// - redux-persist (MMKV-backed): nothing today. monthSelection USED to be
//   whitelisted, but rehydrating it meant the app opened on whatever month
//   the user last viewed — weeks-old sometimes. The slice's initial state is
//   the device's current month, so an empty whitelist gives every cold start
//   today's month while in-session navigation still works normally.
// - Sync MMKV via StorageService: isOnboarded, weekStartDay — read at init
// - ThemeContext + MMKV: theme preference — managed outside Redux entirely
// - WatermelonDB: all domain data (expenses, categories, etc.) — source of truth
const persistConfig = {
  key: 'root',
  storage: mmkvStorage,
  whitelist: [] as string[],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  enhancers: getDefaultEnhancers =>
    getDefaultEnhancers({
      autoBatch: {type: 'tick'},
    }),
});

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;

export default store;
