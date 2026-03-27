"use client";

export const PROMPT_STORAGE_KEY = "instruction-doc-text";
export const LEGACY_PROMPT_STORAGE_KEY = "instruction-doc-md";
export const LEGACY_BUILDER_STORAGE_KEY = "instruction-doc-builder-state";

function getScopedKey(baseKey: string, appId?: string) {
  return appId?.trim() ? `${baseKey}:${appId.trim()}` : baseKey;
}

export function readStoredPrompt(appId?: string) {
  if (typeof window === "undefined") return "";

  const scopedPrompt = localStorage.getItem(getScopedKey(PROMPT_STORAGE_KEY, appId)) || "";
  if (scopedPrompt.trim()) return scopedPrompt;

  const scopedLegacyPrompt =
    localStorage.getItem(getScopedKey(LEGACY_PROMPT_STORAGE_KEY, appId)) || "";
  if (scopedLegacyPrompt.trim()) return scopedLegacyPrompt;

  return "";
}

export function saveStoredPrompt(text: string, appId?: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem(getScopedKey(PROMPT_STORAGE_KEY, appId), text);
  localStorage.setItem(getScopedKey(LEGACY_PROMPT_STORAGE_KEY, appId), text);
}

export function readLegacyBuilderState(appId?: string) {
  if (typeof window === "undefined") return null;

  try {
    const scopedRaw = localStorage.getItem(getScopedKey(LEGACY_BUILDER_STORAGE_KEY, appId));
    if (scopedRaw) {
      return JSON.parse(scopedRaw);
    }
  } catch {}

  return null;
}
