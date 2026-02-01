"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useDelight } from "@/components/DelightProvider";
import { getRecentAttempts, updateUserProfile, getUserProfile } from "@/lib/supabase/db";
import { getMisconceptionById, REVIEW_ERROR_NAMES } from "@/lib/content";
import type { Attempt, AttemptMetadata } from "@/lib/supabase/database.types";
import { extractAttemptMetadata } from "@/lib/supabase/database.types";
import type { CoachNotes, FocusMeta } from "@/lib/types";
import { 
  computeFocusModeScores,
  type FocusAttempt 
} from "@/lib/delight";

// ============================================
// Types
// ============================================

interface CoachNoteItem {
  id: string;
  remember: string;
  nextStep: string;
  topic: string;
  createdAt: string;
  count: number; // For grouping duplicates
}

type NoteStatus = "active" | "resolved" | "dismissed" | "snoozed";

interface NoteState {
  status: NoteStatus;
  updatedAt: string;
  snoozeUntil?: string;
}

interface NoteStates {
  [noteId: string]: NoteState;
}

interface ProgressData {
  accuracy: number | null;
  reviewErrorCount: number;
  misconceptionErrorCount: number;
  topMisconceptions: { id: string; name: string; count: number }[];
  topReviewErrors: { type: string; name: string; count: number }[];
}

interface FocusScores {
  accuracy: number;
  speed: number;
  combined: number;
  treeStage: string;
  attemptCount: number;
  correctCount: number;
  avgTimeSeconds: number | null;
}

// ============================================
// Constants
// ============================================

const USERNAME_KEY = "mm_username";
const NOTE_STATES_KEY = "mm_coach_note_states";

const TREE_STAGES = [
  { min: 0, name: "Seed", emoji: "🌰" },
  { min: 20, name: "Sprout", emoji: "🌱" },
  { min: 40, name: "Sapling", emoji: "🌿" },
  { min: 60, name: "Tree", emoji: "🌳" },
  { min: 80, name: "Strong Tree", emoji: "🌲" },
  { min: 95, name: "Champion Tree", emoji: "🏆🌲" },
];

// ============================================
// Utility Functions
// ============================================

function getTreeStage(combined: number): { name: string; emoji: string } {
  for (let i = TREE_STAGES.length - 1; i >= 0; i--) {
    if (combined >= TREE_STAGES[i].min) {
      return TREE_STAGES[i];
    }
  }
  return TREE_STAGES[0];
}

function getNoteStatesKey(userId: string | undefined): string {
  return `${NOTE_STATES_KEY}_${userId || "guest"}`;
}

function loadNoteStates(userId: string | undefined): NoteStates {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(getNoteStatesKey(userId));
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.warn("[Dashboard] Failed to load note states:", e);
  }
  return {};
}

function saveNoteStates(userId: string | undefined, states: NoteStates): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getNoteStatesKey(userId), JSON.stringify(states));
  } catch (e) {
    console.warn("[Dashboard] Failed to save note states:", e);
  }
}

function loadLocalUsername(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(USERNAME_KEY) || "";
  } catch (e) {
    return "";
  }
}

function saveLocalUsername(name: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USERNAME_KEY, name);
  } catch (e) {
    console.warn("[Dashboard] Failed to save username:", e);
  }
}

function generateNoteId(remember: string, nextStep: string): string {
  return `note_${remember.slice(0, 20).replace(/\s+/g, "_")}_${nextStep.slice(0, 20).replace(/\s+/g, "_")}`;
}

function isNoteActive(note: CoachNoteItem, states: NoteStates): boolean {
  const state = states[note.id];
  if (!state) return true;
  if (state.status === "dismissed" || state.status === "resolved") return false;
  if (state.status === "snoozed" && state.snoozeUntil) {
    return new Date() > new Date(state.snoozeUntil);
  }
  return true;
}

// ============================================
// Main Component
// ============================================

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { settings, playSuccess } = useDelight();
  
  // Username state
  const [username, setUsername] = useState<string>("");
  const [usernameSource, setUsernameSource] = useState<"profile" | "localStorage" | "none">("none");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  
  // Data state
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Coach Notes state
  const [noteStates, setNoteStates] = useState<NoteStates>({});
  const [showResolved, setShowResolved] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  
  // Load username
  useEffect(() => {
    const loadUsername = async () => {
      if (user) {
        try {
          const profile = await getUserProfile(user.id);
          if (profile?.display_name) {
            setUsername(profile.display_name);
            setUsernameSource("profile");
            return;
          }
        } catch (e) {
          console.warn("[Dashboard] Failed to load profile:", e);
        }
      }
      
      const localName = loadLocalUsername();
      if (localName) {
        setUsername(localName);
        setUsernameSource("localStorage");
      } else {
        setUsernameSource("none");
      }
    };
    
    if (!authLoading) {
      loadUsername();
    }
  }, [user, authLoading]);
  
  // Load note states
  useEffect(() => {
    setNoteStates(loadNoteStates(user?.id));
  }, [user?.id]);
  
  // Load dashboard data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (user) {
        const data = await getRecentAttempts(user.id, 50);
        setAttempts(data);
      } else {
        setAttempts([]);
      }
    } catch (e) {
      console.error("[Dashboard] Failed to load data:", e);
      setError("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [user]);
  
  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading, loadData]);
  
  // Save username
  const handleSaveUsername = async () => {
    const name = tempUsername.trim();
    if (!name) return;
    
    setUsername(name);
    saveLocalUsername(name);
    setUsernameSource("localStorage");
    
    if (user) {
      try {
        await updateUserProfile(user.id, { display_name: name });
        setUsernameSource("profile");
      } catch (e) {
        console.warn("[Dashboard] Failed to save to profile:", e);
      }
    }
    
    setIsEditingUsername(false);
    playSuccess();
  };
  
  // Update note state
  const updateNoteState = (noteId: string, status: NoteStatus, snoozeUntil?: string) => {
    const newStates: NoteStates = {
      ...noteStates,
      [noteId]: {
        status,
        updatedAt: new Date().toISOString(),
        snoozeUntil,
      },
    };
    setNoteStates(newStates);
    saveNoteStates(user?.id, newStates);
    playSuccess();
  };
  
  // ============================================
  // Derived Data
  // ============================================
  
  // Progress data
  const progressData = useMemo<ProgressData>(() => {
    const last10 = attempts.slice(0, 10);
    const correctCount = last10.filter(a => a.is_correct).length;
    const accuracy = last10.length > 0 ? Math.round((correctCount / last10.length) * 100) : null;
    
    let reviewErrorCount = 0;
    let misconceptionErrorCount = 0;
    const misconceptionCounts: Record<string, number> = {};
    const reviewErrorCounts: Record<string, number> = {};
    
    for (const attempt of last10) {
      const metadata = extractAttemptMetadata(attempt.top_misconceptions);
      if (metadata) {
        if (metadata.error_class === "review_error") {
          reviewErrorCount++;
          if (metadata.review_error_type) {
            reviewErrorCounts[metadata.review_error_type] = (reviewErrorCounts[metadata.review_error_type] || 0) + 1;
          }
        } else if (metadata.error_class === "misconception_error") {
          misconceptionErrorCount++;
          // Count misconceptions from the array if available
          const misconceptions = attempt.top_misconceptions;
          if (Array.isArray(misconceptions)) {
            for (const m of misconceptions) {
              if (m && typeof m === "object" && "id" in m && typeof m.id === "string" && !m.id.startsWith("REVIEW:")) {
                misconceptionCounts[m.id] = (misconceptionCounts[m.id] || 0) + 1;
              }
            }
          }
        }
      }
    }
    
    const topMisconceptions = Object.entries(misconceptionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({
        id,
        name: getMisconceptionById(id)?.name || id,
        count,
      }));
    
    const topReviewErrors = Object.entries(reviewErrorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => ({
        type,
        name: REVIEW_ERROR_NAMES[type] || type,
        count,
      }));
    
    return {
      accuracy,
      reviewErrorCount,
      misconceptionErrorCount,
      topMisconceptions,
      topReviewErrors,
    };
  }, [attempts]);
  
  // Coach Notes
  const coachNotes = useMemo<CoachNoteItem[]>(() => {
    const noteMap: Record<string, CoachNoteItem> = {};
    
    for (const attempt of attempts) {
      const metadata = extractAttemptMetadata(attempt.top_misconceptions);
      if (metadata?.coach_notes?.remember && metadata?.coach_notes?.next_step) {
        const id = generateNoteId(metadata.coach_notes.remember, metadata.coach_notes.next_step);
        
        if (noteMap[id]) {
          noteMap[id].count++;
        } else {
          noteMap[id] = {
            id,
            remember: metadata.coach_notes.remember,
            nextStep: metadata.coach_notes.next_step,
            topic: attempt.topic,
            createdAt: attempt.created_at || new Date().toISOString(),
            count: 1,
          };
        }
      }
    }
    
    return Object.values(noteMap).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [attempts]);
  
  const activeNotes = useMemo(() => 
    coachNotes.filter(n => isNoteActive(n, noteStates)),
    [coachNotes, noteStates]
  );
  
  const resolvedNotes = useMemo(() => 
    coachNotes.filter(n => noteStates[n.id]?.status === "resolved"),
    [coachNotes, noteStates]
  );
  
  const dismissedNotes = useMemo(() => 
    coachNotes.filter(n => noteStates[n.id]?.status === "dismissed"),
    [coachNotes, noteStates]
  );
  
  // Weekly recap
  const weeklyRecap = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    let resolvedThisWeek = 0;
    const noteCounts: Record<string, number> = {};
    
    for (const [noteId, state] of Object.entries(noteStates)) {
      if (state.status === "resolved" && new Date(state.updatedAt) > oneWeekAgo) {
        resolvedThisWeek++;
      }
    }
    
    // Find most common note this week from attempts
    for (const attempt of attempts) {
      if (new Date(attempt.created_at || "") > oneWeekAgo) {
        const metadata = extractAttemptMetadata(attempt.top_misconceptions);
        if (metadata?.coach_notes?.remember) {
          const key = metadata.coach_notes.remember;
          noteCounts[key] = (noteCounts[key] || 0) + 1;
        }
      }
    }
    
    const mostCommon = Object.entries(noteCounts)
      .sort((a, b) => b[1] - a[1])[0];
    
    return {
      resolvedCount: resolvedThisWeek,
      mostCommonNote: mostCommon ? mostCommon[0] : null,
    };
  }, [attempts, noteStates]);
  
  // Focus Mode scores
  const focusScores = useMemo<FocusScores>(() => {
    const focusAttempts: FocusAttempt[] = [];
    
    for (const attempt of attempts) {
      const metadata = extractAttemptMetadata(attempt.top_misconceptions);
      if (metadata?.focus?.enabled) {
        focusAttempts.push({
          isCorrect: attempt.is_correct,
          timeMs: metadata.focus.time_ms,
          nudges: metadata.focus.nudges,
          topic: attempt.topic,
        });
      }
    }
    
    if (focusAttempts.length === 0) {
      return {
        accuracy: 0,
        speed: 0,
        combined: 0,
        treeStage: "Seed",
        attemptCount: 0,
        correctCount: 0,
        avgTimeSeconds: null,
      };
    }
    
    const scores = computeFocusModeScores(focusAttempts.slice(0, 20));
    const combined = Math.round(scores.accuracy * 0.6 + scores.speed * 0.4);
    const stage = getTreeStage(combined);
    
    return {
      accuracy: scores.accuracy,
      speed: scores.speed,
      combined,
      treeStage: stage.name,
      attemptCount: focusAttempts.length,
      correctCount: scores.correctAttempts,
      avgTimeSeconds: scores.avgTimeSeconds,
    };
  }, [attempts]);
  
  // ============================================
  // Render
  // ============================================
  
  if (authLoading) {
    return (
      <div className="animate-fade-in text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-highlighter-yellow border-t-transparent"></div>
        <p className="text-ink-muted mt-2">Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="animate-fade-in space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-highlighter-yellow to-highlighter-orange flex items-center justify-center text-3xl">
              {username ? username[0].toUpperCase() : "👋"}
            </div>
            <div>
              {isEditingUsername ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    placeholder="Enter your name..."
                    className="px-3 py-1.5 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow text-lg"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveUsername();
                      if (e.key === "Escape") setIsEditingUsername(false);
                    }}
                  />
                  <button
                    onClick={handleSaveUsername}
                    className="px-3 py-1.5 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-medium rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingUsername(false)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-ink-muted font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-ink">
                    Hi, {username || "Learner"}! 👋
                  </h2>
                  <p className="text-ink-muted text-sm">
                    {user ? `Signed in` : "Demo mode"} • {attempts.length} attempts recorded
                  </p>
                </>
              )}
            </div>
          </div>
          {!isEditingUsername && (
            <button
              onClick={() => {
                setTempUsername(username);
                setIsEditingUsername(true);
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-ink-muted text-sm font-medium rounded-lg transition-colors"
            >
              ✏️ Edit Name
            </button>
          )}
        </div>
      </div>
      
      {/* Your Progress Panel */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
        <h3 className="font-semibold text-ink text-lg mb-4 flex items-center gap-2">
          <span className="text-xl">📊</span>
          Your Progress
        </h3>
        
        {isLoading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-highlighter-yellow border-t-transparent"></div>
          </div>
        ) : !user ? (
          <div className="text-center py-4 text-ink-muted">
            <p>Sign in to track your progress across sessions.</p>
          </div>
        ) : attempts.length === 0 ? (
          <div className="text-center py-4 text-ink-muted">
            <p>No attempts yet. Start practicing to see your progress!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-xs text-green-600 font-medium">Accuracy (last 10)</p>
              <p className="text-2xl font-bold text-green-700">
                {progressData.accuracy !== null ? `${progressData.accuracy}%` : "—"}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-xs text-blue-600 font-medium">Total Attempts</p>
              <p className="text-2xl font-bold text-blue-700">{attempts.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <p className="text-xs text-amber-600 font-medium">Review Errors</p>
              <p className="text-2xl font-bold text-amber-700">{progressData.reviewErrorCount}</p>
            </div>
            <div className="bg-pink-50 rounded-lg p-4 border border-pink-200">
              <p className="text-xs text-pink-600 font-medium">Misconceptions</p>
              <p className="text-2xl font-bold text-pink-700">{progressData.misconceptionErrorCount}</p>
            </div>
          </div>
        )}
        
        {/* Top issues */}
        {(progressData.topMisconceptions.length > 0 || progressData.topReviewErrors.length > 0) && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {progressData.topMisconceptions.length > 0 && (
              <div className="bg-pink-50/50 rounded-lg p-3 border border-pink-100">
                <p className="text-xs font-medium text-pink-700 mb-2">Top Misconceptions</p>
                <ul className="space-y-1">
                  {progressData.topMisconceptions.map((m) => (
                    <li key={m.id} className="text-sm text-pink-800 flex justify-between">
                      <span className="truncate">{m.name}</span>
                      <span className="text-pink-600 font-mono">×{m.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {progressData.topReviewErrors.length > 0 && (
              <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                <p className="text-xs font-medium text-amber-700 mb-2">Top Review Errors</p>
                <ul className="space-y-1">
                  {progressData.topReviewErrors.map((e) => (
                    <li key={e.type} className="text-sm text-amber-800 flex justify-between">
                      <span className="truncate">{e.name}</span>
                      <span className="text-amber-600 font-mono">×{e.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Coach Notes Board */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink text-lg flex items-center gap-2">
            <span className="text-xl">📝</span>
            Coach Notes Board
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowResolved(!showResolved)}
              className={`px-2 py-1 rounded transition-colors ${
                showResolved ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              Resolved ({resolvedNotes.length})
            </button>
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className={`px-2 py-1 rounded transition-colors ${
                showDismissed ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              Dismissed ({dismissedNotes.length})
            </button>
          </div>
        </div>
        
        {/* Weekly Recap */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 mb-4 border border-purple-100">
          <h4 className="text-sm font-medium text-purple-800 mb-2">📅 Weekly Recap</h4>
          <div className="text-sm text-purple-700 space-y-1">
            <p>✓ Resolved <strong>{weeklyRecap.resolvedCount}</strong> notes this week</p>
            {weeklyRecap.mostCommonNote && (
              <p className="truncate">🔑 Most common: "{weeklyRecap.mostCommonNote}"</p>
            )}
            <p className="text-purple-600 italic">
              {weeklyRecap.resolvedCount >= 3 ? "Nice work—keep it up! 🎉" : "Keep practicing to build your knowledge!"}
            </p>
          </div>
        </div>
        
        {/* Active Notes */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-ink-muted">Active ({activeNotes.length})</h4>
          {activeNotes.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-4">
              No active notes. Practice more to receive coaching tips!
            </p>
          ) : (
            activeNotes.slice(0, 5).map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onAction={(action) => {
                  if (action === "resolved") updateNoteState(note.id, "resolved");
                  if (action === "dismissed") updateNoteState(note.id, "dismissed");
                  if (action === "snoozed") {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    updateNoteState(note.id, "snoozed", tomorrow.toISOString());
                  }
                }}
              />
            ))
          )}
          {activeNotes.length > 5 && (
            <p className="text-xs text-ink-muted text-center">
              +{activeNotes.length - 5} more active notes
            </p>
          )}
        </div>
        
        {/* Resolved Notes */}
        {showResolved && resolvedNotes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-paper-line space-y-3">
            <h4 className="text-sm font-medium text-green-700">Resolved ({resolvedNotes.length})</h4>
            {resolvedNotes.slice(0, 3).map((note) => (
              <div key={note.id} className="bg-green-50/50 rounded-lg p-3 border border-green-100 opacity-70">
                <p className="text-sm text-green-800">✓ {note.remember}</p>
              </div>
            ))}
          </div>
        )}
        
        {/* Dismissed Notes */}
        {showDismissed && dismissedNotes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-paper-line space-y-3">
            <h4 className="text-sm font-medium text-gray-500">Dismissed ({dismissedNotes.length})</h4>
            {dismissedNotes.slice(0, 3).map((note) => (
              <div key={note.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 opacity-50">
                <p className="text-sm text-gray-600">{note.remember}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Focus Mode: Accuracy + Speed + Competition Tree */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
        <h3 className="font-semibold text-ink text-lg mb-4 flex items-center gap-2">
          <span className="text-xl">⏱️</span>
          Focus Mode Performance
        </h3>
        
        {focusScores.attemptCount === 0 ? (
          <div className="text-center py-6 text-ink-muted">
            <p className="text-4xl mb-2">🌰</p>
            <p>No Focus Mode attempts yet!</p>
            <p className="text-sm">Enable Focus Mode in Settings to track your speed and accuracy.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Accuracy and Speed Bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Accuracy Score */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-700">Accuracy Score</span>
                  <span className="text-xl font-bold text-green-600">{focusScores.accuracy}%</span>
                </div>
                <div className="h-3 bg-green-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-500 rounded-full"
                    style={{ width: `${focusScores.accuracy}%` }}
                  />
                </div>
                <p className="text-xs text-green-600 mt-1">
                  {focusScores.correctCount}/{focusScores.attemptCount} correct
                </p>
              </div>
              
              {/* Speed Score */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">Speed Score</span>
                  <span className="text-xl font-bold text-blue-600">{focusScores.speed}%</span>
                </div>
                <div className="h-3 bg-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                    style={{ width: `${focusScores.speed}%` }}
                  />
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  {focusScores.avgTimeSeconds ? `Avg: ${focusScores.avgTimeSeconds}s` : "Based on correct answers"}
                </p>
              </div>
            </div>
            
            {/* Competition Tree */}
            <div className="bg-gradient-to-br from-amber-50 to-green-50 rounded-xl p-6 border border-amber-200">
              <div className="text-center">
                <div className="text-6xl mb-3">
                  {getTreeStage(focusScores.combined).emoji}
                </div>
                <h4 className="text-xl font-bold text-ink">
                  {focusScores.treeStage}
                </h4>
                <p className="text-sm text-ink-muted mt-1">
                  Combined Score: {focusScores.combined}%
                </p>
                
                {/* Tree Progress */}
                <div className="mt-4 flex items-center justify-center gap-2">
                  {TREE_STAGES.map((stage, i) => (
                    <div 
                      key={stage.name}
                      className={`flex flex-col items-center ${
                        focusScores.combined >= stage.min ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <span className="text-2xl">{stage.emoji}</span>
                      <span className="text-[10px] text-ink-muted">{stage.min}%</span>
                    </div>
                  ))}
                </div>
                
                {/* Tips */}
                <p className="text-xs text-ink-muted mt-4 italic">
                  {focusScores.combined < 40 
                    ? "Keep practicing! Your tree will grow with more Focus Mode attempts."
                    : focusScores.combined < 70
                    ? "Good progress! Balance accuracy and speed to grow your tree."
                    : focusScores.combined < 90
                    ? "Excellent! You're almost at Champion level!"
                    : "🏆 Champion! You've mastered Focus Mode!"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Refresh Button */}
      <div className="text-center">
        <button
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-ink-muted text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          ↻ Refresh Data
        </button>
      </div>
    </div>
  );
}

// ============================================
// Note Card Component
// ============================================

function NoteCard({ 
  note, 
  onAction 
}: { 
  note: CoachNoteItem; 
  onAction: (action: "resolved" | "dismissed" | "snoozed") => void;
}) {
  return (
    <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
              {note.topic}
            </span>
            {note.count > 1 && (
              <span className="text-xs text-amber-600">×{note.count}</span>
            )}
          </div>
          <p className="text-sm font-medium text-amber-900 mb-1">
            🔑 {note.remember}
          </p>
          <p className="text-xs text-amber-700">
            → {note.nextStep}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onAction("resolved")}
            className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
            title="Mark as understood"
          >
            ✓ Got it
          </button>
          <button
            onClick={() => onAction("snoozed")}
            className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
            title="Snooze for 1 day"
          >
            ⏰ Snooze
          </button>
          <button
            onClick={() => onAction("dismissed")}
            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
            title="Dismiss permanently"
          >
            ✕ Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
