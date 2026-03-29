"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

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
 * Odds ticker with a short directional flash whenever the displayed value changes.
 * - Green flash for increase
 * - Red flash for decrease
 * - Updates are debounced to avoid jitter on rapid refreshes
 */
export default function OddsTicker({ value, size = "md", className = "" }: Props) {
  const [displayValue, setDisplayValue] = useState(value);
  const [flashColor, setFlashColor] = useState<"green" | "red" | null>(null);

  const prevValueRef = useRef(value);
  const lastAnimationTimeRef = useRef(0);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cooldownMs = 500;
    const now = Date.now();
    const timeSinceLast = now - lastAnimationTimeRef.current;

    const clearTimers = () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };

    const applyValue = (nextValue: number) => {
      const prevValue = prevValueRef.current;
      if (nextValue === prevValue) {
        setDisplayValue(nextValue);
        return;
      }

      setDisplayValue(nextValue);
      setFlashColor(nextValue > prevValue ? "green" : "red");
      prevValueRef.current = nextValue;
      lastAnimationTimeRef.current = Date.now();

      flashTimeoutRef.current = setTimeout(() => setFlashColor(null), 600);
    };

    if (timeSinceLast >= cooldownMs) {
      applyValue(value);
    } else {
      updateTimeoutRef.current = setTimeout(() => applyValue(value), cooldownMs - timeSinceLast);
    }

    return clearTimers;
  }, [value]);

  const colorClass =
    flashColor === "green" ? "text-green-400" : flashColor === "red" ? "text-red-400" : "text-white";

  return (
    <div className={`inline-flex items-center tabular-nums gap-1 ${SIZE_CLASSES[size]} ${className}`}>
      <motion.span
        className={`transition-colors duration-500 ease-out ${colorClass}`}
        style={{
          textShadow:
            flashColor === "green"
              ? "0 0 8px #4ade80"
              : flashColor === "red"
                ? "0 0 8px #f87171"
                : "none",
        }}
      >
        {displayValue.toFixed(0)}%
      </motion.span>
      {flashColor && (
        <motion.span className={flashColor === "green" ? "text-green-400" : "text-red-400"}>
          {flashColor === "green" ? "↑" : "↓"}
        </motion.span>
      )}
    </div>
  );
}
