import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDaemon } from "../src/daemon";
import { resetDb } from "./helpers";

describe("memory-pg-daemon HTTP", () => {
  let server: ReturnType<typeof startDaemon>;
  let baseUrl: string;

  beforeAll(async () => {
    await resetDb();
    server = startDaemon(0); // port 0 = 空いているポートを自動割当
    baseUrl = `http://${server.hostname}:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("GET /health が200を返す", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("POST /remember → POST /recall で意味検索できる", async () => {
    const rememberRes = await fetch(`${baseUrl}/remember`, {
      method: "POST",
      body: JSON.stringify({ content: "HTTP Daemon経由でrememberを呼んだテスト。" }),
    });
    expect(rememberRes.status).toBe(200);
    const { result: memory } = (await rememberRes.json()) as { result: { id: string; content: string } };
    expect(memory.content).toContain("HTTP Daemon");

    const recallRes = await fetch(`${baseUrl}/recall`, {
      method: "POST",
      body: JSON.stringify({ context: "HTTP経由での記憶保存について", nResults: 3 }),
    });
    expect(recallRes.status).toBe(200);
    const { result: results } = (await recallRes.json()) as { result: { memory: { id: string } }[] };
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.memory.id).toBe(memory.id);
  });

  test("未知のツール名は404を返す", async () => {
    const res = await fetch(`${baseUrl}/no_such_tool`, { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
  });

  test("不正なJSONは400を返す", async () => {
    const res = await fetch(`${baseUrl}/remember`, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
  });

  test("スキーマ違反(必須フィールド欠落)は400を返しエラー詳細を含む", async () => {
    const res = await fetch(`${baseUrl}/remember`, { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe("invalid request body");
    expect(body.details.length).toBeGreaterThan(0);
  });

  test("スキーマ違反(型違い)は400を返す", async () => {
    const res = await fetch(`${baseUrl}/recall`, {
      method: "POST",
      body: JSON.stringify({ context: "ok", nResults: "three" }),
    });
    expect(res.status).toBe(400);
  });

  test("ハンドラ内エラーはメッセージを漏らさず500を返す", async () => {
    // 存在しないIDへのlink_memoriesはFK制約違反でDBエラーになる。
    // クライアントへはDBのエラー文言ではなく汎用メッセージのみ返る想定
    const res = await fetch(`${baseUrl}/link_memories`, {
      method: "POST",
      body: JSON.stringify({ sourceId: "00000000-0000-0000-0000-000000000000", targetId: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("internal error");
  });

  test("GET以外・不明パスへのGETは405", async () => {
    const res = await fetch(`${baseUrl}/remember`, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
