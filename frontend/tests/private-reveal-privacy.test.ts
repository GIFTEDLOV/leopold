// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrivateRevealAutoHide, PRIVATE_REVEAL_TIMEOUT_MS } from "../lib/leopold/private-reveal-privacy";

describe("private reveal browser lifecycle", () => {
  let hide: ReturnType<typeof vi.fn<() => void>>;
  let autoHide: ReturnType<typeof createPrivateRevealAutoHide>;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    hide = vi.fn<() => void>();
    autoHide = createPrivateRevealAutoHide(hide);
  });

  afterEach(() => {
    autoHide.dispose();
    vi.useRealTimers();
  });

  it("keeps a revealed value available until the 60-second expiry, then clears it", () => {
    let plaintext: bigint | null = null;
    hide.mockImplementation(() => {
      plaintext = null;
    });

    plaintext = 131_544_000_000n;
    autoHide.arm();
    vi.advanceTimersByTime(PRIVATE_REVEAL_TIMEOUT_MS - 1);
    expect(plaintext).toBe(131_544_000_000n);

    vi.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledOnce();
    expect(plaintext).toBeNull();
  });

  it("clears a revealed value when the tab becomes hidden", () => {
    autoHide.arm();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(hide).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a revealed value when the browser window loses focus", () => {
    autoHide.arm();
    window.dispatchEvent(new Event("blur"));

    expect(hide).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports an account/session clear followed by a fresh reveal", () => {
    autoHide.arm();
    autoHide.hide();
    expect(hide).toHaveBeenCalledOnce();

    hide.mockClear();
    autoHide.arm();
    vi.advanceTimersByTime(PRIVATE_REVEAL_TIMEOUT_MS);
    expect(hide).toHaveBeenCalledOnce();
  });

  it("does not retain lifecycle listeners after disposal", () => {
    autoHide.dispose();
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(hide).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
