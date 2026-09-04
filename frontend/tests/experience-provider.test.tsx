// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => navigation,
}));

import { ExperienceProvider } from "../components/experience-provider";
import { EXPERIENCE_STORAGE_KEY } from "../lib/ui/experience";

describe("ExperienceProvider hydration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigation.replace.mockClear();
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("releases the hydration gate and renders the default V2 experience", async () => {
    await act(async () => {
      root.render(
        <ExperienceProvider>
          <div>V2 application ready</div>
        </ExperienceProvider>,
      );
    });

    expect(container.textContent).toContain("Loading your Leopold experience");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });

    expect(container.textContent).toContain("V2 application ready");
    expect(container.textContent).not.toContain("Loading your Leopold experience");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("hydrates a stored Classic preference and redirects only the shared V2 home", async () => {
    window.localStorage.setItem(EXPERIENCE_STORAGE_KEY, "v1");

    await act(async () => {
      root.render(
        <ExperienceProvider>
          <div>Classic application ready</div>
        </ExperienceProvider>,
      );
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });

    expect(container.textContent).toContain("Classic application ready");
    expect(navigation.replace).toHaveBeenCalledWith("/app/classic");
  });
});
