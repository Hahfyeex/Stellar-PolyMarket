"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000); // 4 seconds auto-dismiss
  }, [removeToast]);

  const success = (message: string) => toast(message, "success");
  const error = (message: string) => toast(message, "error");
  const warning = (message: string) => toast(message, "warning");
  const info = (message: string) => toast(message, "info");

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className={`pointer-events-auto px-4 py-3 rounded-lg shadow-xl min-w-[300px] flex items-center gap-3 border ${
                t.type === "success" ? "bg-green-900/90 border-green-700 text-green-100" :
                t.type === "error" ? "bg-red-900/90 border-red-700 text-red-100" :
                t.type === "warning" ? "bg-yellow-900/90 border-yellow-700 text-yellow-100" :
                "bg-blue-900/90 border-blue-700 text-blue-100"
              }`}
            >
              <div className="flex-1 text-sm font-medium">{t.message}</div>
              <button onClick={() => removeToast(t.id)} className="opacity-60 hover:opacity-100">✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};
