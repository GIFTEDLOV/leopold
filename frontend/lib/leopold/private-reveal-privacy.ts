export const PRIVATE_REVEAL_TIMEOUT_MS = 60_000;

type RevealWindow = {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
  addEventListener(type: "blur", listener: () => void): void;
  removeEventListener(type: "blur", listener: () => void): void;
};

type RevealDocument = {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type PrivateRevealAutoHide = {
  arm(): void;
  hide(): void;
  cancel(): void;
  dispose(): void;
};

/**
 * Owns only browser lifecycle events for provider-held decrypted values. The
 * provider remains responsible for clearing its plaintext state.
 */
export function createPrivateRevealAutoHide(
  onHide: () => void,
  targets: { window?: RevealWindow; document?: RevealDocument } = {},
): PrivateRevealAutoHide {
  const revealWindow = targets.window ?? window;
  const revealDocument = targets.document ?? document;
  let timeoutHandle: number | null = null;

  const cancel = () => {
    if (timeoutHandle !== null) {
      revealWindow.clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const hide = () => {
    cancel();
    onHide();
  };

  const onBlur = () => hide();
  const onVisibilityChange = () => {
    if (revealDocument.visibilityState === "hidden") hide();
  };

  revealWindow.addEventListener("blur", onBlur);
  revealDocument.addEventListener("visibilitychange", onVisibilityChange);

  return {
    arm: () => {
      cancel();
      timeoutHandle = revealWindow.setTimeout(hide, PRIVATE_REVEAL_TIMEOUT_MS);
    },
    hide,
    cancel,
    dispose: () => {
      cancel();
      revealWindow.removeEventListener("blur", onBlur);
      revealDocument.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
