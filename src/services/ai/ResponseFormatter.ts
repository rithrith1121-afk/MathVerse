/**
 * ResponseFormatter — Converts raw AI text into styled MathVerse HTML.
 * Supports Markdown, LaTeX inline, mathematical symbols, and handwritten notes style.
 * Never display raw AI output in the UI — always pass through this formatter.
 */
import katex from 'katex';

/**
 * Escape HTML special characters to prevent XSS from AI output.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render LaTeX using KaTeX
 */
export function renderKatex(tex: string, displayMode = false): string {
  try {
    let clean = tex.trim();
    clean = clean.replace(/^[$]+|[$]+$/g, '').trim();
    clean = clean.replace(/^\\\(|\\\)$/g, '').trim();
    clean = clean.replace(/^\\\[|\\\]$/g, '').trim();
    clean = clean.replace(/\$/g, '');
    return katex.renderToString(clean, {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false
    });
  } catch (err) {
    return tex;
  }
}

/**
 * Convert multiline/text-based matrices or determinants into LaTeX so KaTeX can render them.
 */
function convertTextMatricesToLatex(text: string): string {
  const lines = text.split('\n');
  const processedLines: string[] = [];
  let inDet = false;
  let detRows: string[][] = [];
  let inMat = false;
  let matRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const isDetLine = trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 3 && !trimmed.slice(1, -1).includes('|');
    const isMatLine = trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 3 && !trimmed.includes(';');

    if (isDetLine) {
      if (inMat) {
        processedLines.push(flushMatrix(matRows));
        inMat = false;
        matRows = [];
      }
      inDet = true;
      const content = trimmed.slice(1, -1).trim();
      const elements = content.split(/\s+/);
      detRows.push(elements);
    } else if (isMatLine) {
      if (inDet) {
        processedLines.push(flushDeterminant(detRows));
        inDet = false;
        detRows = [];
      }
      inMat = true;
      const content = trimmed.slice(1, -1).trim();
      const elements = content.split(/\s+/);
      matRows.push(elements);
    } else {
      if (inDet) {
        processedLines.push(flushDeterminant(detRows));
        inDet = false;
        detRows = [];
      }
      if (inMat) {
        processedLines.push(flushMatrix(matRows));
        inMat = false;
        matRows = [];
      }

      if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.includes(';')) {
        const clean = trimmed.slice(1, -1);
        const rows = clean.split(';').map(r => r.trim().split(/\s+/).join(' & ')).join(' \\\\ ');
        processedLines.push(`$$\\begin{pmatrix} ${rows} \\end{pmatrix}$$`);
      } else {
        processedLines.push(line);
      }
    }
  }

  if (inDet) processedLines.push(flushDeterminant(detRows));
  if (inMat) processedLines.push(flushMatrix(matRows));

  return processedLines.join('\n');
}

function flushDeterminant(rows: string[][]): string {
  const latexRows = rows.map(r => r.join(' & ')).join(' \\\\ ');
  return `$$\\begin{vmatrix} ${latexRows} \\end{vmatrix}$$`;
}

function flushMatrix(rows: string[][]): string {
  const latexRows = rows.map(r => r.join(' & ')).join(' \\\\ ');
  return `$$\\begin{pmatrix} ${latexRows} \\end{pmatrix}$$`;
}

/**
 * Normalize LaTeX delimiters: \[...\] -> $$...$$ and \(...\) -> $...$
 */
export function normalizeMathDelimiters(text: string): string {
  if (!text) return '';
  let str = text;
  str = str.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`);
  str = str.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
  const parts = str.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('$')) {
      parts[i] = parts[i].replace(
        /(\\begin\{(?:aligned|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|align\*?)\}[\s\S]*?\\end\{(?:aligned|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|align\*?)\})/g,
        (match) => `\n$$\n${match.trim()}\n$$\n`
      );
    }
  }
  return parts.join('');
}

/**
 * Wrap raw LaTeX commands if they are not already inside $ or $$
 */
function wrapRawLatexCommands(text: string): string {
  if (!text) return '';
  const normalized = normalizeMathDelimiters(text);
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('$')) continue;

    let processed = part;
    processed = processed.replace(/(?<!\$)\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}(?!\$)/g, '$$\\boxed{$1}$$');
    processed = processed.replace(/(?<!\$)\\frac\{([^{}]+)\}\{([^{}]+)\}(?!\$)/g, '$\\frac{$1}{$2}$');
    processed = processed.replace(/(?<!\$)\\sqrt\{([^{}]+)\}(?!\$)/g, '$\\sqrt{$1}$');

    processed = processed.replace(/(?<!\$)\\([a-zA-Z]+(?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+)?)(?!\$)/g, (match, cmd) => {
      const knownMathSymbols = /^(lambda|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|partial|nabla|infty|pm|mp|times|div|cdot|approx|neq|leq|geq|in|notin|subset|subseteq|cap|cup|forall|exists|to|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow)\b/;
      if (knownMathSymbols.test(cmd)) {
        return `$${match}$`;
      }
      return match;
    });

    parts[i] = processed;
  }
  return parts.join('');
}

/**
 * Parse attractive callout boxes for special highlights.
 */
function parseCallouts(text: string): string {
  text = text.replace(/(?:Important Formula|Formula):\s*(.*?)(?=\n|<div|$)/gi, '<div class="callout-box formula-callout my-4 p-4 rounded-xl border-l-4 border-cyan-500 bg-cyan-950/20 text-slate-300 font-sans shadow-lg flex gap-3 items-start"><span class="text-lg">⚡</span><div><strong class="text-cyan-400 block font-mono text-xs uppercase tracking-wider mb-1">Important Formula</strong>$1</div></div>');
  text = text.replace(/Note:\s*(.*?)(?=\n|<div|$)/gi, '<div class="callout-box note-callout my-4 p-4 rounded-xl border-l-4 border-purple-500 bg-purple-950/20 text-slate-300 font-sans shadow-lg flex gap-3 items-start"><span class="text-lg">📌</span><div><strong class="text-purple-400 block font-mono text-xs uppercase tracking-wider mb-1">Note</strong>$1</div></div>');
  text = text.replace(/Shortcut:\s*(.*?)(?=\n|<div|$)/gi, '<div class="callout-box shortcut-callout my-4 p-4 rounded-xl border-l-4 border-emerald-500 bg-emerald-950/20 text-slate-300 font-sans shadow-lg flex gap-3 items-start"><span class="text-lg">🚀</span><div><strong class="text-emerald-400 block font-mono text-xs uppercase tracking-wider mb-1">Shortcut</strong>$1</div></div>');
  text = text.replace(/(?:Exam Tip|Tip):\s*(.*?)(?=\n|<div|$)/gi, '<div class="callout-box tip-callout my-4 p-4 rounded-xl border-l-4 border-amber-500 bg-amber-950/20 text-slate-300 font-sans shadow-lg flex gap-3 items-start"><span class="text-lg">🎯</span><div><strong class="text-amber-400 block font-mono text-xs uppercase tracking-wider mb-1">Exam Tip</strong>$1</div></div>');
  text = text.replace(/(?:Common Mistake|Mistake):\s*(.*?)(?=\n|<div|$)/gi, '<div class="callout-box mistake-callout my-4 p-4 rounded-xl border-l-4 border-red-500 bg-red-950/20 text-slate-300 font-sans shadow-lg flex gap-3 items-start"><span class="text-lg">⚠️</span><div><strong class="text-red-400 block font-mono text-xs uppercase tracking-wider mb-1">Common Mistake</strong>$1</div></div>');
  return text;
}

/**
 * Replace math patterns with KaTeX HTML in a string.
 */
export function renderMathInText(text: string): string {
  if (!text) return '';
  let processed = convertTextMatricesToLatex(text);
  processed = wrapRawLatexCommands(processed);
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `<div class="math-block-container my-4 text-center overflow-x-auto select-all p-2 rounded-lg bg-slate-950/20 border border-slate-900/40">${renderKatex(math, true)}</div>`);
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `<div class="math-block-container my-4 text-center overflow-x-auto select-all p-2 rounded-lg bg-slate-950/20 border border-slate-900/40">${renderKatex(math, true)}</div>`);
  processed = processed.replace(/\$([^$]+)\$/g, (_, math) => `<span class="math-inline-container inline-block font-sans select-all px-1">${renderKatex(math, false)}</span>`);
  processed = processed.replace(/\\\((.*?)\\\)/g, (_, math) => `<span class="math-inline-container inline-block font-sans select-all px-1">${renderKatex(math, false)}</span>`);
  return processed;
}

/**
 * Apply inline formatting: bold, italic, code.
 */
function applyInlineFormatting(line: string): string {
  line = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-cyan-400 font-semibold">$1</strong>');
  line = line.replace(/\*(.*?)\*/g, '<em class="text-purple-300">$1</em>');
  line = line.replace(/`([^`]+)`/g, '<code class="bg-[#0f131f] border border-slate-800 font-mono text-xs px-1.5 py-0.5 rounded text-cyan-300">$1</code>');
  return line;
}

/**
 * Convert a full AI markdown response string to styled HTML for display.
 */
export function formatResponse(rawText: string): string {
  if (!rawText) return '';

  const escaped = escapeHtml(rawText);
  const processedMath = renderMathInText(escaped);
  const lines = processedMath.split('\n');
  const outputLines: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        outputLines.push(`<pre class="bg-slate-950 font-mono text-xs p-4 rounded-xl border border-slate-800 text-teal-300 overflow-x-auto my-4 select-all">${codeBuffer.join('\n')}</pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(raw);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      outputLines.push(`<h4 class="text-[#00d2ff] font-bold text-sm mt-4 mb-1.5 font-mono">${applyInlineFormatting(trimmed.slice(4))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      outputLines.push(`<h3 class="text-md font-bold text-purple-400 border-b border-white/5 pb-1 mt-6 mb-2 font-mono">${applyInlineFormatting(trimmed.slice(3))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      outputLines.push(`<h2 class="text-lg font-extrabold text-white mt-8 mb-3 font-mono">${applyInlineFormatting(trimmed.slice(2))}</h2>`);
      continue;
    }
    if (/^[-─━]{3,}$/.test(trimmed)) {
      outputLines.push('<hr class="border-slate-800 my-3" />');
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*+]\s+/, '');
      outputLines.push(`<li class="ml-5 list-disc text-sm text-slate-300 mb-1 leading-relaxed">${applyInlineFormatting(content)}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const content = trimmed.replace(/^\d+\.\s+/, '');
      outputLines.push(`<li class="ml-5 list-decimal text-sm text-slate-300 mb-1 leading-relaxed">${applyInlineFormatting(content)}</li>`);
      continue;
    }
    if (!trimmed) {
      outputLines.push('<div class="h-2"></div>');
      continue;
    }
    if (/^Step\s+\d+[:\s]/i.test(trimmed)) {
      outputLines.push(`<p class="text-sm font-bold text-[#00FBFF] mt-4 mb-1 font-mono leading-relaxed">${applyInlineFormatting(trimmed)}</p>`);
      continue;
    }
    if (trimmed.startsWith('=')) {
      outputLines.push(`<p class="text-sm font-mono text-cyan-300 ml-4 mb-0.5 leading-relaxed">${applyInlineFormatting(trimmed)}</p>`);
      continue;
    }
    if (trimmed.startsWith('∴') || trimmed.toLowerCase().startsWith('final answer')) {
      outputLines.push(`<p class="text-sm font-bold text-emerald-400 mt-3 mb-1 font-mono leading-relaxed">${applyInlineFormatting(trimmed)}</p>`);
      continue;
    }
    outputLines.push(`<p class="text-sm text-slate-300 leading-relaxed mb-1.5 font-sans">${applyInlineFormatting(trimmed)}</p>`);
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    outputLines.push(`<pre class="bg-slate-950 font-mono text-xs p-4 rounded-xl border border-slate-800 text-teal-300 overflow-x-auto my-4">${codeBuffer.join('\n')}</pre>`);
  }

  return parseCallouts(outputLines.join(''));
}

/**
 * Strip HTML tags from formatted response (for clipboard copy).
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Safely parse a JSON response from the AI, with a fallback.
 */
export function parseJsonResponse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
