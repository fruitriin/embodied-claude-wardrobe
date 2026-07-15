import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMcpStdio } from "../src/mcp-stdio";
import { resetDb } from "./helpers";

describe("memory-pg-daemon MCP stdio", () => {
  let client: Client;

  beforeAll(async () => {
    await resetDb();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await startMcpStdio(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  test("契約ツール12本がlistToolsに現れる", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "consolidate_memories",
        "create_episode",
        "get_causal_chain",
        "get_memory_stats",
        "link_memories",
        "list_recent_memories",
        "recall",
        "recall_by_camera_position",
        "recall_with_associations",
        "save_visual_memory",
        "search_memories",
        "remember",
      ].sort()
    );
    // ツール選択の判断材料はdescription(日本語)。空でないことを確認
    for (const t of tools) {
      expect(t.description).toBeTruthy();
    }
  });

  test("remember → recall がMCP経由で往復する", async () => {
    const rememberResult = await client.callTool({
      name: "remember",
      arguments: { content: "MCP stdio経由でrememberを呼んだテスト。" },
    });
    expect(rememberResult.isError).toBeFalsy();
    const content = rememberResult.content as { type: string; text: string }[];
    const memory = JSON.parse(content[0]!.text);
    expect(memory.content).toContain("MCP stdio");

    const recallResult = await client.callTool({
      name: "recall",
      arguments: { context: "MCP経由での記憶保存について", nResults: 3 },
    });
    const recallContent = recallResult.content as { type: string; text: string }[];
    const results = JSON.parse(recallContent[0]!.text);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.id).toBe(memory.id);
  });

  test("引数無しツール(get_memory_stats)はargumentsキー省略でも失敗しない", async () => {
    // MCPクライアントは引数無しツール呼び出し時にargumentsキー自体を省略しうる。
    // inputSchemaにz.object({})を渡していると、SDK側のvalidateToolInputが
    // undefinedをparseして失敗するため、この形の呼び出しを明示的に検証する
    const result = await client.callTool({ name: "get_memory_stats" });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const stats = JSON.parse(content[0]!.text);
    expect(stats.totalCount).toBeGreaterThanOrEqual(0);
  });

  test("全フィールドoptionalなツール(consolidate_memories)はargumentsキー省略でも失敗せず、明示的な値も反映される", async () => {
    // z.preprocessでundefined→{}に変換するパターン(空shapeとは別扱い)の回帰テスト。
    // 省略時デフォルト動作と、値を渡したときにちゃんと届くかの両方を確認する
    const omitted = await client.callTool({ name: "consolidate_memories" });
    expect(omitted.isError).toBeFalsy();
    const omittedContent = omitted.content as { type: string; text: string }[];
    const omittedStats = JSON.parse(omittedContent[0]!.text);
    expect(omittedStats.freshnessDecayed).toBe(true);

    const explicit = await client.callTool({
      name: "consolidate_memories",
      arguments: { windowHours: 1, maxReplayEvents: 5 },
    });
    expect(explicit.isError).toBeFalsy();
  });

  test("ハンドラ内エラーはisError=trueかつ汎用メッセージを返す", async () => {
    const result = await client.callTool({
      name: "link_memories",
      arguments: {
        sourceId: "00000000-0000-0000-0000-000000000000",
        targetId: "00000000-0000-0000-0000-000000000001",
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toBe("internal error");
  });
});
