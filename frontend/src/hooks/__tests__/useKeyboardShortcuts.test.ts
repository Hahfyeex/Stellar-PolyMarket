/**
 * Tests for useKeyboardShortcuts — Issue #484
 * Covers: each shortcut trigger, input field guard, cleanup on unmount.
 */
import { renderHook } from "@testing-library/react";
import { act } from "@testing-library/react";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

function fire(key: string, target?: EventTarget) {
  act(() => {
    (target ?? document).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true })
    );
  });
}

function setActiveTag(tag: string, contentEditable = false) {
  const el = document.createElement(tag);
  if (contentEditable) el.setAttribute("contenteditable", "true");
  document.body.appendChild(el);
  el.focus();
  return el;
}

function clearFocus() {
  (document.activeElement as HTMLElement)?.blur?.();
}

afterEach(() => {
  clearFocus();
  // remove any appended elements
  document.body.innerHTML = "";
});

describe("useKeyboardShortcuts — shortcut triggers", () => {
  it("calls onOpenBetForm when B is pressed", () => {
    const onOpenBetForm = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenBetForm }));
    fire("b");
    expect(onOpenBetForm).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenBetForm when uppercase B is pressed", () => {
    const onOpenBetForm = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenBetForm }));
    fire("B");
    expect(onOpenBetForm).toHaveBeenCalledTimes(1);
  });

  it("calls onFocusSearch when / is pressed", () => {
    const onFocusSearch = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onFocusSearch }));
    fire("/");
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
  });

  it("calls onCloseModal when Escape is pressed", () => {
    const onCloseModal = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onCloseModal }));
    fire("Escape");
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenHelp when ? is pressed", () => {
    const onOpenHelp = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenHelp }));
    fire("?");
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("does not throw when handler is not provided", () => {
    renderHook(() => useKeyboardShortcuts({}));
    expect(() => fire("b")).not.toThrow();
    expect(() => fire("/")).not.toThrow();
    expect(() => fire("Escape")).not.toThrow();
    expect(() => fire("?")).not.toThrow();
  });
});

describe("useKeyboardShortcuts — input field guard", () => {
  it("does NOT fire when focus is on an INPUT", () => {
    const onOpenBetForm = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenBetForm }));
    setActiveTag("input");
    fire("b");
    expect(onOpenBetForm).not.toHaveBeenCalled();
  });

  it("does NOT fire when focus is on a TEXTAREA", () => {
    const onFocusSearch = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onFocusSearch }));
    setActiveTag("textarea");
    fire("/");
    expect(onFocusSearch).not.toHaveBeenCalled();
  });

  it("does NOT fire when focus is on a SELECT", () => {
    const onCloseModal = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onCloseModal }));
    setActiveTag("select");
    fire("Escape");
    expect(onCloseModal).not.toHaveBeenCalled();
  });

  it("does NOT fire when focus is on a contenteditable element", () => {
    const onOpenHelp = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenHelp }));
    setActiveTag("div", true);
    fire("?");
    expect(onOpenHelp).not.toHaveBeenCalled();
  });

  it("DOES fire after focus leaves an input", () => {
    const onOpenBetForm = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onOpenBetForm }));
    const input = setActiveTag("input");
    fire("b");
    expect(onOpenBetForm).not.toHaveBeenCalled();
    input.blur();
    fire("b");
    expect(onOpenBetForm).toHaveBeenCalledTimes(1);
  });
});

describe("useKeyboardShortcuts — cleanup on unmount", () => {
  it("removes the keydown listener on unmount", () => {
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useKeyboardShortcuts({}));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("does NOT call handlers after unmount", () => {
    const onOpenBetForm = jest.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onOpenBetForm }));
    unmount();
    fire("b");
    expect(onOpenBetForm).not.toHaveBeenCalled();
  });
});
