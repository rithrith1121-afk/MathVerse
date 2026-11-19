import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  ClipboardList,
  Compass,
  Award,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  HelpCircle,
  Flame,
  Send,
  MessageSquare,
  MessageCircle,
  X,
  RefreshCw,
  Trophy,
  Activity,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { MathLevel, UserState } from "../types";
import {
  loadLessonProgress,
  saveLessonProgress,
  loadAIMemory,
  saveAIMemory,
  LessonProgress,
  AIMemory,
  LessonQuizQuestion,
} from "../services/lessonService";
import {
  loadConceptSection,
  loadFormulasSection,
  loadExamplesSection,
  loadPracticeSection,
  loadQuizSection,
  loadChallengeSection,
  loadSummarySection,
  checkStudentAnswerSection,
} from "../services/ai/LessonSectionLoader";
import type {
  ConceptSection,
  FormulasSection,
  FormulaItem,
  ExamplesSection,
  PracticeSection,
  QuizSection,
  ChallengeSection,
  SummarySection,
  AnswerCheckResult,
} from "../services/ai/LessonPromptBuilder";
import { formatResponse, renderKatex } from "../services/ai/ResponseFormatter";
import { askProfessor } from "../services/ai/AIManager";
import { MathRenderer } from "./MathRenderer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AILessonScreenProps {
  topic: string;
  userState: UserState;
  onBack: () => void;
  onAddScore: (points: number) => void;
}

// ── Per-section state helper ──────────────────────────────────────────────────

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initSection<T>(): SectionState<T> {
  return { data: null, loading: false, error: null };
}

// ── Safe string renderer ──────────────────────────────────────────────────────

/**
 * Safely render any value as a formatted HTML string.
 * Prevents "cannot call .replace on undefined" crashes.
 */
function safeRender(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return formatResponse(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return formatResponse(value.join("\n"));
  if (typeof value === "object") return formatResponse(JSON.stringify(value, null, 2));
  return formatResponse(String(value));
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

// ── Per-section Error Banner ──────────────────────────────────────────────────

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass-panel border border-amber-500/20 bg-amber-950/5 rounded-2xl p-6 flex gap-4 items-start">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="text-sm font-bold text-white font-mono">Section Load Failed</h4>
        <p className="text-xs text-slate-400 font-sans mt-1 leading-relaxed">{message}</p>
        <button
          onClick={onRetry}
          className="cursor-pointer mt-3 border border-amber-500/40 text-amber-300 hover:text-white bg-amber-950/20 px-4 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry Section
        </button>
      </div>
    </div>
  );
}

// ── Per-section Skeleton Loader ───────────────────────────────────────────────

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="glass-panel border border-slate-800/80 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 text-center min-h-[300px]">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      <div>
        <h3 className="text-sm font-bold text-white font-mono">Generating {label}…</h3>
        <p className="text-xs text-slate-500 font-sans mt-1">
          Professor MathVerse is writing your notes
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2 mt-2">
        <div className="h-3 bg-slate-900 rounded-full animate-pulse w-3/4 mx-auto" />
        <div className="h-3 bg-slate-900 rounded-full animate-pulse w-full" />
        <div className="h-3 bg-slate-900/60 rounded-full animate-pulse w-5/6 mx-auto" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const LessonCard: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="glass-panel rounded-2xl border border-[#00FBFF]/20 overflow-hidden shadow-2xl relative mb-6">
    <div className="bg-slate-950/60 border-b border-slate-900 px-6 py-4 flex items-center gap-2">
      <Icon className="w-4 h-4 text-[#00FBFF]" />
      <span className="text-xs font-mono text-[#00FBFF] uppercase tracking-widest">{title}</span>
    </div>
    <div className="p-6 md:p-8 overflow-y-auto font-sans text-slate-300 text-left">
      {children}
    </div>
  </div>
);

export default function AILessonScreen({
  topic,
  userState,
  onBack,
  onAddScore,
}: AILessonScreenProps) {
  const currentLevelName = userState.currentLevel?.name || "Class 9-10";
  const userId = userState.id || null;

  // Active tab
  const [activeTab, setActiveTab] = useState<string>("concept");

  // Progress tracking
  const [progress, setProgress] = useState<LessonProgress>({
    topic,
    level: currentLevelName,
    completed_steps: [],
    score: 0,
    xp_earned: 0,
    completion_percentage: 0,
  });
  const [aiMemory, setAiMemory] = useState<AIMemory>({
    weak_topics: [],
    strong_topics: [],
    previous_mistakes: [],
    faq: [],
  });

  // ── Per-section states ─────────────────────────────────────────────────────

  const [conceptState, setConceptState] = useState<SectionState<ConceptSection>>(initSection());
  const [formulasState, setFormulasState] = useState<SectionState<FormulasSection>>(initSection());
  const [examplesState, setExamplesState] = useState<SectionState<ExamplesSection>>(initSection());
  const [practiceState, setPracticeState] = useState<SectionState<PracticeSection>>(initSection());
  const [quizState, setQuizState] = useState<SectionState<QuizSection>>(initSection());
  const [challengeState, setChallengeState] = useState<SectionState<ChallengeSection>>(initSection());
  const [summaryState, setSummaryState] = useState<SectionState<SummarySection>>(initSection());

  // ── Practice state ─────────────────────────────────────────────────────────

  const [studentPracticeAnswer, setStudentPracticeAnswer] = useState("");
  const [practiceAssessment, setPracticeAssessment] = useState<AnswerCheckResult | null>(null);
  const [assessingPractice, setAssessingPractice] = useState(false);
  const [practiceStatus, setPracticeStatus] = useState<"unanswered" | "checking" | "correct" | "incorrect">("unanswered");

  // ── Quiz state ─────────────────────────────────────────────────────────────

  const [quizAnswers, setQuizAnswers] = useState<{ [key: number]: string }>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // ── Challenge state ────────────────────────────────────────────────────────

  const [showChallengeHint, setShowChallengeHint] = useState(false);
  const [studentChallengeAnswer, setStudentChallengeAnswer] = useState("");
  const [challengeAssessment, setChallengeAssessment] = useState<AnswerCheckResult | null>(null);
  const [checkingChallenge, setCheckingChallenge] = useState(false);
  const [challengeCorrect, setChallengeCorrect] = useState<boolean | null>(null);

  // ── Ask AI chat ────────────────────────────────────────────────────────────

  const [showAskAI, setShowAskAI] = useState(false);
  const [aiChatInput, setAiChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Init: load progress + concept ─────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [loadedProgress, loadedMemory] = await Promise.all([
          loadLessonProgress(userId, topic, currentLevelName),
          loadAIMemory(userId),
        ]);
        if (cancelled) return;
        setProgress(loadedProgress);
        setAiMemory(loadedMemory);
      } catch {
        // Non-fatal — continue with defaults
      }

      // Load concept section
      await loadSection("concept", false);
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, showAskAI]);

  // ── Step completion ────────────────────────────────────────────────────────

  const completeStep = useCallback(
    async (stepName: string, xpReward: number) => {
      setProgress((prev) => {
        if (prev.completed_steps.includes(stepName)) return prev;
        const updatedSteps = [...prev.completed_steps, stepName];
        const percentage = Math.round((updatedSteps.length / 7) * 100);
        const newXp = prev.xp_earned + xpReward;
        const updated: LessonProgress = {
          ...prev,
          completed_steps: updatedSteps,
          xp_earned: newXp,
          completion_percentage: percentage,
        };
        // Persist async — don't block UI
        saveLessonProgress(userId, updated).catch(() => {});
        onAddScore(xpReward);
        return updated;
      });
    },
    [userId, onAddScore]
  );

  // ── Section loader ─────────────────────────────────────────────────────────

  const loadSection = useCallback(
    async (section: string, forceRefresh = false) => {
      switch (section) {
        case "concept": {
          setConceptState((s) => ({ ...s, loading: true, error: null }));
          const result = await loadConceptSection(topic, currentLevelName, forceRefresh);
          setConceptState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          if (result.data) await completeStep("concept", 10);
          break;
        }
        case "formulas": {
          setFormulasState((s) => ({ ...s, loading: true, error: null }));
          const result = await loadFormulasSection(topic, currentLevelName, forceRefresh);
          setFormulasState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          if (result.data) await completeStep("formulas", 10);
          break;
        }
        case "examples": {
          setExamplesState((s) => ({ ...s, loading: true, error: null }));
          const result = await loadExamplesSection(topic, currentLevelName, forceRefresh);
          setExamplesState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          if (result.data) await completeStep("examples", 10);
          break;
        }
        case "practice": {
          setPracticeState((s) => ({ ...s, loading: true, error: null }));
          setPracticeAssessment(null);
          setPracticeStatus("unanswered");
          setStudentPracticeAnswer("");
          const result = await loadPracticeSection(topic, currentLevelName, aiMemory.weak_topics);
          setPracticeState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          break;
        }
        case "quiz": {
          setQuizState((s) => ({ ...s, loading: true, error: null }));
          setQuizAnswers({});
          setQuizSubmitted(false);
          setQuizScore(0);
          const result = await loadQuizSection(topic, currentLevelName, forceRefresh);
          setQuizState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          break;
        }
        case "challenge": {
          setChallengeState((s) => ({ ...s, loading: true, error: null }));
          const result = await loadChallengeSection(topic, currentLevelName, forceRefresh);
          setChallengeState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          break;
        }
        case "summary": {
          setSummaryState((s) => ({ ...s, loading: true, error: null }));
          const result = await loadSummarySection(topic, currentLevelName, forceRefresh);
          setSummaryState({ data: result.data ?? null, loading: false, error: result.error ?? null });
          break;
        }
      }
    },
    [topic, currentLevelName, aiMemory.weak_topics, completeStep]
  );

  // ── Tab change ─────────────────────────────────────────────────────────────

  const handleTabChange = useCallback(
    async (tab: string) => {
      setActiveTab(tab);

      // Lazy load on first visit
      const needsLoad: Record<string, boolean> = {
        concept: !conceptState.data && !conceptState.loading,
        formulas: !formulasState.data && !formulasState.loading,
        examples: !examplesState.data && !examplesState.loading,
        practice: !practiceState.data && !practiceState.loading,
        quiz: !quizState.data && !quizState.loading,
        challenge: !challengeState.data && !challengeState.loading,
        summary: !summaryState.data && !summaryState.loading,
      };

      if (needsLoad[tab]) {
        await loadSection(tab);
      }
    },
    [
      conceptState, formulasState, examplesState, practiceState,
      quizState, challengeState, summaryState, loadSection,
    ]
  );

  // ── Practice submit ────────────────────────────────────────────────────────

  const handlePracticeSubmit = async () => {
    if (!studentPracticeAnswer.trim() || assessingPractice || !practiceState.data) return;
    setAssessingPractice(true);
    setPracticeStatus("checking");

    const result = await checkStudentAnswerSection(
      topic,
      practiceState.data.question,
      studentPracticeAnswer,
      practiceState.data.correctAnswer
    );

    if (result.error) {
      setPracticeStatus("unanswered");
      setAssessingPractice(false);
      return;
    }

    const assessment = result.data!;
    setPracticeAssessment(assessment);

    if (assessment.isCorrect) {
      setPracticeStatus("correct");
      await completeStep("practice", 20);
      const updatedStrong = Array.from(new Set([...aiMemory.strong_topics, topic]));
      const updatedMemory = { ...aiMemory, strong_topics: updatedStrong };
      setAiMemory(updatedMemory);
      saveAIMemory(userId, updatedMemory).catch(() => {});
    } else {
      setPracticeStatus("incorrect");
      const newMistake = {
        topic,
        question: practiceState.data.question,
        mistake: studentPracticeAnswer,
        correction: safeString(assessment.explanation),
        date: new Date().toISOString(),
      };
      const updatedWeak = Array.from(new Set([...aiMemory.weak_topics, topic]));
      const updatedMemory = {
        ...aiMemory,
        weak_topics: updatedWeak,
        previous_mistakes: [...aiMemory.previous_mistakes, newMistake],
      };
      setAiMemory(updatedMemory);
      saveAIMemory(userId, updatedMemory).catch(() => {});
    }

    setAssessingPractice(false);
  };

  const handleRetryPractice = async (newQuestionObj?: { question: string; correctAnswer: string; hint: string }) => {
    if (newQuestionObj) {
      setPracticeState({ data: newQuestionObj, loading: false, error: null });
      setPracticeAssessment(null);
      setPracticeStatus("unanswered");
      setStudentPracticeAnswer("");
    } else {
      await loadSection("practice", true);
    }
  };

  // ── Quiz submit ────────────────────────────────────────────────────────────

  const handleQuizSubmit = async () => {
    const questions = safeArray<LessonQuizQuestion>(quizState.data?.questions);
    let score = 0;
    questions.forEach((q) => {
      if (quizAnswers[q.id] === q.correctAnswer) score++;
    });
    setQuizScore(score);
    setQuizSubmitted(true);
    if (score >= 2) await completeStep("quiz", 30);
  };

  // ── Challenge submit ───────────────────────────────────────────────────────

  const handleChallengeSubmit = async () => {
    if (!studentChallengeAnswer.trim() || checkingChallenge || !challengeState.data) return;
    setCheckingChallenge(true);

    const result = await checkStudentAnswerSection(
      topic,
      challengeState.data.question,
      studentChallengeAnswer,
      challengeState.data.correctAnswer
    );

    if (result.data) {
      setChallengeAssessment(result.data);
      setChallengeCorrect(result.data.isCorrect);
      if (result.data.isCorrect) await completeStep("challenge", 45);
    }

    setCheckingChallenge(false);
  };

  // ── Ask Professor chat ─────────────────────────────────────────────────────

  const handleSendChatMessage = async () => {
    if (!aiChatInput.trim() || sendingChat) return;

    const userMessage = { role: "user", content: aiChatInput };
    setChatHistory((prev) => [...prev, userMessage]);
    setAiChatInput("");
    setSendingChat(true);

    try {
      const result = await askProfessor(topic, currentLevelName, chatHistory, userMessage.content);
      const raw = safeString(result.raw, "I'm unable to respond right now. Please try again.");
      setChatHistory((prev) => [...prev, { role: "assistant", content: raw }]);

      const updatedMemory = {
        ...aiMemory,
        faq: [
          ...aiMemory.faq,
          { question: userMessage.content, answer: raw, date: new Date().toISOString() },
        ],
      };
      setAiMemory(updatedMemory);
      saveAIMemory(userId, updatedMemory).catch(() => {});
    } catch {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: "My chalkboard ran out of space! Please ask again." },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  // ── Badges ─────────────────────────────────────────────────────────────────

  const earnedBadges = [
    { name: "Concept Novice", xp: 10, unlocked: progress.completed_steps.includes("concept"), icon: "📖", desc: "Started the concept module" },
    { name: "Formula Master", xp: 10, unlocked: progress.completed_steps.includes("formulas"), icon: "🧮", desc: "Reviewed mathematical derivations" },
    { name: "Curriculum Scholar", xp: 10, unlocked: progress.completed_steps.includes("examples"), icon: "✍", desc: "Studied solved problems" },
    { name: "Tutor Graduate", xp: 20, unlocked: progress.completed_steps.includes("practice"), icon: "📝", desc: "Answered the AI Professor's prompt" },
    { name: "Quiz Whiz", xp: 30, unlocked: progress.completed_steps.includes("quiz") && quizScore >= 2, icon: "🎯", desc: "Scored 2+ in MCQ quiz" },
    { name: "Challenge Conqueror", xp: 45, unlocked: progress.completed_steps.includes("challenge") && challengeCorrect === true, icon: "🏆", desc: "Solved the advanced engineering problem" },
    { name: "Lesson Complete", xp: 15, unlocked: progress.completed_steps.includes("summary"), icon: "🎓", desc: "Reviewed lesson summary" },
  ];

  // ── Tab definitions ────────────────────────────────────────────────────────

  const tabs = [
    { id: "concept",   label: "Learn Concept",     icon: BookOpen,     reward: "10 XP" },
    { id: "formulas",  label: "Formula Sheet",      icon: ClipboardList, reward: "10 XP" },
    { id: "examples",  label: "Solved Examples",    icon: Compass,      reward: "10 XP" },
    { id: "practice",  label: "Practice Problems",  icon: HelpCircle,   reward: "20 XP" },
    { id: "quiz",      label: "Topic Quiz",         icon: Award,        reward: "30 XP" },
    { id: "challenge", label: "Topic Challenge",    icon: Trophy,       reward: "45 XP" },
    { id: "summary",   label: "Lesson Summary",     icon: Sparkles,     reward: "15 XP" },
    { id: "progress",  label: "My Progress",        icon: Activity,     reward: "Tracker" },
  ];

  // ── Section loading/error helper ───────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderSection<T = any>(
    state: SectionState<T>,
    sectionId: string,
    label: string,
    renderer: (data: T) => React.ReactNode
  ): React.ReactNode {
    if (state.loading) return <SectionSkeleton label={label} />;
    if (state.error) return <SectionError message={state.error} onRetry={() => loadSection(sectionId, true)} />;
    if (!state.data) return null;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return renderer(state.data!);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen pb-16">
      <div className="ambient-glow glow-1 opacity-5" />
      <div className="ambient-glow glow-2 opacity-5" />

      {/* ── Header ── */}
      <header className="fixed top-0 w-full z-40 bg-[#0f131f]/70 backdrop-blur-xl border-b border-white/10 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="cursor-pointer p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Compass className="w-3 h-3 text-[#00FBFF]" /> AI Lesson • {currentLevelName}
            </span>
            <h1 className="text-sm md:text-base font-bold text-white tracking-wide truncate max-w-[200px] md:max-w-md">
              {topic}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-950/50 border border-cyan-500/25 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <div>
              <div className="text-[9px] font-mono text-slate-500 uppercase leading-none">XP EARNED</div>
              <div className="text-xs font-mono font-bold text-cyan-300">{progress.xp_earned} XP</div>
            </div>
          </div>
          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-950/30 border border-cyan-500/20 text-cyan-400 text-xs font-mono">
            {currentLevelName}
          </span>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-slate-950">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-700"
            style={{ width: `${progress.completion_percentage}%` }}
          />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="pt-20 px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Tab Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-2 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 h-fit sticky top-20">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-900 mb-1">
            Lesson Path
          </div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isCompleted = progress.completed_steps.includes(tab.id);
            const isActive = activeTab === tab.id;
            const hasError = tab.id === "concept" ? !!conceptState.error
              : tab.id === "formulas" ? !!formulasState.error
              : tab.id === "examples" ? !!examplesState.error
              : tab.id === "practice" ? !!practiceState.error
              : tab.id === "quiz" ? !!quizState.error
              : tab.id === "challenge" ? !!challengeState.error
              : tab.id === "summary" ? !!summaryState.error
              : false;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`cursor-pointer w-full text-left px-4 py-3 rounded-xl border font-sans text-xs font-semibold flex items-center justify-between transition-all group ${
                  isActive
                    ? "bg-cyan-500/10 border-cyan-500/50 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    : isCompleted
                    ? "bg-slate-950/50 border-slate-900 text-slate-400 hover:text-white"
                    : "bg-transparent border-transparent text-slate-500 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : isCompleted ? "text-green-500/70" : hasError ? "text-amber-500" : "text-slate-500 group-hover:text-slate-300"}`} />
                  <span>{tab.label}</span>
                </div>
                {hasError ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                ) : isCompleted ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                    {tab.reward}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Panel */}
        <div className="lg:col-span-3 flex flex-col gap-6">

          
          {/* ── TAB: Concept ── */}
          {activeTab === "concept" && renderSection(conceptState, "concept", "Concept Lecture", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Topic Title & Introduction" icon={BookOpen}>
                <h1 className="text-2xl font-bold text-white tracking-wide font-sans mb-4">{topic}</h1>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">{safeString(data.introduction)}</p>
              </LessonCard>

              <LessonCard title="Why This Topic Matters" icon={Sparkles}>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">{safeString(data.whyImportant)}</p>
              </LessonCard>

              <LessonCard title="Real-world Applications" icon={Compass}>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">{safeString(data.applications)}</p>
              </LessonCard>

              <LessonCard title="Basic Concepts" icon={BookOpen}>
                <div className="text-sm text-slate-300 leading-relaxed">
                  <MathRenderer text={safeString(data.basicConcepts)} />
                </div>
              </LessonCard>

              <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                <p className="text-xs text-slate-400">Finished reading? Let's look at the formulas.</p>
                <button
                  onClick={() => handleTabChange("formulas")}
                  className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <span>Review Formula Sheet</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          
          {/* ── TAB: Formulas ── */}
          {activeTab === "formulas" && renderSection(formulasState, "formulas", "Formula Sheet", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Basic Definitions" icon={BookOpen}>
                <div className="text-sm text-slate-300 leading-relaxed">
                  <MathRenderer text={safeString(data.definitions)} block={true} />
                </div>
              </LessonCard>

              <LessonCard title="Formulas" icon={ClipboardList}>
                <div className="flex flex-col gap-4">
                  {safeArray<FormulaItem>(data.formulas).map((item, idx) => (
                    <div key={idx} className="bg-slate-950/40 border border-slate-900 rounded-xl p-5 relative overflow-hidden">
                      <h4 className="text-sm font-bold text-white mb-2">{item.name}</h4>
                      <p className="text-xs text-slate-400 mb-4">{item.explanation}</p>
                      
                      <div className="bg-[#0f131f] border border-cyan-500/20 rounded-lg p-4 mb-4 flex justify-center">
                        <MathRenderer text={safeString(item.formula)} block={true} />
                      </div>
                      
                      <div className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                        <h5 className="text-[10px] font-mono uppercase tracking-wider text-cyan-500 mb-2">Variables</h5>
                        <div className="text-xs text-slate-400 font-mono">
                          <MathRenderer text={safeString(item.variables)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </LessonCard>

              <LessonCard title="Derivations" icon={Zap}>
                <div className="text-sm text-slate-300 leading-relaxed font-mono">
                  <MathRenderer text={safeString(data.derivations)} block={true} />
                </div>
              </LessonCard>

              <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                <p className="text-xs text-slate-400">Ready to see how these are used?</p>
                <button
                  onClick={() => handleTabChange("examples")}
                  className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <span>View Solved Examples</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          
          {/* ── TAB: Examples ── */}
          {activeTab === "examples" && renderSection(examplesState, "examples", "Solved Examples", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              
              {[
                { type: 'beginnerExample', label: 'Beginner Example', data: data.beginnerExample, color: 'text-green-400' },
                { type: 'mediumExample', label: 'Medium Example', data: data.mediumExample, color: 'text-amber-400' },
                { type: 'engineeringExample', label: 'Engineering Example', data: data.engineeringExample, color: 'text-purple-400' }
              ].map((ex, i) => (
                ex.data && (
                  <LessonCard key={i} title={ex.label + ": " + ex.data.title} icon={Compass}>
                    <div className="bg-[#0f131f] border border-slate-800 rounded-xl p-5 mb-6">
                      <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-2">Question</h4>
                      <p className="text-sm text-white font-medium">{ex.data.question}</p>
                    </div>

                    <div className="space-y-6">
                      {safeArray<any>(ex.data.steps).map((step, idx) => (
                        <div key={idx} className="relative pl-6 border-l-2 border-slate-800">
                          <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-700 border-2 border-slate-900" />
                          <h5 className={`text-xs font-bold font-mono uppercase tracking-wider ${ex.color} mb-2`}>{step.heading}</h5>
                          <p className="text-sm text-slate-300 mb-3">{step.explanation}</p>
                          {step.equation && (
                            <div className="bg-slate-950 border border-slate-900 rounded-lg p-4">
                              <MathRenderer text={step.equation} block={true} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-800">
                      <h5 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">Final Answer</h5>
                      <div className="text-lg font-bold text-white">
                        <MathRenderer text={safeString(ex.data.finalAnswer)} block={true} />
                      </div>
                    </div>
                  </LessonCard>
                )
              ))}

              <LessonCard title="Tips & Tricks" icon={Sparkles}>
                <div className="space-y-4">
                  <div className="bg-slate-950/40 border border-amber-500/20 rounded-xl p-4">
                    <h5 className="text-xs font-mono uppercase tracking-wider text-amber-400 mb-2">Common Mistakes</h5>
                    <p className="text-sm text-slate-300">{safeString(data.commonMistakes)}</p>
                  </div>
                  <div className="bg-slate-950/40 border border-purple-500/20 rounded-xl p-4">
                    <h5 className="text-xs font-mono uppercase tracking-wider text-purple-400 mb-2">Short Tricks</h5>
                    <p className="text-sm text-slate-300">{safeString(data.shortTricks)}</p>
                  </div>
                  <div className="bg-slate-950/40 border border-emerald-500/20 rounded-xl p-4">
                    <h5 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">Exam Tips</h5>
                    <p className="text-sm text-slate-300">{safeString(data.examTips)}</p>
                  </div>
                </div>
              </LessonCard>

              <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                <p className="text-xs text-slate-400">Time to try it yourself!</p>
                <button
                  onClick={() => handleTabChange("practice")}
                  className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <span>Start Practice</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          
          {/* ── TAB: Practice ── */}
          {activeTab === "practice" && renderSection(practiceState, "practice", "Practice Problems", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Practice Problem" icon={HelpCircle}>
                <div className="text-sm font-medium text-white mb-6">
                  {data.question}
                </div>

                <div className="space-y-4">
                  {practiceStatus === "incorrect" && practiceAssessment && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-red-400 mb-2 font-bold font-mono text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4" /> Needs Correction
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed font-sans">
                        <MathRenderer text={safeString(practiceAssessment.explanation)} />
                      </div>
                    </div>
                  )}

                  {practiceStatus === "correct" && practiceAssessment && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2 font-bold font-mono text-xs uppercase tracking-wider">
                        <CheckCircle className="w-4 h-4" /> Phenomenal Work
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed font-sans">
                        <MathRenderer text={safeString(practiceAssessment.explanation)} />
                      </div>
                    </div>
                  )}

                  {practiceStatus !== "correct" ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={studentPracticeAnswer}
                        onChange={(e) => setStudentPracticeAnswer(e.target.value)}
                        placeholder="Enter your final answer..."
                        className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder-slate-600 transition-all font-sans"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handlePracticeSubmit();
                        }}
                      />
                      <button
                        onClick={handlePracticeSubmit}
                        disabled={assessingPractice || !studentPracticeAnswer.trim()}
                        className="cursor-pointer bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(0,210,255,0.2)] disabled:shadow-none flex items-center justify-center font-mono uppercase tracking-wider text-xs"
                      >
                        {assessingPractice ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRetryPractice(practiceAssessment?.newExample)}
                      className="cursor-pointer w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all font-mono uppercase tracking-wider text-xs border border-slate-700"
                    >
                      Try Another Problem
                    </button>
                  )}
                </div>
              </LessonCard>

              {practiceStatus === "correct" && (
                <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                  <p className="text-xs text-slate-400">Ready for the topic quiz?</p>
                  <button
                    onClick={() => handleTabChange("quiz")}
                    className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                  >
                    <span>Start Quiz</span><ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          
          {/* ── TAB: Quiz ── */}
          {activeTab === "quiz" && renderSection(quizState, "quiz", "Topic Quiz", (data) => {
            const questions = safeArray<LessonQuizQuestion>(data.questions);
            return (
              <div className="flex flex-col gap-6 max-w-[70%]">
                <LessonCard title="Topic Quiz" icon={Award}>
                  <div className="space-y-8">
                    {questions.map((q, idx) => (
                      <div key={q.id || idx} className="bg-[#0f131f] border border-slate-800 rounded-xl p-5">
                        <div className="flex items-start gap-3 mb-4">
                          <span className="text-cyan-400 font-bold font-mono mt-0.5">Q{idx + 1}.</span>
                          <p className="text-sm text-white font-medium">{q.question}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-7">
                          {safeArray<string>(q.options).map((opt, oIdx) => {
                            const isSelected = quizAnswers[q.id] === opt;
                            const isCorrectAnswer = opt === q.correctAnswer;
                            const showResult = quizSubmitted;
                            
                            let btnClass = "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-600 hover:bg-slate-900";
                            if (showResult) {
                              if (isCorrectAnswer) btnClass = "border-emerald-500 bg-emerald-500/10 text-emerald-400";
                              else if (isSelected) btnClass = "border-red-500 bg-red-500/10 text-red-400";
                              else btnClass = "border-slate-800 bg-slate-950 opacity-50 text-slate-500";
                            } else if (isSelected) {
                              btnClass = "border-cyan-500 bg-cyan-500/10 text-cyan-400";
                            }

                            return (
                              <button
                                key={oIdx}
                                disabled={quizSubmitted}
                                onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                className={`cursor-pointer text-left p-3 rounded-lg border text-xs font-sans transition-all ${btnClass}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {quizSubmitted && (
                          <div className={`mt-4 pl-7 text-xs leading-relaxed font-sans ${quizAnswers[q.id] === q.correctAnswer ? 'text-emerald-400' : 'text-slate-400'}`}>
                            <MathRenderer text={safeString(q.explanation)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {!quizSubmitted ? (
                    <button
                      onClick={handleQuizSubmit}
                      disabled={Object.keys(quizAnswers).length < questions.length}
                      className="cursor-pointer mt-6 w-full bg-gradient-to-r from-cyan-500 to-cyan-400 hover:shadow-[0_0_15px_rgba(0,210,255,0.3)] disabled:opacity-30 disabled:shadow-none text-slate-950 font-bold py-3 rounded-xl transition-all font-mono uppercase tracking-wider text-xs"
                    >
                      Submit Quiz Responses
                    </button>
                  ) : (
                    <div className="mt-6 flex flex-col items-center justify-center p-6 bg-slate-950 border border-slate-900 rounded-xl text-center">
                      <div className="text-3xl font-bold font-mono text-white mb-2">{quizScore} / {questions.length}</div>
                      <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                        {quizScore >= 2 ? "Brilliant Score!" : "Keep Reviewing!"}
                      </div>
                    </div>
                  )}
                </LessonCard>

                {quizSubmitted && quizScore >= 2 && (
                  <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                    <p className="text-xs text-slate-400">Ready for the ultimate test?</p>
                    <button
                      onClick={() => handleTabChange("challenge")}
                      className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                    >
                      <span>Take the Challenge</span><ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          
          {/* ── TAB: Challenge ── */}
          {activeTab === "challenge" && renderSection(challengeState, "challenge", "Challenge Problem", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Engineering Challenge" icon={Trophy}>
                <div className="text-sm font-medium text-white mb-6">
                  {data.question}
                </div>

                <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 text-slate-400 mb-2 font-bold font-mono text-[10px] uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" /> Hint
                  </div>
                  <div className="text-xs text-slate-500 leading-relaxed font-sans">
                    {data.hint}
                  </div>
                </div>

                <div className="space-y-4">
                  {challengeCorrect === false && challengeAssessment && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-red-400 mb-2 font-bold font-mono text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4" /> Incorrect
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed font-sans">
                        <MathRenderer text={safeString(challengeAssessment.explanation)} />
                      </div>
                    </div>
                  )}

                  {challengeCorrect === true && challengeAssessment && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2 font-bold font-mono text-xs uppercase tracking-wider">
                        <CheckCircle className="w-4 h-4" /> Challenge Completed!
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed font-sans">
                        <MathRenderer text={safeString(challengeAssessment.explanation)} />
                      </div>
                    </div>
                  )}

                  {challengeCorrect !== true ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={studentChallengeAnswer}
                        onChange={(e) => setStudentChallengeAnswer(e.target.value)}
                        placeholder="Enter your final answer..."
                        className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none placeholder-slate-600 transition-all font-sans"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleChallengeSubmit();
                        }}
                      />
                      <button
                        onClick={handleChallengeSubmit}
                        disabled={checkingChallenge || !studentChallengeAnswer.trim()}
                        className="cursor-pointer bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(0,210,255,0.2)] disabled:shadow-none flex items-center justify-center font-mono uppercase tracking-wider text-xs"
                      >
                        {checkingChallenge ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </LessonCard>

              {challengeCorrect && (
                <div className="flex justify-between items-center p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                  <p className="text-xs text-slate-400">Lesson path complete! View your summary.</p>
                  <button
                    onClick={() => handleTabChange("summary")}
                    className="cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                  >
                    <span>View Summary</span><ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          
          {/* ── TAB: Summary ── */}
          {activeTab === "summary" && renderSection(summaryState, "summary", "Lesson Summary", (data) => (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Lesson Summary" icon={Sparkles}>
                <div className="bg-[#0f131f] border border-cyan-500/10 rounded-xl p-5 mb-6">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-3">Lesson Recap</h4>
                  <div className="text-sm text-slate-300 leading-relaxed font-sans">
                    <MathRenderer text={safeString(data.summary)} block={true} />
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 mb-6">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400 mb-3">Key Formula Cheat Sheet</h4>
                  <div className="text-xs text-cyan-300 font-mono leading-relaxed">
                    <MathRenderer text={safeString(data.keyFormulas)} block={true} />
                  </div>
                </div>

                {safeString(data.nextTopic) && (
                  <div className="bg-purple-950/10 border border-purple-500/20 rounded-xl p-5 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-purple-400 mb-1">Recommended Next Topic</h4>
                      <p className="text-sm font-bold text-white">{safeString(data.nextTopic)}</p>
                    </div>
                    <Zap className="w-6 h-6 text-purple-400 shrink-0" />
                  </div>
                )}
              </LessonCard>

              <div className="flex justify-end p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                <button onClick={() => handleTabChange("progress")} className="cursor-pointer bg-gradient-to-r from-cyan-500 to-cyan-400 hover:shadow-[0_0_15px_rgba(0,210,255,0.3)] text-slate-950 font-bold text-xs font-mono tracking-wider py-3 px-6 rounded-lg uppercase transition-all">
                  View My Progress →
                </button>
              </div>
            </div>
          ))}

          
          {/* ── TAB: Progress ── */}
          {activeTab === "progress" && (
            <div className="flex flex-col gap-6 max-w-[70%]">
              <LessonCard title="Lesson Graduation" icon={Activity}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                  {[
                    { icon: Trophy, color: "cyan", label: "Lesson Completion", value: `${progress.completion_percentage}%` },
                    { icon: Flame, color: "purple", label: "XP Earned", value: `+${progress.xp_earned} XP` },
                    { icon: Award, color: "amber", label: "Badges Unlocked", value: `${earnedBadges.filter((b) => b.unlocked).length} / ${earnedBadges.length}` },
                  ].map(({ icon: Icon, color, label, value }, idx) => (
                    <div key={idx} className="bg-[#0f131f]/40 border border-slate-900 rounded-xl p-5 flex flex-col items-center text-center justify-between">
                      <div className={`w-16 h-16 rounded-full bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center mb-3`}>
                        <Icon className={`w-8 h-8 text-${color}-400`} />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-mono uppercase leading-none">{label}</div>
                        <div className="text-2xl font-bold text-white font-mono mt-1">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Lesson Badges</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {earnedBadges.map((badge, idx) => (
                      <div key={idx} className={`p-4 border rounded-xl flex gap-3 items-center ${badge.unlocked ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-950/20 border-slate-950 text-slate-600"}`}>
                        <span className={`text-2xl ${badge.unlocked ? "" : "grayscale opacity-40"}`}>{badge.icon}</span>
                        <div>
                          <div className={`text-xs font-bold font-mono ${badge.unlocked ? "text-cyan-300" : ""}`}>{badge.name}</div>
                          <div className="text-[10px] text-slate-500 font-sans leading-relaxed mt-0.5">{badge.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </LessonCard>

              <div className="flex justify-end p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/5">
                <button onClick={onBack} className="cursor-pointer bg-gradient-to-r from-cyan-500 to-cyan-400 hover:shadow-[0_0_15px_rgba(0,210,255,0.3)] text-slate-950 font-bold text-xs font-mono tracking-wider py-3 px-6 rounded-lg uppercase transition-all">
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Floating Ask AI Button */}

      <button
        onClick={() => setShowAskAI(true)}
        className="cursor-pointer fixed bottom-6 right-6 p-4 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 text-slate-950 shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95 transition-all duration-300 z-50 flex items-center justify-center"
        title="Ask Professor MathVerse"
      >
        <MessageCircle className="w-6 h-6 text-slate-950" />
      </button>

      {/* Ask AI Drawer */}
      {showAskAI && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-[#0b0e17] border-l border-slate-900 h-full flex flex-col justify-between shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
            <div className="p-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/80">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400 animate-pulse" />
                <div>
                  <h3 className="text-xs font-bold text-white font-mono">Ask Professor MathVerse</h3>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Topic: {topic}</p>
                </div>
              </div>
              <button onClick={() => setShowAskAI(false)} className="cursor-pointer p-1.5 rounded-lg border border-slate-900 text-slate-500 hover:text-white hover:bg-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {chatHistory.length === 0 ? (
                <div className="my-auto text-center p-6 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white font-mono">Lecture Consultation</h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-sans max-w-xs mt-1">
                      Ask any question about "{topic}". Let's solve it together!
                    </p>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "self-end items-end" : "self-start items-start"}`}
                  >
                    <span className="text-[9px] font-mono text-slate-500 uppercase">
                      {msg.role === "user" ? "Student" : "Professor"}
                    </span>
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-cyan-500/15 border border-cyan-500/25 text-white rounded-br-none"
                          : "bg-slate-950 border border-slate-900 text-slate-300 rounded-bl-none font-mono"
                      }`}
                    >
                      <MathRenderer text={msg.content} />
                    </div>
                  </div>
                ))
              )}

              {sendingChat && (
                <div className="flex flex-col gap-1 max-w-[85%] self-start">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Professor</span>
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-900 text-slate-500 rounded-bl-none flex items-center gap-2 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Writing on blackboard…</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-slate-900 bg-slate-950/80 flex gap-2">
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="Ask about this concept..."
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                disabled={sendingChat}
              />
              <button
                onClick={handleSendChatMessage}
                disabled={!aiChatInput.trim() || sendingChat}
                className="cursor-pointer p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 disabled:opacity-40 text-slate-950 flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              >
                <Send className="w-4 h-4 text-slate-950" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
