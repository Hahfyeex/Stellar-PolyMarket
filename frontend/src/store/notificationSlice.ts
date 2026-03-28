/**
 * notificationSlice.ts
 *
 * Redux slice for the in-app notification inbox.
 *
 * Notification types:
 *   MARKET_RESOLVED    — a market the user bet on has been resolved
 *   PAYOUT_AVAILABLE   — winnings are ready to claim
 *   MARKET_ENDING_SOON — a market closes within 1 hour
 *   DISPUTE_OPENED     — a dispute has been opened on a market
 *
 * State is persisted to localStorage so unread counts survive page refresh.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type NotificationType = "MARKET_RESOLVED" | "PAYOUT_AVAILABLE" | "MARKET_ENDING_SOON" | "DISPUTE_OPENED";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  /** false = unread (shows blue dot); true = dismissed */
  read: boolean;
  timestamp: string; // ISO 8601
}

export interface NotificationState {
  items: Notification[];
}

const STORAGE_KEY = "stella_notifications";

function loadFromStorage(): Notification[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Notification[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: Notification[]): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

const initialState: NotificationState = {
  items: loadFromStorage(),
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    /**
     * Add a new notification to the top of the list.
     * Duplicate IDs are ignored to prevent double-delivery from polling.
     */
    addNotification(state, action: PayloadAction<Notification>) {
      const exists = state.items.some((n) => n.id === action.payload.id);
      if (!exists) {
        state.items.unshift(action.payload);
        saveToStorage(state.items);
      }
    },

    /**
     * Mark a single notification as read by ID.
     * Triggered when the user clicks an item in the dropdown.
     */
    markRead(state, action: PayloadAction<string>) {
      const item = state.items.find((n) => n.id === action.payload);
      if (item) {
        item.read = true;
        saveToStorage(state.items);
      }
    },

    /**
     * Clear all notifications and reset unread count to 0.
     * Dispatched by the "Clear All" button in the inbox.
     */
    clearAllNotifications(state) {
      state.items = [];
      saveToStorage(state.items);
    },
  },
});

export const { addNotification, markRead, clearAllNotifications } = notificationSlice.actions;
export default notificationSlice.reducer;
