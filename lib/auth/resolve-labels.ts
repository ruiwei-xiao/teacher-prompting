import { userDisplayLabel } from "./user-label";
import { getUsersByIds } from "./user-store";

/** Resolve stored name/email for each id. Unknown ids keep the raw id. */
export async function resolveUserLabels(
  userIds: Iterable<string>
): Promise<Record<string, string>> {
  const unique = [
    ...new Set(
      [...userIds]
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    ),
  ];
  const users = await getUsersByIds(unique);
  const labels: Record<string, string> = {};
  for (const userId of unique) {
    const user = users.get(userId);
    labels[userId] = userDisplayLabel({
      userId,
      name: user?.name,
      email: user?.email,
    });
  }
  return labels;
}
