/**
 * Self-test: Liveblocks session-token endpoint (Task 6.1).
 * Uses JSON stores + handler functions (auth is injected as userId).
 * The Liveblocks issuer is injected so this never needs LIVEBLOCKS_SECRET_KEY
 * or a network call.
 *
 * Run: npx tsx lib/calibration-api/liveblocks-auth.selftest.ts
 */
import fs from "fs/promises";
import path from "path";

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

const offeringInput = {
  title: "Rubric Calibration Pilot",
  sampleAppId: "app_sample_bot",
  sampleRubric: "Criterion 1: clarity\nCriterion 2: evidence",
  deploymentBrief: "Deploy the tutor for week-3 lab.",
  transcriptExcerpt: "Student: ...\nTutor: ...",
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
};

type IssuedToken = {
  userId: string;
  room: string;
  access: "write" | "read";
  userInfo: { name?: string; color?: string; avatar?: string };
};

async function main(): Promise<void> {
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.LIVEBLOCKS_SECRET_KEY;

  const tempDir = path.join(
    process.cwd(),
    ".data",
    "calibration-api-liveblocks-auth-selftest"
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  process.env.CALIBRATION_DATA_FILE = path.join(tempDir, "calibration.json");

  const { issueLiveblocksToken } = await import("./liveblocks-auth");
  const { createOffering } = await import("./offerings");
  const { formTeam, markDeliverableLocked } = await import(
    "../calibration-store/store"
  );

  try {
    const operatorId = "op_1";
    const learnerA = "user_a";
    const learnerB = "user_b";
    const learnerC = "user_c";
    const stranger = "user_stranger";
    const identity = {
      name: "Ada Lovelace",
      color: "#c45c26",
      avatar: "https://lh3.googleusercontent.com/a/ada",
    };

    const created = await createOffering(operatorId, offeringInput);
    assert(created.ok === true, "create offering ok");
    const offering =
      created.ok && "offering" in created.body ? created.body.offering : null;
    assert(offering !== null, "create returns offering");

    const team = await formTeam(offering!.id, [learnerA, learnerB, learnerC]);
    const room = `calibration:${team.id}`;

    const issued: IssuedToken[] = [];
    const authorize = async (request: IssuedToken) => {
      issued.push(request);
      return { status: 200 as const, body: { token: "test-token" } };
    };

    // --- unsigned userId null → 401, no token ---
    const unsigned = await issueLiveblocksToken(null, { room }, { authorize, identity });
    assertEqual(unsigned.status, 401, "unsigned userId null → 401");
    assertEqual(issued.length, 0, "unsigned request issues no token");

    // --- non-member of existing team → 403, no token (Requirement 15.1) ---
    const denied = await issueLiveblocksToken(
      stranger,
      { room },
      { authorize, identity }
    );
    assertEqual(denied.status, 403, "non-member of existing team → 403");
    assertEqual(issued.length, 0, "non-member request issues no token");

    // --- member of unlocked team → 200, write, identity present (Requirement 7.2) ---
    const memberWrite = await issueLiveblocksToken(
      learnerA,
      { room },
      { authorize, identity }
    );
    assertEqual(memberWrite.status, 200, "member of unlocked team → 200");
    assert(memberWrite.ok === true, "member of unlocked team ok");
    assertEqual(issued.length, 1, "member write issues exactly one token");
    assertEqual(issued[0]?.userId, learnerA, "member write token is for the member");
    assertEqual(issued[0]?.room, room, "member write token is scoped to calibration:{teamId}");
    assertEqual(issued[0]?.access, "write", "member of unlocked team gets write");
    assert(
      typeof issued[0]?.userInfo?.name === "string" &&
        issued[0].userInfo.name.length > 0,
      "member write token carries identity name"
    );
    assertEqual(
      issued[0]?.userInfo?.name,
      identity.name,
      "member write token uses session name"
    );
    assertEqual(
      issued[0]?.userInfo?.avatar,
      identity.avatar,
      "member write token uses the Google account image"
    );
    if (memberWrite.ok) {
      assertEqual(memberWrite.body.token, "test-token", "member write returns token body");
    }

    // --- after markDeliverableLocked, same member → 200, read (Requirement 10.4) ---
    await markDeliverableLocked(team.id, false);
    const memberRead = await issueLiveblocksToken(
      learnerA,
      { room },
      { authorize, identity }
    );
    assertEqual(memberRead.status, 200, "locked-team member → 200");
    assertEqual(issued.length, 2, "locked-team member still issues a token");
    assertEqual(issued[1]?.userId, learnerA, "locked-team token is for the same member");
    assertEqual(issued[1]?.room, room, "locked-team token stays scoped to the team room");
    assertEqual(
      issued[1]?.access,
      "read",
      "member token stops granting write after lock"
    );
    assert(
      issued[1]?.access !== "write",
      "locked-team member must not receive write"
    );

    // --- operator of offering → 200, read even if unlocked (Requirement 14.5) ---
    const unlockedOffering = await createOffering(operatorId, {
      ...offeringInput,
      title: "Unlocked operator view",
    });
    assert(unlockedOffering.ok === true, "second offering ok");
    const offeringB =
      unlockedOffering.ok && "offering" in unlockedOffering.body
        ? unlockedOffering.body.offering
        : null;
    assert(offeringB !== null, "second offering exists");
    const unlockedTeam = await formTeam(offeringB!.id, [
      learnerA,
      learnerB,
      learnerC,
    ]);
    assertEqual(
      unlockedTeam.finalizedAt,
      null,
      "operator fixture team is unlocked"
    );
    const operatorRoom = `calibration:${unlockedTeam.id}`;
    const operatorRead = await issueLiveblocksToken(
      operatorId,
      { room: operatorRoom },
      { authorize, identity }
    );
    assertEqual(operatorRead.status, 200, "operator of unlocked team → 200");
    assertEqual(issued.length, 3, "operator request issues a token");
    assertEqual(issued[2]?.userId, operatorId, "operator token is for the operator");
    assertEqual(
      issued[2]?.room,
      operatorRoom,
      "operator token is scoped to calibration:{teamId}"
    );
    assertEqual(
      issued[2]?.access,
      "read",
      "operator gets read even if the team is unlocked"
    );

    const rubricRoom = `calibration:${unlockedTeam.id}:rubric`;
    const memberRubric = await issueLiveblocksToken(
      learnerA,
      { room: rubricRoom },
      { authorize, identity }
    );
    assertEqual(memberRubric.status, 200, "member of unlocked team can auth a doc room");
    assertEqual(
      issued[3]?.room,
      rubricRoom,
      "doc-room token is scoped to calibration:{teamId}:rubric"
    );
    assertEqual(issued[3]?.access, "write", "unlocked member gets write on the doc room");

    // --- wrong room format → 400 or 403, no token ---
    const beforeBadRoom = issued.length;
    const badRoom = await issueLiveblocksToken(
      learnerA,
      { room: "other-product:not-a-team" },
      { authorize, identity }
    );
    assert(
      badRoom.status === 400 || badRoom.status === 403,
      `wrong room format → 400 or 403, got ${badRoom.status}`
    );
    assertEqual(issued.length, beforeBadRoom, "wrong room format issues no token");

    const missingRoom = await issueLiveblocksToken(
      learnerA,
      { room: "" },
      { authorize, identity }
    );
    assert(
      missingRoom.status === 400 || missingRoom.status === 403,
      `empty room → 400 or 403, got ${missingRoom.status}`
    );
    assertEqual(issued.length, beforeBadRoom, "empty room issues no token");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log(
    "OK: calibration-api liveblocks-auth (ACL, lock write-stop, operator read)"
  );
}

void main();
