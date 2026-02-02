"use client";

import { useState, useEffect, useRef } from "react";
import { useDelight } from "./DelightProvider";
import { useTTS } from "./ReadAloudButton";
import { playHeelFootsteps, type AvatarSize, type AvatarStyle } from "@/lib/delight";

// ============================================
// Types
// ============================================

export type AvatarState = "idle" | "walking" | "pointing" | "sitting" | "speaking" | "celebrating";

export interface AvatarPosition {
  x: number;
  y: number;
}

interface TeacherAvatarProps {
  /** Override the avatar state */
  state?: AvatarState;
  /** Speech bubble text */
  bubbleText?: string;
  /** Show the bubble */
  showBubble?: boolean;
  /** Position override (for moving to anchors) */
  position?: AvatarPosition;
  /** Home position (percentage-based, for when not at an anchor) */
  homePosition?: { xPct: number; yPct: number };
  /** Callback when avatar finishes speaking */
  onSpeakEnd?: () => void;
  /** Callback when user drags avatar to new position */
  onDragEnd?: (xPct: number, yPct: number) => void;
  /** Whether dragging is disabled */
  dragDisabled?: boolean;
}

// Size configurations - significantly increased for better presence
const AVATAR_SIZES: Record<AvatarSize, { width: number; height: number }> = {
  small: { width: 120, height: 150 },
  medium: { width: 180, height: 225 },
  large: { width: 240, height: 300 },  // Default - ~3x original
  xl: { width: 320, height: 400 },      // Extra large for maximum presence
};

// ============================================
// Human Teacher SVG (bun, glasses, pointer stick, heels)
// ============================================

function HumanTeacherSVG({ 
  state, 
  isBlinking,
  walkPhase,
  idlePhase,
}: { 
  state: AvatarState; 
  isBlinking: boolean;
  walkPhase: number;
  idlePhase: number; // For sitting leg dangle / apple nibble
}) {
  // Colors
  const skinColor = "#FDBF6F";
  const hairColor = "#5D4037";
  const dressColor = "#7C3AED";
  const dressHighlight = "#A78BFA";
  const glassesColor = "#1F2937";
  const stickColor = "#92400E";
  const shoeColor = "#1F2937";
  const appleColor = "#EF4444";
  const appleLeaf = "#22C55E";
  
  // Walking animation transforms
  const legSwing = state === "walking" ? Math.sin(walkPhase * Math.PI / 2) * 12 : 0;
  const armSwing = state === "walking" ? Math.sin(walkPhase * Math.PI / 2) * 15 : 0;
  const bodyBob = state === "walking" ? Math.abs(Math.sin(walkPhase * Math.PI / 2)) * 3 : 0;
  
  // Sitting leg dangle animation
  const sittingLegDangle = state === "sitting" ? Math.sin(idlePhase * Math.PI / 30) * 5 : 0;
  
  // Idle bob for non-sitting states
  const idleBob = state === "idle" ? Math.sin(idlePhase * Math.PI / 60) * 2 : 0;
  
  // Eye dimensions for blinking
  const eyeHeight = isBlinking ? 1 : 6;
  
  // Celebrating arm raise
  const celebrateArm = state === "celebrating" ? -30 : 0;
  
  // Pointing animation
  const pointAngle = state === "pointing" ? -35 : 0;
  
  // Apple nibble (shows during idle every ~10-15 seconds for a few frames)
  const showApple = state === "idle" && idlePhase % 300 > 280;
  
  return (
    <svg
      viewBox="0 0 100 145"
      className="w-full h-full"
      style={{ 
        transform: `translateY(${-bodyBob - idleBob}px)`,
        transition: state === "walking" ? "none" : "transform 0.3s ease",
      }}
    >
      {/* Pointer stick (always visible, swings when walking/pointing) */}
      <g 
        style={{ 
          transform: `rotate(${state === "pointing" ? pointAngle : state === "walking" ? armSwing * 0.5 : 0}deg)`,
          transformOrigin: "72px 58px",
          transition: state === "walking" ? "none" : "transform 0.3s ease",
        }}
      >
        <line 
          x1="72" y1="58" 
          x2="98" y2="25" 
          stroke={stickColor} 
          strokeWidth="3.5" 
          strokeLinecap="round" 
        />
        {/* Pointer tip */}
        <circle cx="98" cy="25" r="5" fill="#F59E0B" />
        {state === "pointing" && (
          <circle cx="98" cy="25" r="8" fill="none" stroke="#F59E0B" strokeWidth="2" opacity="0.5">
            <animate attributeName="r" values="5;12;5" dur="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
      
      {/* Hair bun - bigger */}
      <circle cx="50" cy="16" r="15" fill={hairColor} />
      <circle cx="50" cy="25" r="11" fill={hairColor} />
      
      {/* Head - slightly larger */}
      <ellipse cx="50" cy="38" rx="20" ry="22" fill={skinColor} />
      
      {/* Hair bangs */}
      <path 
        d="M 30 30 Q 33 18 45 21 Q 50 16 55 21 Q 67 18 70 30" 
        fill={hairColor}
      />
      
      {/* Glasses frame - more prominent */}
      <g stroke={glassesColor} strokeWidth="2.5" fill="none">
        {/* Left lens */}
        <ellipse cx="41" cy="38" rx="9" ry="7" fill="rgba(200,220,255,0.3)" />
        {/* Right lens */}
        <ellipse cx="59" cy="38" rx="9" ry="7" fill="rgba(200,220,255,0.3)" />
        {/* Bridge */}
        <path d="M 50 38 Q 50 35 50 38" />
        {/* Arms */}
        <line x1="32" y1="38" x2="28" y2="35" />
        <line x1="68" y1="38" x2="72" y2="35" />
      </g>
      
      {/* Eyes (behind glasses) - bigger for friendly look */}
      <ellipse 
        cx="41" cy="38" 
        rx="4" ry={eyeHeight} 
        fill="#1F2937"
      >
        {state === "speaking" && (
          <animate attributeName="cx" values="41;42;40;41" dur="0.5s" repeatCount="indefinite" />
        )}
      </ellipse>
      <ellipse 
        cx="59" cy="38" 
        rx="4" ry={eyeHeight} 
        fill="#1F2937"
      >
        {state === "speaking" && (
          <animate attributeName="cx" values="59;60;58;59" dur="0.5s" repeatCount="indefinite" />
        )}
      </ellipse>
      
      {/* Eye sparkles */}
      {!isBlinking && (
        <>
          <circle cx="39" cy="36" r="2" fill="white" opacity="0.9" />
          <circle cx="57" cy="36" r="2" fill="white" opacity="0.9" />
        </>
      )}
      
      {/* Rosy cheeks */}
      <ellipse cx="32" cy="45" rx="5" ry="3" fill="#FECACA" opacity="0.6" />
      <ellipse cx="68" cy="45" rx="5" ry="3" fill="#FECACA" opacity="0.6" />
      
      {/* Smile */}
      <path 
        d={state === "celebrating" 
          ? "M 42 50 Q 50 58 58 50" // Big smile
          : state === "speaking"
          ? "M 44 50 Q 50 53 56 50" // Talking mouth
          : "M 44 50 Q 50 55 56 50" // Normal smile
        }
        stroke="#D97706" 
        strokeWidth="2.5" 
        fill={state === "speaking" ? "#FEF3C7" : "none"}
        strokeLinecap="round"
      />
      
      {/* Neck */}
      <rect x="45" y="58" width="10" height="7" fill={skinColor} />
      
      {/* Body/Dress - fuller */}
      <path 
        d="M 28 65 L 32 122 L 68 122 L 72 65 Q 50 60 28 65"
        fill={dressColor}
      />
      
      {/* Dress collar/detail */}
      <path 
        d="M 38 65 Q 50 72 62 65"
        stroke={dressHighlight}
        strokeWidth="4"
        fill="none"
      />
      
      {/* Apple (during nibble animation) */}
      {showApple && (
        <g>
          <circle cx="26" cy="80" r="7" fill={appleColor} />
          <ellipse cx="26" cy="74" rx="2" ry="3" fill={appleLeaf} />
          <line x1="26" y1="74" x2="26" y2="71" stroke="#92400E" strokeWidth="1.5" />
        </g>
      )}
      
      {/* Left arm */}
      <g 
        style={{ 
          transform: `rotate(${state === "celebrating" ? celebrateArm : state === "walking" ? armSwing : showApple ? 15 : 0}deg)`,
          transformOrigin: "33px 68px",
          transition: state === "walking" ? "none" : "transform 0.3s ease",
        }}
      >
        <path 
          d={showApple ? "M 33 68 Q 22 75 26 83" : "M 33 68 Q 22 80 26 90"}
          stroke={skinColor}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        {/* Hand */}
        <circle cx={showApple ? "26" : "26"} cy={showApple ? "83" : "90"} r="6" fill={skinColor} />
      </g>
      
      {/* Right arm (holds pointer stick) */}
      <g
        style={{ 
          transform: `rotate(${state === "walking" ? -armSwing : state === "celebrating" ? celebrateArm : 0}deg)`,
          transformOrigin: "67px 68px",
          transition: state === "walking" ? "none" : "transform 0.3s ease",
        }}
      >
        <path 
          d="M 67 68 Q 78 55 72 58"
          stroke={skinColor}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        {/* Hand */}
        <circle cx="72" cy="58" r="6" fill={skinColor} />
      </g>
      
      {/* Legs - for standing/walking */}
      {state !== "sitting" && (
        <g>
          {/* Left leg */}
          <g
            style={{ 
              transform: `rotate(${legSwing}deg)`,
              transformOrigin: "42px 120px",
              transition: state === "walking" ? "none" : "transform 0.3s ease",
            }}
          >
            <rect x="37" y="120" width="10" height="16" fill={skinColor} rx="2" />
            {/* Left shoe */}
            <ellipse cx="42" cy="138" rx="8" ry="5" fill={shoeColor} />
            {/* Heel */}
            <rect x="35" y="136" width="5" height="8" rx="1" fill={shoeColor} />
          </g>
          
          {/* Right leg */}
          <g
            style={{ 
              transform: `rotate(${-legSwing}deg)`,
              transformOrigin: "58px 120px",
              transition: state === "walking" ? "none" : "transform 0.3s ease",
            }}
          >
            <rect x="53" y="120" width="10" height="16" fill={skinColor} rx="2" />
            {/* Right shoe */}
            <ellipse cx="58" cy="138" rx="8" ry="5" fill={shoeColor} />
            {/* Heel */}
            <rect x="60" y="136" width="5" height="8" rx="1" fill={shoeColor} />
          </g>
        </g>
      )}
      
      {/* Sitting pose: dangling legs with animation */}
      {state === "sitting" && (
        <g>
          {/* Left leg - dangling */}
          <g
            style={{ 
              transform: `rotate(${sittingLegDangle}deg)`,
              transformOrigin: "42px 122px",
            }}
          >
            <rect x="37" y="122" width="10" height="20" fill={skinColor} rx="2" />
            <ellipse cx="42" cy="144" rx="8" ry="5" fill={shoeColor} />
            <rect x="35" y="142" width="5" height="8" rx="1" fill={shoeColor} />
          </g>
          
          {/* Right leg - dangling (opposite phase) */}
          <g
            style={{ 
              transform: `rotate(${-sittingLegDangle}deg)`,
              transformOrigin: "58px 122px",
            }}
          >
            <rect x="53" y="122" width="10" height="20" fill={skinColor} rx="2" />
            <ellipse cx="58" cy="144" rx="8" ry="5" fill={shoeColor} />
            <rect x="60" y="142" width="5" height="8" rx="1" fill={shoeColor} />
          </g>
        </g>
      )}
      
      {/* Celebrating sparkles */}
      {state === "celebrating" && (
        <>
          <circle cx="20" cy="28" r="4" fill="#FCD34D">
            <animate attributeName="opacity" values="1;0;1" dur="0.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="80" cy="22" r="3" fill="#FCD34D">
            <animate attributeName="opacity" values="0;1;0" dur="0.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="85" cy="45" r="3.5" fill="#FCD34D">
            <animate attributeName="opacity" values="1;0;1" dur="0.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="15" cy="50" r="2.5" fill="#FCD34D">
            <animate attributeName="opacity" values="0;1;0" dur="0.6s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}

// ============================================
// Legacy Owl Teacher SVG (for users who prefer it)
// ============================================

function OwlTeacherSVG({ 
  state, 
  isBlinking,
  walkPhase,
}: { 
  state: AvatarState; 
  isBlinking: boolean;
  walkPhase: number;
}) {
  const bodyColor = "#8B5CF6";
  const bellyColor = "#DDD6FE";
  const eyeColor = "#FFFFFF";
  const pupilColor = "#1F2937";
  const beakColor = "#F59E0B";
  const capColor = "#1F2937";
  const stickColor = "#92400E";
  
  const getBodyTransform = () => {
    switch (state) {
      case "celebrating":
        return "translateY(-3px)";
      case "walking":
        return `translateX(${Math.sin(walkPhase * Math.PI / 2) * 3}px)`;
      default:
        return "translateY(0)";
    }
  };
  
  const eyeHeight = isBlinking ? 2 : 14;
  const eyeY = isBlinking ? 30 : 23;
  
  return (
    <svg
      viewBox="0 0 80 100"
      className="w-full h-full"
      style={{ transform: getBodyTransform(), transition: "transform 0.3s ease" }}
    >
      {/* Pointer stick */}
      {(state === "pointing" || state === "walking") && (
        <g className={state === "pointing" ? "animate-point" : ""}>
          <line x1="65" y1="50" x2="95" y2="25" stroke={stickColor} strokeWidth="3" strokeLinecap="round" />
          <circle cx="95" cy="25" r="4" fill={beakColor} />
        </g>
      )}
      
      {/* Body */}
      <ellipse cx="40" cy="55" rx="30" ry="35" fill={bodyColor} />
      
      {/* Belly */}
      <ellipse cx="40" cy="60" rx="20" ry="25" fill={bellyColor} />
      
      {/* Left wing */}
      <ellipse 
        cx="16" 
        cy="55" 
        rx="12" 
        ry="20" 
        fill={bodyColor}
        className={state === "celebrating" ? "animate-wave-left" : ""}
      />
      
      {/* Right wing */}
      <ellipse 
        cx="64" 
        cy="55" 
        rx="12" 
        ry="20" 
        fill={bodyColor}
        className={state === "celebrating" ? "animate-wave-right" : ""}
      />
      
      {/* Feet */}
      {state === "sitting" && (
        <>
          <ellipse cx="30" cy="92" rx="7" ry="5" fill={beakColor} />
          <ellipse cx="50" cy="92" rx="7" ry="5" fill={beakColor} />
        </>
      )}
      
      {/* Face - eye backgrounds */}
      <circle cx="27" cy="30" r="16" fill={eyeColor} />
      <circle cx="53" cy="30" r="16" fill={eyeColor} />
      
      {/* Pupils */}
      <ellipse cx="29" cy={eyeY} rx="7" ry={eyeHeight / 2} fill={pupilColor}>
        {state === "speaking" && (
          <animate attributeName="cx" values="29;31;27;29" dur="0.5s" repeatCount="indefinite" />
        )}
      </ellipse>
      <ellipse cx="55" cy={eyeY} rx="7" ry={eyeHeight / 2} fill={pupilColor}>
        {state === "speaking" && (
          <animate attributeName="cx" values="55;57;53;55" dur="0.5s" repeatCount="indefinite" />
        )}
      </ellipse>
      
      {/* Sparkle in eyes */}
      <circle cx="25" cy="26" r="3" fill="#FFFFFF" opacity="0.9" />
      <circle cx="51" cy="26" r="3" fill="#FFFFFF" opacity="0.9" />
      
      {/* Beak */}
      <path 
        d="M 36 42 L 40 54 L 44 42 Z" 
        fill={beakColor}
        className={state === "speaking" ? "animate-beak" : ""}
      />
      
      {/* Graduation cap */}
      <g>
        <path d="M 12 18 L 40 6 L 68 18 L 40 30 Z" fill={capColor} />
        <rect x="34" y="0" width="12" height="12" fill={capColor} />
        <line x1="62" y1="18" x2="74" y2="28" stroke="#F59E0B" strokeWidth="2.5" />
        <circle cx="74" cy="30" r="4" fill="#F59E0B" />
      </g>
      
      {/* Eyebrows */}
      {state === "celebrating" && (
        <>
          <path d="M 16 16 Q 27 12 38 16" stroke={capColor} strokeWidth="2.5" fill="none" />
          <path d="M 42 16 Q 53 12 64 16" stroke={capColor} strokeWidth="2.5" fill="none" />
        </>
      )}
    </svg>
  );
}

// ============================================
// Speech Bubble Component
// ============================================

function SpeechBubble({ text, onClose }: { text: string; onClose?: () => void }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 animate-fade-in">
      <div className="bg-white rounded-xl px-4 py-3 shadow-lg border-2 border-purple-300 max-w-[260px] relative">
        <p className="text-sm text-gray-700 leading-snug">{text}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 w-6 h-6 bg-purple-500 text-white rounded-full text-sm flex items-center justify-center hover:bg-purple-600 transition-colors"
          >
            ×
          </button>
        )}
        {/* Bubble tail */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[-1px] w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent border-t-purple-300" />
      </div>
    </div>
  );
}

// ============================================
// Main Teacher Avatar Component
// ============================================

// Drag threshold in pixels (prevent accidental drags)
const DRAG_THRESHOLD = 8;

export function TeacherAvatar(props: TeacherAvatarProps) {
  const { settings } = useDelight();

  // Only render the hook-heavy component when enabled.
  // This avoids "hooks called conditionally" build errors.
  if (!settings.avatarEnabled) return null;

  return <TeacherAvatarInner {...props} />;
}

function TeacherAvatarInner({
  state: propState,
  bubbleText,
  showBubble: propShowBubble,
  position,
  homePosition,
  onSpeakEnd,
  onDragEnd,
  dragDisabled,
}: TeacherAvatarProps) {
  const { settings } = useDelight();
  const { isPlaying } = useTTS();
  
  const [internalState, setInternalState] = useState<AvatarState>("idle");
  const [isBlinking, setIsBlinking] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [currentBubbleText, setCurrentBubbleText] = useState("");
  const [walkPhase, setWalkPhase] = useState(0);
  const [idlePhase, setIdlePhase] = useState(0);
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const walkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const footstepsStopRef = useRef<(() => void) | null>(null);
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragCurrentPos, setDragCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Use prop state or internal state
  const currentState = propState || internalState;
  
  // Get avatar size from settings
  const avatarSize = AVATAR_SIZES[settings.avatarSize];
  
  // Drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (dragDisabled || propState === "walking") return;
    
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStartPos({ x: e.clientX, y: e.clientY });
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    hasDraggedRef.current = false;
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartPos || dragDisabled) return;
    
    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Only start dragging after threshold
    if (!isDragging && distance > DRAG_THRESHOLD) {
      setIsDragging(true);
      hasDraggedRef.current = true;
    }
    
    if (isDragging || distance > DRAG_THRESHOLD) {
      // Calculate new position (keeping avatar on screen)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;
      
      // Clamp to viewport bounds
      newX = Math.max(0, Math.min(viewportWidth - avatarSize.width, newX));
      newY = Math.max(0, Math.min(viewportHeight - avatarSize.height, newY));
      
      setDragCurrentPos({ x: newX, y: newY });
    }
  };
  
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartPos && isDragging && dragCurrentPos) {
      // Calculate percentage position and save
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Convert to percentage from left and bottom
      const centerX = dragCurrentPos.x + avatarSize.width / 2;
      const xPct = (centerX / viewportWidth) * 100;
      const bottomY = viewportHeight - dragCurrentPos.y - avatarSize.height;
      const yPct = (bottomY / viewportHeight) * 100;
      
      onDragEnd?.(
        Math.max(5, Math.min(95, xPct)),
        Math.max(5, Math.min(95, yPct))
      );
    }
    
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    
    setDragStartPos(null);
    setIsDragging(false);
    setDragCurrentPos(null);
  };
  
  const handlePointerCancel = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    
    setDragStartPos(null);
    setIsDragging(false);
    setDragCurrentPos(null);
  };
  
  // Blinking animation
  useEffect(() => {
    const startBlinking = () => {
      blinkIntervalRef.current = setInterval(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }, 2500 + Math.random() * 2000);
    };
    
    startBlinking();
    
    return () => {
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
    };
  }, []);
  
  // Idle animation (for sitting leg dangle and apple nibble)
  useEffect(() => {
    idleIntervalRef.current = setInterval(() => {
      setIdlePhase(prev => (prev + 1) % 600);
    }, 50);
    
    return () => {
      if (idleIntervalRef.current) {
        clearInterval(idleIntervalRef.current);
      }
    };
  }, []);
  
  // Walking animation and footsteps
  useEffect(() => {
    if (currentState === "walking") {
      // Start walk animation
      walkIntervalRef.current = setInterval(() => {
        setWalkPhase(prev => (prev + 1) % 4);
      }, 180);
      
      // Play footsteps if sound is enabled
      if (settings.soundEnabled) {
        footstepsStopRef.current = playHeelFootsteps(10, 180);
      }
      
      return () => {
        if (walkIntervalRef.current) {
          clearInterval(walkIntervalRef.current);
        }
        if (footstepsStopRef.current) {
          footstepsStopRef.current();
        }
      };
    } else {
      setWalkPhase(0);
    }
  }, [currentState, settings.soundEnabled]);
  
  // Handle bubble text from props
  useEffect(() => {
    if (bubbleText) {
      setCurrentBubbleText(bubbleText);
      setShowBubble(true);
    }
  }, [bubbleText]);
  
  // Handle showBubble from props
  useEffect(() => {
    if (propShowBubble !== undefined) {
      setShowBubble(propShowBubble);
    }
  }, [propShowBubble]);
  
  // Handle speaking end
  useEffect(() => {
    if (!isPlaying && currentState === "speaking") {
      onSpeakEnd?.();
    }
  }, [isPlaying, currentState, onSpeakEnd]);
  
  const closeBubble = () => {
    setShowBubble(false);
  };
  
  // Compute position styles
  const getPositionStyles = (): React.CSSProperties => {
    // If currently dragging, use drag position
    if (isDragging && dragCurrentPos) {
      return {
        position: "fixed",
        left: dragCurrentPos.x,
        top: dragCurrentPos.y,
        transition: "none",
      };
    }
    
    // If position prop is set (walking to anchor), use that
    if (position) {
      return {
        position: "fixed",
        left: position.x,
        bottom: position.y,
        transition: "left 0.8s ease-out, bottom 0.8s ease-out",
      };
    }
    
    // Use home position if available
    if (homePosition) {
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
      
      // Convert percentage to pixels
      const centerX = (homePosition.xPct / 100) * viewportWidth;
      const leftX = centerX - avatarSize.width / 2;
      const bottomY = (homePosition.yPct / 100) * viewportHeight;
      
      return {
        position: "fixed",
        left: Math.max(0, Math.min(viewportWidth - avatarSize.width, leftX)),
        bottom: Math.max(20, bottomY),
        transition: "left 0.5s ease-out, bottom 0.5s ease-out",
      };
    }
    
    // Default: bottom-right corner
    return {
      position: "fixed",
      right: 24,
      bottom: 24,
    };
  };
  
  return (
    <div
      ref={containerRef}
      className={`z-50 ${isDragging ? "cursor-grabbing" : ""}`}
      style={getPositionStyles()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Speech bubble */}
      {showBubble && currentBubbleText && (
        <SpeechBubble text={currentBubbleText} onClose={closeBubble} />
      )}
      
      {/* Avatar container */}
      <div 
        style={{ 
          width: avatarSize.width, 
          height: avatarSize.height,
          opacity: isDragging ? 0.85 : 1,
          transition: isDragging ? "none" : "opacity 0.2s ease",
        }}
        className={`${isDragging ? "cursor-grabbing" : dragDisabled ? "cursor-default" : "cursor-grab"} ${
          !isDragging ? "transition-transform hover:scale-105" : ""
        } ${
          currentState === "idle" && settings.avatarStyle === "owl" ? "animate-bob" : ""
        } ${
          currentState === "celebrating" ? "animate-bounce" : ""
        }`}
      >
        {settings.avatarStyle === "owl" ? (
          <OwlTeacherSVG 
            state={currentState} 
            isBlinking={isBlinking} 
            walkPhase={walkPhase}
          />
        ) : (
          <HumanTeacherSVG 
            state={currentState} 
            isBlinking={isBlinking} 
            walkPhase={walkPhase}
            idlePhase={idlePhase}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Export for AvatarProvider
// ============================================

export { AVATAR_SIZES };
