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

  if (error) {
    console.error("[saveAttempt] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      attempt: { ...attempt, user_id: attempt.user_id.slice(0, 8) + "..." },
    });
  }

  return { 
    data: data as Attempt | null, 
    error: error ? new Error(`${error.message} (code: ${error.code})`) : null 
  };
}

export async function getRecentAttempts(userId: string, limit = 10): Promise<Attempt[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentAttempts] Supabase error:", error);
  }

  return (data as Attempt[]) || [];
}

export async function getAttemptsByTopic(userId: string, topic: string): Promise<Attempt[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("topic", topic)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getAttemptsByTopic] Supabase error:", error);
  }

  return (data as Attempt[]) || [];
}

export async function getMastery(userId: string): Promise<Mastery[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("mastery")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("[getMastery] Supabase error:", error);
  }

  return (data as Mastery[]) || [];
}

export async function updateMastery(
  userId: string, 
  topic: string, 
  accuracy: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from("mastery")
    .upsert({
      user_id: userId,
      topic,
      accuracy,
      last_practiced_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,topic",
    });

  if (error) {
    console.error("[updateMastery] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      userId: userId.slice(0, 8) + "...",
      topic,
      accuracy,
    });
    return { error: new Error(`${error.message} (code: ${error.code})`) };
  }

  return { error: null };
}

export async function getMisconceptionStats(userId: string): Promise<MisconceptionStat[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("misconception_stats")
    .select("*")
    .eq("user_id", userId)
    .order("count", { ascending: false });

  if (error) {
    console.error("[getMisconceptionStats] Supabase error:", error);
  }

  return (data as MisconceptionStat[]) || [];
}

export async function incrementMisconceptionStat(
  userId: string, 
  misconceptionId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  
  // First try to get existing stat
  const { data: existing, error: fetchError } = await supabase
    .from("misconception_stats")
    .select("count")
    .eq("user_id", userId)
    .eq("misconception_id", misconceptionId)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = no rows returned, which is expected for new misconceptions
    console.error("[incrementMisconceptionStat] Fetch error:", fetchError);
  }

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from("misconception_stats")
      .update({
        count: existing.count + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("misconception_id", misconceptionId);

    if (error) {
      console.error("[incrementMisconceptionStat] Update error:", error);
      return { error: new Error(error.message) };
    }
  } else {
    // Insert new
    const { error } = await supabase
      .from("misconception_stats")
      .insert({
        user_id: userId,
        misconception_id: misconceptionId,
        count: 1,
        last_seen_at: new Date().toISOString(),
      });

    if (error) {
      console.error("[incrementMisconceptionStat] Insert error:", error);
      return { error: new Error(error.message) };
    }
  }

  return { error: null };
}

export async function getAttemptsSince(userId: string, since: Date): Promise<Attempt[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getAttemptsSince] Supabase error:", error);
  }

  return (data as Attempt[]) || [];
}

export async function getOrCreateProfile(userId: string, email?: string): Promise<Profile | null> {
  const supabase = createClient();
  
  // Try to get existing profile
  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[getOrCreateProfile] Fetch error:", fetchError);
  }

  if (existing) {
    return existing as Profile;
  }

  // Create new profile
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      display_name: email?.split("@")[0] || null,
      grade_band: "6-8",
    })
    .select()
    .single();

  if (insertError) {
    console.error("[getOrCreateProfile] Insert error:", insertError);
  }

  return created as Profile | null;
}

export async function getUserProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[getUserProfile] Supabase error:", error);
  }

  return data as Profile | null;
}

export async function updateUserProfile(
  userId: string, 
  updates: { display_name?: string; grade_band?: string }
): Promise<Profile | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    // If profile doesn't exist, create it with the updates
    if (error.code === "PGRST116") {
      const { data: created, error: insertError } = await supabase
        .from("profiles")
        .insert({
          user_id: userId,
          display_name: updates.display_name || null,
          grade_band: updates.grade_band || "6-8",
        })
        .select()
        .single();
      
      if (insertError) {
        console.error("[updateUserProfile] Insert error:", insertError);
        return null;
      }
      
      return created as Profile | null;
    }
    
    console.error("[updateUserProfile] Supabase error:", error);
    return null;
  }

  return data as Profile | null;
}
