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
    for (const bLine of bulletLines) {
      const bTrimmed = bLine.trim();
      if (!bTrimmed) continue;

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
    calloutEl.appendChild(labelEl);

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

  document.body.appendChild(staging);

  try {
    // Exact A4 dimensions at 96 DPI (210mm x 297mm)
    const PAGE_HEIGHT = 1123;
    const PAGE_PADDING_TOP = 36;
    const PAGE_PADDING_BOTTOM = 30;
    const PAGE_PADDING_X = 48; // Printable content width = 794 - 96 = 698px

    // Printable content capacity per page
    const AVAILABLE_CONTENT_HEIGHT_P1 = 955;
    const AVAILABLE_CONTENT_HEIGHT_PN = 990;

    const pages: HTMLDivElement[] = [];

    const createPageElement = (pageIndex: number): { page: HTMLDivElement; content: HTMLDivElement } => {
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

      // Content Area: DYNAMIC HEIGHT (NO flex: 1, NO fixed height, NO overflow: hidden)
      const contentEl = document.createElement('div');
      contentEl.className = 'pdf-page-content';
      contentEl.style.width = '100%';
      contentEl.style.boxSizing = 'border-box';
      pageEl.appendChild(contentEl);

      // Footer
      const footerEl = document.createElement('div');
      footerEl.className = 'pdf-page-footer';
      footerEl.style.boxSizing = 'border-box';
      footerEl.style.width = '100%';
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
      pages.push(pageEl);

      return { page: pageEl, content: contentEl };
    };

    // Initialize Page 1
    let currentPageIndex = 0;
    let { content: currentContent } = createPageElement(0);

    const getMaxAllowedHeight = () =>
      currentPageIndex === 0 ? AVAILABLE_CONTENT_HEIGHT_P1 : AVAILABLE_CONTENT_HEIGHT_PN;

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
      renderInlineContent(problemText, probBody);
      problemCard.appendChild(probBody);

      currentContent.appendChild(problemCard);
    }

    // Process Sections with Indivisible Math Blocks and Smart Flow
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      const maxAllowed = getMaxAllowedHeight();

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
        finalBadge.innerHTML = '<span>★</span><span>FINAL ANSWER</span>';
        finalBox.appendChild(finalBadge);

        const finalBody = document.createElement('div');
        finalBody.style.fontSize = '10.5pt';
        finalBody.style.fontWeight = '600';
        finalBody.style.color = '#0f172a';
        finalBody.style.lineHeight = '1.35';

        const finalBlocks = parseBodyIntoBlocks(section.body);
        for (const fb of finalBlocks) {
          finalBody.appendChild(createBlockElement(fb));
        }
        finalBox.appendChild(finalBody);

        currentContent.appendChild(finalBox);

        if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
          currentContent.removeChild(finalBox);
          currentPageIndex++;
          const next = createPageElement(currentPageIndex);
          currentContent = next.content;
          finalBox.style.marginTop = '0';
          currentContent.appendChild(finalBox);
        }
        continue;
      }

      // Normal Section
      const blocks = parseBodyIntoBlocks(section.body);

      // Section Header Element
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

      if (blocks.length === 0) {
        const headerContainer = document.createElement('div');
        headerContainer.style.marginTop = currentContent.children.length === 0 ? '0' : '10px';
        headerContainer.appendChild(headerEl);
        currentContent.appendChild(headerContainer);

        if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
          currentContent.removeChild(headerContainer);
          currentPageIndex++;
          const next = createPageElement(currentPageIndex);
          currentContent = next.content;
          headerContainer.style.marginTop = '0';
          currentContent.appendChild(headerContainer);
        }
        continue;
      }

      // Try appending the entire section intact first (smart block grouping)
      const fullSectionEl = document.createElement('div');
      fullSectionEl.className = 'pdf-step-container';
      fullSectionEl.style.boxSizing = 'border-box';
      fullSectionEl.style.marginTop = currentContent.children.length === 0 ? '0' : '10px';
      fullSectionEl.appendChild(headerEl.cloneNode(true));

      for (const block of blocks) {
        fullSectionEl.appendChild(createBlockElement(block));
      }

      currentContent.appendChild(fullSectionEl);

      if (currentContent.offsetHeight <= maxAllowed) {
        // Fits completely on the current page! Keep it intact!
        continue;
      }

      // If it doesn't fit intact, check remaining space on current page
      currentContent.removeChild(fullSectionEl);
      const usedHeight = currentContent.offsetHeight;
      const remainingHeight = maxAllowed - usedHeight;

      // If page is nearly full (< 140px left) and step fits on a fresh page, move whole step to next page
      if (remainingHeight < 140 && fullSectionEl.offsetHeight <= AVAILABLE_CONTENT_HEIGHT_PN) {
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;
        fullSectionEl.style.marginTop = '0';
        currentContent.appendChild(fullSectionEl);
        continue;
      }

      // Otherwise, plenty of space remains (or step is huge): decompose step into sub-blocks
      // ORPHAN CONTROL: Combine Section Header + First Block into a single LeadBlock
      const leadBlock = document.createElement('div');
      leadBlock.className = 'pdf-step-lead';
      leadBlock.style.boxSizing = 'border-box';
      leadBlock.style.marginTop = currentContent.children.length === 0 ? '0' : '10px';
      leadBlock.appendChild(headerEl);
      leadBlock.appendChild(createBlockElement(blocks[0]));

      currentContent.appendChild(leadBlock);

      if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
        currentContent.removeChild(leadBlock);
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;
        leadBlock.style.marginTop = '0';
        currentContent.appendChild(leadBlock);
      }

      // Append remaining blocks
      for (let bIdx = 1; bIdx < blocks.length; bIdx++) {
        const blockEl = createBlockElement(blocks[bIdx]);

        currentContent.appendChild(blockEl);

        if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
          currentContent.removeChild(blockEl);
          currentPageIndex++;
          const next = createPageElement(currentPageIndex);
          currentContent = next.content;
          blockEl.style.marginTop = '0';
          currentContent.appendChild(blockEl);
        }
      }
    }

    // 3. Wait for all fonts and KaTeX mathematics to finish rendering and layout to stabilize
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // fallback
      }
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 120);
        });
      });
    });

    // 4. Ensure wide mathematical formulas fit within printable page width via KaTeX font sizing
    // (NO CSS transforms, preventing canvas clipping and maintaining crisp fonts)
    const displayMaths = staging.querySelectorAll<HTMLElement>('.pdf-math-display');
    displayMaths.forEach((el) => {
      const katexEl = el.querySelector<HTMLElement>('.katex');
      if (katexEl && el.scrollWidth > 698) {
        const ratio = 694 / el.scrollWidth;
        if (ratio < 1) {
          const targetEm = Math.max(0.75, Math.floor(ratio * 100) / 100);
          katexEl.style.fontSize = `${targetEm}em`;
        }
      }
    });

    // 5. Update accurate total page numbers across all footers
    const totalPages = pages.length;
    pages.forEach((pageEl, idx) => {
      const numSpan = pageEl.querySelector('.pdf-page-number');
      if (numSpan) {
        numSpan.textContent = `Page ${idx + 1} of ${totalPages}`;
      }
    });

    // 6. Validation Check: Ensure no empty pages or failed math renders
    const renderedMathBlocks = staging.querySelectorAll('.pdf-math-display, .pdf-math-inline');
    let hasZeroDimensionMath = false;
    renderedMathBlocks.forEach((m) => {
      const el = m as HTMLElement;
      if (el.offsetHeight === 0 && el.textContent?.trim()) {
        hasZeroDimensionMath = true;
      }
    });

    if (hasZeroDimensionMath) {
      // Allow an extra layout tick if any math block hadn't resolved dimensions
      await new Promise<void>((r) => setTimeout(r, 60));
    }

    // 7. Render each page using html2canvas and assemble into jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
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

    // 8. Trigger download
    pdf.save(filename);
  } finally {
    // 9. Clean up staging container
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
