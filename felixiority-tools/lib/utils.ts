import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...v: ClassValue[]) {
  return twMerge(clsx(v));
}
