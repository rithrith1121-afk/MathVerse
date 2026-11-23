/**
 * pdfService.ts — Content-First, Zero-Clipping A4 Engineering Answer Key PDF Export Engine.
 *
 * Reproduces MathVerse's mathematical rendering with 100% fidelity directly from DOM nodes,
 * preventing string corruption, unclipped equations, unsevered fractions, and dynamic A4 pagination.
 */

import 'katex/dist/katex.min.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import katex from 'katex';
import {
  cleanResponseText,
  convertProgrammingSyntaxToMath,
  convertTextMatricesToLatex,
  normalizeMathDelimiters,
  wrapRawLatexCommands,
} from '../components/MathRenderer';

export interface GeneratePdfOptions {
  problemText: string;
  solutionRaw: string;
  levelName?: string;
}

/**
 * Sanitize a string into a clean, filesystem-safe filename.
 */
function generateFilename(problem: string): string {
  if (!problem) return 'MathVerse_Answer_Key.pdf';
  const cleaned = problem
    .replace(/^(find|solve|evaluate|compute|calculate|what is the)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 32);

  return cleaned ? `MathVerse_Answer_Key_${cleaned}.pdf` : 'MathVerse_Answer_Key.pdf';
}

/**
 * Escape HTML special characters for safe fallback text injection.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Append formatted inline text (bold, italic, code) into a parent DOM node without touching KaTeX nodes.
 */
function appendFormattedText(text: string, container: HTMLElement): void {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.style.color = '#0f172a';
      strong.style.fontWeight = '600';
      strong.textContent = part.slice(2, -2);
      container.appendChild(strong);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      const em = document.createElement('em');
      em.style.color = '#475569';
      em.style.fontStyle = 'italic';
      em.textContent = part.slice(1, -1);
      container.appendChild(em);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.style.fontFamily = 'monospace';
      code.style.fontSize = '8.5pt';
      code.style.background = '#f1f5f9';
      code.style.padding = '1px 4px';
      code.style.borderRadius = '3px';
      code.style.color = '#0891b2';
      code.textContent = part.slice(1, -1);
      container.appendChild(code);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * Render mixed text with inline math ($...$) into a container DOM node directly.
 * Zero string replacement over KaTeX markup.
 */
function renderInlineContent(text: string, container: HTMLElement): void {
  if (!text) return;

  // Split on inline math boundaries $...$
  const parts = text.split(/(\$[^$]+?\$)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('$') && part.endsWith('$')) {
      const math = part.slice(1, -1).trim();
      const mathSpan = document.createElement('span');
      mathSpan.className = 'pdf-math-inline';
      mathSpan.style.display = 'inline-block';
      mathSpan.style.verticalAlign = '-1px';
      mathSpan.style.margin = '0 1.5px';
      mathSpan.style.color = '#0f172a';

      try {
        katex.render(math, mathSpan, {
          displayMode: false,
          throwOnError: false,
          trust: true,
          strict: false,
        });
      } catch {
        mathSpan.textContent = part;
      }
      container.appendChild(mathSpan);
    } else {
      appendFormattedText(part, container);
    }
  }
}

/**
 * Represents an indivisible logical block of mathematical solution content.
 */
interface RenderBlock {
  type: 'display-math' | 'text' | 'bullet' | 'subheading' | 'callout';
  content: string;
  calloutType?: 'formula' | 'note' | 'tip' | 'shortcut' | 'mistake';
  /** True when this block is the continuation of a block split across a page break. */
  continued?: boolean;
}

/**
 * Parse a section's markdown body into atomic logical blocks.
 * Preserves display math blocks intact and isolates paragraphs and bullets.
 */
function parseBodyIntoBlocks(body: string): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  const lines = body.split('\n');
  let textBuffer: string[] = [];
  let inDisplayMath = false;
  let mathBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      const fullText = textBuffer.join('\n').trim();
      if (fullText) {
        // Detect callouts
        if (/^(?:Important Formula|Formula):/i.test(fullText)) {
          blocks.push({
            type: 'callout',
            calloutType: 'formula',
            content: fullText.replace(/^(?:Important Formula|Formula):\s*/i, '').trim(),
          });
        } else if (/^Note:/i.test(fullText)) {
          blocks.push({
            type: 'callout',
            calloutType: 'note',
            content: fullText.replace(/^Note:\s*/i, '').trim(),
          });
        } else if (/^(?:Exam Tip|Tip):/i.test(fullText)) {
          blocks.push({
            type: 'callout',
            calloutType: 'tip',
            content: fullText.replace(/^(?:Exam Tip|Tip):\s*/i, '').trim(),
          });
        } else if (/^Shortcut:/i.test(fullText)) {
          blocks.push({
            type: 'callout',
            calloutType: 'shortcut',
            content: fullText.replace(/^Shortcut:\s*/i, '').trim(),
          });
        } else if (/^(?:Common Mistake|Mistake):/i.test(fullText)) {
          blocks.push({
            type: 'callout',
            calloutType: 'mistake',
            content: fullText.replace(/^(?:Common Mistake|Mistake):\s*/i, '').trim(),
          });
        } else if (fullText.startsWith('- ') || fullText.startsWith('• ') || fullText.startsWith('* ')) {
          blocks.push({ type: 'bullet', content: fullText });
        } else if (fullText.startsWith('### ')) {
          blocks.push({ type: 'subheading', content: fullText.slice(4).trim() });
        } else {
          blocks.push({ type: 'text', content: fullText });
        }
      }
      textBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('$$')) {
      if (inDisplayMath) {
        // Closing $$
        mathBuffer.push(trimmed.slice(0, trimmed.endsWith('$$') && trimmed.length > 2 ? -2 : undefined));
        blocks.push({
          type: 'display-math',
          content: mathBuffer.join('\n').replace(/\$\$/g, '').trim(),
        });
        mathBuffer = [];
        inDisplayMath = false;
      } else {
        // Opening $$
        flushText();
        if (trimmed.endsWith('$$') && trimmed.length > 2) {
          // Single-line display equation: $$...$$
          blocks.push({ type: 'display-math', content: trimmed.slice(2, -2).trim() });
        } else {
          inDisplayMath = true;
          mathBuffer.push(trimmed.slice(2));
        }
      }
    } else if (inDisplayMath) {
      mathBuffer.push(line);
    } else {
      if (!trimmed) {
        flushText();
      } else {
        textBuffer.push(line);
      }
    }
  }

  flushText();
  if (mathBuffer.length > 0) {
    blocks.push({
      type: 'display-math',
      content: mathBuffer.join('\n').replace(/\$\$/g, '').trim(),
    });
  }

  return blocks;
}

/**
 * Creates an unclipped, auto-height DOM element representing a logical block.
 */
function createBlockElement(block: RenderBlock): HTMLElement {
  if (block.type === 'display-math') {
    const mathDiv = document.createElement('div');
    mathDiv.className = 'pdf-math-display';
    mathDiv.style.margin = '6px 0';
    mathDiv.style.padding = '3px 0';
    mathDiv.style.textAlign = 'center';
    mathDiv.style.color = '#0f172a';
    mathDiv.style.lineHeight = '1.3';
    mathDiv.style.width = '100%';
    mathDiv.style.boxSizing = 'border-box';

    try {
      katex.render(block.content, mathDiv, {
        displayMode: true,
        throwOnError: false,
        trust: true,
        strict: false,
      });
    } catch {
      mathDiv.textContent = `$$${block.content}$$`;
    }
    return mathDiv;
  }

  if (block.type === 'bullet') {
    const bulletContainer = document.createElement('div');
    bulletContainer.style.margin = '2px 0';

    const bulletLines = block.content.split('\n');
    let isFirstRow = true;
    for (const bLine of bulletLines) {
      const bTrimmed = bLine.trim();
      if (!bTrimmed) continue;
      // A bullet continued from the previous page keeps its indent but not a second dot.
      const hideDot = isFirstRow && !!block.continued;
      isFirstRow = false;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.margin = '2px 0';
      row.style.fontSize = '9.5pt';
      row.style.lineHeight = '1.35';
      row.style.color = '#334155';
      row.style.alignItems = 'baseline';

      const dot = document.createElement('span');
      dot.style.color = '#0891b2';
      dot.style.fontWeight = 'bold';
      dot.style.fontSize = '11px';
      dot.style.lineHeight = '1.3';
      dot.textContent = '•';
      if (hideDot) dot.style.visibility = 'hidden';
      row.appendChild(dot);

      const contentDiv = document.createElement('div');
      contentDiv.style.flex = '1';
      contentDiv.style.wordBreak = 'break-word';
      renderInlineContent(bTrimmed.replace(/^[-•*]\s+/, ''), contentDiv);
      row.appendChild(contentDiv);

      bulletContainer.appendChild(row);
    }
    return bulletContainer;
  }

  if (block.type === 'subheading') {
    const subH = document.createElement('div');
    subH.style.fontSize = '10pt';
    subH.style.fontWeight = '700';
    subH.style.color = '#0891b2';
    subH.style.margin = '5px 0 2px 0';
    subH.style.lineHeight = '1.3';
    renderInlineContent(block.content, subH);
    return subH;
  }

  if (block.type === 'callout') {
    const calloutEl = document.createElement('div');
    calloutEl.style.margin = '5px 0';
    calloutEl.style.padding = '6px 10px';
    calloutEl.style.borderRadius = '0 4px 4px 0';
    calloutEl.style.fontSize = '9pt';
    calloutEl.style.color = '#334155';
    calloutEl.style.lineHeight = '1.35';

    let borderColor = '#0891b2';
    let bgColor = '#ecfeff';
    let label = '⚡ Key Formula';
    let labelColor = '#0891b2';

    if (block.calloutType === 'note') {
      borderColor = '#8b5cf6';
      bgColor = '#f5f3ff';
      label = '📌 Note';
      labelColor = '#7c3aed';
    } else if (block.calloutType === 'tip') {
      borderColor = '#f59e0b';
      bgColor = '#fffbeb';
      label = '🎯 Exam Tip';
      labelColor = '#d97706';
    } else if (block.calloutType === 'shortcut') {
      borderColor = '#10b981';
      bgColor = '#ecfdf5';
      label = '🚀 Shortcut';
      labelColor = '#059669';
    } else if (block.calloutType === 'mistake') {
      borderColor = '#ef4444';
      bgColor = '#fef2f2';
      label = '⚠️ Common Mistake';
      labelColor = '#dc2626';
    }

    calloutEl.style.borderLeft = `3px solid ${borderColor}`;
    calloutEl.style.background = bgColor;

    const labelEl = document.createElement('strong');
    labelEl.style.color = labelColor;
    labelEl.style.textTransform = 'uppercase';
    labelEl.style.fontSize = '8pt';
    labelEl.style.letterSpacing = '0.05em';
    labelEl.style.display = 'block';
    labelEl.style.marginBottom = '2px';
    labelEl.textContent = label;
    if (!block.continued) calloutEl.appendChild(labelEl);

    const bodyDiv = document.createElement('div');
    renderInlineContent(block.content, bodyDiv);
    calloutEl.appendChild(bodyDiv);

    return calloutEl;
  }

  // Regular paragraph text
  const para = document.createElement('div');
  para.style.fontSize = '9.5pt';
  para.style.color = '#334155';
  para.style.lineHeight = '1.38';
  para.style.margin = '3px 0';
  para.style.wordBreak = 'break-word';
  renderInlineContent(block.content, para);
  return para;
}

/**
 * Split text roughly in half at a safe boundary (line break, then sentence end, then a space)
 * that is never inside inline math ($...$), bold (**...**) or code (`...`).
 * Returns null when the text has no safe boundary. Used only for blocks taller than a full page.
 */
function splitTextOutsideMath(text: string): [string, string] | null {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length > 1) {
    const mid = Math.ceil(lines.length / 2);
    return [lines.slice(0, mid).join('\n'), lines.slice(mid).join('\n')];
  }

  const sentenceBreaks: number[] = [];
  const spaceBreaks: number[] = [];
  let inMath = false;
  let inBold = false;
  let inCode = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '$' && text[i - 1] !== '\\') {
      inMath = !inMath;
    } else if (!inMath && ch === '`') {
      inCode = !inCode;
    } else if (!inMath && !inCode && ch === '*' && text[i + 1] === '*') {
      inBold = !inBold;
      i++;
    } else if (ch === ' ' && !inMath && !inBold && !inCode) {
      spaceBreaks.push(i);
        if (/[.!?]/.test(text[i - 1] ?? '')) sentenceBreaks.push(i);
    }
  }

  const candidates = sentenceBreaks.length ? sentenceBreaks : spaceBreaks;
  if (!candidates.length) return null;
  const target = text.length / 2;
  const at = candidates.reduce((best, p) => (Math.abs(p - target) < Math.abs(best - target) ? p : best));
  const first = text.slice(0, at).trim();
  const second = text.slice(at).trim();
  return first && second ? [first, second] : null;
}

/**
 * Split a block that does not fit on a full empty page into smaller blocks, without
 * dropping or altering any content. Display math is never split (it is an atomic unit).
 */
function splitBlock(block: RenderBlock): RenderBlock[] | null {
  if (block.type === 'display-math' || block.type === 'subheading') return null;

  if (block.type === 'bullet') {
    const rows = block.content.split('\n').filter((l) => l.trim());
    if (rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      return [
        { ...block, content: rows.slice(0, mid).join('\n') },
        { ...block, content: rows.slice(mid).join('\n'), continued: false },
      ];
    }
    const parts = splitTextOutsideMath(block.content.trim().replace(/^[-•*]\s+/, ''));
    if (!parts) return null;
    return [
      { ...block, content: `- ${parts[0]}` },
      { ...block, content: `- ${parts[1]}`, continued: true },
    ];
  }

  const parts = splitTextOutsideMath(block.content);
  if (!parts) return null;
  return [
    { ...block, content: parts[0] },
    { ...block, content: parts[1], continued: true },
  ];
}

/**
 * Offsets in a text/bullet/callout block where it may be broken across pages: spaces and
 * line breaks that are not inside inline math ($...$), bold (**...**) or code (`...`).
 */
function safeBreakOffsets(block: RenderBlock): number[] {
  if (block.type === 'display-math' || block.type === 'subheading') return [];
  const text = block.content;
  const offsets: number[] = [];
  let inMath = false;
  let inBold = false;
  let inCode = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '$' && text[i - 1] !== '\\') {
      inMath = !inMath;
    } else if (!inMath && ch === '`') {
      inCode = !inCode;
    } else if (!inMath && !inCode && ch === '*' && text[i + 1] === '*') {
      inBold = !inBold;
      i++;
    } else if ((ch === ' ' || ch === '\n') && !inMath && !inBold && !inCode) {
      offsets.push(i);
    }
  }
  return offsets;
}

/** Break a block at `offset` (from safeBreakOffsets) into head + continuation; nothing is dropped. */
function splitBlockAt(block: RenderBlock, offset: number): [RenderBlock, RenderBlock] | null {
  const head = block.content.slice(0, offset).trim();
  const tail = block.content.slice(offset).trim();
  if (!head || !tail) return null;
  // A bullet list broken between rows starts a fresh row; anything else is a continuation.
  const continued = !(block.type === 'bullet' && block.content[offset] === '\n');
  return [
    { ...block, content: head },
    { ...block, content: tail, continued },
  ];
}

const MIN_MATH_FONT_PX = 5;

/** Scale a KaTeX root's font size (must use !important to beat the app's global `.katex` rule). */
function scaleKatexFont(katexEl: HTMLElement, ratio: number): void {
  const px = parseFloat(getComputedStyle(katexEl).fontSize);
  if (!px || ratio >= 1) return;
  katexEl.style.setProperty('font-size', `${Math.max(MIN_MATH_FONT_PX, px * ratio)}px`, 'important');
}

/**
 * Ensure every rendered equation inside `root` fits the printable width so nothing is
 * cropped at the right edge of the page. Must run while `root` is attached to a page.
 */
function fitMathToWidth(root: HTMLElement): void {
  const mathEls = Array.from(root.querySelectorAll<HTMLElement>('.pdf-math-display, .pdf-math-inline'));
  if (root.matches('.pdf-math-display, .pdf-math-inline')) mathEls.unshift(root);

  for (const mathEl of mathEls) {
    const katexEl = mathEl.querySelector<HTMLElement>('.katex');
    const isDisplay = mathEl.classList.contains('pdf-math-display');
    const host = isDisplay ? mathEl : mathEl.parentElement;
    if (!katexEl || !host) continue;

    for (let i = 0; i < 6; i++) {
      // Inline math carries a 1.5px horizontal margin on each side.
      const maxWidth = host.clientWidth - (isDisplay ? 0 : 4);
      const natural = mathEl.scrollWidth;
      if (maxWidth <= 0 || natural <= maxWidth) break;
      scaleKatexFont(katexEl, (maxWidth / natural) * 0.98);
    }
  }
}

/**
 * Last resort for an indivisible block (e.g. a very tall matrix) that is taller than a
 * whole page: scale its math down until it fits, instead of letting the page crop it.
 */
function shrinkMathToFitHeight(el: HTMLElement, getOverflow: () => number): void {
  const katexEls = Array.from(el.querySelectorAll<HTMLElement>('.katex'));
  if (!katexEls.length) return;
  for (let i = 0; i < 8; i++) {
    const overflow = getOverflow();
    const height = el.offsetHeight;
    if (overflow <= 0 || height <= 0) return;
    const ratio = Math.max(0.5, (height - overflow) / height) * 0.98;
    katexEls.forEach((k) => scaleKatexFont(k, ratio));
  }
}

/** Every KaTeX face, so glyph metrics are final before anything is measured. */
const KATEX_FONT_DESCRIPTORS = [
  '16px KaTeX_Main',
  'bold 16px KaTeX_Main',
  'italic 16px KaTeX_Main',
  'italic bold 16px KaTeX_Main',
  'italic 16px KaTeX_Math',
  'italic bold 16px KaTeX_Math',
  '16px KaTeX_AMS',
  '16px KaTeX_Caligraphic',
  'bold 16px KaTeX_Caligraphic',
  '16px KaTeX_Fraktur',
  'bold 16px KaTeX_Fraktur',
  '16px KaTeX_SansSerif',
  'bold 16px KaTeX_SansSerif',
  'italic 16px KaTeX_SansSerif',
  '16px KaTeX_Script',
  '16px KaTeX_Size1',
  '16px KaTeX_Size2',
  '16px KaTeX_Size3',
  '16px KaTeX_Size4',
  '16px KaTeX_Typewriter',
];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function waitForFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return;
  await Promise.allSettled(KATEX_FONT_DESCRIPTORS.map((d) => fonts.load(d, 'x')));
  try {
    await fonts.ready;
  } catch {
    // ignore — layout validation below catches any late metric change
  }
}

/** Wait for DOM layout, fonts and any images inside `root` to be fully ready. */
async function waitForRenderReady(root: HTMLElement): Promise<void> {
  await nextFrame();
  await nextFrame();
  await waitForFonts();
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.allSettled(images.map((img) => (img.complete ? Promise.resolve() : img.decode())));
  await nextFrame();
}

/**
 * html2canvas misplaces `position: absolute` SVGs nested in KaTeX's relatively-offset vlist
 * spans: tall matrix brackets / determinant bars are drawn shifted down and clipped. KaTeX's
 * SVGs normally sit exactly at their static position, so pin each one to `static` — but only
 * when that leaves the live layout (its own box and its parent's) unchanged; otherwise revert.
 */
function pinKatexSvgsForCapture(root: HTMLElement): void {
  const same = (a: DOMRect, b: DOMRect) =>
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;

  root.querySelectorAll<SVGSVGElement>('.katex svg').forEach((svg) => {
    const parent = svg.parentElement;
    if (!parent || getComputedStyle(svg).position !== 'absolute') return;
    const before = svg.getBoundingClientRect();
    const parentBefore = parent.getBoundingClientRect();
    svg.style.setProperty('position', 'static', 'important');
    if (!same(before, svg.getBoundingClientRect()) || !same(parentBefore, parent.getBoundingClientRect())) {
      svg.style.removeProperty('position');
    }
  });
}

/** A unit of PDF layout that can optionally be broken into smaller units if taller than a page. */
interface LayoutPiece {
  el: HTMLElement;
  /** Coarse split, used only when a keep-together piece is taller than a whole page. */
  split?: () => LayoutPiece[] | null;
  /**
   * Break off the largest head that fits in the current page's remaining space, at a safe
   * boundary (never inside an equation). Returns null when not even a single line fits.
   */
  splitToFit?: () => [LayoutPiece, LayoutPiece] | null;
  /** Prefer moving to a fresh page over splitting; split only if taller than a whole page. */
  keepTogether?: boolean;
}

/**
 * Parsed structured section.
 */
interface ParsedSection {
  title: string;
  body: string;
  isFinalAnswer: boolean;
}

function parseSolutionSections(solutionMarkdown: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const rawParts = solutionMarkdown.split(/\n(?=##\s+)/);

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('## ')) {
      const firstLineEnd = trimmed.indexOf('\n');
      const headerLine = firstLineEnd !== -1 ? trimmed.slice(0, firstLineEnd) : trimmed;
      const body = firstLineEnd !== -1 ? trimmed.slice(firstLineEnd + 1).trim() : '';
      const title = headerLine.replace(/^##\s+/, '').trim();
      const isFinalAnswer = title.toLowerCase().includes('final answer');

      sections.push({ title, body, isFinalAnswer });
    } else {
      sections.push({
        title: 'Problem Overview',
        body: trimmed,
        isFinalAnswer: false,
      });
    }
  }

  return sections;
}

/**
 * Downloads the current mathematical solution as an A4 Engineering Answer Key PDF.
 * Implements content-first layout, native KaTeX rendering, and zero clipping.
 */
export async function downloadAnswerKeyPdf({
  problemText,
  solutionRaw,
  levelName = 'Engineering Mathematics',
}: GeneratePdfOptions): Promise<void> {
  if (!solutionRaw || typeof document === 'undefined') {
    throw new Error('Solution text is required to generate PDF');
  }

  const filename = generateFilename(problemText);

  // 1. Normalize full document text using MathVerse's native normalizers
  let normalized = cleanResponseText(solutionRaw);
  normalized = convertProgrammingSyntaxToMath(normalized);
  normalized = convertTextMatricesToLatex(normalized);
  normalized = normalizeMathDelimiters(normalized);
  normalized = wrapRawLatexCommands(normalized);

  const sections = parseSolutionSections(normalized);
  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const refCode = `MV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // 2. Off-screen staging container (A4 width: 794px at standard 96 DPI)
  const staging = document.createElement('div');
  staging.id = 'mathverse-pdf-staging';
  staging.style.position = 'fixed';
  staging.style.left = '0';
  staging.style.top = '0';
  staging.style.width = '794px';
  staging.style.background = '#ffffff';
  staging.style.color = '#0f172a';
  staging.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  staging.style.zIndex = '-9999';
  staging.style.opacity = '0';
  staging.style.pointerEvents = 'none';

  // PDF-only override. The app's global stylesheet gives `.katex-display` / `.katex-html`
  // `overflow: auto|hidden` and `max-width: 100%` (scrollable math on screen). Inside the PDF
  // those rules crop wide equations on the right and clip the tops/bottoms of fractions,
  // matrices, superscripts and subscripts, so math overflow must be visible here.
  // Scoped to the staging id, so the on-screen app is unaffected.
  //
  // Second rule: html2canvas finds each font's baseline by placing a 1x1 <img> beside sample
  // text in a hidden <div> appended to <body>, and reading img.offsetTop. Tailwind's preflight
  // (`img { display: block }`) pushes that probe image onto its own line, so every glyph is
  // drawn at a wrong baseline — badly so for KaTeX's tall fonts, which detaches matrix brackets,
  // surds and fraction bars from their content and misplaces super/subscripts. Keep the probe
  // image inline. Matches only that hidden probe, and is removed together with the staging.
  const pdfStyle = document.createElement('style');
  pdfStyle.textContent = `
    #mathverse-pdf-staging .katex-display,
    #mathverse-pdf-staging .katex-html {
      overflow: visible !important;
      max-width: none !important;
    }
    body > div[style*="visibility: hidden"] > img {
      display: inline !important;
    }
  `;
  staging.appendChild(pdfStyle);

  document.body.appendChild(staging);

  try {
    // Exact A4 dimensions at 96 DPI (210mm x 297mm)
    const PAGE_HEIGHT = 1123;
    const PAGE_PADDING_TOP = 36;
    const PAGE_PADDING_BOTTOM = 30;
    const PAGE_PADDING_X = 48; // Printable content width = 794 - 96 = 698px

    // 3. Fonts (incl. every KaTeX face) must be loaded BEFORE measuring, otherwise heights
    //    measured with fallback metrics grow after the font swap and overflow the page.
    await waitForFonts();

    interface PageInfo {
      page: HTMLDivElement;
      content: HTMLDivElement;
      /** Measured content capacity of this page (between header and footer). */
      available: number;
    }

    const createPageElement = (pageIndex: number): PageInfo => {
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-a4-page';
      pageEl.style.width = '794px';
      pageEl.style.minHeight = `${PAGE_HEIGHT}px`;
      pageEl.style.height = `${PAGE_HEIGHT}px`;
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.padding = `${PAGE_PADDING_TOP}px ${PAGE_PADDING_X}px ${PAGE_PADDING_BOTTOM}px ${PAGE_PADDING_X}px`;
      pageEl.style.background = '#ffffff';
      pageEl.style.display = 'flex';
      pageEl.style.flexDirection = 'column';
      pageEl.style.justifyContent = 'space-between';
      pageEl.style.position = 'relative';

      // Header
      const headerEl = document.createElement('div');
      headerEl.style.boxSizing = 'border-box';
      headerEl.style.width = '100%';
      headerEl.style.flexShrink = '0';

      if (pageIndex === 0) {
        headerEl.innerHTML = `
          <div style="border-bottom: 2px solid #0891b2; padding-bottom: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="background: #0891b2; color: #ffffff; font-family: monospace; font-size: 8pt; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.06em;">MATHVERSE</span>
                  <span style="font-size: 8.5pt; font-weight: 600; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase;">AI Learning Curriculum</span>
                </div>
                <h1 style="font-size: 15pt; font-weight: 800; color: #0f172a; margin: 4px 0 2px 0; letter-spacing: -0.01em; line-height: 1.2;">
                  Engineering Mathematical Solution & Answer Key
                </h1>
                <div style="font-size: 8.5pt; color: #64748b;">
                  Target Calibration: <strong style="color: #0891b2;">${escapeHtml(levelName)}</strong> • Step-by-Step Verified Derivation
                </div>
              </div>
              <div style="text-align: right; font-size: 8.5pt; color: #64748b; font-family: monospace; line-height: 1.3;">
                <div>Ref: <strong style="color: #0f172a;">${refCode}</strong></div>
                <div>Date: ${formattedDate}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        headerEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 8pt; color: #64748b;">
            <span><strong style="color: #0891b2;">MATHVERSE</strong> • Engineering Mathematical Solution Key</span>
            <span>Calibration: <strong>${escapeHtml(levelName)}</strong></span>
            <span style="font-family: monospace;">Ref: ${refCode}</span>
          </div>
        `;
      }
      pageEl.appendChild(headerEl);

      // Content Area: DYNAMIC HEIGHT (NO flex: 1, NO fixed height, NO overflow: hidden).
      // flexShrink 0 so the flex page can never squash content while it is being measured.
      const contentEl = document.createElement('div');
      contentEl.className = 'pdf-page-content';
      contentEl.style.width = '100%';
      contentEl.style.boxSizing = 'border-box';
      contentEl.style.flexShrink = '0';
      pageEl.appendChild(contentEl);

      // Footer
      const footerEl = document.createElement('div');
      footerEl.className = 'pdf-page-footer';
      footerEl.style.boxSizing = 'border-box';
      footerEl.style.width = '100%';
      footerEl.style.flexShrink = '0';
      footerEl.style.marginTop = 'auto';
      footerEl.style.borderTop = '1px solid #e2e8f0';
      footerEl.style.paddingTop = '5px';
      footerEl.style.display = 'flex';
      footerEl.style.justifyContent = 'space-between';
      footerEl.style.fontSize = '8pt';
      footerEl.style.color = '#94a3b8';
      footerEl.innerHTML = `
        <span>MathVerse AI Solution Engine • Step-by-Step Mathematical Derivation</span>
        <span class="pdf-page-number">Page ${pageIndex + 1}</span>
      `;
      pageEl.appendChild(footerEl);

      staging.appendChild(pageEl);

      // Capacity is measured from the real rendered header/footer, not assumed:
      // everything between the top of the (empty) content area and the top of the footer.
      const available =
        Math.floor(footerEl.getBoundingClientRect().top - contentEl.getBoundingClientRect().top) - 2;

      return { page: pageEl, content: contentEl, available };
    };

    // ── Element builders (styles unchanged from the original design) ──────────

    const buildProblemCard = (text: string): HTMLElement => {
      const problemCard = document.createElement('div');
      problemCard.className = 'pdf-problem-card';
      problemCard.style.boxSizing = 'border-box';
      problemCard.style.border = '1px solid #cbd5e1';
      problemCard.style.borderRadius = '6px';
      problemCard.style.background = '#f8fafc';
      problemCard.style.padding = '8px 12px';
      problemCard.style.marginBottom = '8px';

      const probLabel = document.createElement('div');
      probLabel.style.fontSize = '8pt';
      probLabel.style.fontWeight = '700';
      probLabel.style.color = '#0891b2';
      probLabel.style.textTransform = 'uppercase';
      probLabel.style.letterSpacing = '0.08em';
      probLabel.style.marginBottom = '3px';
      probLabel.textContent = 'Problem Statement';
      problemCard.appendChild(probLabel);

      const probBody = document.createElement('div');
      probBody.style.fontSize = '10pt';
      probBody.style.fontWeight = '600';
      probBody.style.color = '#0f172a';
      probBody.style.lineHeight = '1.35';
      renderInlineContent(text, probBody);
      problemCard.appendChild(probBody);
      return problemCard;
    };

    const buildFinalBox = (blocks: RenderBlock[], continued: boolean): HTMLElement => {
      const finalBox = document.createElement('div');
      finalBox.className = 'pdf-final-answer-box';
      finalBox.style.boxSizing = 'border-box';
      finalBox.style.border = '1.5px solid #0891b2';
      finalBox.style.borderRadius = '6px';
      finalBox.style.background = '#f0fdfa';
      finalBox.style.padding = '8px 12px';
      finalBox.style.marginTop = '10px';
      finalBox.style.marginBottom = '4px';

      const finalBadge = document.createElement('div');
      finalBadge.style.fontSize = '9pt';
      finalBadge.style.fontWeight = '800';
      finalBadge.style.color = '#0891b2';
      finalBadge.style.textTransform = 'uppercase';
      finalBadge.style.letterSpacing = '0.08em';
      finalBadge.style.marginBottom = '4px';
      finalBadge.style.display = 'flex';
      finalBadge.style.alignItems = 'center';
      finalBadge.style.gap = '5px';
      finalBadge.innerHTML = continued
        ? '<span>★</span><span>FINAL ANSWER (CONTINUED)</span>'
        : '<span>★</span><span>FINAL ANSWER</span>';
      finalBox.appendChild(finalBadge);

      const finalBody = document.createElement('div');
      finalBody.style.fontSize = '10.5pt';
      finalBody.style.fontWeight = '600';
      finalBody.style.color = '#0f172a';
      finalBody.style.lineHeight = '1.35';
      for (const fb of blocks) {
        finalBody.appendChild(createBlockElement(fb));
      }
      finalBox.appendChild(finalBody);
      return finalBox;
    };

    const buildSectionHeader = (title: string): HTMLElement => {
      const headerEl = document.createElement('div');
      headerEl.style.fontSize = '10.5pt';
      headerEl.style.fontWeight = '700';
      headerEl.style.color = '#0f172a';
      headerEl.style.borderLeft = '3px solid #0891b2';
      headerEl.style.paddingLeft = '6px';
      headerEl.style.margin = '0 0 4px 0';
      headerEl.style.lineHeight = '1.3';
      headerEl.style.textTransform = 'capitalize';
      headerEl.textContent = title;
      return headerEl;
    };

    const buildLead = (title: string, block: RenderBlock): HTMLElement => {
      const leadBlock = document.createElement('div');
      leadBlock.className = 'pdf-step-lead';
      leadBlock.style.boxSizing = 'border-box';
      leadBlock.style.marginTop = '10px';
      leadBlock.appendChild(buildSectionHeader(title));
      leadBlock.appendChild(createBlockElement(block));
      return leadBlock;
    };

    // ── Keep-together pieces (coarse split only when taller than a whole page) ──

    const problemPiece = (text: string): LayoutPiece => ({
      el: buildProblemCard(text),
      keepTogether: true,
      split: () => {
        const parts = splitTextOutsideMath(text);
        return parts ? parts.map(problemPiece) : null;
      },
    });

    const finalAnswerPiece = (blocks: RenderBlock[], continued: boolean): LayoutPiece => ({
      el: buildFinalBox(blocks, continued),
      keepTogether: true,
      split: () => {
        if (blocks.length > 1) {
          const mid = Math.ceil(blocks.length / 2);
          return [finalAnswerPiece(blocks.slice(0, mid), continued), finalAnswerPiece(blocks.slice(mid), true)];
        }
        const parts = blocks[0] ? splitBlock(blocks[0]) : null;
        return parts ? [finalAnswerPiece([parts[0]], continued), finalAnswerPiece(parts.slice(1), true)] : null;
      },
    });

    // ── Pagination: measure real rendered heights; never let a page crop content ──

    const layoutPages = (): PageInfo[] => {
      staging.querySelectorAll('.pdf-a4-page').forEach((p) => p.remove());

      const pages: PageInfo[] = [];
      let current = createPageElement(0);
      pages.push(current);

      const startNewPage = () => {
        current = createPageElement(pages.length);
        pages.push(current);
      };
      const overflow = () => current.content.offsetHeight - current.available;
      const fits = () => overflow() <= 0;

      const fitsHere = (el: HTMLElement): boolean => {
        if (current.content.children.length === 0) el.style.marginTop = '0';
        current.content.appendChild(el);
        fitMathToWidth(el);
        const ok = fits();
        current.content.removeChild(el);
        return ok;
      };

      /**
       * Find the largest head of `block` (built with `build`) that fits in the remaining
       * space of the current page — binary search over safe word/line boundaries, so a
       * paragraph is broken exactly once, at the page boundary, and never inside math.
       */
      const splitBlockToFit = (
        block: RenderBlock,
        build: (b: RenderBlock) => HTMLElement,
      ): [RenderBlock, RenderBlock] | null => {
        const offsets = safeBreakOffsets(block);
        let lo = 0;
        let hi = offsets.length - 1;
        let best: [RenderBlock, RenderBlock] | null = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const parts = splitBlockAt(block, offsets[mid]);
          if (parts && fitsHere(build(parts[0]))) {
            best = parts;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        return best;
      };

      const blockPiece = (block: RenderBlock): LayoutPiece => ({
        el: createBlockElement(block),
        splitToFit: () => {
          const parts = splitBlockToFit(block, createBlockElement);
          return parts ? [blockPiece(parts[0]), blockPiece(parts[1])] : null;
        },
      });

      // ORPHAN CONTROL: a section header always travels with (the start of) its first block.
      const leadPiece = (title: string, block: RenderBlock): LayoutPiece => ({
        el: buildLead(title, block),
        splitToFit: () => {
          const parts = splitBlockToFit(block, (b) => buildLead(title, b));
          return parts ? [leadPiece(title, parts[0]), blockPiece(parts[1])] : null;
        },
      });

      const placePiece = (piece: LayoutPiece): void => {
        const { el } = piece;
        const pageIsEmpty = current.content.children.length === 0;
        if (pageIsEmpty) el.style.marginTop = '0';
        current.content.appendChild(el);
        fitMathToWidth(el);
        if (fits()) return;
        current.content.removeChild(el);

        // Flowing text: fill the remaining space, continue the rest on the next page.
        if (!piece.keepTogether && piece.splitToFit) {
          const parts = piece.splitToFit();
          if (parts) {
            placePiece(parts[0]);
            placePiece(parts[1]);
            return;
          }
        }

        // Keep-together piece taller than a whole page: split it coarsely.
        if (pageIsEmpty && piece.split) {
          const parts = piece.split();
          if (parts && parts.length > 1) {
            parts.forEach(placePiece);
            return;
          }
        }

        // Move it intact to a fresh page.
        if (!pageIsEmpty) {
          startNewPage();
          placePiece(piece);
          return;
        }

        // Indivisible and taller than a whole page (e.g. one huge matrix):
        // scale its math down until it fits instead of letting the page crop it.
        current.content.appendChild(el);
        shrinkMathToFitHeight(el, overflow);
      };

      if (problemText.trim()) {
        placePiece(problemPiece(problemText));
      }

      for (const section of sections) {
        const blocks = parseBodyIntoBlocks(section.body);

        if (section.isFinalAnswer) {
          // Highlighted Final Answer Box (kept together as a single atomic unit when possible)
          placePiece(finalAnswerPiece(blocks, false));
          continue;
        }

        if (blocks.length === 0) {
          const headerContainer = document.createElement('div');
          headerContainer.style.marginTop = '10px';
          headerContainer.appendChild(buildSectionHeader(section.title));
          placePiece({ el: headerContainer });
          continue;
        }

        // Try appending the entire section intact first (smart block grouping)
        const fullSectionEl = document.createElement('div');
        fullSectionEl.className = 'pdf-step-container';
        fullSectionEl.style.boxSizing = 'border-box';
        fullSectionEl.style.marginTop = current.content.children.length === 0 ? '0' : '10px';
        fullSectionEl.appendChild(buildSectionHeader(section.title));
        for (const block of blocks) {
          fullSectionEl.appendChild(createBlockElement(block));
        }

        current.content.appendChild(fullSectionEl);
        fitMathToWidth(fullSectionEl);
        if (fits()) continue;

        current.content.removeChild(fullSectionEl);
        const remainingHeight = current.available - current.content.offsetHeight;

        // Page nearly full (< 140px left): try the whole step on a fresh page.
        if (remainingHeight < 140 && current.content.children.length > 0) {
          startNewPage();
          fullSectionEl.style.marginTop = '0';
          current.content.appendChild(fullSectionEl);
          if (fits()) continue;
          current.content.removeChild(fullSectionEl);
        }

        // Decompose the step into its blocks (header kept with its first block).
        placePiece(leadPiece(section.title, blocks[0]));

        for (let bIdx = 1; bIdx < blocks.length; bIdx++) {
          placePiece(blockPiece(blocks[bIdx]));
        }
      }

      return pages;
    };

    let pages = layoutPages();

    // 4. Wait for DOM/fonts/assets to settle, then validate against real measurements.
    //    If anything shifted after layout (late font or asset load), paginate again with the
    //    final metrics so no page can overflow its fixed A4 capture area.
    await waitForRenderReady(staging);
    if (pages.some((p) => p.content.offsetHeight > p.available)) {
      pages = layoutPages();
      await waitForRenderReady(staging);
    }

    // Layout is final: prepare KaTeX SVGs (brackets, bars, surds) for faithful rasterization.
    pinKatexSvgsForCapture(staging);

    // 5. Update accurate total page numbers across all footers
    const totalPages = pages.length;
    pages.forEach(({ page }, idx) => {
      const numSpan = page.querySelector('.pdf-page-number');
      if (numSpan) {
        numSpan.textContent = `Page ${idx + 1} of ${totalPages}`;
      }
    });

    // 6. Render each page using html2canvas and assemble into jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i].page;
      const canvas = await html2canvas(pageEl, {
        scale: 2, // 2x resolution for razor-sharp KaTeX mathematics
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    // 7. Trigger download
    pdf.save(filename);
  } finally {
    // 8. Clean up staging container
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
