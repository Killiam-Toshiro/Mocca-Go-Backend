/** Escapa los comodines de LIKE para que `%`, `_` y `\` se busquen como texto. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
