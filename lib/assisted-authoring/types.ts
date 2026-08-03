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
 * Client snapshot for preserved test cases when mode is OFF.
 * Stored in browser localStorage, scoped by appId.
 */
export type AssistedAuthoringSnapshot = {
  appId: string;
  promptFingerprint: string;
  testCases: unknown; // serializable test case data as used by AssistantPanel
  savedAt: string; // ISO 8601 timestamp
};

/**
 * Plan for OFF→ON transition based on Final Prompt fingerprint comparison.
 */
export type OffToOnPlan =
  | { action: "restore"; snapshot: AssistedAuthoringSnapshot }
  | { action: "regenerate" }
  | { action: "regenerate"; reason: "missing-snapshot" };
