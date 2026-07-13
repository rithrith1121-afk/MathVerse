/**
 * PromptBuilder — Centralizes every system instruction and user prompt template.
 * NEVER build prompts inside React components or services directly.
 */

import type { ModelConfig } from './models.config';

// ── Professor System Instruction ────────────────────────────────────────────

const PROFESSOR_SYSTEM_BASE = `You are Professor MathVerse, a friendly and expert engineering mathematics professor.

You teach exactly like a teacher writing clean notes in a student's class notebook.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYMBOL RULES — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use proper mathematical symbols everywhere:
  Calculus: d/dx, ∂/∂x, ∫, Σ, Π, lim
  Logic:    ∧ ∨ ¬ → ⇔ ∀ ∃
  Sets:     ∈ ∉ ⊂ ⊆ ∪ ∩ ∅ ℕ ℤ ℚ ℝ ℂ
  Comparison: ≠ ≤ ≥ ≈ ∞
  Special: ∴ ∵ √ ±

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE RULES — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Explain in plain English first, then show the mathematical expression.
- Every single step goes on its own line.
- Every continuation line starts with "=".
- NEVER skip a step or calculation.
- NEVER use report headings: Problem Understanding, Topic Identification, Summary.
- NEVER write dense packed notation.
- Use proper symbols — NEVER spell out "integral of" or "derivative of" inside an expression.
- Write like handwritten classroom notes, not a calculator printout.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED ANSWER FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Understand the Question
Step 2: Write the Given Expression
Step 3: Identify the Method
Step 4: Write the Formula (in words first, then symbols)
Step 5: Substitute Values (one substitution per line)
Step 6: Solve Step-by-Step (one operation per line)
Step 7: Simplify
Step 8: Final Answer (use ∴)
Step 9: Simple Explanation (3-5 sentences, plain English only)`;

// ── Learning Mode Suffix ────────────────────────────────────────────────────

function learningModeSuffix(mode?: string): string {
  switch (mode) {
    case 'simple':
      return '\n\nLEARNING MODE: SIMPLE — Use very basic language. Break every step into smaller sub-steps. Use relatable everyday examples.';
    case 'visual':
      return '\n\nLEARNING MODE: VISUAL — Use spacing and alignment to make the solution feel drawn step by step on a blackboard.';
    case 'exam_focused':
      return '\n\nLEARNING MODE: EXAM FOCUSED — Show all steps clearly. Highlight the formula and final answer. Do not skip any calculation.';
    default:
      return '\n\nLEARNING MODE: DETAILED — Show every operation, explain every transformation. Do not skip a single step.';
  }
}

// ── Exported Prompt Builders ────────────────────────────────────────────────

export interface SolveMathPrompts {
  system: string;
  user: string;
}

export function buildSolveMathPrompts(
  problem: string,
  level: string,
  learningMode?: string
): SolveMathPrompts {
  return {
    system: PROFESSOR_SYSTEM_BASE + learningModeSuffix(learningMode),
    user: `Teach me how to solve this step by step, exactly like writing class notes on a blackboard.

Problem: "${problem}"
Student Level: ${level}
IMPORTANT: Follow Step 1 through Step 9 format. Never use report-style headings. Never skip any step.`,
  };
}

export function buildImageSolvePrompts(
  level: string,
  learningMode?: string,
  additionalText?: string
): SolveMathPrompts {
  const imageInstruction = additionalText?.trim()
    ? `The student has also written: "${additionalText.trim()}". Extract the math problem from the image, combine with the student's note if relevant, and solve step by step.`
    : `Extract the exact math problem shown in the image and solve it step by step.`;

  return {
    system: PROFESSOR_SYSTEM_BASE + learningModeSuffix(learningMode),
    user: `${imageInstruction}\nStudent Level: ${level}.\nFollow Step 1 through Step 9. Never skip a step.`,
  };
}

export function buildTeachTopicPrompts(
  topic: string,
  level: string,
  section: 'concept' | 'formulas' | 'examples'
): SolveMathPrompts {
  const sectionInstructions: Record<string, string> = {
    concept: `Generate a conceptual introduction. Return ONLY valid JSON with keys:
- "introduction": Friendly topic introduction
- "whyImportant": Why this is important for engineers/students
- "applications": 2-3 real-world applications
- "basicConcepts": Explanation in simple words`,
    formulas: `Generate a formula sheet and derivation guide. Return ONLY valid JSON with keys:
- "definitions": Formal mathematical definitions in simple words
- "formulas": Array of { "name", "formula" (with proper symbols), "variables", "explanation" }
- "derivations": Full step-by-step derivation, one calculation per line`,
    examples: `Generate worked examples and tips. Return ONLY valid JSON with keys:
- "beginnerExample": { "question", "solution" (full step-by-step) }
- "mediumExample": { "question", "solution" }
- "engineeringExample": { "question", "solution" }
- "commonMistakes": String
- "shortTricks": String
- "examTips": String`,
  };

  return {
    system: `${PROFESSOR_SYSTEM_BASE}\n\nIMPORTANT: You must return only valid JSON. No markdown fences, no preamble, just JSON.`,
    user: `Topic: "${topic}"\nTarget Level: "${level}"\n\n${sectionInstructions[section]}`,
  };
}

export function buildQuizPrompts(topic: string, level: string): SolveMathPrompts {
  return {
    system: `You are a mathematics exam setter for ${level} students. Generate exactly 3 high-quality multiple-choice questions. Return ONLY valid JSON: { "questions": [ { "id", "question", "options" (array of 4), "correctAnswer", "explanation" } ] }. No markdown.`,
    user: `Topic: "${topic}"\nGenerate 3 MCQ questions in JSON.`,
  };
}

export function buildPracticeQuestionPrompts(
  topic: string,
  level: string,
  previousMistakes?: string[]
): SolveMathPrompts {
  const mistakeContext = previousMistakes?.length
    ? `\nStudent's previous mistakes to reinforce: ${previousMistakes.join('; ')}`
    : '';

  return {
    system: `You are Professor MathVerse generating a single practice problem. Return ONLY valid JSON: { "question", "correctAnswer", "hint" }. No markdown.`,
    user: `Topic: "${topic}"\nLevel: "${level}"${mistakeContext}\nGenerate one open-ended math problem.`,
  };
}

export function buildAnswerCheckPrompts(
  topic: string,
  question: string,
  studentAnswer: string,
  correctAnswer: string
): SolveMathPrompts {
  return {
    system: `You are Professor MathVerse evaluating a student's math answer. Be lenient with notation equivalence. Return ONLY valid JSON: { "isCorrect" (boolean), "explanation" (professor-style feedback), "newExample"? (optional, if wrong: { "question", "correctAnswer", "hint" }) }. No markdown.`,
    user: `Topic: "${topic}"\nQuestion: "${question}"\nStudent's Answer: "${studentAnswer}"\nReference Answer: "${correctAnswer}"\nAssess the answer.`,
  };
}

export function buildExplainStepPrompts(
  expression: string,
  level: string
): SolveMathPrompts {
  return {
    system: PROFESSOR_SYSTEM_BASE,
    user: `Explain this mathematical step in very simple terms for a ${level} student:\n${expression}\nWrite exactly like a professor explaining at a blackboard.`,
  };
}

export function buildStudyPlanPrompts(
  weakTopics: string[],
  level: string
): SolveMathPrompts {
  const topicsStr = weakTopics.length > 0 ? weakTopics.join(', ') : 'General Mathematics';
  return {
    system: `You are an AI Academic Coordinator. Generate a structured, motivating 7-day study plan in clean Markdown. Use ## section headings. Wrap LaTeX in $...$. Never use JSON.`,
    user: `Level: "${level}"\nFocus Topics: "${topicsStr}"\n\nGenerate a Quantum Study Strategy Plan with:\n- Core Target Calibration\n- 7-Day Curricular Schedule\n- Specialized Revision Tips & Formulas\n- Mental Wellness & Focus Rules`,
  };
}

export function buildChallengePrompts(topic: string, level: string): SolveMathPrompts {
  return {
    system: `Generate 1 tough challenge problem. Return ONLY valid JSON: { "question", "hint", "correctAnswer", "explanation" }. No markdown.`,
    user: `Topic: "${topic}"\nLevel: "${level}"\nGenerate an engineering-level challenge.`,
  };
}

export function buildAskProfessorPrompts(
  topic: string,
  level: string,
  chatHistory: { role: string; content: string }[],
  studentQuestion: string
): SolveMathPrompts {
  const historyStr = chatHistory
    .map(c => `${c.role === 'user' ? 'Student' : 'Professor'}: ${c.content}`)
    .join('\n');

  return {
    system: `${PROFESSOR_SYSTEM_BASE}\n\nYou are currently helping the student learn "${topic}" at the "${level}" level. Answer helpfully and supportively. If asked something unrelated to mathematics, gently redirect them.`,
    user: `${historyStr}\nStudent: ${studentQuestion}\nProfessor:`,
  };
}
