import React, { useEffect, useRef, memo, useMemo } from 'react';
import katex from 'katex';

// ─── Text Normalizer ────────────────────────────────────────────────────────────
export function cleanResponseText(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Extract LaTeX from pre-rendered KaTeX/MathML annotation tags (display blocks)
  cleaned = cleaned.replace(
    /<div[^>]*class=["']math-block-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/div>/gi,
    (_, math) => `\n$$\n${math}\n$$\n`
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']math-display-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `\n$$\n${math}\n$$\n`
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']katex-display["'][^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `\n$$\n${math}\n$$\n`
  );

  // Extract LaTeX from inline KaTeX annotations
  cleaned = cleaned.replace(
    /<span[^>]*class=["']math-inline-container[^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `$${math}$`
  );
  cleaned = cleaned.replace(
    /<span[^>]*class=["']katex["'][^>]*>[\s\S]*?<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi,
    (_, math) => `$${math}$`
  );
  cleaned = cleaned.replace(
    /<annotation\s+encoding=["']application\/x-tex["']\s*>([\s\S]*?)<\/annotation>/gi,
    (_, math) => `$${math}$`
  );

  // Remove MathML
  cleaned = cleaned.replace(/<math[^>]*>[\s\S]*?<\/math>/gi, '');
  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return cleaned;
}

export function repairWordJoins(text: string): string {
  // Just an alias to keep the rest of the code from breaking immediately,
  // we will replace its usage entirely.
  return text;
}

export function convertProgrammingSyntaxToMath(text: string): string {
  if (!text) return '';
  let processed = text;

  // Replace comparison operators outside of existing math blocks?
  processed = processed.replace(/<=/g, '\\leq');
  processed = processed.replace(/>=/g, '\\geq');
  processed = processed.replace(/!=/g, '\\neq');
  processed = processed.replace(/->/g, '\\rightarrow');

  // Convert raw a^b or a_b into KaTeX by wrapping in $...$ if not already wrapped
  // This uses a lookbehind and lookahead to check for $ boundaries but simpler is just wrapping
  // words that contain ^ or _ that aren't inside math blocks. That's done in wrapRawLatexCommands.

  // sqrt(x) -> \sqrt{x}
  processed = processed.replace(/(?<!\\)sqrt\(([^)]+)\)/g, '$\\sqrt{$1}$');

  return processed;
}

export function applyTextFormattingRules(text: string): string {
  if (!text) return '';
  let processed = text;

  // 1. De-merge English Words (order matters for overlapping replacements)
  const wordSplits: [string, string][] = [
    ['Findtheeigenvaluesofthematrix', 'Find the eigenvalues of the matrix'],
    ['Thecharacteristicequation', 'The characteristic equation'],
    ['characteristicequation', 'Characteristic Equation'],
    ['identitymatrix', 'Identity Matrix'],
    ['eigenvaluematrix', 'Eigenvalue Matrix'],
    ['Findthe', 'Find the'],
    ['ofthematrix', 'of the matrix'],
    ['eigenvaluesof', 'eigenvalues of'],
    ['theeigenvalues', 'the eigenvalues']
  ];
  for (const [key, value] of wordSplits) {
    processed = processed.replace(new RegExp(key, 'gi'), value);
  }

  // 2. Format Variables vertically
  if (processed.includes(':') && processed.includes(',') && processed.split(',').length > 1) {
    const parts = processed.split(',');
    const allHaveColons = parts.every(p => p.includes(':'));
    if (allHaveColons) {
      let result = 'Variables\n';
      parts.forEach(p => {
        let [vars, desc] = p.split(':');
        desc = desc.trim();
        // Capitalize the first letter of the description to match the user's requirements
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        result += `• ${vars.trim()} → ${desc}\n`;
      });
      return result;
    }
  }

  // 3. Space out mathematical operators
  // We apply space padding around: = + − × ÷
  const operators = ['=', '\\+', '−', '×', '÷', '-'];
  for (const op of operators) {
    const regex = new RegExp(`(?<!\\s)(${op})(?!\\s)`, 'g');
    processed = processed.replace(regex, ' $1 ');
  }

  return processed;
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
  // We want to catch ANY leaked math: \lambda, ^, _, \frac, etc.
  // We will split the text by existing math blocks so we only process plain text parts.
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.startsWith('$') && !part.startsWith('\\[')) {
      let processed = part;
      // Catch bare \lambda, \frac, \begin, etc.
      const katexRegex = /\\(lambda|alpha|beta|gamma|delta|theta|pi|phi|psi|omega|sigma|sum|int|lim|frac|sqrt|begin|end|vmatrix|bmatrix|pmatrix|partial|nabla|left|right|infty|le|ge|ne|pm|to|Leftrightarrow|Rightarrow|cdot|times)/g;
      
      // If there's a leaked command, we wrap the contiguous mathy word in $
      processed = processed.replace(/(\\[a-zA-Z]+(?:\{[^{}]*\}|\s|[0-9]|\^|_|-|\+|=|\(|\))*)/g, '$$$1$$');
      
      // Catch leaked ^ or _ e.g. x^2 or a_1
      processed = processed.replace(/([a-zA-Z0-9]+[\^_][a-zA-Z0-9]+(?:[\^_][a-zA-Z0-9]+)*)/g, '$$$1$$');
      
      // Remove double dollars created by aggressive wrapping
      processed = processed.replace(/\$\$\$/g, '$');
      
      parts[i] = processed;
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
    let cleaned = cleanResponseText(text);
    if (!cleaned) return null;

    // 2. Convert programming syntax to math (x^2, sqrt, <=, etc)
    cleaned = convertProgrammingSyntaxToMath(cleaned);

    // 3. If the whole thing is raw math (no $ delimiters), render as a display block
    if (displayMode || (!cleaned.includes('$') && !cleaned.includes('\\(') && !cleaned.includes('\\[') && isRawMath(cleaned))) {
      return (
        <div className={`math-display-block ${className}`}>
          <SingleMathBlock math={cleaned} displayMode={true} />
        </div>
      );
    }

    // 4. Convert text-based matrices to LaTeX then auto-wrap bare commands
    let processed = convertTextMatricesToLatex(cleaned);
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
        // 5. Apply our text formatting rules to plain text
        const formattedText = applyTextFormattingRules(part);
        
        // Split on newlines to preserve paragraph spacing
        const lines = formattedText.split('\n');
        lines.forEach((line, li) => {
          if (li > 0) rendered.push(<br key={`br-${index}-${li}`} />);
          if (line) {
            rendered.push(
              <span key={`t-${index}-${li}`} className="whitespace-pre-wrap font-sans font-normal">
                {renderFormattedText(line)}
              </span>
            );
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
