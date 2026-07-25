/** Normaliza un nombre: sin tildes, mayúsculas, sin espacios dobles. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar diacríticos
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * Distancia Levenshtein para fuzzy matching de nombres (por typos).
 * O(n·m) — está bien porque los nombres son cortos y solo se usa como fallback.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Devuelve el nombre más cercano en `candidates` si hay UN solo match cercano
 * (distancia normalizada <= 0.1), si no `null`.
 */
export function findFuzzyMatch(target: string, candidates: string[]): string | null {
  const scored = candidates
    .map(c => ({ c, dist: levenshtein(target, c) / Math.max(target.length, c.length) }))
    .filter(x => x.dist <= 0.1)
    .sort((a, b) => a.dist - b.dist);
  if (scored.length === 0) return null;
  // Solo aceptar si el segundo mejor está claramente más lejos
  if (scored.length >= 2 && scored[1].dist - scored[0].dist < 0.02) return null;
  return scored[0].c;
}

/** Descarga un Blob como archivo. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
