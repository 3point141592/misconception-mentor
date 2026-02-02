import { NextRequest, NextResponse } from "next/server";
import { getNotesByTopicId } from "@/lib/content";
import type { LanguageCode } from "@/i18n";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") || "fractions";
  const language = (searchParams.get("language") || "en") as LanguageCode;
  
  try {
    // Get notes for the topic (currently in English only)
    const notes = getNotesByTopicId(topic);
    
    if (!notes) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    
    // Return a preview of the lesson content
    // In a full implementation, this would load language-specific content
    return NextResponse.json({
      title: notes.title,
      overview: (notes as any).overview ?? "",
      mascot: notes.mascot,
      accent: notes.accent,
      language,
    });
  } catch (error) {
    console.error("Error loading lesson preview:", error);
    return NextResponse.json(
      { error: "Failed to load lesson preview" },
      { status: 500 }
    );
  }
}
