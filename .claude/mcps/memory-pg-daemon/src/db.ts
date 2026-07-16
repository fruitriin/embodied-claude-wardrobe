import { sql } from "bun";

export { sql };

// Postgres配列リテラル({a,b,c}形式)を安全に組み立てる。
// bun:sql に text[] を渡すと単純カンマ結合になり malformed array literal になるため自前実装。
export function toTextArrayLiteral(arr: string[]): string {
  const escaped = arr.map((s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

export function parseTextArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  return [];
}
