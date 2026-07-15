import { searchImportantMemories } from "./store";
import type { Memory } from "./types";

// 作業記憶（短期記憶）バッファ — インメモリのみ、永続化しない（旧Python版 WorkingMemoryBuffer 相当）
export class WorkingMemoryBuffer {
  private buffer: Memory[] = [];
  private readonly capacity: number;

  constructor(capacity = 20) {
    this.capacity = capacity;
  }

  add(memory: Memory): void {
    this.buffer.push(memory);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getRecent(n = 10): Memory[] {
    return [...this.buffer].reverse().slice(0, n);
  }

  getAll(): Memory[] {
    return [...this.buffer].reverse();
  }

  clear(): void {
    this.buffer = [];
  }

  size(): number {
    return this.buffer.length;
  }

  // 重要な記憶を長期記憶(DB)から再ロードする。
  // 条件: importance >= 4, access_count >= 5, last_accessed が直近1週間以内（旧Python版と同一条件）
  async refreshImportant(): Promise<void> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const important = await searchImportantMemories(4, 5, oneWeekAgo, 10);
    const existingIds = new Set(this.buffer.map((m) => m.id));
    for (const memory of important) {
      if (!existingIds.has(memory.id)) {
        this.buffer.push(memory);
      }
    }
  }
}

export const workingMemory = new WorkingMemoryBuffer();
