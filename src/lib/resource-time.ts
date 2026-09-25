import { RESOURCE_POSITION_MAX_SECONDS } from "./resource-types.ts";

export function formatResourceTime(seconds: number) {
  const total = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

export function parseResourceTime(text: string): number | null {
  const parts = text.trim().split(":");
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !/^\d{1,4}$/.test(part))
  )
    return null;
  const numbers = parts.map(Number);
  if (numbers.at(-1)! > 59 || (numbers.length === 3 && numbers[1]! > 59))
    return null;
  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  return seconds <= RESOURCE_POSITION_MAX_SECONDS ? seconds : null;
}
