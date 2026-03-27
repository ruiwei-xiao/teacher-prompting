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
    gradeLevel: "Grade 6",
    knowledgeLevel: "Beginner; needs concrete examples and frequent checks for understanding.",
    personality: "Careful and a little shy. Answers briefly unless the teacher gives reassurance.",
  },
  {
    id: "student-2",
    label: "Student 2",
    gradeLevel: "Grade 8",
    knowledgeLevel: "Intermediate; knows some core ideas but makes partial or overconfident explanations.",
    personality: "Curious and talkative. Likes to guess first and think out loud.",
  },
  {
    id: "student-3",
    label: "Student 3",
    gradeLevel: "Grade 10",
    knowledgeLevel: "Mixed understanding; can handle harder tasks but has a few persistent misconceptions.",
    personality: "Independent and slightly skeptical. Responds well to challenge and reflection prompts.",
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

export function buildStudentProfilesPromptSection() {
  return [
    TEST_CASE_STUDENTS_SECTION_HEADING,
    ...DEFAULT_TEST_CASE_STUDENTS.flatMap((profile, index) => [
      `${index + 1}. ${profile.label}`,
      `Grade level: ${profile.gradeLevel}`,
      `Knowledge level: ${profile.knowledgeLevel}`,
      `Personality: ${profile.personality}`,
      "",
    ]),
  ]
    .join("\n")
    .trim();
}

export function ensurePromptHasStudentProfiles(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return buildStudentProfilesPromptSection();
  }

  if (trimmed.includes(TEST_CASE_STUDENTS_SECTION_HEADING)) {
    return trimmed;
  }

  return `${trimmed}\n\n${buildStudentProfilesPromptSection()}`;
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
