# 検証用Dockerコンテナを使い回すテストのDB分離

## わかったこと

- スキーマ検証・実装検証用に立てた Docker コンテナ（例: `tmp/postgres-schema-verify/`）は PC を再起動しない限り生き続け、複数セッション・複数回の `bun test` / `pytest` 実行にまたがってデータが蓄積する
- テストコード側に明示的なリセットがないと、「前回パスしたテストが別セッションで非決定的に失敗する」形の劣化が起きる。特に embedding 距離順で上位N件を取る意味検索テストは、蓄積したデータの中に偶然近い記憶が増えるほど壊れやすい
- 症状は「コードは変えていないのにテストが落ちる」「ローカルでは通るが別セッションでは落ちる」という形で現れ、実装のバグと誤認しやすい

## やり方 / 使い方

- テストファイル（またはグローバルセットアップ）の **トップレベル** に `beforeAll(resetDb)` を置き、対象テーブルを `TRUNCATE ... CASCADE` する
  - `describe` ブロックの中に置くと、同じファイルに複数の `describe` がある場合、部分実行（`bun test -t "..."`）やテスト順序次第でリセット漏れが起きる。ファイル冒頭のトップレベルに書くのが堅牢
  - 同一ファイル内のテスト間でデータを使い回す設計（test1 で作った記憶を test3 が読む、等）を壊さないために、`beforeEach` ではなく `beforeAll` を選ぶ（ファイルごとに1回だけリセット）
- `resetDb()` 自体に **DATABASE_URL が検証用ホスト（`localhost`/`127.0.0.1`）を指しているかのガード** を入れ、一致しなければ例外を投げて処理を止める。本番相当のリモートDB（Supabase等）を誤って指した状態でテストを実行しても記憶データを消さないための安全装置
  ```ts
  export async function resetDb(): Promise<void> {
    const url = process.env.DATABASE_URL ?? "";
    if (!/^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)[:/]/.test(url)) {
      throw new Error(`resetDb: DATABASE_URL がローカル検証用に見えません: ${url || "(未設定)"}`);
    }
    await sql`TRUNCATE memories, episodes CASCADE`;
  }
  ```
- 接続情報を `.env` に置かず、シェルの `export DATABASE_URL=...` で都度渡す運用のプロジェクトもある。次セッションで `password authentication failed` に遭遇したら、まず「DATABASE_URL が設定されているか」を疑い、`docker ps` / `docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}'` でコンテナの実際の `POSTGRES_PASSWORD` とポートマッピングを確認してから組み立て直す

## 気をつけること

- `TRUNCATE` の対象テーブルは FK の `ON DELETE CASCADE` が張られているものは連鎖して空になるが、`schema_versions` のようなマイグレーション履歴テーブルは対象に含めない（テストデータではないため）
- ガードの正規表現は「ローカルらしきURLだけ許可」ではなく「本番らしきURLを拒否」ではない点に注意——ホスト名の判定ミスで許可漏れ・拒否漏れが起きないよう、実際に本番URL文字列を渡してみて拒否されることを一度確認してから使う

## 参照

- `.claude/mcps/memory-pg-daemon/tests/helpers.ts`
- 2026-07-15 コミット `fix(memory-pg-daemon): テスト分離バグを修正しrecall_divergent着手前の調査結果を記録`
