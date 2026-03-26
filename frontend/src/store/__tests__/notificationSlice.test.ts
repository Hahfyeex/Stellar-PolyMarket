/**
 * Tests for notificationSlice
 * Target: >90% coverage of reducer logic and state transitions
 */
import notificationReducer, {
  addNotification,
  markRead,
  clearAllNotifications,
  Notification,
  NotificationState,
} from "../../store/notificationSlice";

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: "n1",
  type: "MARKET_RESOLVED",
  message: "Market resolved: Yes wins",
  read: false,
  timestamp: "2026-03-26T12:00:00.000Z",
  ...overrides,
});

const emptyState: NotificationState = { items: [] };

// ── addNotification ───────────────────────────────────────────────────────────

describe("addNotification", () => {
  it("adds a notification to an empty list", () => {
    const n = makeNotification();
    const state = notificationReducer(emptyState, addNotification(n));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toEqual(n);
  });

  it("prepends new notifications (most recent first)", () => {
    const n1 = makeNotification({ id: "n1" });
    const n2 = makeNotification({ id: "n2", message: "Payout ready" });
    let state = notificationReducer(emptyState, addNotification(n1));
    state = notificationReducer(state, addNotification(n2));
    expect(state.items[0].id).toBe("n2");
    expect(state.items[1].id).toBe("n1");
  });

  it("ignores duplicate IDs (deduplication)", () => {
    const n = makeNotification();
    let state = notificationReducer(emptyState, addNotification(n));
    state = notificationReducer(state, addNotification(n));
    expect(state.items).toHaveLength(1);
  });

  it("handles all three notification types", () => {
    const types = ["MARKET_RESOLVED", "PAYOUT_AVAILABLE", "MARKET_ENDING_SOON"] as const;
    let state = emptyState;
    types.forEach((type, i) => {
      state = notificationReducer(state, addNotification(makeNotification({ id: `n${i}`, type })));
    });
    expect(state.items.map((n) => n.type)).toEqual([...types].reverse());
  });

  it("new notifications default to unread", () => {
    const state = notificationReducer(emptyState, addNotification(makeNotification()));
    expect(state.items[0].read).toBe(false);
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe("markRead", () => {
  it("marks a notification as read by ID", () => {
    const n = makeNotification({ id: "n1", read: false });
    let state = notificationReducer(emptyState, addNotification(n));
    state = notificationReducer(state, markRead("n1"));
    expect(state.items[0].read).toBe(true);
  });

  it("does not affect other notifications", () => {
    const n1 = makeNotification({ id: "n1" });
    const n2 = makeNotification({ id: "n2" });
    let state = notificationReducer(emptyState, addNotification(n1));
    state = notificationReducer(state, addNotification(n2));
    state = notificationReducer(state, markRead("n1"));
    expect(state.items.find((n) => n.id === "n2")?.read).toBe(false);
  });

  it("is a no-op for unknown IDs", () => {
    const n = makeNotification({ id: "n1" });
    let state = notificationReducer(emptyState, addNotification(n));
    state = notificationReducer(state, markRead("unknown"));
    expect(state.items[0].read).toBe(false);
  });

  it("is idempotent — marking already-read item stays read", () => {
    const n = makeNotification({ id: "n1", read: true });
    let state = notificationReducer(emptyState, addNotification(n));
    state = notificationReducer(state, markRead("n1"));
    expect(state.items[0].read).toBe(true);
  });
});

// ── clearAllNotifications ─────────────────────────────────────────────────────

describe("clearAllNotifications", () => {
  it("removes all notifications", () => {
    let state = notificationReducer(emptyState, addNotification(makeNotification({ id: "n1" })));
    state = notificationReducer(state, addNotification(makeNotification({ id: "n2" })));
    state = notificationReducer(state, clearAllNotifications());
    expect(state.items).toHaveLength(0);
  });

  it("is a no-op on an already empty list", () => {
    const state = notificationReducer(emptyState, clearAllNotifications());
    expect(state.items).toHaveLength(0);
  });

  it("resets unread count to 0", () => {
    let state = notificationReducer(emptyState, addNotification(makeNotification({ id: "n1" })));
    state = notificationReducer(state, addNotification(makeNotification({ id: "n2" })));
    state = notificationReducer(state, clearAllNotifications());
    const unread = state.items.filter((n) => !n.read).length;
    expect(unread).toBe(0);
  });
});

// ── unread count selector logic ───────────────────────────────────────────────

describe("unread count", () => {
  it("counts only unread items", () => {
    let state = notificationReducer(emptyState, addNotification(makeNotification({ id: "n1" })));
    state = notificationReducer(state, addNotification(makeNotification({ id: "n2" })));
    state = notificationReducer(state, markRead("n1"));
    const unread = state.items.filter((n) => !n.read).length;
    expect(unread).toBe(1);
  });

  it("is 0 when all items are read", () => {
    let state = notificationReducer(emptyState, addNotification(makeNotification({ id: "n1" })));
    state = notificationReducer(state, markRead("n1"));
    expect(state.items.filter((n) => !n.read).length).toBe(0);
  });
});
