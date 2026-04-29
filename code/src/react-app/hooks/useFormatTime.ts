import { useLanguage } from "../contexts/LanguageContext";
import { useCallback } from "react";

/**
 * Format time using the agoFormat pattern
 * Pattern supports: {n} for number, {unit} for time unit
 * Example: "{n} {unit} ago" (English) or "il y a {n} {unit}" (French)
 */
function formatWithPattern(n: number, unit: string, format: string): string {
  return format.replace('{n}', String(n)).replace('{unit}', unit);
}

/**
 * Hook for formatting time ago with translations
 */
export function useFormatTimeAgo() {
  const { t } = useLanguage();

  const formatTimeAgo = useCallback((dateString: string | null | undefined): string => {
    if (!dateString) return t.time.recently || "recently";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return t.time.recently || "recently";
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 0) return t.time.recently || "recently"; // Future dates
    
    // Default format for backwards compatibility
    const format = t.time.agoFormat || `{n} {unit} ${t.time.ago}`;
    
    if (seconds < 60) return t.time.now;
    
    const minutes = Math.floor(seconds / 60);
    if (seconds < 3600) {
      const unit = minutes === 1 ? t.time.minute : t.time.minutes;
      return formatWithPattern(minutes, unit, format);
    }
    
    const hours = Math.floor(seconds / 3600);
    if (seconds < 86400) {
      const unit = hours === 1 ? t.time.hour : t.time.hours;
      return formatWithPattern(hours, unit, format);
    }
    
    const days = Math.floor(seconds / 86400);
    if (seconds < 604800) {
      const unit = days === 1 ? t.time.day : t.time.days;
      return formatWithPattern(days, unit, format);
    }
    
    const weeks = Math.floor(seconds / 604800);
    if (seconds < 2592000) {
      const unit = weeks === 1 ? t.time.week : t.time.weeks;
      return formatWithPattern(weeks, unit, format);
    }
    
    const months = Math.floor(seconds / 2592000);
    if (seconds < 31536000) {
      const unit = months === 1 ? t.time.month : t.time.months;
      return formatWithPattern(months, unit, format);
    }
    
    const years = Math.floor(seconds / 31536000);
    const unit = years === 1 ? t.time.year : t.time.years;
    return formatWithPattern(years, unit, format);
  }, [t]);

  return formatTimeAgo;
}
