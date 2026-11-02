import React, { useState, useEffect } from 'react';
import { ToastType, ToastItem } from '../types';

type ToastListener = (toasts: ToastItem[]) => void;

let toastsState: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach((listener) => listener([...toastsState]));
}

export function showToast(message: string, type: ToastType = 'success', duration = 3000): void {
  const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const newItem: ToastItem = { id, message, type, duration };
  toastsState = [...toastsState, newItem];
  notify();

  setTimeout(() => {
    toastsState = toastsState.filter((t) => t.id !== id);
    notify();
  }, duration);
}

const bgColors: Record<ToastType, string> = {
  success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100',
  info: 'bg-sky-900/90 border-sky-500/50 text-sky-100',
  error: 'bg-rose-900/90 border-rose-500/50 text-rose-100',
};

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>(toastsState);

  useEffect(() => {
    const handler: ToastListener = (updated) => setToasts(updated);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 pointer-events-auto max-w-full sm:max-w-md w-full sm:w-auto text-sm font-medium ${bgColors[toast.type]} transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-2`}
        >
          {toastIcons[toast.type]}
          <span className="flex-1">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
