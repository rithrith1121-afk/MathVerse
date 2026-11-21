/**
 * pdfService.ts — Generates professional, compact A4 Engineering Answer Key PDFs
 * from MathVerse AI solutions with crisp KaTeX mathematical rendering and
 * intelligent orphan-controlled pagination.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import katex from 'katex';

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
 * Escape HTML characters to prevent malformed DOM rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render LaTeX using KaTeX directly into crisp HTML.
 */
function renderPdfKatex(tex: string, displayMode = false): string {
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
      strict: false,
    });
  } catch {
    return escapeHtml(tex);
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

  const flushDet = (rows: string[][]): string => {
    const latexRows = rows.map((r) => r.join(' & ')).join(' \\\\ ');
    return `\n$$\\begin{vmatrix} ${latexRows} \\end{vmatrix}$$\n`;
  };

  const flushMat = (rows: string[][]): string => {
    const latexRows = rows.map((r) => r.join(' & ')).join(' \\\\ ');
    return `\n$$\\begin{pmatrix} ${latexRows} \\end{pmatrix}$$\n`;
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isDetLine =
      trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 3 && !trimmed.slice(1, -1).includes('|');
    const isMatLine =
      trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 3 && !trimmed.includes(';');

    if (isDetLine) {
      if (inMat) {
        processedLines.push(flushMat(matRows));
        inMat = false;
        matRows = [];
      }
      inDet = true;
      const content = trimmed.slice(1, -1).trim();
      detRows.push(content.split(/\s+/));
    } else if (isMatLine) {
      if (inDet) {
        processedLines.push(flushDet(detRows));
        inDet = false;
        detRows = [];
      }
      inMat = true;
      const content = trimmed.slice(1, -1).trim();
      matRows.push(content.split(/\s+/));
    } else {
      if (inDet) {
        processedLines.push(flushDet(detRows));
        inDet = false;
        detRows = [];
      }
      if (inMat) {
        processedLines.push(flushMat(matRows));
        inMat = false;
        matRows = [];
      }
      processedLines.push(lines[i]);
    }
  }

  if (inDet) processedLines.push(flushDet(detRows));
  if (inMat) processedLines.push(flushMat(matRows));

  return processedLines.join('\n');
}

/**
 * Normalize LaTeX delimiters: \[...\] -> $$...$$ and \(...\) -> $...$
 */
function normalizeLatexDelimiters(text: string): string {
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
 * Wrap standalone math commands in $ if they were emitted without delimiters.
 */
function wrapRawMathCommands(text: string): string {
  if (!text) return '';
  const normalized = normalizeLatexDelimiters(text);
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('$')) continue;

    let processed = part;
    processed = processed.replace(/(?<!\$)\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}(?!\$)/g, '$$\\boxed{$1}$$');
    processed = processed.replace(/(?<!\$)\\frac\{([^{}]+)\}\{([^{}]+)\}(?!\$)/g, '$\\frac{$1}{$2}$');
    processed = processed.replace(/(?<!\$)\\sqrt\{([^{}]+)\}(?!\$)/g, '$\\sqrt{$1}$');

    processed = processed.replace(/(?<!\$)\\([a-zA-Z]+(?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+)?)(?!\$)/g, (match, cmd) => {
      const knownSymbols = /^(lambda|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|partial|nabla|infty|pm|mp|times|div|cdot|approx|neq|leq|geq|in|notin|subset|subseteq|cap|cup|forall|exists|to|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow)\b/;
      return knownSymbols.test(cmd) ? `$${match}$` : match;
    });

    parts[i] = processed;
  }
  return parts.join('');
}

/**
 * Convert callout indicators into neat, compact engineering boxes.
 */
function parsePdfCallouts(text: string): string {
  text = text.replace(
    /(?:Important Formula|Formula):\s*(.*?)(?=\n|<div|$)/gi,
    '<div style="margin: 4px 0; padding: 6px 10px; border-left: 3px solid #0891b2; background: #ecfeff; border-radius: 0 4px 4px 0; font-size: 9pt; color: #334155; line-height: 1.35;"><strong style="color: #0891b2; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">⚡ Key Formula</strong>$1</div>'
  );
  text = text.replace(
    /Note:\s*(.*?)(?=\n|<div|$)/gi,
    '<div style="margin: 4px 0; padding: 6px 10px; border-left: 3px solid #8b5cf6; background: #f5f3ff; border-radius: 0 4px 4px 0; font-size: 9pt; color: #334155; line-height: 1.35;"><strong style="color: #7c3aed; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">📌 Note</strong>$1</div>'
  );
  text = text.replace(
    /Shortcut:\s*(.*?)(?=\n|<div|$)/gi,
    '<div style="margin: 4px 0; padding: 6px 10px; border-left: 3px solid #10b981; background: #ecfdf5; border-radius: 0 4px 4px 0; font-size: 9pt; color: #334155; line-height: 1.35;"><strong style="color: #059669; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">🚀 Shortcut</strong>$1</div>'
  );
  text = text.replace(
    /(?:Exam Tip|Tip):\s*(.*?)(?=\n|<div|$)/gi,
    '<div style="margin: 4px 0; padding: 6px 10px; border-left: 3px solid #f59e0b; background: #fffbeb; border-radius: 0 4px 4px 0; font-size: 9pt; color: #334155; line-height: 1.35;"><strong style="color: #d97706; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">🎯 Exam Tip</strong>$1</div>'
  );
  text = text.replace(
    /(?:Common Mistake|Mistake):\s*(.*?)(?=\n|<div|$)/gi,
    '<div style="margin: 4px 0; padding: 6px 10px; border-left: 3px solid #ef4444; background: #fef2f2; border-radius: 0 4px 4px 0; font-size: 9pt; color: #334155; line-height: 1.35;"><strong style="color: #dc2626; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">⚠️ Common Mistake</strong>$1</div>'
  );
  return text;
}

/**
 * Render inline markdown and KaTeX into compact HTML designed specifically for PDF printing.
 */
function renderPdfContent(rawText: string): string {
  if (!rawText) return '';

  let processed = convertTextMatricesToLatex(rawText);
  processed = wrapRawMathCommands(processed);

  // Render display math blocks with tight margins (4px top/bottom, centered, no dark backgrounds)
  processed = processed.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, math) =>
      `<div class="pdf-display-math" style="margin: 4px 0; padding: 1px 0; text-align: center; color: #0f172a; line-height: 1.25; overflow: hidden;">${renderPdfKatex(
        math,
        true
      )}</div>`
  );

  // Render inline math
  processed = processed.replace(
    /\$([^$\n]+)\$/g,
    (_, math) =>
      `<span class="pdf-inline-math" style="display: inline-block; vertical-align: -1px; margin: 0 1px; color: #0f172a;">${renderPdfKatex(
        math,
        false
      )}</span>`
  );

  // Markdown styling: bold, italics, code
  processed = processed
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 600;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color: #475569;">$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="font-family: monospace; font-size: 8.5pt; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; color: #0891b2;">$1</code>'
    );

  processed = parsePdfCallouts(processed);

  // Process lines (bullet points, paragraphs)
  const lines = processed.split('\n');
  const renderedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Bullet points with tight 2px vertical margin
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      renderedLines.push(
        `<div style="display: flex; gap: 6px; margin: 2px 0; font-size: 9.5pt; line-height: 1.35; color: #334155; align-items: baseline;">
          <span style="color: #0891b2; font-weight: bold; font-size: 11px; line-height: 1.3;">•</span>
          <div style="flex: 1;">${trimmed.slice(2)}</div>
        </div>`
      );
    } else if (trimmed.startsWith('### ')) {
      renderedLines.push(
        `<div style="font-size: 10pt; font-weight: 700; color: #0891b2; margin: 5px 0 2px 0; line-height: 1.3;">
          ${trimmed.slice(4)}
        </div>`
      );
    } else if (trimmed.startsWith('<div class="pdf-display-math"') || trimmed.startsWith('<div style="margin: 4px')) {
      renderedLines.push(trimmed);
    } else {
      renderedLines.push(
        `<div style="font-size: 9.5pt; color: #334155; line-height: 1.35; margin: 3px 0;">${trimmed}</div>`
      );
    }
  }

  return renderedLines.join('');
}

/**
 * Parse solution markdown into distinct structured sections.
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
 * Split a section body into individual renderable items (paragraphs, math blocks, bullets)
 * so that long steps can cleanly paginate across pages without orphan headers.
 */
function splitSectionBodyIntoChunks(body: string): string[] {
  if (!body.trim()) return [];

  const normalized = normalizeLatexDelimiters(body);
  // Split on display math boundaries $$...$$
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$)/);
  const chunks: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('$$')) {
      // Standalone display equation chunk
      chunks.push(trimmed);
    } else {
      // Split non-math blocks by bullet points or paragraph breaks
      const subParts = trimmed.split(/\n(?=[-•*]\s+|\n+)/);
      for (const sp of subParts) {
        const subTrimmed = sp.trim();
        if (subTrimmed) {
          chunks.push(subTrimmed);
        }
      }
    }
  }

  return chunks;
}

/**
 * Downloads the current mathematical solution as an A4 Engineering Answer Key PDF
 * with space-efficient layout, tight vertical margins, and intelligent pagination.
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
  const sections = parseSolutionSections(solutionRaw);
  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const refCode = `MV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // 1. Off-screen staging container (A4 width: 794px at 96 DPI)
  const staging = document.createElement('div');
  staging.id = 'mathverse-pdf-staging';
  staging.style.position = 'fixed';
  staging.style.left = '-9999px';
  staging.style.top = '0';
  staging.style.width = '794px';
  staging.style.background = '#ffffff';
  staging.style.color = '#0f172a';
  staging.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  staging.style.zIndex = '-1000';
  staging.style.pointerEvents = 'none';

  document.body.appendChild(staging);

  try {
    // Exact A4 dimensions at 96 DPI (210mm x 297mm)
    const PAGE_HEIGHT = 1123;
    // Top padding: 36px (~9.5mm), Bottom padding: 30px (~8mm), Left/Right: 48px (~13mm)
    const PAGE_PADDING_TOP = 36;
    const PAGE_PADDING_BOTTOM = 30;
    const PAGE_PADDING_X = 48;

    // Available content heights considering headers and footers with safe buffer
    const AVAILABLE_CONTENT_HEIGHT_P1 = 965; // Room for full Page 1 Header (~52px) + Footer (~20px)
    const AVAILABLE_CONTENT_HEIGHT_PN = 995; // Room for compact running header (~20px) + Footer (~20px)

    const pages: HTMLDivElement[] = [];

    const createPageElement = (pageIndex: number): { page: HTMLDivElement; content: HTMLDivElement } => {
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-a4-page';
      pageEl.style.width = '794px';
      pageEl.style.height = `${PAGE_HEIGHT}px`;
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.padding = `${PAGE_PADDING_TOP}px ${PAGE_PADDING_X}px ${PAGE_PADDING_BOTTOM}px ${PAGE_PADDING_X}px`;
      pageEl.style.background = '#ffffff';
      pageEl.style.display = 'flex';
      pageEl.style.flexDirection = 'column';
      pageEl.style.justifyContent = 'space-between';
      pageEl.style.overflow = 'hidden';

      // Header
      const headerEl = document.createElement('div');
      if (pageIndex === 0) {
        // Page 1 Header: Compact, professional engineering document header
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
        // Page 2+ Running Header: Slim single-line header
        headerEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 8pt; color: #64748b;">
            <span><strong style="color: #0891b2;">MATHVERSE</strong> • Engineering Mathematical Solution Key</span>
            <span>Calibration: <strong>${escapeHtml(levelName)}</strong></span>
            <span style="font-family: monospace;">Ref: ${refCode}</span>
          </div>
        `;
      }
      pageEl.appendChild(headerEl);

      // Content Area
      const contentEl = document.createElement('div');
      contentEl.className = 'pdf-page-content';
      contentEl.style.flex = '1';
      contentEl.style.display = 'flex';
      contentEl.style.flexDirection = 'column';
      contentEl.style.overflow = 'hidden';
      pageEl.appendChild(contentEl);

      // Footer
      const footerEl = document.createElement('div');
      footerEl.className = 'pdf-page-footer';
      footerEl.style.borderTop = '1px solid #e2e8f0';
      footerEl.style.paddingTop = '5px';
      footerEl.style.marginTop = '6px';
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
      pages.push(pageEl);

      return { page: pageEl, content: contentEl };
    };

    // Initialize Page 1
    let currentPageIndex = 0;
    let { content: currentContent } = createPageElement(0);

    const getMaxAllowedHeight = () =>
      currentPageIndex === 0 ? AVAILABLE_CONTENT_HEIGHT_P1 : AVAILABLE_CONTENT_HEIGHT_PN;

    /**
     * Appends an element to the current page. If it exceeds available vertical space,
     * it moves the element to a newly spawned page.
     */
    const appendWithPageBreak = (el: HTMLElement, isTopOnNewPage = false): void => {
      currentContent.appendChild(el);
      const maxAllowed = getMaxAllowedHeight();

      if (currentContent.scrollHeight > maxAllowed && currentContent.children.length > 1) {
        currentContent.removeChild(el);
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;

        if (isTopOnNewPage) {
          el.style.marginTop = '0';
        }
        currentContent.appendChild(el);
      }
    };

    // Add Compact Problem Statement Box to Page 1
    if (problemText.trim()) {
      const problemCard = document.createElement('div');
      problemCard.className = 'pdf-problem-card';
      problemCard.style.boxSizing = 'border-box';
      problemCard.style.border = '1px solid #cbd5e1';
      problemCard.style.borderRadius = '6px';
      problemCard.style.background = '#f8fafc';
      problemCard.style.padding = '8px 12px';
      problemCard.style.marginBottom = '8px';
      problemCard.innerHTML = `
        <div style="font-size: 8pt; font-weight: 700; color: #0891b2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px;">
          Problem Statement
        </div>
        <div style="font-size: 10pt; font-weight: 600; color: #0f172a; line-height: 1.35;">
          ${renderPdfContent(problemText)}
        </div>
      `;
      currentContent.appendChild(problemCard);
    }

    // Add Solution Sections with Granular Orphan Control
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];

      if (section.isFinalAnswer) {
        // Highlighted Final Answer Box (kept together as a single atomic unit)
        const finalBox = document.createElement('div');
        finalBox.className = 'pdf-final-answer-box';
        finalBox.style.boxSizing = 'border-box';
        finalBox.style.border = '1.5px solid #0891b2';
        finalBox.style.borderRadius = '6px';
        finalBox.style.background = '#f0fdfa';
        finalBox.style.padding = '8px 12px';
        finalBox.style.marginTop = '10px';
        finalBox.style.marginBottom = '4px';
        finalBox.innerHTML = `
          <div style="font-size: 9pt; font-weight: 800; color: #0891b2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
            <span>★</span><span>FINAL ANSWER</span>
          </div>
          <div style="font-size: 10.5pt; font-weight: 600; color: #0f172a; line-height: 1.35;">
            ${renderPdfContent(section.body)}
          </div>
        `;
        appendWithPageBreak(finalBox, true);
        continue;
      }

      // Step / Section Header Element
      const headerEl = document.createElement('div');
      headerEl.style.fontSize = '10.5pt';
      headerEl.style.fontWeight = '700';
      headerEl.style.color = '#0f172a';
      headerEl.style.borderLeft = '3px solid #0891b2';
      headerEl.style.paddingLeft = '6px';
      headerEl.style.margin = '0 0 4px 0';
      headerEl.style.lineHeight = '1.3';
      headerEl.style.textTransform = 'capitalize';
      headerEl.textContent = section.title;

      const chunks = splitSectionBodyIntoChunks(section.body);

      if (chunks.length === 0) {
        // Section with only a header
        const singleHeaderWrapper = document.createElement('div');
        singleHeaderWrapper.style.marginTop = sIdx === 0 ? '0' : '10px';
        singleHeaderWrapper.appendChild(headerEl);
        appendWithPageBreak(singleHeaderWrapper, true);
        continue;
      }

      // ORPHAN CONTROL: Combine Section Header + First Chunk into a single LeadBlock
      // This guarantees the header is never stranded alone at the bottom of a page.
      const leadBlock = document.createElement('div');
      leadBlock.className = 'pdf-step-lead';
      leadBlock.style.boxSizing = 'border-box';
      leadBlock.style.marginTop = sIdx === 0 ? '0' : '10px';
      leadBlock.appendChild(headerEl);

      const firstChunkEl = document.createElement('div');
      firstChunkEl.innerHTML = renderPdfContent(chunks[0]);
      leadBlock.appendChild(firstChunkEl);

      appendWithPageBreak(leadBlock, true);

      // Remaining chunks of this step flow naturally
      for (let cIdx = 1; cIdx < chunks.length; cIdx++) {
        const chunkEl = document.createElement('div');
        chunkEl.style.boxSizing = 'border-box';
        chunkEl.innerHTML = renderPdfContent(chunks[cIdx]);
        appendWithPageBreak(chunkEl, false);
      }
    }

    // Update accurate total page numbers across all footers
    const totalPages = pages.length;
    pages.forEach((pageEl, idx) => {
      const numSpan = pageEl.querySelector('.pdf-page-number');
      if (numSpan) {
        numSpan.textContent = `Page ${idx + 1} of ${totalPages}`;
      }
    });

    // 3. Render each page using html2canvas and assemble into jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const canvas = await html2canvas(pageEl, {
        scale: 2, // Crisp 2x rendering for razor-sharp KaTeX mathematics
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

    // 4. Trigger download
    pdf.save(filename);
  } finally {
    // 5. Clean up staging container
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
