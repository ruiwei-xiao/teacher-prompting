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

/** Text + images for learner chat (preview & published). */
export const CHAT_ATTACHMENT_ACCEPT = [TEXT_FILE_INPUT_ACCEPT, "image/*"].join(",");

/** Final prompt editor: text, images, and PDF (PDF text extracted via API). */
export const TEACHER_PROMPT_ATTACHMENT_ACCEPT = [
  TEXT_FILE_INPUT_ACCEPT,
  "image/*",
  ".pdf",
  "application/pdf",
].join(",");

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function readImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be about 4MB or smaller.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

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

/**
 * Build inline content for the teacher system-prompt attachment flow (text, image as data-URL markdown, or PDF via server text extraction).
 */
export async function buildTeacherPromptAttachmentBlock(file: File) {
  if (isSupportedTextFile(file)) {
    return buildFileAttachmentText(file);
  }

  if (file.type.startsWith("image/")) {
    const dataUrl = await readImageDataUrl(file);
    return `[Uploaded image: ${file.name}]\n![${file.name}](${dataUrl})`;
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/prompt-attachments/pdf-text", {
      method: "POST",
      body: form,
    });
    let body: { text?: string; error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      body = {};
    }
    if (!res.ok) {
      throw new Error(
        typeof body.error === "string" ? body.error : "Could not extract PDF text."
      );
    }
    const raw = String(body.text || "").trim();
    const limited =
      raw.length > 12000
        ? `${raw.slice(0, 12000)}\n\n[PDF text truncated for length]`
        : raw;
    return `[Uploaded PDF: ${file.name}]\n${limited || "[No extractable text found in this PDF]"}`;
  }

  throw new Error(
    "Unsupported file type. Use text, code, PDF, or image files."
  );
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
