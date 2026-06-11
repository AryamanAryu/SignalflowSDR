import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merges Tailwind class names safely (used by all shadcn/ui components).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
