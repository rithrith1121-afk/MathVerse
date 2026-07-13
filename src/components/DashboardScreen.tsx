import React from "react";
import { Sparkles, BrainCircuit, Award, RotateCcw, Flame, ArrowRight, Compass, ShieldAlert, User, BarChart2 } from "lucide-react";
import AvatarDropdown from "./AvatarDropdown";
import { supabase } from "../lib/supabase";
import { MathLevel, UserState } from "../types";

interface DashboardScreenProps {
  userState: UserState;
  onSolveRedirect: () => void;
  onPracticeRedirect: (selectedTopic?: string) => void;
  onLessonRedirect: (topic: string) => void;
  onProfileRedirect: () => void;
  onChangeLevelRedirect: () => void;
  onDiagnosticsRedirect: () => void;
  onLogOut: () => void;
  onAvatarChange?: (url: string) => void;
}

import { loadLessonProgress, LessonProgress } from "../services/lessonService";

export default function DashboardScreen({
  userState,
  onSolveRedirect,
  onPracticeRedirect,
  onLessonRedirect,
  onProfileRedirect,
  onChangeLevelRedirect,
  onDiagnosticsRedirect,
  onLogOut,
  onAvatarChange,
}: DashboardScreenProps) {
  const currentLevel: MathLevel = userState.currentLevel!;
  const [userId, setUserId] = React.useState<string>('');
  const [progresses, setProgresses] = React.useState<{[topic: string]: LessonProgress}>({});

  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const uId = user ? user.id : null;
      if (user) setUserId(user.id);
      
      const loaded: {[topic: string]: LessonProgress} = {};
      for (const t of currentLevel.topics) {
        try {
          const prog = await loadLessonProgress(uId, t, currentLevel.name);
          loaded[t] = prog;
        } catch (_) {}
      }
      setProgresses(loaded);
    });
  }, [currentLevel]);

  const lastActiveLesson = React.useMemo(() => {
    const list = Object.values(progresses) as LessonProgress[];
    if (list.length === 0) return null;
    const inProgress = list.filter(p => p.completion_percentage > 0 && p.completion_percentage < 100);
    if (inProgress.length > 0) {
      return inProgress[0];
    }
    const anyStarted = list.filter(p => p.completion_percentage > 0);
    if (anyStarted.length > 0) {
      return anyStarted[0];
    }
    return null;
  }, [progresses]);


  return (
    <div className="relative min-h-screen">
      <div className="ambient-glow glow-1 opacity-10"></div>
      <div className="ambient-glow glow-2 opacity-10"></div>

      {/* Main Header bar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-6 md:px-16 h-16 bg-[#0f131f]/60 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(0,210,255,0.05)]">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-cyan-400 w-5 h-5" />
          <span className="font-sans font-bold text-lg bg-gradient-to-r from-cyan-400 to-[#00FBFF] bg-clip-text text-transparent">
            MathVerse
          </span>
        </div>

        {/* User Account Controls */}
        <div className="flex items-center gap-4">
          <AvatarDropdown
            userId={userId}
            email={userState.email}
            avatarUrl={userState.avatar_url}
            onLogout={onLogOut}
            onViewProfile={onProfileRedirect}
            onAvatarChange={onAvatarChange}
          />
        </div>
      </header>

      {/* Main dashboard grid layout */}
      <main className="container mx-auto px-6 md:px-16 pt-24 max-w-7xl pb-16">
        
        {/* Futuristic Grid Hero Widget */}
        <div className="glass-card rounded-2xl p-6 md:p-8 border border-[#00FBFF]/20 overflow-hidden mb-8 shadow-[0_0_30px_rgba(0,210,255,0.1)]">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-2">
                <Sparkles className="w-4 h-4 animate-spin-slow" /> Core Educational Orbit
              </div>
              <h2 className="text-2xl md:text-3xl font-bold font-sans text-white mb-2">
                Category: {currentLevel.name}
              </h2>
              <p className="text-slate-400 font-sans text-sm max-w-xl">
                Currently calibrated in <span className="text-cyan-300 font-semibold">{currentLevel.badge}</span> level. {currentLevel.description}. Reach absolute master calibration index.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onDiagnosticsRedirect}
                className="flex items-center gap-1.5 text-xs font-mono py-2 px-4 rounded-xl cursor-pointer border border-slate-800 hover:border-cyan-500 hover:bg-cyan-500/5 transition-all text-slate-400 hover:text-cyan-400"
              >
                <BarChart2 className="w-3.5 h-3.5 text-[#00FBFF]" /> Analytics Deck
              </button>
              <button
                onClick={onChangeLevelRedirect}
                className="flex items-center gap-1.5 text-xs font-mono py-2 px-4 rounded-xl cursor-pointer border border-slate-800 hover:border-cyan-500 hover:bg-cyan-500/5 transition-all text-slate-400 hover:text-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Shift Orbit
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 border-t border-slate-800/60 pt-6">
            <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 flex items-center gap-4">
              <Award className="text-[#00FBFF] w-8 h-8" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Learning Score</div>
                <div className="text-lg font-bold text-white">{userState.score} XP</div>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 flex items-center gap-4">
              <BrainCircuit className="text-purple-400 w-8 h-8" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Solved via AI</div>
                <div className="text-lg font-bold text-white">{userState.solvedProblems} Solutions</div>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-[#00FBFF]/10 rounded-xl p-4 flex items-center gap-4">
              <Flame className="text-amber-500 w-8 h-8 animate-pulse" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Quantum Streak</div>
                <div className="text-lg font-bold text-white">4 Calibration Days</div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Pathways */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Main Topic Checklist Area */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800/80">
            <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" /> AI Learning Curriculum
            </h3>
            
            {lastActiveLesson && (
              <div className="mb-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/10 flex items-center justify-between animate-pulse">
                <div>
                  <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider">Active Curriculum Path</div>
                  <div className="text-xs font-bold text-white mt-0.5">Continue Learning: {lastActiveLesson.topic}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lesson Completion: {lastActiveLesson.completion_percentage}%</div>
                </div>
                <button
                  onClick={() => onLessonRedirect(lastActiveLesson.topic)}
                  className="cursor-pointer bg-gradient-to-r from-cyan-500 to-cyan-400 hover:shadow-[0_0_10px_rgba(0,210,255,0.3)] text-slate-950 text-[10px] font-mono font-bold py-1.5 px-3.5 rounded-lg uppercase"
                >
                  Continue
                </button>
              </div>
            )}

            <div className="space-y-3">
              {currentLevel.topics.map((topic, idx) => {
                const topicProgress = progresses[topic];
                const pct = topicProgress?.completion_percentage || 0;
                const completedSteps = topicProgress?.completed_steps || [];

                return (
                  <div
                    key={idx}
                    onClick={() => onLessonRedirect(topic)}
                    className="group flex flex-col gap-2.5 p-4 bg-slate-950/60 hover:bg-[#00d2ff]/5 border border-slate-900 hover:border-[#00d2ff]/35 rounded-xl cursor-pointer transition-all duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-600 group-hover:text-[#00d2ff] transition-colors">
                          {(idx + 1).toString().padStart(2, "0")}
                        </span>
                        <span className="text-sm font-bold text-[#dfe2f3] group-hover:text-white transition-colors">
                          {topic}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Unlocked Step badges */}
                        <div className="flex gap-1 text-xs mr-2">
                          {completedSteps.includes("concept") && <span title="Concept Read">📖</span>}
                          {completedSteps.includes("formulas") && <span title="Formulas Studied">🧮</span>}
                          {completedSteps.includes("examples") && <span title="Examples Reviewed">✍</span>}
                          {completedSteps.includes("practice") && <span title="Practice Answered">📝</span>}
                          {completedSteps.includes("quiz") && <span title="Quiz Passed">🎯</span>}
                          {completedSteps.includes("challenge") && <span title="Challenge Overcome">🏆</span>}
                        </div>
                        
                        <button className="flex items-center gap-1 text-[10px] font-mono text-slate-500 group-hover:text-[#00d2ff] group-hover:translate-x-1 transition-all">
                          <span>Start AI Lesson</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {pct > 0 && (
                      <div className="w-full flex items-center gap-3 pt-1">
                        <div className="flex-1 h-1 bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500">{pct}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Action Interactive Cards */}
          <div className="flex flex-col gap-6">
            
            {/* AI Solver Pathway */}
            <div className="glass-card rounded-2xl p-6 border border-cyan-500/20 bg-slate-950/10 flex-1 hover:border-cyan-400 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-400 text-[10px] font-mono tracking-wider uppercase mb-4">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Active AI Solver Tool
                </div>
                <h4 className="text-lg font-bold text-white font-sans mb-2">
                  MathVerse AI Search Solver
                </h4>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  Type or paste any complex formula, calculus equation, geometry proof, or algebra riddle. Groq will generate a pedagogical, customized step-by-step resolution orbit.
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={onSolveRedirect}
                  className="cursor-pointer bg-gradient-to-r from-cyan-500 to-cyan-300 hover:shadow-[0_0_15px_rgba(0,210,255,0.4)] text-[#0a0e1a] font-bold text-xs font-mono tracking-wider py-2.5 px-6 rounded-lg uppercase flex items-center gap-1.5 group transition-all"
                >
                  <span>Solve Math Engine</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>



          </div>

        </div>

        {/* Security / Connection Footer details */}
        <div className="mt-8 p-4 rounded-xl border border-slate-900 bg-slate-950/20 text-slate-500 flex items-center gap-2 text-xs font-mono justify-center">
          <ShieldAlert className="w-4 h-4 text-cyan-500" />
          <span>Active local database sandbox. Future sync modules are live.</span>
        </div>

      </main>
    </div>
  );
}
