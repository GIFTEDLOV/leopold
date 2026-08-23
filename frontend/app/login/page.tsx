import { LoginClient } from "@/components/auth-flow";
import styles from "./auth-page.module.css";

export default function LoginPage() {
  return (
    <div className={styles.scope}>
      <LoginClient />
    </div>
  );
}
