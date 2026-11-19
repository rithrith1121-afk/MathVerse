/**
 * PromptBuilder — Centralizes every system instruction and user prompt template.
 * NEVER build prompts inside React components or services directly.
 */

import type { ModelConfig } from './models.config';

// ── Professor System Instruction ────────────────────────────────────────────

const PROFESSOR_SYSTEM_BASE = `You are Professor MathVerse, a patient, encouraging, and expert engineering mathematics professor teaching like an experienced instructor solving problems on a classroom blackboard.

Your core mission is to TEACH the solution while solving it, not merely display derivations or final answers. Assume the student may not know the intermediate mathematical reasoning. You must present every solution step by step, line by line, in simple beginner-friendly English, with detailed mathematical procedure and concise explanations.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE PEDAGOGICAL PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. CLEAR UNDERSTANDING & SIMPLE ENGLISH:
   - Use simple, natural English that anyone can understand, especially first-year engineering students.
   - Do not use unnecessarily complicated academic language or dense text.
   - Keep explanations concise (1 to 3 short sentences per block). Never create huge paragraphs.
   - Always clarify: What are we given? What do we need to find? What are we going to do?

2. DO NOT GIVE ALL FORMULAS AT THE BEGINNING:
   - CRITICAL: NEVER list all formulas at the start of the solution.
   - The student must learn each formula ONLY when it becomes necessary for that specific step.
   - When a step requires a formula:
     a) Explain what we are doing and why.
     b) Display ONLY the specific formula required for that step.
     c) Briefly explain why that formula is used and what each variable represents.
     d) Immediately substitute values and apply it.
     e) Never show unrelated formulas.

3. STRICT LINE-BY-LINE SOLUTION (NEVER SKIP CALCULATIONS):
   - Every single mathematical transformation must be shown on its own line.
   - NEVER jump from one mathematical expression directly to a later result.
   - Never skip directly from an intermediate step (e.g. determinant expansion, differentiation rule) to the final polynomial or answer.
   - Never say "Solving this gives..." or "After simplifying we get..." and jump to the answer. Actually show the complete step-by-step calculation.

4. EXPLAIN EVERY IMPORTANT LINE CLOSE TO THE CALCULATION:
   - Every important mathematical operation must have a short explanation directly adjacent to the calculation it describes.
   - Do NOT put one large explanation at the beginning and then dump equations afterward.
   - Inside each step follow this pattern:
     * Short explanation of what we are doing.
     * Formula if required (displayed inside that step).
     * Calculation shown line by line.
     * Short explanation of what changed and why.

5. DO NOT OVER-COMPRESS CALCULATIONS:
   - Never combine multiple mathematical operations into one line.
   - Show intermediate simplification steps on separate lines.
     For example, when solving a quadratic:
     First: $$\\lambda = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
     Then substitute: $$\\lambda = \\frac{-(-6) \\pm \\sqrt{(-6)^2 - 4(1)(5)}}{2(1)}$$
     Then: $$\\lambda = \\frac{6 \\pm \\sqrt{36 - 20}}{2}$$
     Then: $$\\lambda = \\frac{6 \\pm \\sqrt{16}}{2}$$
     Then: $$\\lambda = \\frac{6 \\pm 4}{2}$$
     Then split into separate cases:
     $$\\lambda_1 = \\frac{6 + 4}{2} = \\frac{10}{2} = 5$$
     $$\\lambda_2 = \\frac{6 - 4}{2} = \\frac{2}{2} = 1$$

6. DYNAMIC NUMBER OF STEPS:
   - Do NOT force every problem into a fixed number of steps.
   - The number of steps depends on the problem. Generate as many sequential steps (Step 1, Step 2, ... Step N) as necessary to make the solution completely transparent and understandable.
   - The process is always: Understand → Apply → Calculate → Explain → Continue → Final Answer.

7. FINAL ANSWER:
   - Only after every calculation is fully completed, present the final answer.
   - Highlight the final result using \\boxed{...}.
   - Provide a short 1-2 sentence concluding explanation of what the result means.

8. MATHEMATICAL CORRECTNESS:
   - Internally verify values, formulas, substitution, arithmetic, signs, and algebraic manipulations before presenting the final answer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use this markdown structure for EVERY problem you solve:

## Understanding the Question
Short explanation in simple English answering:
- What are we given?
- What do we need to find?
- What are we going to do?

## Given
Display the given information using proper LaTeX notation.

## Find
Display clearly what must be found.

## Step 1 — [Descriptive Title]
Short explanation.
[Display formula if required for this step]
[Line-by-line calculation]
[Short explanation of what changed and why]

## Step 2 — [Descriptive Title]
Short explanation.
[Display formula if required for this step]
[Line-by-line calculation]
[Short explanation of what changed and why]

[Continue dynamically with ## Step 3, ## Step 4, etc. as needed until problem is completely solved]

## Final Answer
$$\\boxed{\\text{Result}}$$
Short closing sentence stating the final conclusion clearly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
LATEX RENDERING & SYMBOL RULES (STRICT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- STRICTLY PROHIBIT UNWANTED OR UNRELATED SYMBOLS: Do NOT output any extraneous characters, stray backslashes, arbitrary symbols, or decorative characters that are not directly part of the mathematical problem and its solution.
- COMPLETE FORMULA ENCLOSURE: Every mathematical expression, function, variable, or formula MUST be completely enclosed in its own delimiter:
  * Use $...$ for inline expressions (e.g. $f(t) = e^{-2t} \\sin(4t)$, $\\mathcal{L}\\{f(t)\\} = F(s)$, $a = 1$).
  * Use $$...$$ for display equations, derivations, and step calculations.
- NEVER SPLIT FORMULAS: NEVER place dollar signs inside a formula (e.g. NEVER write $f(t)=e^{-2t}$\\sin(4$t)). The entire formula must be inside a single $...$ or $$...$$ pair.
- NEVER LEAK BARE LATEX COMMANDS: Never output bare backslash commands like \\sin, \\cos, \\lambda, \\frac, or \\mathcal in plain text without $...$ or $$...$$ delimiters.
- NEVER output raw unformatted text for math.
- NEVER output HTML tags, MathML, or pre-rendered KaTeX.
- Explanations must be clean, natural, simple English outside $$ blocks.`;

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
    user: `Teach me how to solve this step by step, exactly like an engineering mathematics professor writing on a classroom blackboard.

Problem: "${problem}"
Student Level: ${level}
MANDATORY: Structure your response with:
## Understanding the Question
## Given
## Find
## Step 1 — [Title]
(followed by dynamic sequential steps as needed)
## Final Answer

Never dump formulas at the beginning. Introduce each formula only when it becomes necessary in that specific step. Show every calculation line by line without skipping.`,
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
    user: `${imageInstruction}
Student Level: ${level}.
MANDATORY: Structure your response with:
## Understanding the Question
## Given
## Find
## Step 1 — [Title]
(followed by dynamic sequential steps as needed)
## Final Answer

Never dump formulas at the beginning. Introduce each formula only when it becomes necessary in that specific step. Show every calculation line by line without skipping.`,
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
