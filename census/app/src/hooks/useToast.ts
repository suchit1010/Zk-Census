import { useState, useCallback } from 'react';
import type { ToastType, ToastProps } from '@/components/Toast';

interface ToastInput {
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const showToast = useCallback((input: ToastInput) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastProps = {
      id,
      ...input,
      onClose: (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
    };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const success = useCallback(
    (message: string, description?: string) => {
      return showToast({ type: 'success', message, description });
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, description?: string) => {
      return showToast({ type: 'error', message, description, duration: 7000 });
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, description?: string) => {
      return showToast({ type: 'info', message, description });
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, description?: string) => {
      return showToast({ type: 'warning', message, description });
    },
    [showToast]
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showToast,
    success,
    error,
    info,
    warning,
    dismiss,
    dismissAll,
  };
}
