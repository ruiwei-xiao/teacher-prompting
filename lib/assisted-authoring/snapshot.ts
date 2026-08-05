/**
 * Assisted Authoring Snapshot helpers.
 *
 * Legacy localStorage snapshots from the old preserve/restore design may still
 * exist; clearAssistedAuthoringSnapshot removes them on ON→OFF. OFF→ON always
 * regenerates assisted cases (no restore).
 */

"use client";

import type { AssistedAuthoringSnapshot, OffToOnPlan } from "./types";

const SNAPSHOT_STORAGE_KEY = "assisted-authoring-snapshot";

function getScopedSnapshotKey(appId: string): string {
  return `${SNAPSHOT_STORAGE_KEY}:${appId.trim()}`;
}

/**
 * Simple string hash function for generating fingerprints.
 * Uses a variant of the Java String.hashCode() algorithm.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a normalized fingerprint of Final Prompt text.
 * Trims and normalizes whitespace for stable comparison.
 */
export function fingerprintFinalPrompt(promptText: string): string {
  const normalized = promptText.trim().replace(/\s+/g, " ");
  return hashString(normalized);
}

/**
 * Save an assisted authoring snapshot to client localStorage.
 * Kept for tests / cleanup tooling; editor transitions no longer preserve.
 */
export function saveAssistedAuthoringSnapshot(
  snapshot: AssistedAuthoringSnapshot
): void {
  if (typeof window === "undefined" && typeof localStorage === "undefined") {
    throw new Error("localStorage is not available");
  }

  const key = getScopedSnapshotKey(snapshot.appId);
  const serialized = JSON.stringify(snapshot);

  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    throw new Error(
      `Failed to save assisted authoring snapshot: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Read an assisted authoring snapshot from client localStorage.
 */
export function readAssistedAuthoringSnapshot(
  appId: string
): AssistedAuthoringSnapshot | null {
  if (typeof window === "undefined" && typeof localStorage === "undefined") {
    return null;
  }

  const key = getScopedSnapshotKey(appId);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as AssistedAuthoringSnapshot;
  } catch (error) {
    console.error(
      `Failed to read assisted authoring snapshot for ${appId}:`,
      error
    );
    return null;
  }
}

/**
 * Clear an assisted authoring snapshot from client localStorage.
 */
export function clearAssistedAuthoringSnapshot(appId: string): void {
  if (typeof window === "undefined" && typeof localStorage === "undefined") {
    return;
  }

  const key = getScopedSnapshotKey(appId);
  localStorage.removeItem(key);
}

/**
 * Plan OFF→ON transition: always regenerate (assisted suites are discarded on OFF).
 */
export function planOffToOnTransition(_input: {
  appId: string;
  currentFinalPrompt: string;
}): OffToOnPlan {
  return { action: "regenerate" };
}
