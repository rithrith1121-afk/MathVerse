import React, { useEffect, useRef, memo, useMemo } from 'react';
import katex from 'katex';

// ─── Text Repair ───────────────────────────────────────────────────────────────
// Fixes AI output where words get fused together (e.g. "Theeigenvaluesare...")
function repairWordJoins(text: string): string {
  if (!text) return '';

  // Insert space before capital letters that immediately follow a lowercase letter
  // e.g. "TheEigenvalues" → "The Eigenvalues"
  let fixed = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Insert space after punctuation if missing (but not inside math)
  fixed = fixed.replace(/([.,;:!?])([A-Za-z])/g, '$1 $2');

  // Fix common mashed-word patterns from AI response quirks
  fixed = fixed
    .replace(/(\w)(∴|∵|∈|∉|∪|∩|⊂|⊆|≤|≥|≠|≈|⇒|⇔|→|↦)/g, '$1 $2')
    .replace(/(∴|∵|∈|∉|∪|∩|⊂|⊆|≤|≥|≠|≈|⇒|⇔|→|↦)(\w)/g, '$1 $2');

  return fixed;
}

// ─── HTML / MathML Cleaner ─────────────────────────────────────────────────────
export function cleanResponseText(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Extract LaTeX from pre-rendered KaTeX/MathML annotation tags (display blocks)
  cleaned = cleaned.replace(
    /<div[^>]*class=["']math-block-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/div>/gi,
    (_, math) => `\n$$\n${math.trim()}\n$$\n`
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']math-display-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `\n$$\n${math.trim()}\n$$\n`
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']katex-display["'][^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `\n$$\n${math.trim()}\n$$\n`
  );

  // Extract LaTeX from inline KaTeX annotations
  cleaned = cleaned.replace(
    /<span[^>]*class=["']math-inline-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => ` $${math.trim()}$ `
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']katex["'][^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => ` $${math.trim()}$ `
  );
  cleaned = cleaned.replace(
    /<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>/gi,
    (_, math) => ` $${math.trim()}$ `
  );

  // Remove MathML
  cleaned = cleaned.replace(/<math[^>]*>[\s\S]*?<\/math>/gi, '');
  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  // Collapse multiple spaces
  cleaned = cleaned.replace(/ {2,}/g, ' ');

  // Decode HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return cleaned.trim();
}

// ─── Raw Math Detection ────────────────────────────────────────────────────────
export function isRawMath(text: string): boolean {
  const mathRegex = /\\(lambda|alpha|beta|gamma|delta|theta|pi|phi|psi|omega|sigma|sum|int|lim|frac|sqrt|begin|end|vmatrix|bmatrix|pmatrix|partial|nabla|left|right|infty|le|ge|ne|pm|to|Leftrightarrow|Rightarrow|cdot|times|vec|diff|der)/;
  const commonOperators = /[=\-+*/^_\u222B\u2211\u03BB\u03B1\u03B2\u03B3\u03B4\u03B8\u03C0\u03D5\u03C8\u03C9\u03C3\u2202\u2207\u221A\u2234\u2208\u222A\u2229\u2264\u2265\u2260\u2248\u221E\u2227\u2228\u00AC]/;
  return mathRegex.test(text) || commonOperators.test(text);
}

// ─── Matrix / Determinant Converter ───────────────────────────────────────────
export function convertTextMatricesToLatex(text: string): string {
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
      if (inMat) { processedLines.push(flushMatrix(matRows)); inMat = false; matRows = []; }
      inDet = true;
      detRows.push(trimmed.slice(1, -1).trim().split(/\s+/));
    } else if (isMatLine) {
      if (inDet) { processedLines.push(flushDeterminant(detRows)); inDet = false; detRows = []; }
      inMat = true;
      matRows.push(trimmed.slice(1, -1).trim().split(/\s+/));
    } else {
      if (inDet) { processedLines.push(flushDeterminant(detRows)); inDet = false; detRows = []; }
      if (inMat) { processedLines.push(flushMatrix(matRows)); inMat = false; matRows = []; }
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
  return `$$\\begin{vmatrix} ${rows.map(r => r.join(' & ')).join(' \\\\ ')} \\end{vmatrix}$$`;
}

function flushMatrix(rows: string[][]): string {
  return `$$\\begin{pmatrix} ${rows.map(r => r.join(' & ')).join(' \\\\ ')} \\end{pmatrix}$$`;
}

// ─── Auto-wrap Bare LaTeX Commands ────────────────────────────────────────────
export function wrapRawLatexCommands(text: string): string {
  const katexRegex = /\\(lambda|alpha|beta|gamma|delta|theta|pi|phi|psi|omega|sigma|sum|int|lim|frac|sqrt|begin|end|vmatrix|bmatrix|pmatrix|partial|nabla|left|right|infty|le|ge|ne|pm|to|Leftrightarrow|Rightarrow|cdot|times)/;
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.startsWith('$') && !part.startsWith('\\[')) {
      if (katexRegex.test(part)) {
        parts[i] = part.replace(/(\\[a-zA-Z]+(?:\{[^{}]*\}|\s|[0-9]|\^|-|\+|=|\(|\))*)/g, '$$1$');
      }
    }
  }
  return parts.join('');
}

// ─── Single Math Block (KaTeX) ────────────────────────────────────────────────
interface SingleMathBlockProps {
  math: string;
  displayMode?: boolean;
  className?: string;
}

export const SingleMathBlock = memo<SingleMathBlockProps>(({ math, displayMode = false, className = '' }) => {
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    try {
      katex.render(math.trim(), elementRef.current, {
        displayMode,
        throwOnError: false,
        trust: true,
        strict: false,
        // Responsive: allow line breaks inside display math
        ...(displayMode ? { maxSize: Infinity } : {}),
      });
    } catch (err) {
      if (elementRef.current) elementRef.current.textContent = math;
    }
  }, [math, displayMode]);

  return <span ref={elementRef} className={className} />;
});
SingleMathBlock.displayName = 'SingleMathBlock';

// ─── Rich Text (bold / italic / code) ─────────────────────────────────────────
function renderFormattedText(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={index} className="text-cyan-300 font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={index} className="text-purple-300 italic">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index} className="bg-slate-900/80 border border-slate-700 font-mono text-[0.85em] px-1.5 py-0.5 rounded text-cyan-300">{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
}

// ─── MathRenderer Props ────────────────────────────────────────────────────────
interface MathRendererProps {
  /** Raw AI text that may contain $...$ inline or $$...$$ display math */
  text: string;
  /** Force the entire content into display mode (centres equation) */
  displayMode?: boolean;
  className?: string;
  /** When true the outer wrapper is a <div> not a <span> (use for block contexts) */
  block?: boolean;
}

// ─── Main MathRenderer ────────────────────────────────────────────────────────
export const MathRenderer = memo<MathRendererProps>(({ text, displayMode = false, className = '', block = false }) => {
  const nodes = useMemo(() => {
    if (!text) return null;

    // 1. Strip / convert any legacy HTML / MathML
    const cleaned = cleanResponseText(text);
    if (!cleaned) return null;

    // 2. Repair fused words from AI output
    const repaired = repairWordJoins(cleaned);

    // 3. If the whole thing is raw math (no $ delimiters), render as a display block
    if (displayMode || (!repaired.includes('$') && !repaired.includes('\\(') && !repaired.includes('\\[') && isRawMath(repaired))) {
      return (
        <div className={`math-display-block ${className}`}>
          <SingleMathBlock math={repaired} displayMode={true} />
        </div>
      );
    }

    // 4. Convert text-based matrices to LaTeX then auto-wrap bare commands
    let processed = convertTextMatricesToLatex(repaired);
    processed = wrapRawLatexCommands(processed);

    // 5. Split on math delimiters
    const splitRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\))/g;
    const parts = processed.split(splitRegex);

    const rendered: React.ReactNode[] = [];
    let hasBlock = false;

    parts.forEach((part, index) => {
      if (!part) return;

      if ((part.startsWith('$$') && part.endsWith('$$')) ||
          (part.startsWith('\\[') && part.endsWith('\\]'))) {
        hasBlock = true;
        const math = part.startsWith('$$') ? part.slice(2, -2).trim() : part.slice(2, -2).trim();
        rendered.push(
          <div key={index} className="math-display-block">
            <SingleMathBlock math={math} displayMode={true} />
          </div>
        );
      } else if ((part.startsWith('$') && part.endsWith('$')) ||
                 (part.startsWith('\\(') && part.endsWith('\\)'))) {
        const math = part.startsWith('$') ? part.slice(1, -1).trim() : part.slice(2, -2).trim();
        rendered.push(
          <span key={index} className="math-inline-container">
            <SingleMathBlock math={math} displayMode={false} />
          </span>
        );
      } else {
        // Plain text — split on newlines to insert paragraph breaks
        const lines = part.split('\n');
        lines.forEach((line, li) => {
          const trimmed = line.trim();
          if (!trimmed) {
            if (li > 0) rendered.push(<br key={`br-${index}-${li}`} />);
            return;
          }
          rendered.push(
            <span key={`t-${index}-${li}`}>
              {renderFormattedText(trimmed)}
            </span>
          );
          // Add a space between text segments on same line
          if (li < lines.length - 1 && lines[li + 1]?.trim()) {
            rendered.push(' ');
          }
        });
      }
    });

    // If any display-math blocks exist we must return a <div> not <span>
    if (hasBlock || block) return { nodes: rendered, needsDiv: true };
    return { nodes: rendered, needsDiv: false };
  }, [text, displayMode, className, block]);

  if (!nodes) return null;

  if (typeof nodes === 'object' && 'needsDiv' in nodes) {
    const { nodes: children, needsDiv } = nodes as { nodes: React.ReactNode[]; needsDiv: boolean };
    if (needsDiv) {
      return <div className={`math-content ${className}`}>{children}</div>;
    }
    return <span className={`math-content ${className}`}>{children}</span>;
  }

  // displayMode single-block path (already a <div>)
  return nodes as React.ReactElement;
});
MathRenderer.displayName = 'MathRenderer';

// ─── Convenience wrapper: always renders as a <div> block ─────────────────────
export const MathBlock: React.FC<{ text: string; className?: string }> = memo(({ text, className = '' }) => (
  <MathRenderer text={text} block={true} className={className} />
));
MathBlock.displayName = 'MathBlock';
