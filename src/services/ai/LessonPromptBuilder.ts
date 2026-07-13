/**
 * LessonPromptBuilder — Compact, section-specific prompts for the AI lesson system.
 *
 * DESIGN RULES:
 * - Every prompt must fit well under 2000 tokens to avoid HTTP 413.
 * - Each section is a standalone request — never bundle two sections.
 * - System instructions are SHORT — the professor persona is implied.
 * - Return format: always valid JSON, no markdown fences.
 */

// ── Shared micro-system instruction ─────────────────────────────────────────

const BASE_SYSTEM = `You are Professor MathVerse, an engineering mathematics professor.
Teach using proper math symbols (∫ d/dx ∑ ∂ √ ∴ ∈ ∪ ∩ ≤ ≥ ≠ ≈ ∞ ∧ ∨ ¬).
Write like handwritten class notes. Show every step. Use simple English.
Return ONLY valid JSON — no markdown fences, no preamble, no explanation outside JSON.`;

// ── Type definitions for each section ───────────────────────────────────────

export interface ConceptSection {
  introduction: string;
  whyImportant: string;
  applications: string;
  basicConcepts: string;
}

export interface FormulaItem {
  name: string;
  formula: string;
  variables: string;
  explanation: string;
}

export interface FormulasSection {
  definitions: string;
  formulas: FormulaItem[];
  derivations: string;
}

export interface ExampleStep {
  heading: string;
  explanation: string;
  equation: string;
}

export interface ExampleItem {
  title: string;
  question: string;
  steps: ExampleStep[];
  finalAnswer: string;
}

export interface ExamplesSection {
  beginnerExample: ExampleItem;
  mediumExample: ExampleItem;
  engineeringExample: ExampleItem;
  commonMistakes: string;
  shortTricks: string;
  examTips: string;
}

export interface PracticeSection {
  question: string;
  correctAnswer: string;
  hint: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizSection {
  questions: QuizQuestion[];
}

export interface ChallengeSection {
  question: string;
  hint: string;
  correctAnswer: string;
  explanation: string;
}

export interface SummarySection {
  summary: string;
  keyFormulas: string;
  nextTopic: string;
}

export interface AnswerCheckResult {
  isCorrect: boolean;
  explanation: string;
  newExample?: { question: string; correctAnswer: string; hint: string };
}

// ── Prompt factories ─────────────────────────────────────────────────────────

export interface SectionPrompt {
  system: string;
  user: string;
}

export function buildConceptPrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON with keys: introduction, whyImportant, applications, basicConcepts.
Each value: 2-4 sentences of plain English.`,
  };
}

export function buildFormulasPrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON with keys:
- definitions: 2-3 sentences defining the topic mathematically
- formulas: array of up to 4 objects {name, formula (use math symbols), variables, explanation}
- derivations: step-by-step derivation of the main formula (one step per line, use = prefix for continuations)`,
  };
}

export function buildExamplesPrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON with keys:
- beginnerExample: { title, question, steps (array of {heading, explanation, equation}), finalAnswer }
- mediumExample: { title, question, steps (array of {heading, explanation, equation}), finalAnswer }
- engineeringExample: { title, question, steps (array of {heading, explanation, equation}), finalAnswer }
- commonMistakes: 1-2 sentences
- shortTricks: 1-2 sentences
- examTips: 1-2 sentences

Requirements for steps:
1. Each step must contain: "heading" (e.g., "Step 1"), "explanation" (what we are doing, why we are doing it, 2-3 sentences max in simple professor tone), and "equation" (the math calculation or simplification).
2. NEVER wrap equations in $$ or $ inside the JSON string; just return clean LaTeX or math symbols.
3. Show all intermediate calculations. Never skip a step.`,
  };
}

export function buildPracticePrompt(
  topic: string,
  level: string,
  previousMistakes?: string[]
): SectionPrompt {
  const mistakeCtx = previousMistakes?.length
    ? `\nFocus on student's weak areas: ${previousMistakes.slice(0, 2).join('; ')}`
    : '';
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"${mistakeCtx}
Return JSON with keys: question, correctAnswer, hint.
One open-ended problem with a clean numeric or symbolic answer.`,
  };
}

export function buildQuizPrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON: { "questions": [ {id, question, options (4 strings), correctAnswer, explanation} ] }
Generate exactly 3 MCQ questions.`,
  };
}

export function buildChallengePrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON: { question, hint, correctAnswer, explanation }
One tough engineering-level challenge problem.`,
  };
}

export function buildSummaryPrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON: { summary (3 sentences), keyFormulas (one-line cheat sheet), nextTopic (name of logical next topic) }`,
  };
}

export function buildAnswerCheckPrompt(
  topic: string,
  question: string,
  studentAnswer: string,
  correctAnswer: string
): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}"
Question: "${question.slice(0, 200)}"
Student Answer: "${studentAnswer.slice(0, 100)}"
Correct Answer: "${correctAnswer.slice(0, 100)}"
Return JSON: { isCorrect (boolean), explanation (professor feedback), newExample? ({question, correctAnswer, hint}) }
Be lenient with notation equivalence.`,
  };
}
