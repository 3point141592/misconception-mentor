/**
 * Tests for language detection utility
 * Run with: npx vitest run src/lib/language-detect.test.ts
 */

import { describe, it, expect } from "vitest";
import { 
  detectLanguage, 
  detectLanguageFromResponse, 
  extractTextValues,
  isTargetLanguageMatch 
} from "./language-detect";

describe("detectLanguage", () => {
  describe("Roman Hindi (hi-Latn)", () => {
    it("should detect Roman Hindi with high marker density", () => {
      const text = "Acha try hai, lekin addition ka method sahi nahi tha. Common denominator ka use karo.";
      const result = detectLanguage(text);
      
      expect(result.tag).toBe("hi-Latn");
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.label).toBe("Roman Hindi (hi-Latn)");
    });
    
    it("should detect Roman Hindi in math context", () => {
      const text = "Fractions ko add karne se pehle common denominator dhundho.";
      const result = detectLanguage(text);
      
      expect(["hi-Latn", "mixed-hi-Latn-en"]).toContain(result.tag);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
    
    it("should detect Roman Hindi remediation text", () => {
      const text = "Pehle dono fractions ke liye common denominator dhundho, phir sirf numerators ko jodo. Denominator same rahega.";
      const result = detectLanguage(text);
      
      expect(result.tag).toBe("hi-Latn");
    });
  });
  
  describe("Mixed Roman Hindi + English", () => {
    it("should detect mixed content", () => {
      const text = "Remember to find common denominator pehle, then add karein.";
      const result = detectLanguage(text);
      
      expect(["hi-Latn", "mixed-hi-Latn-en"]).toContain(result.tag);
    });
  });
  
  describe("Pure English", () => {
    it("should detect pure English", () => {
      const text = "Good try, but you need to use a common denominator before adding fractions.";
      const result = detectLanguage(text);
      
      expect(result.tag).toBe("en");
      expect(result.label).toBe("English");
    });
    
    it("should detect English math instructions", () => {
      const text = "Step 1: Find the least common denominator. Step 2: Convert both fractions. Step 3: Add the numerators.";
      const result = detectLanguage(text);
      
      expect(result.tag).toBe("en");
    });
  });
  
  describe("Devanagari Hindi (hi-Deva)", () => {
    it("should detect Devanagari script", () => {
      const text = "अच्छा प्रयास है, लेकिन पहले समान हर (common denominator) बनाओ।";
      const result = detectLanguage(text);
      
      expect(result.tag).toBe("hi-Deva");
      expect(result.label).toBe("Hindi (Devanagari)");
    });
  });
  
  describe("Edge cases", () => {
    it("should handle empty string", () => {
      const result = detectLanguage("");
      expect(result.tag).toBe("unknown");
    });
    
    it("should handle whitespace only", () => {
      const result = detectLanguage("   ");
      expect(result.tag).toBe("unknown");
    });
  });
});

describe("extractTextValues", () => {
  it("should extract string values from object, ignoring keys", () => {
    const obj = {
      short_feedback: "Acha try hai",
      solution_steps: ["Pehle common denominator dhundho", "Phir numerators jodo"],
      is_correct: false,
    };
    
    const text = extractTextValues(obj);
    
    expect(text).toContain("Acha try hai");
    expect(text).toContain("Pehle common denominator dhundho");
    expect(text).not.toContain("short_feedback");
    expect(text).not.toContain("solution_steps");
  });
  
  it("should handle nested objects", () => {
    const obj = {
      top_3: [
        { id: "FRAC-01", name: "Adding denominators", remediation: "Sirf numerators ko jodo" },
      ],
      key_takeaway: "Common denominator pehle dhundho",
    };
    
    const text = extractTextValues(obj);
    
    expect(text).toContain("Sirf numerators ko jodo");
    expect(text).toContain("Common denominator pehle dhundho");
    expect(text).not.toContain("top_3");
    expect(text).not.toContain("key_takeaway");
    expect(text).not.toContain("remediation");
  });
});

describe("detectLanguageFromResponse", () => {
  it("should detect Roman Hindi from API response object", () => {
    // This is the key test - passing an object with English keys but Roman Hindi values
    // must still classify as hi-Latn, not English
    const response = {
      is_correct: false,
      short_feedback: "Acha try hai, lekin method sahi nahi tha",
      solution_steps: ["Common denominator dhundho", "Numerators ko add karo"],
      coach_notes: {
        what_went_well: ["Aapne fractions samjhe"],
        remember: "Pehle common denominator!",
      },
    };
    
    const result = detectLanguageFromResponse(response);
    
    // Should NOT detect as English just because JSON keys are English
    expect(result.tag).not.toBe("en");
    expect(["hi-Latn", "mixed-hi-Latn-en"]).toContain(result.tag);
  });
  
  it("should detect English from English-only response", () => {
    const response = {
      is_correct: false,
      short_feedback: "Good try, but you need a common denominator.",
      solution_steps: ["Find the LCD", "Convert both fractions", "Add numerators"],
    };
    
    const result = detectLanguageFromResponse(response);
    
    expect(result.tag).toBe("en");
  });
});

describe("isTargetLanguageMatch", () => {
  it("should match hi-Latn for hi_latn target", () => {
    const detected = { tag: "hi-Latn" as const, confidence: 0.8, label: "", notes: "" };
    expect(isTargetLanguageMatch(detected, "hi_latn")).toBe(true);
  });
  
  it("should match mixed-hi-Latn-en for hi_latn target", () => {
    const detected = { tag: "mixed-hi-Latn-en" as const, confidence: 0.7, label: "", notes: "" };
    expect(isTargetLanguageMatch(detected, "hi_latn")).toBe(true);
  });
  
  it("should not match en for hi_latn target", () => {
    const detected = { tag: "en" as const, confidence: 0.8, label: "", notes: "" };
    expect(isTargetLanguageMatch(detected, "hi_latn")).toBe(false);
  });
  
  it("should match en for en target", () => {
    const detected = { tag: "en" as const, confidence: 0.8, label: "", notes: "" };
    expect(isTargetLanguageMatch(detected, "en")).toBe(true);
  });
});
