export type OnboardingAuthSnapshot = {
  loading: boolean;
  authenticated: boolean;
};

export function onboardingSurface(auth: OnboardingAuthSnapshot): "authenticated" | "walkthrough" {
  return auth.authenticated ? "authenticated" : "walkthrough";
}
