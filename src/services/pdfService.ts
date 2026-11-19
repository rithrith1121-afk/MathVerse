/**
 * pdfService.ts — Generates professional A4 Engineering Answer Key PDFs
 * from MathVerse AI solutions with crisp KaTeX mathematical rendering.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { renderMathInText, normalizeMathDelimiters } from './ai/ResponseFormatter';

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
  // Strip out common introductory phrases
  const cleaned = problem
    .replace(/^(find|solve|evaluate|compute|calculate|what is the)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 32);

  return cleaned ? `MathVerse_Answer_Key_${cleaned}.pdf` : 'MathVerse_Answer_Key.pdf';
}

/**
 * Format markdown text inside section body (bold, italics, bullet points).
 */
function formatSectionText(text: string): string {
  // First normalize and render any math blocks via KaTeX
  const withMath = renderMathInText(normalizeMathDelimiters(text));

  // Convert markdown bold and italics
  let formatted = withMath
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 600;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color: #475569;">$1</em>');

  // Convert bullet lists and preserve newlines
  const lines = formatted.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      processedLines.push('<div style="height: 6px;"></div>');
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      processedLines.push(
        `<div style="display: flex; gap: 8px; margin: 3px 0; align-items: baseline;">
          <span style="color: #0891b2; font-size: 14px; line-height: 1;">•</span>
          <div style="flex: 1; line-height: 1.5; color: #334155;">${trimmed.slice(2)}</div>
        </div>`
      );
    } else {
      processedLines.push(`<div style="margin: 3px 0; line-height: 1.55; color: #334155;">${trimmed}</div>`);
    }
  }

  return processedLines.join('');
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
 * Downloads the current mathematical solution as an A4 Engineering Answer Key PDF.
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

  // 1. Create off-screen staging container (A4 width at 96 DPI: 794px)
  const staging = document.createElement('div');
  staging.id = 'mathverse-pdf-staging';
  staging.style.position = 'fixed';
  staging.style.left = '-9999px';
  staging.style.top = '0';
  staging.style.width = '794px';
  staging.style.background = '#ffffff';
  staging.style.color = '#0f172a';
  staging.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  staging.style.zIndex = '-1000';
  staging.style.pointerEvents = 'none';

  document.body.appendChild(staging);

  try {
    // 2. Build pages with strict height budget to prevent cutting equations
    const PAGE_HEIGHT = 1123; // Exact A4 height at 96 DPI (297mm)
    const PAGE_PADDING_Y = 64; // 32px top + 32px bottom
    const AVAILABLE_CONTENT_HEIGHT_P1 = PAGE_HEIGHT - PAGE_PADDING_Y - 140; // Room for full header & footer
    const AVAILABLE_CONTENT_HEIGHT_PN = PAGE_HEIGHT - PAGE_PADDING_Y - 75; // Room for compact running header & footer

    const pages: HTMLDivElement[] = [];

    const createPageElement = (pageIndex: number): { page: HTMLDivElement; content: HTMLDivElement } => {
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-a4-page';
      pageEl.style.width = '794px';
      pageEl.style.height = `${PAGE_HEIGHT}px`;
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.padding = '32px 42px';
      pageEl.style.background = '#ffffff';
      pageEl.style.display = 'flex';
      pageEl.style.flexDirection = 'column';
      pageEl.style.justifyContent = 'space-between';
      pageEl.style.overflow = 'hidden';

      // Header
      const headerEl = document.createElement('div');
      if (pageIndex === 0) {
        // Full Header for Page 1
        headerEl.innerHTML = `
          <div style="border-bottom: 2px solid #0891b2; padding-bottom: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="background: #0891b2; color: #ffffff; font-family: monospace; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.08em;">MATHVERSE</span>
                  <span style="font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase;">AI Learning Curriculum</span>
                </div>
                <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 6px 0 2px; letter-spacing: -0.02em;">
                  Engineering Mathematical Solution & Answer Key
                </h1>
                <div style="font-size: 11px; color: #64748b;">
                  Target Calibration: <strong style="color: #0891b2;">${levelName}</strong> • Verified Procedural Derivation
                </div>
              </div>
              <div style="text-align: right; font-size: 10px; color: #64748b; font-family: monospace;">
                <div>Ref: <strong style="color: #0f172a;">${refCode}</strong></div>
                <div>Date: ${formattedDate}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        // Compact Running Header for Page 2+
        headerEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; font-size: 10px; color: #64748b;">
            <span style="font-weight: 700; color: #0891b2; letter-spacing: 0.05em;">MATHVERSE AI ANSWER KEY</span>
            <span>Calibration: <strong>${levelName}</strong></span>
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
      contentEl.style.gap = '12px';
      pageEl.appendChild(contentEl);

      // Placeholder footer (page count will be updated at the end)
      const footerEl = document.createElement('div');
      footerEl.className = 'pdf-page-footer';
      footerEl.style.borderTop = '1px solid #e2e8f0';
      footerEl.style.paddingTop = '8px';
      footerEl.style.display = 'flex';
      footerEl.style.justifyContent = 'space-between';
      footerEl.style.fontSize = '10px';
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

    // Add Problem Card to Page 1
    if (problemText.trim()) {
      const problemCard = document.createElement('div');
      problemCard.style.border = '1px solid #cbd5e1';
      problemCard.style.borderRadius = '8px';
      problemCard.style.background = '#f8fafc';
      problemCard.style.padding = '12px 16px';
      problemCard.style.boxSizing = 'border-box';
      problemCard.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; color: #0891b2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">
          Problem Statement
        </div>
        <div style="font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1.45;">
          ${formatSectionText(problemText)}
        </div>
      `;
      currentContent.appendChild(problemCard);
    }

    // Add Solution Sections
    for (const section of sections) {
      const sectionCard = document.createElement('div');
      sectionCard.style.boxSizing = 'border-box';

      if (section.isFinalAnswer) {
        // Highlighted Final Answer Box
        sectionCard.style.border = '2px solid #0891b2';
        sectionCard.style.borderRadius = '8px';
        sectionCard.style.background = '#f0fdfa';
        sectionCard.style.padding = '14px 18px';
        sectionCard.style.margin = '4px 0';
        sectionCard.innerHTML = `
          <div style="font-size: 11px; font-weight: 800; color: #0891b2; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
            ★ FINAL ANSWER
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #0f172a;">
            ${formatSectionText(section.body)}
          </div>
        `;
      } else {
        // Standard Section Card
        sectionCard.style.border = '1px solid #e2e8f0';
        sectionCard.style.borderRadius = '8px';
        sectionCard.style.background = '#ffffff';
        sectionCard.style.padding = '12px 16px';
        sectionCard.innerHTML = `
          <div style="font-size: 12px; font-weight: 700; color: #0f172a; border-left: 3px solid #0891b2; padding-left: 8px; margin-bottom: 8px; text-transform: capitalize;">
            ${section.title}
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: #334155;">
            ${formatSectionText(section.body)}
          </div>
        `;
      }

      // Append and check if it overflows the page limit
      currentContent.appendChild(sectionCard);

      const maxAllowed = currentPageIndex === 0 ? AVAILABLE_CONTENT_HEIGHT_P1 : AVAILABLE_CONTENT_HEIGHT_PN;
      if (currentContent.scrollHeight > maxAllowed && currentContent.children.length > 1) {
        // Move card to next page
        currentContent.removeChild(sectionCard);
        currentPageIndex++;
        const next = createPageElement(currentPageIndex);
        currentContent = next.content;
        currentContent.appendChild(sectionCard);
      }
    }

    // Update total page counts in footers
    const totalPages = pages.length;
    pages.forEach((pageEl, idx) => {
      const numSpan = pageEl.querySelector('.pdf-page-number');
      if (numSpan) {
        numSpan.textContent = `Page ${idx + 1} of ${totalPages}`;
      }
    });

    // 3. Render each page using html2canvas and compile into jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const canvas = await html2canvas(pageEl, {
        scale: 2, // 2x resolution for razor-sharp KaTeX rendering
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }

    // 4. Download file locally
    pdf.save(filename);
  } finally {
    // 5. Clean up staging container
    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}
