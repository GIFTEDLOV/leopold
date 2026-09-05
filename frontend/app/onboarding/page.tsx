import type { Metadata } from "next";
import { LeopoldOnboardingRoute } from "@/components/onboarding/leopold-onboarding";
import styles from "../login/auth-page.module.css";

export const metadata: Metadata = {
  title: "How Leopold Works — Onboarding",
  description: "A short visual walkthrough of private prize savings with Leopold.",
};

export default function OnboardingPage() {
  return (
    <div className={styles.scope}>
      <LeopoldOnboardingRoute />
    </div>
  );
}
