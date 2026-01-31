-- Misconception Mentor Database Schema
-- Run this in Supabase SQL Editor to set up all tables

-- 1) Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  grade_band TEXT DEFAULT '6-8',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- 2) Attempts table
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  explanation_text TEXT,
  is_correct BOOLEAN NOT NULL,
  top_misconceptions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS attempts_user_id_idx ON attempts(user_id);
CREATE INDEX IF NOT EXISTS attempts_topic_idx ON attempts(topic);
CREATE INDEX IF NOT EXISTS attempts_created_at_idx ON attempts(created_at DESC);

-- Enable RLS
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

-- Users can read their own attempts
CREATE POLICY "Users can read own attempts" ON attempts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own attempts
CREATE POLICY "Users can insert own attempts" ON attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3) Mastery table
CREATE TABLE IF NOT EXISTS mastery (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  accuracy REAL DEFAULT 0,
  last_practiced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, topic)
);

-- Enable RLS
ALTER TABLE mastery ENABLE ROW LEVEL SECURITY;

-- Users can read their own mastery
CREATE POLICY "Users can read own mastery" ON mastery
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own mastery
CREATE POLICY "Users can insert own mastery" ON mastery
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own mastery
CREATE POLICY "Users can update own mastery" ON mastery
  FOR UPDATE USING (auth.uid() = user_id);

-- 4) Misconception stats table
CREATE TABLE IF NOT EXISTS misconception_stats (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  misconception_id TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, misconception_id)
);

-- Enable RLS
ALTER TABLE misconception_stats ENABLE ROW LEVEL SECURITY;

-- Users can read their own stats
CREATE POLICY "Users can read own misconception_stats" ON misconception_stats
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own stats
CREATE POLICY "Users can insert own misconception_stats" ON misconception_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own stats
CREATE POLICY "Users can update own misconception_stats" ON misconception_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, grade_band)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), '6-8');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
