import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** CGPA → Percentage using CBSE formula: CGPA × 9.5 */
export function cgpaToPercentage(cgpa: number): number {
  return Math.min(100, parseFloat((cgpa * 9.5).toFixed(2)))
}

/** Validate: manual percentage must not exceed CGPA × 9.5 + 2 tolerance */
export function isPercentageValid(cgpa: number, percentage: number): boolean {
  return percentage <= cgpa * 9.5 + 2
}

export function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-500"
  if (score >= 50) return "text-yellow-500"
  return "text-red-500"
}

export function getScoreBg(score: number): string {
  if (score >= 75) return "bg-green-500"
  if (score >= 50) return "bg-yellow-500"
  return "bg-red-500"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}