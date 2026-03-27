"use client";
/**
 * ReduxProvider
 * Client component that wraps the app with the Redux store.
 * Kept separate so layout.tsx stays a server component.
 */
import { Provider } from "react-redux";
import { store } from "../store";

export default function ReduxProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
