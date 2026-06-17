"use client";
import { useState, useCallback } from "react";

export function useUndoStack<T>(initial: T, maxHistory = 5) {
  const [state, setState] = useState<{ current: T; history: T[] }>({ current: initial, history: [] });

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState(s => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(s.current) : next;
      return { current: resolved, history: [s.current, ...s.history].slice(0, maxHistory) };
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    setState(s => {
      if (s.history.length === 0) return s;
      const [prev, ...rest] = s.history;
      return { current: prev, history: rest };
    });
  }, []);

  return [state.current, set, undo, state.history.length > 0] as const;
}
