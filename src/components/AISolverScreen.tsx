import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, ArrowLeft, Loader2, PlaySquare, AlertCircle,
  Copy, Check, CheckCircle2, ImagePlus, Camera, X, Zap
} from "lucide-react";
import { MathLevel, UserState } from "../types";
import { solveMathStreaming, solveImage } from "../services/ai/AIManager";
import { formatResponse, stripHtml } from "../services/ai/ResponseFormatter";
import { formatUserError } from "../services/ai/ErrorHandler";
import type { MathVerseError } from "../services/ai/ErrorHandler";
import { MathRenderer } from "./MathRenderer";
import { supabase } from "../lib/supabase";
import CameraCapture from "./CameraCapture";

interface AISolverScreenProps {
  userState: UserState;
  onBack: () => void;
  onIncrementSolved: () => void;
}

export default function AISolverScreen({ userState, onBack, onIncrementSolved }: AISolverScreenProps) {
  const currentLevel: MathLevel = userState.currentLevel!;
  const [problemText, setProblemText] = useState("");
  const [solving, setSolving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [solutionHTML, setSolutionHTML] = useState<string | null>(null);
  const [solutionRaw, setSolutionRaw] = useState<string | null>(null);
  const [streamingRaw, setStreamingRaw] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [solveStage, setSolveStage] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // Image state (upload or camera)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<"upload" | "camera" | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick pre-set complex problems
  const presets = [
    {
      title: "Evaluate Integral of Sin(x) Cos(x) dx",
      text: "Evaluate the indefinite integral: ∫ sin(x) * cos(x) dx",
    },
    {
      title: "Solve Quadratic 3x² - 5x + 2 = 0",
      text: "Solve for x: 3x² - 5x + 2 = 0 with full derivation steps.",
    },
    {
      title: "Laplace Transform of e^{-2t} sin(4t)",
      text: "Find the Laplace Transform of f(t) = e^{-2t} * sin(4t).",
    }
  ];

  // ── Image Helpers ────────────────────────────────────────────────────────────

  const clearImage = useCallback(() => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageSource(null);
    // reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [imagePreviewUrl]);

  const applyImageFile = (file: File) => {
    clearImage();
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload Image ─────────────────────────────────────────────────────────────

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only PNG, JPG, JPEG, and WEBP images are supported.");
      return;
    }
    setError("");
    applyImageFile(file);
    setImageSource("upload");
  };

  // ── Camera Capture ───────────────────────────────────────────────────────────

  const handleCameraCapture = (file: File) => {
    applyImageFile(file);
    setImageSource("camera");
    setShowCamera(false);
  };

  // ── Solve ────────────────────────────────────────────────────────────────────

  const handleSolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemText.trim() && !imageFile) return;

    // Cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSolving(true);
    setError("");
    setSolutionHTML(null);
    setSolutionRaw(null);
    setStreamingRaw("");
    setIsStreaming(false);

    try {
      if (imageFile) {
        // ── Image path: OCR + vision model chain ─────────────────────────
        setSolveStage("Preprocessing image…");
        const result = await solveImage({
          file: imageFile,
          level: currentLevel.name,
          learningMode: userState.learningMode,
          additionalText: problemText.trim() || undefined,
          onProgress: (stage) => {
            const labels = {
              validating: "Validating image…",
              preprocessing: "Enhancing image for OCR…",
              sending: "Sending to vision AI…",
              formatting: "Formatting solution…",
            };
            setSolveStage(labels[stage]);
          },
        });
        setSolutionHTML(result.html);
        setSolutionRaw(result.raw);
        setSolveStage("");
        onIncrementSolved();
        if (userState.email) {
          await supabase.from("ai_history").insert({
            user_email: userState.email,
            question: `[image${problemText.trim() ? ` + "${problemText.trim()}"` : ""}]`,
            answer: stripHtml(result.html),
            input_type: imageSource ?? "upload",
          });
        }
      } else {
        // ── Text path: streaming ─────────────────────────────────────────
        setIsStreaming(true);
        setSolveStage("Connecting to AI…");

        await new Promise<void>((resolve) => {
          solveMathStreaming(
            problemText,
            currentLevel.name,
            {
              onChunk: (accumulated) => {
                setStreamingRaw(accumulated);
                setSolveStage("");
              },
              onComplete: (result) => {
                setIsStreaming(false);
                setSolutionHTML(result.html);
                setSolutionRaw(result.raw);
                setStreamingRaw("");
                onIncrementSolved();
                if (userState.email) {
                  supabase.from("ai_history").insert({
                    user_email: userState.email,
                    question: problemText,
                    answer: result.raw,
                    input_type: "text",
                  });
                }
                resolve();
              },
              onError: (err: MathVerseError) => {
                setIsStreaming(false);
                setError(formatUserError(err));
                resolve();
              },
              signal: controller.signal,
            },
            userState.learningMode
          );
        });
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'userMessage' in err
          ? formatUserError(err as MathVerseError)
          : 'MathVerse AI is temporarily unavailable.';
      setError(msg);
      setIsStreaming(false);
    } finally {
      setSolving(false);
      setSolveStage("");
    }
  };

  const handleCopySolution = () => {
    if (!solutionRaw) return;
    navigator.clipboard.writeText(solutionRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const canSubmit = !solving && !isStreaming && (!!problemText.trim() || !!imageFile);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen">
      {/* Background Particles */}
      <div className="particles-layer"></div>

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Top Header */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-6 md:px-16 h-16 bg-[#0f131f]/60 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(0,210,255,0.05)]">
        <button
          onClick={onBack}
          className="text-cyan-400 hover:scale-95 transition-transform p-2 rounded-full hover:bg-white/5 cursor-pointer flex items-center gap-1 text-sm uppercase tracking-wider font-mono focus:outline-none"
        >
          <ArrowLeft className="w-4 h-4" /> Exit Solver
        </button>
        <div className="font-sans font-bold text-sm tracking-tight text-slate-400 flex items-center gap-1.5">
          <span className="hidden md:inline">Target Calibration:</span>
          <span className="hidden sm:inline md:hidden">Target:</span>
          <span className="text-cyan-400 font-mono px-2 py-0.5 border border-cyan-500/20 bg-cyan-950/20 rounded-full text-xs max-w-[120px] sm:max-w-none truncate">
            {currentLevel.name}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="container mx-auto px-6 md:px-16 pt-24 pb-16 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ── Left Column: Input ────────────────────────────────────── */}
          <div className="lg:col-span-5 flex flex-col gap-6">

            {/* Context / Presets card */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800">
              <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#00FBFF]" /> Math Solver Synthesizer
              </h3>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                Type a problem, upload an image, or capture from your camera. MathVerse AI will read and solve it step by step.
              </p>

              {/* Presets */}
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                <div className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">Try predefined triggers</div>
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setProblemText(p.text); clearImage(); }}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-900 hover:border-cyan-500/40 text-xs text-slate-400 hover:text-[#00FBFF] transition-all cursor-pointer font-sans truncate block"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSolve} className="flex flex-col gap-4">

              {/* Textarea wrapper with action buttons inside */}
              <div className="relative w-full rounded-xl bg-slate-950 border border-slate-800 focus-within:border-cyan-500 transition-all overflow-hidden">
                <textarea
                  placeholder="e.g. Find the roots of f(x) = x³ - 3x² + x - 3 or type any math problem here..."
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  className="w-full p-4 pb-14 bg-transparent text-sm font-sans focus:ring-0 text-[#dfe2f3] placeholder-slate-600 outline-none resize-none"
                  rows={6}
                />

                {/* Action buttons — bottom-right inside textarea */}
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  {/* Upload Image */}
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    title="Upload Image"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-all cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>

                  {/* Open Camera */}
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    title="Open Camera"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-all cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Camera</span>
                  </button>
                </div>
              </div>

              {/* Image Preview (below input box) */}
              {imageFile && imagePreviewUrl && (
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/20 bg-slate-950 shadow-[0_0_20px_rgba(0,210,255,0.07)]">
                  {/* Badge */}
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-sm text-[10px] font-mono text-cyan-400 border border-cyan-500/20">
                    {imageSource === "camera" ? <Camera className="w-3 h-3" /> : <ImagePlus className="w-3 h-3" />}
                    {imageSource === "camera" ? "Camera Capture" : "Uploaded Image"}
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={clearImage}
                    title="Remove image"
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-900/80 backdrop-blur-sm text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/50 transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <img
                    src={imagePreviewUrl}
                    alt="Math problem image"
                    className="w-full max-h-56 object-contain p-2"
                  />

                  {/* Replace button */}
                  <div className="border-t border-slate-800 flex items-center gap-2 px-3 py-2 bg-slate-900/60">
                    <span className="text-[10px] text-slate-500 font-mono flex-1 truncate">{imageFile.name}</span>
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <ImagePlus className="w-3 h-3" /> Replace
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full cursor-pointer bg-gradient-to-r from-cyan-500 to-cyan-300 font-mono text-xs uppercase tracking-wider font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 text-slate-950 ${
                  !canSubmit ? "opacity-35 cursor-not-allowed" : "hover:shadow-[0_0_20px_rgba(3,226,255,0.4)]"
                }`}
              >
                {solving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Resolving Orbit...</span>
                  </>
                ) : (
                  <>
                    <PlaySquare className="w-4 h-4" />
                    <span>Trigger AI Resolution</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ── Right Column: Solution Viewer ─────────────────────────── */}
          <div className="lg:col-span-7">

            {/* Loading/Streaming state */}
            {(solving && !isStreaming) && (
              <div className="glass-card rounded-2xl p-8 border border-cyan-500/10 bg-slate-950/20 flex flex-col items-center justify-center min-h-[400px] text-center gap-6">
                <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                <div className="space-y-2">
                  <h4 className="text-[#00FBFF] text-lg font-bold font-sans tracking-tight animate-pulse">
                    {solveStage || "Calibrating Vector Steps"}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                    MathVerse is parsing structural logic via Groq generation. Formulating intuitive answers with step-by-step takeaways.
                  </p>
                </div>
                <div className="w-full max-w-md space-y-3 mt-4">
                  <div className="h-4 bg-slate-900 rounded-full animate-pulse w-3/4"></div>
                  <div className="h-3.5 bg-slate-900 rounded-full animate-pulse w-11/12"></div>
                  <div className="h-3.5 bg-slate-900/60 rounded-full animate-pulse w-5/6"></div>
                  <div className="h-4 bg-slate-900/40 rounded-full animate-pulse w-2/3"></div>
                </div>
              </div>
            )}

            {/* Streaming output — live token-by-token display */}
            {isStreaming && streamingRaw && (
              <div className="glass-panel rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl relative">
                <div className="bg-slate-950/60 border-b border-slate-900 px-6 py-3 flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  <Zap className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                  Streaming Live Response…
                </div>
                <div className="p-6 md:p-8 max-h-[600px] overflow-y-auto font-sans text-slate-300">
                  <MathRenderer text={streamingRaw} />
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="glass-card rounded-2xl p-6 border border-red-500/30 bg-red-950/10 flex items-start gap-4 min-h-[150px] mb-4">
                <AlertCircle className="text-red-400 w-6 h-6 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="text-red-200 font-bold text-sm">Service Unavailable</h4>
                  <p className="text-xs text-red-300/80 leading-relaxed max-w-md">{error}</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!solving && !error && !solutionRaw && (
              <div className="glass-card rounded-2xl p-8 border border-dashed border-slate-800 flex flex-col items-center justify-center min-h-[420px] text-center text-slate-500 gap-4">
                <Sparkles className="w-12 h-12 text-slate-700 animate-pulse" />
                <div>
                  <h4 className="text-white text-md font-bold mb-1 font-sans">AI Solver Console Stationary</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto font-sans leading-relaxed">
                    Type a problem, upload an image, or capture from your camera to activate AI synthesis.
                  </p>
                </div>
              </div>
            )}

            {/* Solution output */}
            {!isStreaming && !error && solutionRaw && (
              <div className="glass-panel rounded-2xl border border-[#00FBFF]/20 overflow-hidden shadow-2xl relative">

                {/* Result header */}
                <div className="bg-slate-950/60 border-b border-slate-900 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#00FBFF] uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Math Resolution Complete
                  </div>
                  <button
                    onClick={handleCopySolution}
                    className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-cyan-400 py-1.5 px-3 rounded-lg border border-slate-900 hover:border-cyan-500 transition-all cursor-pointer bg-slate-950/20"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Formatted solution body */}
                <div className="p-6 md:p-8 max-h-[600px] overflow-y-auto font-sans text-slate-300">
                  <MathRenderer text={solutionRaw} />
                </div>

                {/* Footer stamp */}
                <div className="bg-slate-950/40 border-t border-slate-900 px-6 py-3 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>RESOLVED MATRIX VECTOR VERIFIED</span>
                  <span>CALIBRATION SUITABLE</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
