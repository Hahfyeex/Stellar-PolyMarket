"use client";
/**
 * Toast — lightweight ephemeral notification.
 * Auto-dismisses after `duration` ms (default 3000).
 */
import { useEffect, useState } from "react";

interface Props {
  message: string;
  type?: "warning" | "error" | "success";
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({ message, type = "warning", duration = 3000, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // wait for fade-out
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  const colors = {
    warning: "bg-yellow-900/90 border-yellow-700 text-yellow-200",
    error: "bg-red-900/90 border-red-700 text-red-200",
    success: "bg-green-900/90 border-green-700 text-green-200",
  };

  return (
    <div
      data-testid="toast"
      role="alert"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-xl border text-sm font-medium shadow-lg
        transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
        ${colors[type]}`}
    >
      {message}
    </div>
  );
}
