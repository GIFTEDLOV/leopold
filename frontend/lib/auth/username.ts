const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export class UsernameValidationError extends Error {
  readonly code = "INVALID_USERNAME" as const;

  constructor(message = "Use 3–20 lowercase letters, numbers, or underscores.") {
    super(message);
    this.name = "UsernameValidationError";
  }
}

export function canonicalizeUsername(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) throw new UsernameValidationError();
  return normalized;
}

export function isValidUsername(value: string): boolean {
  try {
    canonicalizeUsername(value);
    return true;
  } catch {
    return false;
  }
}

export function usernameValidationMessage(value: string): string | null {
  try {
    canonicalizeUsername(value);
    return null;
  } catch (error) {
    return error instanceof UsernameValidationError ? error.message : "Choose a valid username.";
  }
}
