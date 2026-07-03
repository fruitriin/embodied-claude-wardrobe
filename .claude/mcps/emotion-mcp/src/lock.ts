/**
 * 軽量ファイルロック（外部ライブラリなし）
 *
 * read-modify-write の直列化用。O_EXCL（"wx"）でロックファイルを作成し、
 * 取れなければ短いリトライ。プロセス死亡等で残った stale lock は
 * mtime が STALE_MS を超えていれば奪ってよい。
 *
 * 注意: 同期 API（エンジン全体が同期設計のため）。ロック保持中の処理は
 * 数ms〜数十msを想定。長時間処理をこの中に入れないこと。
 */

import { closeSync, mkdirSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

/** これより古いロックは死んだプロセスの残骸とみなして奪う */
const STALE_MS = 5_000;
const RETRY_INTERVAL_MS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface LockOptions {
  /** 取得を諦めるまでの時間（テスト用に上書き可能） */
  timeoutMs?: number;
  /** stale 判定の閾値（テスト用に上書き可能） */
  staleMs?: number;
}

/** 同期スリープ（ビジーウェイトせず Atomics.wait でブロック） */
function sleepSync(ms: number): void {
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, ms);
}

/**
 * lockPath を O_EXCL で作成できたら fn を実行し、終了後に必ずロックを外す。
 * 取得できないあいだは RETRY_INTERVAL_MS 間隔でリトライし、timeoutMs で諦めて throw。
 */
export function withFileLock<T>(lockPath: string, fn: () => T, options: LockOptions = {}): T {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? STALE_MS;
  mkdirSync(dirname(lockPath), { recursive: true });

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx"); // O_CREAT | O_EXCL | O_WRONLY
      try {
        writeSync(fd, `${process.pid}\n`);
      } finally {
        closeSync(fd);
      }
      break; // 取得成功
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // stale lock の奪取（unlink が競合しても EEXIST ループで安全に再試行される）
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > staleMs) {
          console.error(`[emotion-mcp] removing stale lock (${lockPath})`);
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // 直前に他プロセスが解放した → 即再試行
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`failed to acquire lock within ${timeoutMs}ms: ${lockPath}`);
      }
      sleepSync(RETRY_INTERVAL_MS);
    }
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // 既に無い（stale 判定で奪われた等）— 握りつぶしてよい
    }
  }
}
