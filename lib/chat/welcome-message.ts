/**
 * Static first assistant bubble for student/preview chats.
 * Not model-generated — matches published chatbot UX.
 */
export function getWelcomeMessage(appName: string): string {
  const name = appName.trim() || "your tutor";
  return `Hi! I'm ${name}. We can learn step by step together.\n\nYou can type, speak, or attach a file or image.`;
}
