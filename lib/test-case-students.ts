export type StudentProfile = {
  id: string;
  label: string;
  gradeLevel: string;
  knowledgeLevel: string;
  personality: string;
};

export const DEFAULT_TEST_CASE_STUDENTS: StudentProfile[] = [
  {
    id: "student-1",
    label: "Student 1",
    gradeLevel: "Grade 8",
    knowledgeLevel: "Mainstream learner; has partial background knowledge and benefits from clear examples and guided practice.",
    personality: "Curious and cooperative. Will usually follow the intended learning flow and respond to scaffolding.",
  },
  {
    id: "student-2",
    label: "Student 2",
    gradeLevel: "Grade 10",
    knowledgeLevel: "Mixed understanding; can tackle tougher concepts but has some misconceptions and may resist support.",
    personality: "Independent and slightly skeptical. More likely to challenge the bot, rush, or show frustration.",
  },
];

export const TEST_CASE_STUDENTS_SECTION_HEADING = "Default Test Case Students";

export function formatStudentProfile(profile: StudentProfile) {
  return [
    `${profile.label}`,
    `Grade level: ${profile.gradeLevel}`,
    `Knowledge level: ${profile.knowledgeLevel}`,
    `Personality: ${profile.personality}`,
  ].join("\n");
}

/** Removes the legacy global "Default Test Case Students" block from stored prompts. */
export function stripTestCaseStudentsFromPrompt(prompt: string) {
  const trimmed = prompt.trim();
  const marker = TEST_CASE_STUDENTS_SECTION_HEADING;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return trimmed;
  return trimmed.slice(0, idx).replace(/\s+$/u, "");
}

export function buildCaseSpecificPrompt(basePrompt: string, profile?: StudentProfile | null) {
  const normalizedPrompt = basePrompt.trim();
  if (!profile) return normalizedPrompt;

  return [
    normalizedPrompt,
    "",
    "Active Test Case Student",
    formatStudentProfile(profile),
    "When previewing this testcase, treat the student above as the learner you are responding to.",
  ]
    .join("\n")
    .trim();
}
