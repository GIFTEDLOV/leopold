import { OnboardingClient } from "@/components/auth-flow";
import styles from "../login/auth-page.module.css";

export default function OnboardingPage() {
  return (
    <div className={styles.scope}>
      <OnboardingClient />
    </div>
  );
}
