/**
 * Self-test: person labels stay names, never swap to email for duplicates.
 * Run: npx tsx lib/auth/resolve-labels.selftest.ts
 */
import { mergePersonLabels, personOverlayFromUser } from "./resolve-labels";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function main(): void {
  const users = new Map([
    [
      "uuid-1",
      { name: "Miina Koyama", email: "one@school.edu", image: "https://img/1" },
    ],
    [
      "uuid-2",
      { name: "Miina Koyama", email: "two@school.edu", image: "https://img/2" },
    ],
    ["uuid-3", { name: "", email: "no-name@school.edu" }],
  ]);

  const duplicate = mergePersonLabels(["uuid-1", "uuid-2"], users);
  assertEqual(duplicate.labels["uuid-1"], "Miina Koyama", "keeps the shared name");
  assertEqual(
    duplicate.labels["uuid-2"],
    "Miina Koyama",
    "does not replace a duplicate name with email"
  );
  assertEqual(duplicate.avatars["uuid-1"], "https://img/1", "keeps the first avatar");
  assertEqual(duplicate.avatars["uuid-2"], "https://img/2", "keeps the second avatar");

  const emailOnly = mergePersonLabels(["uuid-3"], users);
  assertEqual(
    emailOnly.labels["uuid-3"],
    "no-name@school.edu",
    "email is only used when no name exists"
  );

  const missing = mergePersonLabels(["ghost"], users);
  assertEqual(missing.labels["ghost"], "Teammate", "unknown ids become Teammate");

  const twoMissing = mergePersonLabels(["ghost-a", "ghost-b"], users);
  assertEqual(twoMissing.labels["ghost-a"], "Teammate 1", "two unknown ids are numbered");
  assertEqual(twoMissing.labels["ghost-b"], "Teammate 2", "second unknown id is Teammate 2");

  const overlaid = mergePersonLabels(["ghost"], users, {
    overlays: {
      ghost: {
        name: "Ada Lovelace",
        image: "https://lh3.googleusercontent.com/a/ada",
      },
    },
  });
  assertEqual(
    overlaid.labels["ghost"],
    "Ada Lovelace",
    "session overlay supplies a name when the user store misses"
  );
  assertEqual(
    overlaid.avatars["ghost"],
    "https://lh3.googleusercontent.com/a/ada",
    "session overlay supplies a Google avatar"
  );

  const profiled = mergePersonLabels(["ghost"], users, {
    profiles: new Map([
      ["ghost", { name: "Cached Name", image: "https://img/cached" }],
    ]),
  });
  assertEqual(
    profiled.labels["ghost"],
    "Cached Name",
    "remembered profiles fill names Liveblocks already had"
  );

  const overlay = personOverlayFromUser({
    name: "  Ada  ",
    email: " ada@school.edu ",
    image: "  https://img/ada  ",
  });
  assertEqual(overlay?.name, "Ada", "overlay trims name");
  assertEqual(overlay?.image, "https://img/ada", "overlay trims image");
  assertEqual(personOverlayFromUser(null), undefined, "empty session has no overlay");

  if (failures > 0) {
    console.error(`\nresolve-labels.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("resolve-labels.selftest: all assertions passed");
}

main();
