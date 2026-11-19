import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API health route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  const getGroqApiKey = (): string => {
    const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
    if (!apiKey || apiKey === "MY_GROQ_API_KEY") {
      throw new Error("GROQ_API_KEY or VITE_GROQ_API_KEY environment variable is required.");
    }
    return apiKey;
  };

  // AI Solver Endpoint
  app.post("/api/solver/solve", async (req, res) => {
    try {
      const apiKey = getGroqApiKey();
      const { problem, level, imageBase64, imageMime, learningMode } = req.body;
      
      let systemPrompt = `You are Professor MathVerse, a patient, encouraging, and expert engineering mathematics professor teaching like an experienced instructor solving problems on a classroom blackboard.

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

      let userPrompt = `Teach me how to solve this problem step by step, exactly like an engineering mathematics professor writing on a classroom blackboard.

Problem: "${problem}"
${level ? `Student Level: ${level}.` : ''}

MANDATORY: Structure your response with:
## Understanding the Question
## Given
## Find
## Step 1 — [Title]
(followed by dynamic sequential steps as needed)
## Final Answer

Never dump formulas at the beginning. Introduce each formula only when it becomes necessary in that specific step. Show every calculation line by line without skipping.`;

      let learningModeInstruction = "";
      if (learningMode === "simple") {
        learningModeInstruction = "The student needs SIMPLE teaching. Use very basic language. Break every single step into smaller sub-steps. Use relatable everyday examples.";
      } else if (learningMode === "visual") {
        learningModeInstruction = "The student prefers VISUAL teaching. Use spacing, alignment, and clear line-by-line layout. Make the solution look like it is drawn step by step on a blackboard.";
      } else if (learningMode === "exam_focused") {
        learningModeInstruction = "The student is preparing for an EXAM. Show all steps clearly. Highlight the formula and the final answer. Do not skip any calculation.";
      } else {
        learningModeInstruction = "Provide DETAILED teaching. Show every operation. Explain every transformation. Do not skip a single step.";
      }
      systemPrompt += `\n\nADDITIONAL INSTRUCTION: ${learningModeInstruction}`;

      let messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      let selectedModel = "openai/gpt-oss-120b";
      let fallbackModel = "qwen/qwen3.8-27b";

      if (imageBase64 && imageMime) {
        selectedModel = "qwen/qwen3.8-27b";
        fallbackModel = "qwen/qwen3.8-27b";
        messages.push({
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMime};base64,${imageBase64.replace(/^data:image\/[^;]+;base64,/, "")}`
              }
            }
          ]
        });
      } else {
        messages.push({
          role: "user",
          content: userPrompt
        });
      }

      let responseText = "";
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messages,
            temperature: 0.2
          })
        });
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || "";
      } catch (err) {
        console.warn(`Primary model ${selectedModel} failed on server, trying fallback...`, err);
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: fallbackModel,
            messages: messages,
            temperature: 0.2
          })
        });
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || "";
      }

      res.json({ result: responseText });
    } catch (err: any) {
      console.error("Solver Error:", err);
      res.status(500).json({ error: "MathVerse AI is temporarily unavailable." });
    }
  });

  // Practice Questions Generator Endpoint
  app.post("/api/practice/generate", async (req, res) => {
    try {
      const apiKey = getGroqApiKey();
      const { level, subject } = req.body;

      const systemPrompt = `Generate exactly 3 high-quality multiple-choice practice mathematical questions customized for standard tests.
      Selected Level Category: ${level || "Class 9-10"}
      Topic Area: ${subject || "Algebra and Equations"}

      Format the response strictly as a JSON array (no wrapping quotes or backticks prefix, just JSON) containing objects with the following keys:
      - "id" (unique number)
      - "question" (the question string)
      - "options" (array of exactly 4 choices as strings)
      - "correctAnswer" (the string matching exactly one of the options)
      - "explanation" (concise, educational detail of the answer)

      Ensure clean JSON parser compatibility. Use proper LaTeX formulas inside text if needed.`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the JSON practice questions array." }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      const textOutput = data.choices?.[0]?.message?.content || "{}";
      
      let parsed = JSON.parse(textOutput.trim());
      let questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      res.json({ questions });
    } catch (err: any) {
      console.error("Practice Gen Error:", err);
      res.status(500).json({ error: "MathVerse AI is temporarily unavailable." });
    }
  });

  // AI Study Plan Generator Endpoint
  app.post("/api/planner/generate", async (req, res) => {
    try {
      const apiKey = getGroqApiKey();
      const { weakTopics, level } = req.body;

      const topicsStr = Array.isArray(weakTopics) && weakTopics.length > 0
        ? weakTopics.join(", ")
        : "General Mathematics";

      const systemPrompt = `You are a highly capable AI Academic Coordinator and Study Advisor. 
      Generate a customized, professional, and immersive step-by-step study plan tailored for:
      - Academic Grade Level: "${level || "Class 9-10"}"
      - Focus Areas / Weak Math Topics: "${topicsStr}"

      Format the response in clean, beautiful Markdown. 
      Structure the plan with sections for:
      - "# Quantum Study Strategy Plan"
      - "## Core Target Calibration" (summarizing what topics they need to learn and why)
      - "## 7-Day Curricular Schedule" (day-by-day tasks, time blocks, and practice topics)
      - "## Specialized Revision Tips & Formulas" (provide common formulas for the subjects and quick tips)
      - "## Mental Wellness & Focus Rules" (inspiring focus and healthy studying advice)

      Use engaging, futuristic, and encouraging language. Wrap LaTeX math formulas in $...$ syntax like $f(x) = \int x\,dx$.`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate my math study plan." }
          ],
          temperature: 0.3
        })
      });

      let responseText = "";
      if (response.ok) {
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || "";
      } else {
        console.warn("Primary planner model failed, trying fallback...");
        const fallbackResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Generate my math study plan." }
            ],
            temperature: 0.3
          })
        });
        if (!fallbackResponse.ok) throw new Error(`Fallback status: ${fallbackResponse.status}`);
        const data = await fallbackResponse.json();
        responseText = data.choices?.[0]?.message?.content || "";
      }

      res.json({ plan: responseText });
    } catch (err: any) {
      console.error("Study Planner Gen Error:", err);
      res.status(500).json({ error: "MathVerse AI is temporarily unavailable." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

const startListening = (port: number) => {
  const server = app.listen(port, "0.0.0.0");
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const newPort = port + 1;
      console.warn(`Port ${port} in use, trying ${newPort}`);
      startListening(newPort);
    } else {
      console.error('Server error:', err);
    }
  });
  server.on('listening', () => {
    console.log("\n  🚀 \x1b[36m\x1b[1mMathVerse Server is active!\x1b[0m");
    console.log(`  ➜  \x1b[1mLocal:\x1b[0m    \x1b[35mhttp://localhost:${port}/\x1b[0m`);
    console.log(`  ➜  \x1b[1mNetwork:\x1b[0m  \x1b[35mhttp://127.0.0.1:${port}/\x1b[0m`);
    console.log(`  ➜  \x1b[1mAPI Health:\x1b[0m \x1b[32mhttp://localhost:${port}/api/health\x1b[0m\n`);
  });
};
startListening(PORT);
}

startServer().catch(console.error);
