// Delight Mode: Sound effects and celebration utilities
// Uses Web Audio API for synth sounds (no external audio files)

// ============================================
// Settings persistence
// ============================================

export type AvatarSize = "small" | "medium" | "large" | "xl";
export type AvatarStyle = "teacher" | "owl";

export interface DelightSettings {
  soundEnabled: boolean;
  celebrationsEnabled: boolean;
  focusModeEnabled: boolean;
  // Voice narration (ElevenLabs TTS)
  voiceEnabled: boolean;
  autoReadFeedback: boolean;
  showReadAloudButtons: boolean;
  // Teacher Avatar
  avatarEnabled: boolean;
  avatarStyle: AvatarStyle;
  avatarSize: AvatarSize;
  avatarSpeaks: boolean;
  focusNudgesEnabled: boolean;
  // Encouragement
  encouragementEnabled: boolean;
}

const SETTINGS_KEY = "misconception_mentor_delight";
const CELEBRATION_KEY = "misconception_mentor_last_celebration";

// Check if user prefers reduced motion
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Load settings from localStorage
export function loadDelightSettings(): DelightSettings {
  const defaults: DelightSettings = {
    soundEnabled: true,
    celebrationsEnabled: true,
    focusModeEnabled: false,
    voiceEnabled: false,
    autoReadFeedback: false,
    showReadAloudButtons: true,
    avatarEnabled: true,
    avatarStyle: "teacher",
    avatarSize: "large", // Default to large for better visibility
    avatarSpeaks: false,
    focusNudgesEnabled: true,
    encouragementEnabled: true, // Default ON for encouraging experience
  };
  
  if (typeof window === "undefined") {
    return defaults;
  }
  
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate avatarSize and avatarStyle
      const validSizes: AvatarSize[] = ["small", "medium", "large", "xl"];
      const validStyles: AvatarStyle[] = ["teacher", "owl"];
      const avatarSize = validSizes.includes(parsed.avatarSize) ? parsed.avatarSize : defaults.avatarSize;
      const avatarStyle = validStyles.includes(parsed.avatarStyle) ? parsed.avatarStyle : defaults.avatarStyle;
      
      return {
        soundEnabled: parsed.soundEnabled ?? defaults.soundEnabled,
        celebrationsEnabled: parsed.celebrationsEnabled ?? !prefersReducedMotion(),
        focusModeEnabled: parsed.focusModeEnabled ?? defaults.focusModeEnabled,
        voiceEnabled: parsed.voiceEnabled ?? defaults.voiceEnabled,
        autoReadFeedback: parsed.autoReadFeedback ?? defaults.autoReadFeedback,
        showReadAloudButtons: parsed.showReadAloudButtons ?? defaults.showReadAloudButtons,
        avatarEnabled: parsed.avatarEnabled ?? defaults.avatarEnabled,
        avatarStyle,
        avatarSize,
        avatarSpeaks: parsed.avatarSpeaks ?? defaults.avatarSpeaks,
        focusNudgesEnabled: parsed.focusNudgesEnabled ?? defaults.focusNudgesEnabled,
        encouragementEnabled: parsed.encouragementEnabled ?? defaults.encouragementEnabled,
      };
    }
  } catch (e) {
    console.warn("[Delight] Failed to load settings:", e);
  }
  
  // Default: celebrations off if prefers-reduced-motion, voice features off by default
  return {
    ...defaults,
    celebrationsEnabled: !prefersReducedMotion(),
  };
}

// Save settings to localStorage
export function saveDelightSettings(settings: DelightSettings): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[Delight] Failed to save settings:", e);
  }
}

// ============================================
// Avatar Home Position (persisted)
// ============================================

const AVATAR_POSITION_KEY = "mm_avatar_home_pos";

export interface AvatarHomePosition {
  xPct: number;  // 0-100 percentage from left
  yPct: number;  // 0-100 percentage from bottom
}

// Default home position (bottom-right corner)
export const DEFAULT_AVATAR_HOME: AvatarHomePosition = {
  xPct: 95,  // 95% from left = right side
  yPct: 5,   // 5% from bottom = near bottom
};

// Load avatar home position from localStorage
export function loadAvatarHomePosition(): AvatarHomePosition {
  if (typeof window === "undefined") return DEFAULT_AVATAR_HOME;
  
  try {
    const stored = localStorage.getItem(AVATAR_POSITION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate and clamp values
      const xPct = typeof parsed.xPct === "number" 
        ? Math.max(5, Math.min(95, parsed.xPct)) 
        : DEFAULT_AVATAR_HOME.xPct;
      const yPct = typeof parsed.yPct === "number" 
        ? Math.max(5, Math.min(95, parsed.yPct)) 
        : DEFAULT_AVATAR_HOME.yPct;
      return { xPct, yPct };
    }
  } catch (e) {
    console.warn("[Delight] Failed to load avatar position:", e);
  }
  
  return DEFAULT_AVATAR_HOME;
}

// Save avatar home position to localStorage
export function saveAvatarHomePosition(position: AvatarHomePosition): void {
  if (typeof window === "undefined") return;
  
  try {
    // Clamp values before saving
    const clamped: AvatarHomePosition = {
      xPct: Math.max(5, Math.min(95, position.xPct)),
      yPct: Math.max(5, Math.min(95, position.yPct)),
    };
    localStorage.setItem(AVATAR_POSITION_KEY, JSON.stringify(clamped));
  } catch (e) {
    console.warn("[Delight] Failed to save avatar position:", e);
  }
}

// Clear avatar home position (reset to default)
export function resetAvatarHomePosition(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(AVATAR_POSITION_KEY);
  } catch (e) {
    console.warn("[Delight] Failed to reset avatar position:", e);
  }
}

// Convert percentage position to pixel position
export function avatarPctToPixels(
  position: AvatarHomePosition,
  viewportWidth: number,
  viewportHeight: number,
  avatarWidth: number,
  avatarHeight: number
): { x: number; y: number } {
  // xPct is percentage from left edge
  // yPct is percentage from bottom edge
  const x = (position.xPct / 100) * viewportWidth - avatarWidth / 2;
  const y = (position.yPct / 100) * viewportHeight;
  
  // Clamp to keep avatar on screen
  const clampedX = Math.max(0, Math.min(viewportWidth - avatarWidth, x));
  const clampedY = Math.max(20, Math.min(viewportHeight - avatarHeight - 20, y));
  
  return { x: clampedX, y: clampedY };
}

// Convert pixel position to percentage position
export function avatarPixelsToPct(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  avatarWidth: number,
  avatarHeight: number
): AvatarHomePosition {
  // Convert from left edge position to center percentage
  const centerX = x + avatarWidth / 2;
  const xPct = (centerX / viewportWidth) * 100;
  
  // y is from bottom, so just convert directly
  const yPct = (y / viewportHeight) * 100;
  
  return {
    xPct: Math.max(5, Math.min(95, xPct)),
    yPct: Math.max(5, Math.min(95, yPct)),
  };
}

// ============================================
// Celebration milestone tracking
// ============================================

interface CelebrationRecord {
  key: string;
  timestamp: number;
}

// Check if we should celebrate a milestone (only once per day per milestone)
export function shouldCelebrateMilestone(milestoneKey: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const stored = localStorage.getItem(CELEBRATION_KEY);
    if (stored) {
      const records: CelebrationRecord[] = JSON.parse(stored);
      const existing = records.find(r => r.key === milestoneKey);
      if (existing) {
        // Already celebrated today?
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (existing.timestamp > oneDayAgo) {
          return false; // Already celebrated within 24h
        }
      }
    }
  } catch (e) {
    console.warn("[Delight] Failed to check milestone:", e);
  }
  
  return true;
}

// Mark a milestone as celebrated
export function markMilestoneCelebrated(milestoneKey: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const stored = localStorage.getItem(CELEBRATION_KEY);
    let records: CelebrationRecord[] = stored ? JSON.parse(stored) : [];
    
    // Remove old record if exists
    records = records.filter(r => r.key !== milestoneKey);
    
    // Add new record
    records.push({ key: milestoneKey, timestamp: Date.now() });
    
    // Keep only recent records (last 50)
    if (records.length > 50) {
      records = records.slice(-50);
    }
    
    localStorage.setItem(CELEBRATION_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn("[Delight] Failed to mark milestone:", e);
  }
}

// ============================================
// Web Audio API Sound Effects (Synth sounds)
// ============================================

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("[Delight] Web Audio API not supported:", e);
      return null;
    }
  }
  
  // Resume context if suspended (required for user interaction policy)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  
  return audioContext;
}

// Play a success sound: bright, happy burst (major arpeggio)
export function playSuccessSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  // Quick major arpeggio: C5, E5, G5
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0, now + i * 0.08);
    gain.gain.linearRampToValueAtTime(0.3, now + i * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.2);
  });
}

// Play a fail sound: descending "wah-wah" deflating tone
export function playFailSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
  
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.5);
}

// Play a perfect sound: celebratory ascending arpeggio with sparkle
export function playPerfectSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  // Longer celebratory arpeggio: C5, E5, G5, C6, E6
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.1;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  });
  
  // Add a shimmer/sparkle effect
  setTimeout(() => {
    const ctx2 = getAudioContext();
    if (!ctx2) return;
    
    for (let i = 0; i < 3; i++) {
      const osc = ctx2.createOscillator();
      const gain = ctx2.createGain();
      
      osc.type = "sine";
      osc.frequency.value = 2000 + Math.random() * 1000;
      
      const t = ctx2.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx2.destination);
      
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }, 400);
}

// ============================================
// Confetti (using canvas-confetti if available)
// ============================================

let confettiModule: any = null;

// Dynamically load canvas-confetti
async function loadConfetti() {
  if (confettiModule) return confettiModule;
  
  try {
    confettiModule = (await import("canvas-confetti")).default;
    return confettiModule;
  } catch (e) {
    console.warn("[Delight] canvas-confetti not available:", e);
    return null;
  }
}

// Fire confetti celebration
export async function fireConfetti(): Promise<void> {
  const confetti = await loadConfetti();
  if (!confetti) return;
  
  // Fire from both sides
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: any) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 0.2, y: 0.7 },
  });
  
  fire(0.2, {
    spread: 60,
    origin: { x: 0.5, y: 0.7 },
  });
  
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    origin: { x: 0.5, y: 0.7 },
  });
  
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    origin: { x: 0.8, y: 0.7 },
  });
}

// ============================================
// Encouragement micro-copy
// ============================================

const CORRECT_PHRASES = [
  "Nice! 🎯",
  "You got it! ✨",
  "Great work! 💪",
  "Excellent! 🌟",
  "Perfect! 👏",
  "Awesome! 🚀",
  "Well done! ⭐",
  "Nailed it! 🎉",
];

const INCORRECT_PHRASES = [
  "Good try! Keep going. 💪",
  "Almost! Let's learn from this. 📚",
  "Not quite, but you're learning! 🌱",
  "Keep practicing! 💫",
  "Learning moment! 🧠",
];

const PERFECT_PHRASES = [
  "100%! Amazing work! 🏆",
  "Perfect score! You're a star! ⭐",
  "Incredible! 100% accuracy! 🎉",
  "Flawless! You crushed it! 💪",
];

export function getRandomPhrase(type: "correct" | "incorrect" | "perfect"): string {
  const phrases = type === "correct" 
    ? CORRECT_PHRASES 
    : type === "incorrect" 
      ? INCORRECT_PHRASES 
      : PERFECT_PHRASES;
  
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================
// Speed bonus sound (for fast correct answers in Focus Mode)
// ============================================

export function playSpeedBonusSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  // Quick ascending bling with shimmer
  const notes = [880, 1100, 1320, 1760]; // A5, C#6, E6, A6
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.05;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.2);
  });
}

// Play heel footstep clicks (for avatar walking)
// Returns a function to stop the footsteps
export function playHeelFootsteps(stepCount: number = 4, intervalMs: number = 200): () => void {
  const ctx = getAudioContext();
  if (!ctx) return () => {};
  
  const now = ctx.currentTime;
  const oscillators: OscillatorNode[] = [];
  
  for (let i = 0; i < stepCount; i++) {
    const stepTime = now + (i * intervalMs) / 1000;
    
    // Create a sharp click sound (heel on hard floor)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    // Use noise-like tone for click
    osc.type = "square";
    osc.frequency.value = 800 + (i % 2) * 100; // Alternate slightly for left/right foot
    
    filter.type = "highpass";
    filter.frequency.value = 600;
    
    // Very short attack and decay for click
    gain.gain.setValueAtTime(0, stepTime);
    gain.gain.linearRampToValueAtTime(0.15, stepTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.05);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(stepTime);
    osc.stop(stepTime + 0.06);
    oscillators.push(osc);
  }
  
  // Return stop function
  return () => {
    oscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {
        // Already stopped
      }
    });
  };
}

// ============================================
// Focus Mode: Target Times & Efficiency Scoring
// ============================================

// Target times in seconds per topic (baseline for "good" performance)
export const FOCUS_TARGET_TIMES: Record<string, number> = {
  fractions: 35,
  negatives: 25,
  "linear-equations": 40,
  "mixed-review": 35,
};

// Efficiency labels based on rating
export const EFFICIENCY_LABELS: { min: number; label: string; emoji: string }[] = [
  { min: 90, label: "Competition Ready", emoji: "🏆" },
  { min: 70, label: "Fast & Accurate", emoji: "⚡" },
  { min: 40, label: "Focused Learner", emoji: "📚" },
  { min: 0, label: "Getting Started", emoji: "🌱" },
];

export function getEfficiencyLabel(rating: number): { label: string; emoji: string } {
  for (const tier of EFFICIENCY_LABELS) {
    if (rating >= tier.min) {
      return { label: tier.label, emoji: tier.emoji };
    }
  }
  return { label: "Getting Started", emoji: "🌱" };
}

// Clamp helper
function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

// Compute speed factor: target_seconds / actual_seconds, clamped 0.25-1.5
export function computeSpeedFactor(topicId: string, timeSeconds: number): number {
  const targetSeconds = FOCUS_TARGET_TIMES[topicId] || 35;
  const actualSeconds = Math.max(1, timeSeconds);
  return clamp(0.25, 1.5, targetSeconds / actualSeconds);
}

// Determine if the answer was "fast" (deserves speed bonus sound)
// Fast = completed under 70% of target time
export function isFastAnswer(topicId: string, timeSeconds: number): boolean {
  const targetSeconds = FOCUS_TARGET_TIMES[topicId] || 35;
  return timeSeconds < targetSeconds * 0.7;
}

// Focus attempt data for efficiency computation
export interface FocusAttempt {
  isCorrect: boolean;
  timeMs: number;
  nudges: number;
  topic: string;
}

// Compute efficiency rating from a list of Focus Mode attempts
// Returns rating (0-100) computed incrementally from starting rating 50
export function computeEfficiencyRating(attempts: FocusAttempt[]): number {
  let rating = 50;
  
  for (const attempt of attempts) {
    const timeSeconds = attempt.timeMs / 1000;
    const speedFactor = computeSpeedFactor(attempt.topic, timeSeconds);
    
    let delta: number;
    if (attempt.isCorrect) {
      // Correct: +3 to +8 based on speed
      delta = Math.round(2 + 4 * speedFactor);
    } else {
      // Incorrect: -5
      delta = -5;
    }
    
    // Nudge penalty: -1 per nudge
    delta = delta - attempt.nudges;
    
    rating = clamp(0, 100, rating + delta);
  }
  
  return rating;
}

// Compute average time from focus attempts (in seconds)
export function computeAverageFocusTime(attempts: FocusAttempt[]): number | null {
  if (attempts.length === 0) return null;
  const totalMs = attempts.reduce((sum, a) => sum + a.timeMs, 0);
  return Math.round(totalMs / attempts.length / 1000);
}

// ============================================
// Separate Accuracy and Speed Scores
// ============================================

export interface FocusModeScores {
  accuracy: number; // 0-100 based on correct/total
  speed: number;    // 0-100 based on correct attempts only
  avgTimeSeconds: number | null;
  totalAttempts: number;
  correctAttempts: number;
}

// Compute separate Accuracy and Speed scores
export function computeFocusModeScores(attempts: FocusAttempt[]): FocusModeScores {
  if (attempts.length === 0) {
    return {
      accuracy: 0,
      speed: 0,
      avgTimeSeconds: null,
      totalAttempts: 0,
      correctAttempts: 0,
    };
  }
  
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter(a => a.isCorrect).length;
  
  // Accuracy: simple correct/total percentage
  const accuracy = Math.round((correctAttempts / totalAttempts) * 100);
  
  // Speed: only from correct attempts
  const correctAttemptsData = attempts.filter(a => a.isCorrect);
  let speed = 0;
  let avgTimeSeconds: number | null = null;
  
  if (correctAttemptsData.length > 0) {
    // Compute average speed factor for correct attempts
    const speedFactors = correctAttemptsData.map(a => {
      const timeSeconds = a.timeMs / 1000;
      return computeSpeedFactor(a.topic, timeSeconds);
    });
    
    const avgSpeedFactor = speedFactors.reduce((sum, f) => sum + f, 0) / speedFactors.length;
    
    // Convert speed factor (0.25-1.5) to a 0-100 score
    // 0.25 -> 0, 1.0 -> 60, 1.5 -> 100
    speed = Math.round(clamp(0, 100, (avgSpeedFactor - 0.25) / 1.25 * 100));
    
    // Average time
    const totalMs = correctAttemptsData.reduce((sum, a) => sum + a.timeMs, 0);
    avgTimeSeconds = Math.round(totalMs / correctAttemptsData.length / 1000);
  }
  
  return {
    accuracy,
    speed,
    avgTimeSeconds,
    totalAttempts,
    correctAttempts,
  };
}

// Get combined label from scores
export function getCombinedEfficiencyLabel(scores: FocusModeScores): { label: string; emoji: string } {
  // Weighted average: 60% accuracy, 40% speed
  const combined = scores.accuracy * 0.6 + scores.speed * 0.4;
  return getEfficiencyLabel(combined);
}

// ============================================
// Adaptive Nudge Thresholds
// ============================================

// Compute adaptive nudge thresholds based on user's recent speed
export function computeAdaptiveNudgeThresholds(
  recentTimesMs: number[]
): { firstNudgeMs: number; secondNudgeMs: number; baselineMs: number } {
  // Default baseline if no history
  const DEFAULT_BASELINE_MS = 30000; // 30 seconds
  
  let baselineMs: number;
  
  if (recentTimesMs.length === 0) {
    baselineMs = DEFAULT_BASELINE_MS;
  } else {
    // Use median of recent times
    const sorted = [...recentTimesMs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    baselineMs = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  
  // Compute thresholds based on baseline
  // First nudge: 125% of baseline, clamped 6s - 90s
  const firstNudgeMs = clamp(6000, 90000, baselineMs * 1.25);
  
  // Second nudge: 175% of baseline, clamped (first + 6s) - 150s
  const secondNudgeMs = clamp(firstNudgeMs + 6000, 150000, baselineMs * 1.75);
  
  return { firstNudgeMs, secondNudgeMs, baselineMs };
}
