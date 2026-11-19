/**
 * OCRService — Client-side image preprocessing pipeline using HTML Canvas.
 * Enhances math problem images before sending to vision AI models.
 *
 * Pipeline:
 *   Original File → Canvas → Grayscale → Contrast → Threshold → Clean File
 */

import { aiLog } from './AILogger';

export interface OCRProcessingOptions {
  /** Contrast multiplier (default: 1.5) */
  contrast?: number;
  /** Binarization threshold 0–255 (default: 128) */
  threshold?: number;
  /** Output MIME type (default: image/png) */
  outputMime?: string;
  /** Output quality for jpeg (default: 0.95) */
  quality?: number;
}

/**
 * Apply canvas-based grayscale + contrast + threshold binarization to an image File.
 * Returns a new processed File ready for the vision API.
 */
export async function preprocessImage(
  file: File,
  options: OCRProcessingOptions = {}
): Promise<File> {
  const {
    contrast = 1.3,
    threshold = 128,
    outputMime = 'image/jpeg',
    quality = 0.9,
  } = options;

  aiLog('INFO', `OCR preprocessing started: ${file.name} (${Math.round(file.size / 1024)}KB)`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Downscale large mobile camera photos to prevent memory crashes (max 1600px)
      const MAX_DIM = 1600;
      let w = img.naturalWidth || 800;
      let h = img.naturalHeight || 600;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) {
          h = Math.round((h * MAX_DIM) / w);
          w = MAX_DIM;
        } else {
          w = Math.round((w * MAX_DIM) / h);
          h = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      // Draw downscaled image
      ctx.drawImage(img, 0, 0, w, h);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Step 1: Convert to grayscale using luminance formula
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Step 2: Apply gentle contrast enhancement without clipping faint math symbols
        const val = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));

        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        // Alpha channel unchanged
      }

      // Put processed pixels back
      ctx.putImageData(imageData, 0, 0);

      // Convert canvas to Blob → File
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          const processedFile = new File([blob], `ocr_${file.name.replace(/\.[^/.]+$/, "")}.jpg`, { type: outputMime });
          aiLog('INFO', `OCR preprocessing complete: ${Math.round(processedFile.size / 1024)}KB`);
          resolve(processedFile);
        },
        outputMime,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for OCR preprocessing'));
    };

    img.src = objectUrl;
  });
}

/**
 * Convert a File to a base64 data string (strips the data URL prefix).
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Strip "data:image/png;base64," prefix
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Validate that the file is an accepted image format.
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  const MAX_SIZE_MB = 10;

  if (!ALLOWED_TYPES.has(file.type)) {
    return { valid: false, error: 'Only PNG, JPG, JPEG, and WEBP images are supported.' };
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `Image must be smaller than ${MAX_SIZE_MB}MB.` };
  }

  return { valid: true };
}
