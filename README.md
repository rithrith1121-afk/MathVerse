<p align="center">
  <img src="public/mathverse-logo.png" alt="MathVerse Logo" width="100" />
</p>

<h1 align="center">MathVerse</h1>

<p align="center">
  <strong>AI-Powered Engineering Mathematics Learning Platform</strong><br/>
  Solve · Learn · Practice · Master
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/KaTeX-0.17-green" />
  <img src="https://img.shields.io/badge/Groq_AI-Llama_3.3-orange" />
  <img src="https://img.shields.io/badge/Netlify-Deployed-00C7B7?logo=netlify&logoColor=white" />
</p>

---

## 📖 Overview

**MathVerse** is a full-featured AI-powered mathematics learning platform designed for engineering students. It delivers step-by-step solutions to any mathematical problem using Groq's LLaMA 3 models, complete with professor-style explanations, KaTeX-rendered formulas, and an interactive learning curriculum.

Whether you type a problem, upload a photo of a question, or capture one on camera — MathVerse reads, understands, and teaches the solution from first principles.

---

## ✨ Features

### 🔢 AI Math Solver
- **Text & Image Input** — Type any math problem or upload/capture a photo of a handwritten or printed question
- **Image Crop Tool** — Precisely crop the mathematical region before submission for accurate OCR
- **Groq AI Engine** — Powered by LLaMA 3.3 70B with automatic model fallback chain
- **Streaming Responses** — Live token-by-token answer streaming with real-time rendering
- **Professor-Style Explanations** — Step-by-step solutions with "What are we given / finding / doing?" structure
- **KaTeX Math Rendering** — Beautiful LaTeX-quality formulas: matrices, integrals, fractions, eigenvectors, and more

### 📚 AI Learning Curriculum
- Structured lessons organized by engineering mathematics topics
- Interactive AI-powered lesson delivery with real-time Q&A
- Progress tracking persisted locally across sessions

### 📝 Practice System
- Topic-specific practice problems with difficulty calibration
- AI-verified answer checking with detailed feedback
- Streak tracking and scoring system

### 📄 Answer Key PDF Export
- One-click **Download Answer Key as PDF**
- Professional A4 layout with compact typography
- Complete mathematical content — zero clipping, zero missing symbols
- KaTeX fonts bundled locally for consistent rendering across devices
- Intelligent A4 pagination with orphan prevention

### 📊 Analytics Dashboard
- Learning progress visualization with charts
- Solved problem history and accuracy metrics
- Study streak tracking

### 📅 Study Planner
- AI-generated personalized study plans
- Topic scheduling with priority management

### 🎓 Level Calibration
- Supports multiple engineering mathematics calibration levels:
  - Engineering Mathematics
  - Advanced Engineering Mathematics
  - And more

### 👤 Profile & Onboarding
- Guided onboarding with level selection
- Avatar customization
- Local-first data persistence (no mandatory account required)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript 5.8 |
| **Build** | Vite 6.4 + esbuild |
| **Styling** | Tailwind CSS 4.1 |
| **Math Rendering** | KaTeX 0.17 |
| **AI Backend** | Groq API (LLaMA 3.3 70B + Vision models) |
| **PDF Export** | jsPDF 4 + html2canvas + KaTeX DOM |
| **Storage** | localStorage / LocalForage (offline-first) |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Animation** | Motion (Framer Motion) |
| **Image Crop** | Custom canvas-based cropper |
| **Deployment** | Netlify |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and **npm** 9+
- A **[Groq API key](https://console.groq.com)** (free tier available)

### 1. Clone the Repository

```bash
git clone https://github.com/rithrith1121-afk/MathVerse.git
cd MathVerse
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example env file and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required — Your Groq API key
VITE_GROQ_API_KEY="gsk_your_key_here"
GROQ_API_KEY="gsk_your_key_here"

# Storage mode (keep as 'local' for offline-first)
VITE_STORAGE_MODE=local

# App URL
APP_URL="http://localhost:3000"
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Building for Production

```bash
npm run build
```

The production-ready static site will be output to the `dist/` directory.

---

## ☁️ Deploying to Netlify

### Option A — Deploy via Netlify UI (Recommended)

1. Push your code to GitHub (already done).
2. Go to [netlify.com](https://netlify.com) → **New site from Git**.
3. Connect your GitHub repository: `rithrith1121-afk/MathVerse`.
4. Build settings are auto-detected from `netlify.toml`:
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`
5. Set environment variables in **Site Settings → Environment Variables**:
   - `VITE_GROQ_API_KEY` → your Groq key
   - `VITE_STORAGE_MODE` → `local`
6. Click **Deploy site**.

### Option B — Deploy via Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

> **Important:** Always set `VITE_GROQ_API_KEY` as an environment variable in your Netlify dashboard — never commit your API key to the repository.

---

## 📁 Project Structure

```
MathVerse/
├── public/
│   └── mathverse-logo.png
├── src/
│   ├── components/
│   │   ├── AISolverScreen.tsx      # Main AI Math Solver UI
│   │   ├── AILessonScreen.tsx      # Interactive lesson delivery
│   │   ├── DashboardScreen.tsx     # Home dashboard
│   │   ├── PracticeScreen.tsx      # Practice problems
│   │   ├── ProfileScreen.tsx       # User profile & settings
│   │   ├── AnalyticsDashboard.tsx  # Progress charts
│   │   ├── StudyPlannerScreen.tsx  # AI study planner
│   │   ├── ImageCropper.tsx        # Canvas-based image cropper
│   │   ├── CameraCapture.tsx       # Camera input handler
│   │   ├── MathRenderer.tsx        # KaTeX math rendering engine
│   │   ├── AuthScreen.tsx          # Authentication UI
│   │   ├── OnboardingScreen.tsx    # First-run onboarding
│   │   └── LevelSelectionScreen.tsx
│   ├── services/
│   │   ├── ai/
│   │   │   ├── AIManager.ts        # Central AI coordinator & fallback chain
│   │   │   ├── GroqProvider.ts     # Groq API client
│   │   │   ├── ImageSolver.ts      # Vision model for image problems
│   │   │   ├── ResponseFormatter.ts # Answer formatting & KaTeX injection
│   │   │   ├── PromptBuilder.ts    # Structured prompt engineering
│   │   │   ├── RetryManager.ts     # Exponential backoff retry logic
│   │   │   ├── ErrorHandler.ts     # Error classification
│   │   │   └── models.config.ts    # Model chain configuration
│   │   ├── pdfService.ts           # Answer Key PDF generation engine
│   │   ├── aiService.ts            # Legacy AI service façade
│   │   ├── lessonService.ts        # Lesson progress management
│   │   ├── analyticsService.ts     # Learning analytics
│   │   ├── ocrService.ts           # Image OCR pre-processing
│   │   └── profileService.ts       # User profile persistence
│   ├── lib/
│   │   └── supabase.ts             # Supabase client (optional)
│   ├── App.tsx                     # Root app + routing state machine
│   ├── main.tsx                    # App entry point
│   ├── types.ts                    # Shared TypeScript types
│   └── index.css                   # Global styles
├── netlify.toml                    # Netlify deployment configuration
├── vite.config.ts                  # Vite build configuration
├── tsconfig.json                   # TypeScript configuration
├── .env.example                    # Environment variable template
└── package.json
```

---

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server on port 3000 |
| `npm run build` | Build optimized production bundle to `dist/` |
| `npm run lint` | Run TypeScript type checking |
| `npm run clean` | Remove the `dist/` directory |

---

## 🧮 AI Model Architecture

MathVerse uses a **resilient multi-model fallback chain** via the Groq API:

```
User Input (Text / Image)
         │
         ▼
   AIManager.ts
         │
    ┌────┴────┐
    │  Text   │  → Primary Model (LLaMA 3.3 70B)
    │         │  → Fallback Model (LLaMA 3.1 70B)
    │         │  → Fallback 2 (LLaMA 3.1 8B)
    └────┬────┘
    ┌────┴────┐
    │  Image  │  → Vision Model (LLaMA 3.2 90B Vision)
    │         │  → Vision Fallback (LLaMA 3.2 11B Vision)
    └─────────┘
         │
         ▼
  ResponseFormatter.ts
         │
         ▼
   KaTeX Rendering
         │
         ▼
   MathRenderer.tsx
```

---

## 📄 PDF Export Engine

The Answer Key PDF export system is a **DOM-Native, Content-First** rendering pipeline:

1. **Text Normalization** — Cleans and normalizes LaTeX delimiters, matrices, and math commands
2. **Block Tokenization** — Parses the solution into indivisible logical blocks (display math, bullets, paragraphs, callouts)
3. **Native KaTeX Rendering** — Each math block is rendered directly via `katex.render()` into DOM nodes — no string slicing that could sever formulas
4. **A4 Pagination** — Intelligent content-aware page breaks with orphan prevention
5. **Font Bundling** — All KaTeX fonts are bundled locally to prevent CORS canvas clipping issues
6. **html2canvas → jsPDF** — High-resolution 2x canvas capture assembled into A4 PDF

---

## 🌐 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GROQ_API_KEY` | ✅ Yes | Groq API key for AI model access |
| `GROQ_API_KEY` | ✅ Yes | Server-side Groq key (for server.ts) |
| `VITE_STORAGE_MODE` | Optional | `local` (default) uses localStorage only |
| `APP_URL` | Optional | Base URL of the app (default: `http://localhost:3000`) |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature-name`
5. Open a Pull Request

---

## 📜 License

This project is private. All rights reserved.

---

<p align="center">
  Built with ❤️ for engineering students everywhere.
</p>
