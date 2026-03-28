import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../useOnlineStatus";

describe("useOnlineStatus", () => {
  const fireEvent = (type: "online" | "offline") => {
    act(() => {
      window.dispatchEvent(new Event(type));
    });
  };

  beforeEach(() => {
    // Default: online
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  it("returns true when navigator.onLine is true", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("updates to false on offline event", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    fireEvent("offline");
    expect(result.current).toBe(false);
  });

  it("updates to true on online event after going offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
    fireEvent("online");
    expect(result.current).toBe(true);
  });

  it("removes event listeners on unmount", () => {
    const removeSpy = jest.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("handles multiple online/offline transitions", () => {
    const { result } = renderHook(() => useOnlineStatus());
    fireEvent("offline");
    expect(result.current).toBe(false);
    fireEvent("online");
    expect(result.current).toBe(true);
    fireEvent("offline");
    expect(result.current).toBe(false);
  });
});
