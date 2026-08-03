/**
 * Validation helpers for app PATCH requests.
 * Extracted for testability without spinning Next server.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

/**
 * Validates assistedAuthoringMode field from PATCH body.
 * Returns 400 if present but not boolean; omits if absent.
 */
export function validateAssistedAuthoringMode(
  body: Record<string, unknown>
): ValidationResult<boolean | undefined> {
  if (!("assistedAuthoringMode" in body)) {
    return { ok: true, value: undefined };
  }

  const value = body.assistedAuthoringMode;
  if (typeof value !== "boolean") {
    return {
      ok: false,
      error: "assistedAuthoringMode must be a boolean",
      status: 400,
    };
  }

  return { ok: true, value };
}

/**
 * Creates default AppConfig fields for new bot creation.
 */
export function createDefaultBotFields(): {
  assistedAuthoringMode: false;
} {
  return {
    assistedAuthoringMode: false,
  };
}
