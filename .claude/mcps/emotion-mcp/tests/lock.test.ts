import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileLock } from "../src/lock";
import { defaultStatePath, loadState } from "../src/persistence";
import { DEFAULT_PROFILE } from "../src/profile";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "emotion-mcp-lock-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("withFileLock — 軽量ファイルロック", () => {
  test("実行中はロックファイルが存在し、終了後（例外時も）必ず消える", () => {
    const lockPath = join(dir, "state.json.lock");
    const result = withFileLock(lockPath, () => {
      expect(existsSync(lockPath)).toBe(true);
      return 42;
    });
    expect(result).toBe(42);
    expect(existsSync(lockPath)).toBe(false);

    expect(() =>
      withFileLock(lockPath, () => {
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(existsSync(lockPath)).toBe(false);
  });

  test("他プロセスが保持中のロックはタイムアウトまで取れない", () => {
    const lockPath = join(dir, "held.lock");
    writeFileSync(lockPath, "99999\n", "utf-8"); // いま取られたばかりのロック
    expect(() =>
      withFileLock(lockPath, () => "should not run", { timeoutMs: 60, staleMs: 60_000 })
    ).toThrow(/failed to acquire lock/);
    expect(existsSync(lockPath)).toBe(true); // 他人のロックは消さない
  });

  test("stale lock（mtime が閾値超え）は奪って続行できる", () => {
    const lockPath = join(dir, "stale.lock");
    writeFileSync(lockPath, "99999\n", "utf-8");
    const past = new Date(Date.now() - 10_000); // 10秒前 = デフォルト閾値5秒超え
    utimesSync(lockPath, past, past);
    const result = withFileLock(lockPath, () => "recovered");
    expect(result).toBe("recovered");
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("並行 update のロストアップデート防止（CLI 2プロセス同時実行）", () => {
  test("2連発の並行 update が両方反映される", async () => {
    const cliPath = join(import.meta.dir, "..", "cli.ts");
    const spawnUpdate = () =>
      Bun.spawn(["bun", "run", cliPath, "update", "--delta", "DA=0.05", "--root", dir], {
        stdout: "pipe",
        stderr: "pipe",
      });
    const procs = [spawnUpdate(), spawnUpdate()];
    const exits = await Promise.all(procs.map((p) => p.exited));
    expect(exits).toEqual([0, 0]);

    // ロストアップデートがなければ両方の +0.05 が積み上がる（0.6 → 0.7）
    const state = loadState(defaultStatePath(dir, "default"));
    expect(state).not.toBeNull();
    expect(state!.substance.DA).toBeCloseTo(DEFAULT_PROFILE.baseline.DA + 0.1, 3);
    // ロックファイルが残っていない
    expect(existsSync(`${defaultStatePath(dir, "default")}.lock`)).toBe(false);
  });
});
