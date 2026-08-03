/**
 * Self-test: filterSpotlightStepsForMode (Task 3.6 / SpotlightModeAdapt).
 *
 * While Assisted Authoring Mode is OFF, steps that require test cases,
 * mark-pass, or all-pass publish must be omitted so the tour is not mandatory
 * for assisted-only workflows (Requirements 5.1, 5.2).
 *
 * Run: npx tsx components/editor/editorSpotlightTourSteps.selftest.ts
 */

import {
  EDITOR_SPOTLIGHT_STEPS,
  filterSpotlightStepsForMode,
} from "./editorSpotlightTourSteps";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function idsOf(steps: { id: number }[]): number[] {
  return steps.map((s) => s.id);
}

console.log("Test 1: ON mode keeps the full step list (order preserved)");
{
  const filtered = filterSpotlightStepsForMode(EDITOR_SPOTLIGHT_STEPS, true);
  assert(
    filtered.length === EDITOR_SPOTLIGHT_STEPS.length,
    `ON should keep all steps, got ${filtered.length} vs ${EDITOR_SPOTLIGHT_STEPS.length}`
  );
  assert(
    idsOf(filtered).join(",") === idsOf(EDITOR_SPOTLIGHT_STEPS).join(","),
    `ON should preserve step ids/order, got ${idsOf(filtered).join(",")}`
  );
}

console.log("Test 2: OFF mode omits assisted-only test case / mark-pass / all-pass steps");
{
  const filtered = filterSpotlightStepsForMode(EDITOR_SPOTLIGHT_STEPS, false);
  const ids = idsOf(filtered);

  // Final Prompt + settings-relevant steps remain
  for (const keep of [0, 1, 2]) {
    assert(ids.includes(keep), `OFF tour must keep step ${keep}`);
  }

  // Test-case rail / mark pass / all-pass publish guidance must not be mandatory
  const assistedOnlyIds = [3, 4, 5, 6, 7, 8, 9, 10];
  for (const skip of assistedOnlyIds) {
    assert(
      !ids.includes(skip),
      `OFF tour must omit assisted-only step ${skip}, got ids=${ids.join(",")}`
    );
  }

  assert(
    filtered.every((s) => !s.assistedOnly),
    "OFF filtered list must contain only non-assistedOnly steps"
  );
}

console.log("Test 3: filter is pure — does not mutate the input array");
{
  const snapshot = EDITOR_SPOTLIGHT_STEPS.map((s) => ({ ...s }));
  const beforeIds = idsOf(EDITOR_SPOTLIGHT_STEPS);
  filterSpotlightStepsForMode(EDITOR_SPOTLIGHT_STEPS, false);
  assert(
    idsOf(EDITOR_SPOTLIGHT_STEPS).join(",") === beforeIds.join(","),
    "filterSpotlightStepsForMode must not mutate EDITOR_SPOTLIGHT_STEPS"
  );
  assert(
    EDITOR_SPOTLIGHT_STEPS.every(
      (s, i) =>
        s.id === snapshot[i].id && s.assistedOnly === snapshot[i].assistedOnly
    ),
    "filterSpotlightStepsForMode must not mutate step definitions"
  );
}

console.log("Test 4: custom step list respects assistedOnly flag");
{
  const custom = [
    { id: 100, assistedOnly: false },
    { id: 101, assistedOnly: true },
    { id: 102, assistedOnly: false },
  ];
  const on = filterSpotlightStepsForMode(custom, true);
  const off = filterSpotlightStepsForMode(custom, false);
  assert(idsOf(on).join(",") === "100,101,102", `ON custom ids, got ${idsOf(on)}`);
  assert(idsOf(off).join(",") === "100,102", `OFF custom ids, got ${idsOf(off)}`);
}

console.log("✓ All filterSpotlightStepsForMode tests passed");
