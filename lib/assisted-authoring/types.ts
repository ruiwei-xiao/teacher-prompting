/**
 * Assisted Authoring Mode types.
 * 
 * Assisted Authoring Mode controls whether the Teacher Prompting System
 * provides assisted authoring behaviors (test case generation, prompt revision
 * from AI response edits, and publish gating).
 */

/**
 * Resolved Assisted Authoring Mode state.
 * - true (ON): Assisted behaviors are enabled
 * - false (OFF): Assisted behaviors are disabled
 */
export type AssistedAuthoringMode = boolean;

/**
 * Minimal shape for an app configuration with optional Assisted Authoring Mode field.
 */
export type AppWithAssistedAuthoring = {
  assistedAuthoringMode?: boolean;
};

/**
 * Legacy client snapshot shape (old preserve/restore design).
 * May still exist in localStorage; cleared on ON→OFF. Not used for restore.
 */
export type AssistedAuthoringSnapshot = {
  appId: string;
  promptFingerprint: string;
  testCases: unknown[];
  savedAt: string;
};

/**
 * Plan for OFF→ON transition. Always regenerate after discard-on-OFF.
 */
export type OffToOnPlan = { action: "regenerate" };
