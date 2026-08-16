/**
 * Client-safe person labels. Prefer name, then email, then the stored user id.
 */
export function userDisplayLabel(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
}): string {
  const name = input.name?.trim();
  if (name) return name;
  const email = input.email?.trim();
  if (email) return email;
  return input.userId;
}

export function labelForUserId(
  userId: string,
  labels: Record<string, string> = {}
): string {
  const mapped = labels[userId]?.trim();
  return mapped || userId;
}

export function readUserLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const labels: Record<string, string> = {};
  for (const [userId, label] of Object.entries(value as Record<string, unknown>)) {
    if (!userId.trim() || typeof label !== "string" || !label.trim()) continue;
    labels[userId] = label.trim();
  }
  return labels;
}
