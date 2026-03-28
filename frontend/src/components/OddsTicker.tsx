"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [displayValue, setDisplayValue] = useState(value);
  const [flashColor, setFlashColor] = useState<"green" | "red" | null>(null);
  const prevValueRef = useRef(value);
  const lastAnimationTimeRef = useRef(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      setDisplayValue(newVal);
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
  }, [value]);

  const flashClasses = flashColor === "green" 
    ? "text-green-400 transition-colors duration-200" 
    : flashColor === "red" 
    ? "text-red-400 transition-colors duration-200" 
    : "text-white transition-colors duration-600";

  return (
    <div className={`inline-flex items-center tabular-nums ${SIZE_CLASSES[size]} ${className}`}>
      <motion.span
        key={displayValue}
        initial={{ y: flashColor === "green" ? 10 : -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: flashColor === "green" ? -10 : 10, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={flashClasses}
      >
        {displayValue.toFixed(0)}%
      </motion.span>
    </div>
  );
}
