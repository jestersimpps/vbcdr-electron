import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const SEMANTIC_TEXT_SIZES = ['text-micro', 'text-meta', 'text-body', 'text-emphasis', 'text-title']

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': SEMANTIC_TEXT_SIZES } }
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
