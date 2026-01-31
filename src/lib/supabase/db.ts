import { createClient } from "./client";
import type { Attempt, AttemptInsert, Profile, Mastery, MisconceptionStat } from "./database.types";

// Client-side database operations

export async function saveAttempt(attempt: AttemptInsert): Promise<{ data: Attempt | null; error: Error | null }> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("attempts")
    .insert(attempt)
    .select()
    .single();

  return { 
    data: data as Attempt | null, 
    error: error as Error | null 
  };
}

export async function getRecentAttempts(userId: string, limit = 10): Promise<Attempt[]> {
  const supabase = createClient();
  
  const { data } = await supabase
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as Attempt[]) || [];
}

export async function getAttemptsByTopic(userId: string, topic: string): Promise<Attempt[]> {
  const supabase = createClient();
  
  const { data } = await supabase
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("topic", topic)
    .order("created_at", { ascending: false });

  return (data as Attempt[]) || [];
}

export async function getMastery(userId: string): Promise<Mastery[]> {
  const supabase = createClient();
  
  const { data } = await supabase
    .from("mastery")
    .select("*")
    .eq("user_id", userId);

  return (data as Mastery[]) || [];
}

export async function updateMastery(userId: string, topic: string, accuracy: number): Promise<void> {
  const supabase = createClient();
  
  await supabase
    .from("mastery")
    .upsert({
      user_id: userId,
      topic,
      accuracy,
      last_practiced_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,topic",
    });
}

export async function getMisconceptionStats(userId: string): Promise<MisconceptionStat[]> {
  const supabase = createClient();
  
  const { data } = await supabase
    .from("misconception_stats")
    .select("*")
    .eq("user_id", userId)
    .order("count", { ascending: false });

  return (data as MisconceptionStat[]) || [];
}

export async function incrementMisconceptionStat(userId: string, misconceptionId: string): Promise<void> {
  const supabase = createClient();
  
  // First try to get existing stat
  const { data: existing } = await supabase
    .from("misconception_stats")
    .select("count")
    .eq("user_id", userId)
    .eq("misconception_id", misconceptionId)
    .single();

  if (existing) {
    // Update existing
    await supabase
      .from("misconception_stats")
      .update({
        count: existing.count + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("misconception_id", misconceptionId);
  } else {
    // Insert new
    await supabase
      .from("misconception_stats")
      .insert({
        user_id: userId,
        misconception_id: misconceptionId,
        count: 1,
        last_seen_at: new Date().toISOString(),
      });
  }
}

export async function getOrCreateProfile(userId: string, email?: string): Promise<Profile | null> {
  const supabase = createClient();
  
  // Try to get existing profile
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (existing) {
    return existing as Profile;
  }

  // Create new profile
  const { data: created } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      display_name: email?.split("@")[0] || null,
      grade_band: "6-8",
    })
    .select()
    .single();

  return created as Profile | null;
}
