export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

export function tokenBarFill(
  pct: number,
  theme: { green?: string; yellow?: string; red?: string }
): string {
  if (pct < 0.5) return theme.green ?? '#7ee787'
  if (pct < 0.75) return theme.yellow ?? '#ffa657'
  return theme.red ?? '#ff7b72'
}
