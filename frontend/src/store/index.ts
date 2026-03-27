/**
 * Redux store
 * Configured with @reduxjs/toolkit.
 * Visible in Redux DevTools browser extension.
 */
import { configureStore } from "@reduxjs/toolkit";
import contractErrorReducer from "./contractErrorSlice";
import notificationReducer from "./notificationSlice";

export const store = configureStore({
  reducer: {
    contractError: contractErrorReducer,
    notifications: notificationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
