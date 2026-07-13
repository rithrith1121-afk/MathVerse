-- Database setup for MathVerse Phase 4: Lesson Progress and AI Memory System

-- 1. Create lesson_progress table to track user completion steps, xp, score
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    topic TEXT NOT NULL,
    level TEXT NOT NULL,
    completed_steps TEXT[] DEFAULT '{}', -- e.g. ['concept', 'formulas', 'examples', 'practice', 'quiz', 'challenge']
    score INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    completion_percentage INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, topic, level)
);

-- Enable RLS on lesson_progress
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lesson_progress
CREATE POLICY "Allow users to view their own lesson progress" 
ON public.lesson_progress FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to manage their own lesson progress" 
ON public.lesson_progress FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- 2. Create ai_memory table to save user specific weak/strong topics, previous mistakes, etc.
CREATE TABLE IF NOT EXISTS public.ai_memory (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    weak_topics TEXT[] DEFAULT '{}',
    strong_topics TEXT[] DEFAULT '{}',
    previous_mistakes JSONB DEFAULT '[]'::jsonb, -- Array of objects: { topic, question, mistake, correction, date }
    faq JSONB DEFAULT '[]'::jsonb,              -- Frequently asked questions
    next_recommended_topic TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on ai_memory
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ai_memory
CREATE POLICY "Allow users to view their own AI memory" 
ON public.ai_memory FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to manage their own AI memory" 
ON public.ai_memory FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
