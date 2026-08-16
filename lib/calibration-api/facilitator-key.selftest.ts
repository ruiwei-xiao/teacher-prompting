/**
 * Self-test: facilitator API key resolution.
 * Run: npx tsx lib/calibration-api/facilitator-key.selftest.ts
 */
import {
  publicOffering,
  resolveFacilitatorApiKey,
} from "./facilitator-key";

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

async function main(): Promise<void> {
  const offering = {
    sampleAppId: "app_1",
    operatorUserId: "op_1",
  };

  assertEqual(
    await resolveFacilitatorApiKey(
      { ...offering, facilitatorApiKey: "  sk-override  " },
      { getAppById: async () => ({ apiKey: "sk-bot" } as never) }
    ),
    "sk-override",
    "offering override wins over the sample bot key"
  );

  assertEqual(
    await resolveFacilitatorApiKey(offering, {
      getAppById: async (id, ownerId) => {
        assertEqual(id, "app_1", "loads the sample bot");
        assertEqual(ownerId, "op_1", "loads the bot as the offering operator");
        return { apiKey: " sk-bot " } as never;
      },
    }),
    "sk-bot",
    "falls back to the sample bot key"
  );

  assertEqual(
    await resolveFacilitatorApiKey(offering, {
      getAppById: async () => null,
    }),
    "",
    "missing bot yields an empty key"
  );

  const published = publicOffering({
    id: "off_1",
    title: "Pilot",
    facilitatorApiKey: "sk-secret",
  });
  assertEqual(
    "facilitatorApiKey" in published,
    false,
    "public offering omits the facilitator key"
  );
  assertEqual(published.id, "off_1", "public offering keeps other fields");

  if (failures > 0) {
    console.error(`\nfacilitator-key.selftest: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("facilitator-key.selftest: all assertions passed");
}

void main().catch((err) => {
  console.error("facilitator-key.selftest crashed:", err);
  process.exit(1);
});
