import { sql } from "../src/db";

// テストDBを空にする。tmp/postgres-schema-verify/ の検証専用コンテナが前提。
// 本番記憶データは Supabase 等のリモートホストを指す設計（設計判断2）のため、
// localhost/127.0.0.1 以外を指している場合は誤爆防止のため実行を拒否する。
export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(`resetDb: DATABASE_URL がローカル検証用に見えません: ${url || "(未設定)"}`);
  }
  await sql`TRUNCATE memories, episodes CASCADE`;
}
