"use client";

export const SUPPORTED_TEXT_FILE_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".ts",
  ".py",
  ".html",
  ".css",
  ".xml",
] as const;

export const TEXT_FILE_INPUT_ACCEPT = [
  "text/*",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".ts",
  ".py",
  ".html",
  ".css",
  ".xml",
].join(",");

export function isSupportedTextFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    SUPPORTED_TEXT_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
}

export async function buildFileAttachmentText(file: File) {
  if (!isSupportedTextFile(file)) {
    throw new Error("Only text-based files are supported right now.");
  }

  const text = await file.text();
  const trimmed = text.trim();
  const limited =
    trimmed.length > 12000 ? `${trimmed.slice(0, 12000)}\n\n[File truncated for length]` : trimmed;

  return `[Uploaded file: ${file.name}]\n${limited || "[File was empty]"}`;
}

export function appendTextToComposer(current: string, addition: string) {
  if (!current.trim()) return addition;
  return `${current.trim()}\n\n${addition}`;
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}
