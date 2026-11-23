/**
 * pdfService.ts — Production-Quality A4 Engineering Answer Key PDF Export Engine.
 *
 * Implements dynamic content flow, zero content clipping, accurate A4 pagination,
 * intelligent block grouping with orphan prevention, and full KaTeX mathematical fidelity.
 */

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
 * Escape HTML special characters to prevent DOM injection / malformed tags.
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
 * Zero overflow:hidden, auto dynamic height, preserved line wrapping.
 */
function renderPdfContent(rawText: string): string {
  if (!rawText) return '';

  let processed = rawText;

  // Render display math blocks with tight margins (centered, auto height, no dark background, no overflow:hidden)
  processed = processed.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, math) =>
      `<div class="pdf-math-display" style="margin: 4px 0; padding: 1px 0; text-align: center; color: #0f172a; line-height: 1.25; width: 100%; box-sizing: border-box;">${renderPdfKatex(
        math,
        true
      )}</div>`
  );

  // Render inline math
  processed = processed.replace(
    /\$([^$\n]+)\$/g,
    (_, math) =>
      `<span class="pdf-math-inline" style="display: inline-block; vertical-align: -1px; margin: 0 1px; color: #0f172a;">${renderPdfKatex(
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

  // Process individual lines (bullet points, subheadings, paragraphs)
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
          <div style="flex: 1; word-break: break-word;">${trimmed.slice(2)}</div>
        </div>`
      );
    } else if (trimmed.startsWith('### ')) {
      renderedLines.push(
        `<div style="font-size: 10pt; font-weight: 700; color: #0891b2; margin: 5px 0 2px 0; line-height: 1.3;">
          ${trimmed.slice(4)}
        </div>`
      );
    } else if (trimmed.startsWith('<div class="pdf-math-display"') || trimmed.startsWith('<div style="margin: 4px')) {
      renderedLines.push(trimmed);
    } else {
      renderedLines.push(
        `<div style="font-size: 9.5pt; color: #334155; line-height: 1.35; margin: 3px 0; word-break: break-word;">${trimmed}</div>`
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
      // Intro or unheaded section
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

  // Split on display math boundaries $$...$$
  const parts = body.split(/(\$\$[\s\S]*?\$\$)/);
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
 * Downloads the current mathematical solution as an A4 Engineering Answer Key PDF.
 * Uses real A4 printable heights, auto dynamic container heights, orphan-controlled
 * pagination, and full KaTeX rendering.
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

  // 1. Normalize the full document text using battle-tested normalizers
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
    const PAGE_PADDING_X = 48; // Left/Right 48px (~12.7mm) -> printable content width = 698px

    // Printable content capacity per page (measured without flex: 1 or overflow: hidden constraints)
    // Page 1: 1123 - 36 (top) - 30 (bottom) - 58 (header) - 24 (footer) - 20 (safety margin) = 955px
    const AVAILABLE_CONTENT_HEIGHT_P1 = 955;
    // Page 2+: 1123 - 36 (top) - 30 (bottom) - 24 (header) - 24 (footer) - 19 (safety margin) = 990px
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
        // Page 1 Header: Compact professional engineering document title bar
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

      // Content Area: AUTO/DYNAMIC HEIGHT (NO flex: 1, NO fixed height, NO overflow: hidden)
      const contentEl = document.createElement('div');
      contentEl.className = 'pdf-page-content';
      contentEl.style.width = '100%';
      contentEl.style.boxSizing = 'border-box';
      pageEl.appendChild(contentEl);

      // Footer: Pushed to bottom via margin-top: auto
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

    // Process Sections with Smart Block Flow and Orphan Prevention
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
        finalBox.innerHTML = `
          <div style="font-size: 9pt; font-weight: 800; color: #0891b2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
            <span>★</span><span>FINAL ANSWER</span>
          </div>
          <div style="font-size: 10.5pt; font-weight: 600; color: #0f172a; line-height: 1.35;">
            ${renderPdfContent(section.body)}
          </div>
        `;

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
      const chunks = splitSectionBodyIntoChunks(section.body);

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

      if (chunks.length === 0) {
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

      for (const chunk of chunks) {
        const chunkEl = document.createElement('div');
        chunkEl.style.boxSizing = 'border-box';
        chunkEl.innerHTML = renderPdfContent(chunk);
        fullSectionEl.appendChild(chunkEl);
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

      // If page is nearly full (< 150px left) and step fits on a fresh page, move whole step to next page
      if (remainingHeight < 150 && fullSectionEl.offsetHeight <= AVAILABLE_CONTENT_HEIGHT_PN) {
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;
        fullSectionEl.style.marginTop = '0';
        currentContent.appendChild(fullSectionEl);
        continue;
      }

      // Otherwise, plenty of space remains (or step is huge): decompose step into sub-blocks
      // ORPHAN CONTROL: Combine Section Header + First Chunk into a single LeadBlock
      const leadBlock = document.createElement('div');
      leadBlock.className = 'pdf-step-lead';
      leadBlock.style.boxSizing = 'border-box';
      leadBlock.style.marginTop = currentContent.children.length === 0 ? '0' : '10px';
      leadBlock.appendChild(headerEl);

      const firstChunkEl = document.createElement('div');
      firstChunkEl.style.boxSizing = 'border-box';
      firstChunkEl.innerHTML = renderPdfContent(chunks[0]);
      leadBlock.appendChild(firstChunkEl);

      currentContent.appendChild(leadBlock);

      if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
        currentContent.removeChild(leadBlock);
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;
        leadBlock.style.marginTop = '0';
        currentContent.appendChild(leadBlock);
      }

      // Append remaining chunks
      for (let cIdx = 1; cIdx < chunks.length; cIdx++) {
        const chunkEl = document.createElement('div');
        chunkEl.style.boxSizing = 'border-box';
        chunkEl.innerHTML = renderPdfContent(chunks[cIdx]);

        currentContent.appendChild(chunkEl);

        if (currentContent.offsetHeight > maxAllowed && currentContent.children.length > 1) {
          currentContent.removeChild(chunkEl);
          currentPageIndex++;
          const next = createPageElement(currentPageIndex);
          currentContent = next.content;
          chunkEl.style.marginTop = '0';
          currentContent.appendChild(chunkEl);
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
          setTimeout(resolve, 100);
        });
      });
    });

    // 4. Ensure wide mathematical formulas fit within printable page width
    const mathDisplays = staging.querySelectorAll<HTMLElement>('.pdf-math-display');
    mathDisplays.forEach((el) => {
      const katexEl = el.querySelector<HTMLElement>('.katex-display') || el;
      if (katexEl.scrollWidth > el.clientWidth && el.clientWidth > 0) {
        const scale = Math.max(0.75, (el.clientWidth - 4) / katexEl.scrollWidth);
        katexEl.style.transform = `scale(${scale})`;
        katexEl.style.transformOrigin = 'center center';
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

    // 6. Render each page using html2canvas and assemble into jsPDF
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

    // 7. Save file locally
    pdf.save(filename);
  } finally {
    // 8. Clean up staging container
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
