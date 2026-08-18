import { userDisplayLabel } from "./user-label";
import {
  getDisplayProfiles,
  getUsersByIds,
  rememberDisplayProfile,
  type DisplayProfile,
} from "./user-store";

export type PersonOverlay = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type PersonRecord = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type ResolvedPeople = {
  labels: Record<string, string>;
  avatars: Record<string, string>;
};

export function personOverlayFromUser(
  user?: PersonOverlay | null
): PersonOverlay | undefined {
  if (!user) return undefined;
  const name = user.name?.trim() || null;
  const email = user.email?.trim() || null;
  const image = user.image?.trim() || null;
  if (!name && !email && !image) return undefined;
  return { name, email, image };
}

function uniqueUserIds(userIds: Iterable<string>): string[] {
  return [
    ...new Set(
      [...userIds]
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    ),
  ];
}

/**
 * Prefer a person's name. Email is only a fallback when no name exists.
 * Duplicate names stay as names — they are not replaced with email.
 */
export function mergePersonLabels(
  userIds: Iterable<string>,
  users: { get(userId: string): PersonRecord | undefined },
  extras: {
    profiles?: { get(userId: string): PersonRecord | DisplayProfile | undefined };
    overlays?: Record<string, PersonOverlay>;
  } = {}
): ResolvedPeople {
  const unique = uniqueUserIds(userIds);
  const labels: Record<string, string> = {};
  const avatars: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const userId of unique) {
    const overlay = extras.overlays?.[userId];
    const user = users.get(userId);
    const profile = extras.profiles?.get(userId);
    const name =
      overlay?.name?.trim() ||
      user?.name?.trim() ||
      profile?.name?.trim() ||
      "";
    const email = overlay?.email?.trim() || user?.email?.trim() || "";
    const image =
      overlay?.image?.trim() ||
      user?.image?.trim() ||
      profile?.image?.trim() ||
      "";
    const label = userDisplayLabel({
      userId,
      name: name || null,
      email: email || null,
    });
    if (image) avatars[userId] = image;
    if (label === userId && !name && !email) {
      unresolved.push(userId);
      continue;
    }
    labels[userId] = label;
  }

  unresolved.forEach((userId, index) => {
    labels[userId] =
      unresolved.length === 1 ? "Teammate" : `Teammate ${index + 1}`;
  });

  return { labels, avatars };
}

export async function resolveUserPeople(
  userIds: Iterable<string>,
  overlays?: Record<string, PersonOverlay>
): Promise<ResolvedPeople> {
  const unique = uniqueUserIds(userIds);
  const [users, profiles] = await Promise.all([
    getUsersByIds(unique),
    getDisplayProfiles(unique),
  ]);
  return mergePersonLabels(unique, users, { profiles, overlays });
}

/** Resolve stored name for each id. Unknown ids become Teammate. */
export async function resolveUserLabels(
  userIds: Iterable<string>,
  overlays?: Record<string, PersonOverlay>
): Promise<Record<string, string>> {
  const people = await resolveUserPeople(userIds, overlays);
  return people.labels;
}

export async function rememberSessionPerson(
  userId: string | null | undefined,
  identity?: PersonOverlay | null
): Promise<void> {
  const id = userId?.trim();
  if (!id) return;
  await rememberDisplayProfile({
    userId: id,
    name: identity?.name,
    image: identity?.image,
  });
}
