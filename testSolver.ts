import dotenv from "dotenv";
dotenv.config();

console.log("=== Testing Online Groq Solver ===");
console.log("API Key loaded:", process.env.VITE_GROQ_API_KEY ? "YES" : "NO");

(async () => {
  try {
    const { generateMathSolution } = await import("./src/services/aiService.ts");
    const question = "Find the derivative of f(x) = (3x^2 + 2x) * sin(x)";
    console.log(`Querying: "${question}"...\n`);
    const answer = await generateMathSolution(question, "Engineering Mathematics");
    console.log("Groq AI Solver Response:\n");
    console.log(answer);
  } catch (e) {
    console.error("Error running solver test:", e);
  }
})();
