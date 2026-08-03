/**
 * Assisted Authoring Mode resolution.
 * 
 * This module provides the single source of truth for resolving
 * Assisted Authoring Mode from stored app configuration.
 */

import type { AssistedAuthoringMode, AppWithAssistedAuthoring } from "./types";

/**
 * Resolves Assisted Authoring Mode from an app configuration.
 * 
 * Resolution rules:
 * - undefined or missing → ON (true) - legacy bots default to assisted mode
 * - explicit true → ON (true)
 * - explicit false → OFF (false)
 * 
 * @param app - An object with an optional assistedAuthoringMode field
 * @returns Resolved mode: true (ON) or false (OFF)
 */
export function resolveAssistedAuthoringMode(
  app: AppWithAssistedAuthoring
): AssistedAuthoringMode {
  return app.assistedAuthoringMode ?? true;
}
