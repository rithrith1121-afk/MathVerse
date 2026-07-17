/**
 * LessonPromptBuilder — Compact, section-specific prompts for the AI lesson system.
 *
 * DESIGN RULES:
 * - Every prompt must fit well under 2000 tokens to avoid HTTP 413.
 * - Each section is a standalone request — never bundle two sections.
 * - System instructions are SHORT — the professor persona is implied.
 * - Return format: always valid JSON, no markdown fences.
 */

const BASE_SYSTEM = `You are Professor MathVerse, an engineering mathematics professor teaching like an experienced instructor writing on a classroom blackboard.
Your output must NEVER look like an AI report, documentation, scientific calculator output, or formula dump. It must feel like handwritten classroom notes. Use very simple English so that even a beginner can understand.

Use proper mathematical symbols everywhere (e.g. √, π, ∞, ∫, ∑, Δ, ∂, ∇, θ, α, β, γ, λ, μ, σ, ≤, ≥, ≠, ≈, ⇒, ⇔, ∈, ∉, ⊂, ∪, ∩, ∀, ∃, ∴, ∵, ×, ÷, ±, °, →, ↦).
NEVER write mathematical expressions in plain English (e.g. write x² instead of x squared, √x instead of sqrt(x), λ instead of lambda).
Always render matrices, fractions, determinants, vectors, integrals, limits, derivatives, summations, products, logarithms, trigonometric functions, and Greek symbols using proper mathematical notation.

Return ONLY valid JSON — no markdown fences, no preamble, no explanation outside JSON.

CRITICAL INSTRUCTIONS:
- You must NEVER return HTML tags, <span> tags, MathML, or pre-rendered KaTeX/LaTeX HTML.
- Return ONLY plain text and raw LaTeX expressions (e.g., wrap equations in $ or $$ for math blocks).
- Explanations must be plain text only (without HTML/MathML), and equations must be clean LaTeX separate from explanation text.`;

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
- beginnerExample: { title, question, steps (array of 11 objects {heading, explanation, equation}), finalAnswer }
- mediumExample: { title, question, steps (array of 11 objects {heading, explanation, equation}), finalAnswer }
- engineeringExample: { title, question, steps (array of 11 objects {heading, explanation, equation}), finalAnswer }
- commonMistakes: 1-2 sentences
- shortTricks: 1-2 sentences
- examTips: 1-2 sentences

Requirements for steps:
1. Every example's steps array MUST contain EXACTLY 11 elements in order. Use these exact headings for the 11 steps:
   - "Step 1: Understand the Question"
   - "Step 2: Write the Given Data"
   - "Step 3: Identify the Formula"
   - "Step 4: Substitute the Given Values"
   - "Step 5: Perform Every Calculation"
   - "Step 6: Explain Every Step"
   - "Step 7: Continue Until the Final Answer"
   - "Step 8: Verification"
   - "Step 9: Final Answer"
   - "Step 10: Easy Explanation"
   - "Step 11: Exam Tips"
2. For each step, provide a detailed explanation in simple professor voice (under "explanation") and the corresponding math equation (under "equation").
3. NEVER wrap equations in $$ or $ inside the JSON string; just return clean LaTeX.
4. Show all intermediate calculations. Never skip a step or say "after simplifying".`,
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
Generate exactly 3 MCQ questions.
Requirements:
The "explanation" for each question MUST show the complete step-by-step solution formatted with the 11-step teaching methodology (Step 1 through Step 11) in plain text, with each step labeled.`,
  };
}

export function buildChallengePrompt(topic: string, level: string): SectionPrompt {
  return {
    system: BASE_SYSTEM,
    user: `Topic: "${topic}" | Level: "${level}"
Return JSON: { question, hint, correctAnswer, explanation }
One tough engineering-level challenge problem.
Requirements:
The "explanation" MUST show the complete step-by-step solution formatted with the 11-step teaching methodology (Step 1 through Step 11) in plain text, with each step labeled.`,
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
Be lenient with notation equivalence.
Requirements:
The "explanation" must provide the solution and feedback structured using the 11-step teaching methodology (Step 1 through Step 11) in plain text, with each step labeled.`,
  };
}
