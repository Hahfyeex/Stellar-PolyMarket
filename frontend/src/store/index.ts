/**
 * Redux store
 * Configured with @reduxjs/toolkit.
 * Visible in Redux DevTools browser extension.
 */
import { configureStore } from "@reduxjs/toolkit";
import contractErrorReducer from "./contractErrorSlice";

export const store = configureStore({
  reducer: {
    contractError: contractErrorReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
