"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EXPERIENCE_STORAGE_KEY,
  persistExperience,
  readStoredExperience,
  type AppExperience,
} from "@/lib/ui/experience";

type ExperienceContextValue = {
  experience: AppExperience;
  hydrated: boolean;
  setExperience(experience: AppExperience): void;
};

const fallbackExperience: ExperienceContextValue = {
  experience: "v2",
  hydrated: false,
  setExperience: () => undefined,
};

const ExperienceContext = createContext<ExperienceContextValue>(fallbackExperience);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [experience, setExperienceState] = useState<AppExperience>("v2");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setExperienceState(readStoredExperience(window.localStorage));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (hydrated && experience === "v1" && pathname === "/app") router.replace("/app/classic");
  }, [experience, hydrated, pathname, router]);

  const setExperience = useCallback((next: AppExperience) => {
    setExperienceState(next);
    persistExperience(window.localStorage, next);
  }, []);

  const value = useMemo(
    () => ({ experience, hydrated, setExperience }),
    [experience, hydrated, setExperience],
  );

  if (!hydrated) {
    return (
      <div className="experience-hydration-gate" role="status" aria-live="polite">
        Loading your Leopold experience…
      </div>
    );
  }

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  return useContext(ExperienceContext);
}

export { EXPERIENCE_STORAGE_KEY };
