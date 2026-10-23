"use client";
import { useEffect, useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type"> & {
  value: number;
  onChange: (n: number) => void;
  /** Lowest allowed value. Default 0 — quantities and percentages never go negative. */
  min?: number;
  max?: number;
  /** Whole numbers only. */
  int?: boolean;
};

/**
 * Number field for quantities and percentages.
 *
 * - No stuck leading zero: with a plain <input type="number" value={number}> typing 8 into a
 *   field showing 0 leaves "08", because React skips the DOM update when the new number equals
 *   the old one numerically. This keeps the typed text itself and strips the zero.
 * - Can be emptied while typing (counts as 0).
 * - Can't go below `min` (default 0) — not by typing, pasting or the spinner arrows.
 */
export function NumInput({ value, onChange, min = 0, max, int, onBlur, onKeyDown, ...rest }: Props) {
  const [text, setText] = useState(String(value));

  // Re-sync only when the parent changed the value to something the text doesn't already mean.
  useEffect(() => {
    if ((parseFloat(text) || 0) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));

  return (
    <input
      {...rest}
      type="number"
      inputMode={int ? "numeric" : "decimal"}
      min={min}
      max={max}
      value={text}
      onKeyDown={e => {
        if (["e", "E", "+"].includes(e.key) || (min >= 0 && e.key === "-")) e.preventDefault();
        onKeyDown?.(e);
      }}
      onChange={e => {
        // Half-typed input ("0.", "1e") reads as "" — leave what the user is typing alone.
        if (e.target.validity.badInput) return;
        let raw = e.target.value;
        if (min >= 0) raw = raw.replace(/-/g, "");
        if (int) raw = raw.replace(/[.,].*$/, "");
        raw = raw.replace(/^0+(?=\d)/, "");
        const n = raw === "" ? 0 : parseFloat(raw);
        if (Number.isNaN(n)) { setText(raw); return; }
        const c = max !== undefined && n > max ? max : n;
        setText(c !== n ? String(c) : raw);
        onChange(c < min ? min : c);
      }}
      onBlur={e => {
        const n = clamp(parseFloat(text) || 0);
        setText(String(n));
        if (n !== value) onChange(n);
        onBlur?.(e);
      }}
    />
  );
}
