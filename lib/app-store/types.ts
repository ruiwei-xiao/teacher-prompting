export type SupportedProvider = "openai" | "google" | "anthropic";

export type PromptBuilderState = {
  learningObjective: string;
  learningObjectivePrompt: string;
  uploadedExerciseName: string;
  uploadedExerciseText: string;
  exercisePrompt: string;
  gradeLevel: string;
  language: string;
  learnerNotes: string;
  learnerProfilePrompt: string;
  selectedTemplate: string;
  templatePrompt: string;
};

export type ProjectShareVisibility = "private" | "public";

export type AppConfig = {
  id: string;
  publicSlug?: string;
  projectShareSlug?: string;
  ownerId?: string;
  name: string;
  description?: string;
  provider: SupportedProvider;
  model: string;
  apiKey: string;
  variability?: number;
  systemPrompt?: string;
  builderState?: PromptBuilderState;
  communitySubject?: string;
  communityTags?: string[];
  publishedAt?: string;
  projectSharedAt?: string;
  projectShareVisibility?: ProjectShareVisibility;
  shareAuthorName?: boolean;
  forkedFromProjectName?: string;
  forkedFromProjectShareSlug?: string;
  forkedFromAuthorName?: string;
  createdAt: string;
  updatedAt: string;
};