import { NextRequest, NextResponse } from "next/server";
import type { LanguageCode } from "@/i18n";

// ElevenLabs TTS API endpoint
// POST /api/tts - Convert text to speech using ElevenLabs
// Returns audio/mpeg stream

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Default voice ID - "Rachel" (clear, friendly female voice good for education)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

// Model fallback order - multilingual models that support all languages
// eleven_flash_v2 is English-only, so we don't use it
const MODEL_FALLBACK_ORDER = [
  "eleven_flash_v2_5",      // Fast, multilingual
  "eleven_multilingual_v2", // High quality, multilingual  
  "eleven_turbo_v2_5",      // Faster variant
];

// Map UI language codes to ElevenLabs language codes
// See: https://elevenlabs.io/docs/api-reference/text-to-speech
const LANGUAGE_CODE_MAP: Record<LanguageCode, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  zh_hans: "zh",
  hi_latn: "hi",
};

interface TTSResult {
  success: boolean;
  audioData?: ArrayBuffer;
  error?: string;
  modelUsed?: string;
  languageCode?: string;
  fallbackUsed?: boolean;
}

async function tryTTSWithModel(
  apiKey: string,
  voiceId: string,
  text: string,
  modelId: string,
  languageCode: string
): Promise<TTSResult> {
  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: languageCode, // Important for multilingual pronunciation
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] Model ${modelId} failed:`, response.status, errorText.slice(0, 200));
      
      return {
        success: false,
        error: `${response.status}: ${errorText.slice(0, 100)}`,
        modelUsed: modelId,
        languageCode,
        fallbackUsed: false,
      };
    }

    const audioData = await response.arrayBuffer();
    return {
      success: true,
      audioData,
      modelUsed: modelId,
      languageCode,
      fallbackUsed: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      modelUsed: modelId,
      languageCode,
      fallbackUsed: false,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured", code: "NO_API_KEY" },
        { status: 500 }
      );
    }
    
    const body = await request.json();
    const { text, voiceId, language } = body;
    
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field", code: "INVALID_TEXT" },
        { status: 400 }
      );
    }
    
    // Limit text length to prevent abuse
    const maxLength = 1000;
    const trimmedText = text.slice(0, maxLength);
    
    if (trimmedText.length === 0) {
      return NextResponse.json(
        { error: "Text cannot be empty", code: "EMPTY_TEXT" },
        { status: 400 }
      );
    }
    
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
    
    // Map language to ElevenLabs language code
    const uiLanguage = (language || "en") as LanguageCode;
    const languageCode = LANGUAGE_CODE_MAP[uiLanguage] || "en";
    
    console.log(`[TTS] Request: language=${uiLanguage}, languageCode=${languageCode}, textLength=${trimmedText.length}`);
    
    // Get model from env or use default
    const envModelId = process.env.ELEVENLABS_MODEL_ID;
    const modelsToTry = envModelId 
      ? [envModelId, ...MODEL_FALLBACK_ORDER.filter(m => m !== envModelId)]
      : MODEL_FALLBACK_ORDER;
    
    let lastError = "";
    let fallbackUsed = false;
    
    // Try models in order until one works
    for (let i = 0; i < modelsToTry.length; i++) {
      const modelId = modelsToTry[i];
      console.log(`[TTS] Trying model: ${modelId}, language: ${languageCode}`);
      
      const result = await tryTTSWithModel(apiKey, selectedVoiceId, trimmedText, modelId, languageCode);
      
      if (result.success && result.audioData) {
        console.log(`[TTS] Success with model: ${modelId}${i > 0 ? " (fallback)" : ""}`);
        
        return new NextResponse(result.audioData, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": result.audioData.byteLength.toString(),
            "Cache-Control": "no-cache",
            "X-TTS-Model": modelId,
            "X-TTS-Language": languageCode,
            "X-TTS-Fallback": i > 0 ? "true" : "false",
          },
        });
      }
      
      lastError = result.error || "Unknown error";
      fallbackUsed = i > 0;
    }
    
    // All models failed
    console.error("[TTS] All models failed. Last error:", lastError);
    return NextResponse.json(
      { 
        error: `Voice generation failed: ${lastError}`,
        code: "TTS_FAILED",
        modelsTried: modelsToTry,
        languageCode,
        fallbackUsed,
      },
      { status: 500 }
    );
    
  } catch (error) {
    console.error("[TTS] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// GET endpoint to check if TTS is configured
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const envModelId = process.env.ELEVENLABS_MODEL_ID;
  
  return NextResponse.json({
    configured: !!apiKey,
    defaultVoiceId: DEFAULT_VOICE_ID,
    defaultModel: envModelId || MODEL_FALLBACK_ORDER[0],
    fallbackModels: MODEL_FALLBACK_ORDER,
    supportedLanguages: Object.keys(LANGUAGE_CODE_MAP),
    languageCodeMap: LANGUAGE_CODE_MAP,
  });
}
