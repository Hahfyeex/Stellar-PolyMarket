"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, useSpring, useTransform, animate } from "framer-motion";

interface Props {
  value: number; // Percentage (0-100)
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-lg font-semibold",
  lg: "text-2xl font-bold",
};

/**
 * OddsTicker component that animates odds changes with directional color flash.
 * Flash: Green for increase, Red for decrease.
 * Fades out cleanly after 600ms.
 * Max one animation per 500ms (debounced).
 */
export default function OddsTicker({ value, size = "md", className = "" }: Props) {
  const [flashColor, setFlashColor] = useState<"green" | "red" | null>(null);
  const prevValueRef = useRef(value);
  const lastAnimationTimeRef = useRef(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Framer motion spring for the numerical counter
  const springValue = useSpring(value, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const displayValue = useTransform(springValue, (latest) => latest.toFixed(0));

  useEffect(() => {
    const now = Date.now();
    const timeSinceLast = now - lastAnimationTimeRef.current;
    const cooldown = 500;

    const triggerAnimation = (newVal: number) => {
      const prevVal = prevValueRef.current;
      if (newVal === prevVal) return;

      // Determine direction
      const direction = newVal > prevVal ? "green" : "red";
      setFlashColor(direction);
      
      // Animate the spring to the new target value
      springValue.set(newVal);
      
      prevValueRef.current = newVal;
      lastAnimationTimeRef.current = Date.now();

      // Clear flash after 600ms
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        setFlashColor(null);
      }, 600);
    };

    if (timeSinceLast >= cooldown) {
      triggerAnimation(value);
    } else {
      // Debounce: schedule for later if still within cooldown
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        triggerAnimation(value);
      }, cooldown - timeSinceLast);
    }

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [value, springValue]);

  // Determine classes for color flash
  let colorClass = "text-white";
  if (flashColor === "green") colorClass = "text-green-400";
  if (flashColor === "red") colorClass = "text-red-400";

  return (
    <div className={`inline-flex items-center tabular-nums gap-1 ${SIZE_CLASSES[size]} ${className}`}>
      <div 
        className={`transition-colors duration-600 ease-out ${colorClass}`}
        style={{ 
          textShadow: flashColor ? `0 0 8px ${flashColor === 'green' ? '#4ade80' : '#f87171'}` : 'none',
          transitionProperty: 'color, text-shadow'
        }}
      >
        <motion.span>{displayValue}</motion.span>%
      </div>
      
      {/* Visual cue indicator arrows (optional but enhances UIUX) */}
      {flashColor && (
        <motion.span
          initial={{ opacity: 0, scale: 0.5, y: flashColor === "green" ? 5 : -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={flashColor === "green" ? "text-green-400" : "text-red-400"}
        >
          {flashColor === "green" ? "↑" : "↓"}
        </motion.span>
      )}
    </div>
  );
}
