/** Canonical “empty” Final Prompt template (placeholders for Background / Workflow / Guardrails). */
export const DEFAULT_INSTRUCTION_PROMPT = [
  'Background',
  'You are an expert in ________.',
  'Your role is to __________.',
  'You are talking to __________.',
  '',
  'Your Workflow',
  'First, ___________.',
  'After they respond, then ___________.',
  'Next, ___________.',
  '',
  'Guidelines & Guardrails',
  'Avoid language that might seem judgmental or dismissive.',
  'Be inclusive in your examples and explanations, consider multiple perspectives, and avoid stereotypes.',
  'Provide clear and concise responses.',
  'If off-topic, prompt users to return to the main subject.',
].join('\n');

export function normalizeInstructionText(value: string) {
  return value.replace(/\r\n/g, '\n');
}

/** True when the saved text is exactly the built-in starter template (not customized). */
export function isDefaultInstructionPrompt(value: string) {
  const a = normalizeInstructionText(value).trim();
  const b = normalizeInstructionText(DEFAULT_INSTRUCTION_PROMPT).trim();
  return a === b;
}
