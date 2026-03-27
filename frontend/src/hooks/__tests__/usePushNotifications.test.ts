/**
 * Tests for usePushNotifications hook
 * Covers FCM token registration and preference logic.
 */
import { renderHook, act } from "@testing-library/react";
import { usePushNotifications } from "../../hooks/usePushNotifications";

const mockGetToken = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn());

jest.mock("../../lib/firebase", () => ({
  messaging: {},
  getToken: (...args: unknown[]) => mockGetToken(...args),
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Notification API
const mockRequestPermission = jest.fn();
Object.defineProperty(global, "Notification", {
  value: { permission: "default", requestPermission: mockRequestPermission },
  writable: true,
  configurable: true,
});

describe("usePushNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockOnMessage.mockReturnValue(jest.fn());
  });

  it("initialises with default preferences", () => {
    const { result } = renderHook(() => usePushNotifications("GTEST123"));
    expect(result.current.preferences).toEqual({
      market_resolved: true,
      payout_available: true,
      market_ending_soon: true,
    });
  });

  it("requests permission and registers FCM token", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockGetToken.mockResolvedValue("fcm-token-abc");
    Object.defineProperty(global.Notification, "permission", { value: "granted", writable: true });

    const { result } = renderHook(() => usePushNotifications("GWALLET1"));
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockGetToken).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/notifications/register"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.fcmToken).toBe("fcm-token-abc");
  });

  it("does not register token when wallet is null", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockGetToken.mockResolvedValue("fcm-token-xyz");

    const { result } = renderHook(() => usePushNotifications(null));
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("updatePreference persists to localStorage and calls backend", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    mockGetToken.mockResolvedValue("fcm-token-def");
    Object.defineProperty(global.Notification, "permission", { value: "granted", writable: true });

    const { result } = renderHook(() => usePushNotifications("GWALLET2"));
    await act(async () => {
      await result.current.requestPermission();
    });

    await act(async () => {
      await result.current.updatePreference("market_resolved", false);
    });

    expect(result.current.preferences.market_resolved).toBe(false);
    const stored = JSON.parse(localStorage.getItem("stella_notif_prefs") ?? "{}");
    expect(stored.market_resolved).toBe(false);
  });

  it("loads saved preferences from localStorage", () => {
    localStorage.setItem(
      "stella_notif_prefs",
      JSON.stringify({ market_resolved: false, payout_available: true, market_ending_soon: false })
    );
    const { result } = renderHook(() => usePushNotifications("GWALLET3"));
    expect(result.current.preferences.market_resolved).toBe(false);
    expect(result.current.preferences.market_ending_soon).toBe(false);
  });
});
