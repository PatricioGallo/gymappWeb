export function formatRepe(repe: number, repeMax?: number | null): string {
  return repeMax && repeMax > repe ? `${repe}-${repeMax}` : `${repe}`;
}
