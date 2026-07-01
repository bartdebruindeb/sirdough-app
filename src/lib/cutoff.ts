import { bakeryConfig } from "@/config/bakery.config";

// Cutoff = orderCutoffHour Amsterdam time on the day BEFORE the given date (DST-safe)
export function cutoffDate(dateStr: string): Date {
  const prev = new Date(dateStr + "T12:00:00Z");
  prev.setUTCDate(prev.getUTCDate() - 1);
  const fmt = (tz: string) => parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(prev));
  const offsetHours = fmt("Europe/Amsterdam") - fmt("UTC");
  const d = new Date(prev);
  d.setUTCHours(bakeryConfig.orderCutoffHour - offsetHours, 0, 0, 0);
  return d;
}

export function isCutoffPassed(dateStr: string): boolean {
  return new Date() >= cutoffDate(dateStr);
}
