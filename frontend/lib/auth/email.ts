const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class EmailValidationError extends Error {
  readonly code = "INVALID_EMAIL" as const;

  constructor(message = "Enter a valid email address.") {
    super(message);
    this.name = "EmailValidationError";
  }
}

export function normalizeEmail(value: string): string {
  const normalized = value.trim();
  if (!EMAIL_PATTERN.test(normalized)) throw new EmailValidationError();
  return normalized;
}

export function isValidEmail(value: string): boolean {
  try {
    normalizeEmail(value);
    return true;
  } catch {
    return false;
  }
}
