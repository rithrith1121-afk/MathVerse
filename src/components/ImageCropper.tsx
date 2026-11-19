import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Crop, Check, X, RotateCcw, Move, Sparkles } from 'lucide-react';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type HandleType = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface ImageCropperProps {
  imageFile: File;
  onConfirmCrop: (croppedFile: File) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageFile,
  onConfirmCrop,
  onCancel,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [displayedSize, setDisplayedSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [cropBox, setCropBox] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    handle: HandleType;
    startX: number;
    startY: number;
    initialCrop: CropRect;
  } | null>(null);

  // Load image URL
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  // Initialize crop box once image loads
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    setNaturalSize({ width: nw, height: nh });

    const dw = img.clientWidth;
    const dh = img.clientHeight;
    setDisplayedSize({ width: dw, height: dh });

    // Initial crop: centered 85% width, 70% height
    const initW = Math.round(dw * 0.85);
    const initH = Math.round(dh * 0.7);
    const initX = Math.round((dw - initW) / 2);
    const initY = Math.round((dh - initH) / 2);

    setCropBox({
      x: Math.max(0, initX),
      y: Math.max(0, initY),
      width: Math.min(dw, initW),
      height: Math.min(dh, initH),
    });
    setImageLoaded(true);
  };

  // Recalculate on window resize
  const handleResize = useCallback(() => {
    if (!imgRef.current || !naturalSize.width) return;
    const img = imgRef.current;
    const dw = img.clientWidth;
    const dh = img.clientHeight;
    if (dw === displayedSize.width && dh === displayedSize.height) return;

    const scaleX = dw / (displayedSize.width || dw);
    const scaleY = dh / (displayedSize.height || dh);

    setDisplayedSize({ width: dw, height: dh });
    setCropBox((prev) => ({
      x: Math.max(0, Math.min(dw - 30, Math.round(prev.x * scaleX))),
      y: Math.max(0, Math.min(dh - 30, Math.round(prev.y * scaleY))),
      width: Math.max(30, Math.min(dw, Math.round(prev.width * scaleX))),
      height: Math.max(30, Math.min(dh, Math.round(prev.height * scaleY))),
    }));
  }, [displayedSize, naturalSize]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Pointer drag start
  const handlePointerDown = (handle: HandleType, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...cropBox },
    };
  };

  // Pointer drag move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !displayedSize.width) return;
    e.preventDefault();

    const { handle, startX, startY, initialCrop } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const minSize = 35;
    const maxW = displayedSize.width;
    const maxH = displayedSize.height;

    let newBox = { ...initialCrop };

    if (handle === 'move') {
      newBox.x = Math.max(0, Math.min(maxW - initialCrop.width, initialCrop.x + dx));
      newBox.y = Math.max(0, Math.min(maxH - initialCrop.height, initialCrop.y + dy));
    } else {
      // Resizing with boundaries
      if (handle.includes('w')) {
        const potentialX = Math.max(0, Math.min(initialCrop.x + initialCrop.width - minSize, initialCrop.x + dx));
        newBox.width = initialCrop.width + (initialCrop.x - potentialX);
        newBox.x = potentialX;
      }
      if (handle.includes('e')) {
        newBox.width = Math.max(minSize, Math.min(maxW - initialCrop.x, initialCrop.width + dx));
      }
      if (handle.includes('n')) {
        const potentialY = Math.max(0, Math.min(initialCrop.y + initialCrop.height - minSize, initialCrop.y + dy));
        newBox.height = initialCrop.height + (initialCrop.y - potentialY);
        newBox.y = potentialY;
      }
      if (handle.includes('s')) {
        newBox.height = Math.max(minSize, Math.min(maxH - initialCrop.y, initialCrop.height + dy));
      }
    }

    setCropBox(newBox);
  };

  // Pointer drag end
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
    }
  };

  // Reset to full view crop
  const handleResetCrop = () => {
    if (!displayedSize.width) return;
    const initW = Math.round(displayedSize.width * 0.9);
    const initH = Math.round(displayedSize.height * 0.85);
    const initX = Math.round((displayedSize.width - initW) / 2);
    const initY = Math.round((displayedSize.height - initH) / 2);
    setCropBox({
      x: Math.max(0, initX),
      y: Math.max(0, initY),
      width: initW,
      height: initH,
    });
  };

  // Confirm crop -> produce high quality blob and File
  const handleConfirm = async () => {
    if (!imgRef.current || !naturalSize.width || isProcessing) return;
    setIsProcessing(true);

    try {
      const img = imgRef.current;
      const scaleX = naturalSize.width / displayedSize.width;
      const scaleY = naturalSize.height / displayedSize.height;

      const sx = Math.max(0, Math.round(cropBox.x * scaleX));
      const sy = Math.max(0, Math.round(cropBox.y * scaleY));
      const sWidth = Math.min(naturalSize.width - sx, Math.round(cropBox.width * scaleX));
      const sHeight = Math.min(naturalSize.height - sy, Math.round(cropBox.height * scaleY));

      if (sWidth <= 0 || sHeight <= 0) {
        setIsProcessing(false);
        return;
      }

      // Draw onto high-res canvas (preserving 100% natural pixel clarity)
      const canvas = document.createElement('canvas');
      canvas.width = sWidth;
      canvas.height = sHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

      const mimeType = imageFile.type && imageFile.type.startsWith('image/') ? imageFile.type : 'image/png';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsProcessing(false);
            return;
          }
          const croppedName = imageFile.name.replace(/\.[^/.]+$/, '') + '_cropped.png';
          const croppedFile = new File([blob], croppedName, { type: mimeType });
          setIsProcessing(false);
          onConfirmCrop(croppedFile);
        },
        mimeType,
        0.95
      );
    } catch (err) {
      console.error('Error during image crop:', err);
      setIsProcessing(false);
    }
  };

  // Natural pixel dimensions preview
  const naturalCropW = displayedSize.width ? Math.round(cropBox.width * (naturalSize.width / displayedSize.width)) : 0;
  const naturalCropH = displayedSize.height ? Math.round(cropBox.height * (naturalSize.height / displayedSize.height)) : 0;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onCancel();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0a0e1a] border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(0,210,255,0.2)] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold text-cyan-300 uppercase tracking-wider">
                Crop Math Problem
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Drag and resize to frame the specific equation or problem.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            title="Cancel crop"
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800/60 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cropping Canvas Workspace */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[260px] max-h-[58vh] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-hidden select-none"
          style={{ touchAction: 'none' }}
        >
          {imageUrl && (
            <div className="relative inline-block overflow-hidden rounded-lg shadow-inner">
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Source for cropping"
                onLoad={handleImageLoad}
                className="max-h-[52vh] max-w-full w-auto h-auto object-contain block pointer-events-none"
                draggable={false}
              />

              {/* Crop box overlay */}
              {imageLoaded && displayedSize.width > 0 && (
                <div
                  className="absolute cursor-move border-2 border-cyan-400 select-none shadow-[0_0_15px_rgba(0,251,255,0.4)]"
                  style={{
                    left: `${cropBox.x}px`,
                    top: `${cropBox.y}px`,
                    width: `${cropBox.width}px`,
                    height: `${cropBox.height}px`,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => handlePointerDown('move', e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {/* Rule of thirds grid lines */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                    <div className="border-r border-b border-cyan-300"></div>
                    <div className="border-r border-b border-cyan-300"></div>
                    <div className="border-b border-cyan-300"></div>
                    <div className="border-r border-b border-cyan-300"></div>
                    <div className="border-r border-b border-cyan-300"></div>
                    <div className="border-b border-cyan-300"></div>
                    <div className="border-r border-cyan-300"></div>
                    <div className="border-r border-cyan-300"></div>
                    <div></div>
                  </div>

                  {/* Center drag icon hint */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
                    <Move className="w-5 h-5 text-cyan-300" />
                  </div>

                  {/* Corner Handles */}
                  {/* NW */}
                  <div
                    className="absolute -top-2.5 -left-2.5 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-20"
                    onPointerDown={(e) => handlePointerDown('nw', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 bg-cyan-400 border-2 border-slate-950 rounded-sm shadow-md"></div>
                  </div>
                  {/* NE */}
                  <div
                    className="absolute -top-2.5 -right-2.5 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-20"
                    onPointerDown={(e) => handlePointerDown('ne', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 bg-cyan-400 border-2 border-slate-950 rounded-sm shadow-md"></div>
                  </div>
                  {/* SW */}
                  <div
                    className="absolute -bottom-2.5 -left-2.5 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-20"
                    onPointerDown={(e) => handlePointerDown('sw', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 bg-cyan-400 border-2 border-slate-950 rounded-sm shadow-md"></div>
                  </div>
                  {/* SE */}
                  <div
                    className="absolute -bottom-2.5 -right-2.5 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-20"
                    onPointerDown={(e) => handlePointerDown('se', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 bg-cyan-400 border-2 border-slate-950 rounded-sm shadow-md"></div>
                  </div>

                  {/* Edge Handles */}
                  {/* N */}
                  <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-ns-resize z-10"
                    onPointerDown={(e) => handlePointerDown('n', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-4 h-1.5 bg-cyan-300 rounded-full border border-slate-950"></div>
                  </div>
                  {/* S */}
                  <div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-ns-resize z-10"
                    onPointerDown={(e) => handlePointerDown('s', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="w-4 h-1.5 bg-cyan-300 rounded-full border border-slate-950"></div>
                  </div>
                  {/* W */}
                  <div
                    className="absolute top-1/2 -left-2 -translate-y-1/2 h-8 w-4 flex items-center justify-center cursor-ew-resize z-10"
                    onPointerDown={(e) => handlePointerDown('w', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="h-4 w-1.5 bg-cyan-300 rounded-full border border-slate-950"></div>
                  </div>
                  {/* E */}
                  <div
                    className="absolute top-1/2 -right-2 -translate-y-1/2 h-8 w-4 flex items-center justify-center cursor-ew-resize z-10"
                    onPointerDown={(e) => handlePointerDown('e', e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="h-4 w-1.5 bg-cyan-300 rounded-full border border-slate-950"></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-[#0d1222] flex flex-wrap items-center justify-between gap-3">
          {/* Resolution Badge */}
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Preserved OCR Resolution:</span>
            <span className="text-cyan-300 font-bold">{naturalCropW} × {naturalCropH} px</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 ml-auto">
            {/* Reset Area */}
            <button
              type="button"
              onClick={handleResetCrop}
              disabled={isProcessing}
              title="Reset crop selection to full area"
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Reset Area
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 text-xs font-mono transition-all cursor-pointer"
            >
              Cancel
            </button>

            {/* Confirm Crop */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing || !imageLoaded}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-mono text-xs font-bold hover:shadow-[0_0_15px_rgba(0,210,255,0.4)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isProcessing ? 'Cropping…' : 'Confirm Crop'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ImageCropper;
