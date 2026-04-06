# Forked Agent Pattern（フォークエージェントパターン）

ソースマップ解析による未公開機能レポート（2026-03-31）

## 概要

Claude Code 内部で多用される設計パターン。メインの会話を**フォーク**し、
同じプロンプトキャッシュを共有しつつ独立したエージェントとして動作させる。

公開情報の subagent/fork とは異なり、これは**内部インフラとしてのフォーク**。
extractMemories, autoDream, confidence rating 等のバックグラウンド処理で使われる。

## 設計

```typescript
import { createCacheSafeParams, runForkedAgent } from '../../utils/forkedAgent.js'

const result = await runForkedAgent({
  promptMessages: [createUserMessage({ content: prompt })],
  cacheSafeParams: createCacheSafeParams(context),  // メインのキャッシュを共有
  canUseTool: createAutoMemCanUseTool(memoryDir),    // ツール制限
  querySource: 'extract_memories',                    // テレメトリ用ラベル
  forkLabel: 'extract_memories',
  skipTranscript: true,                               // メイントランスクリプトに記録しない
  maxTurns: 5,                                        // ターン上限
})
```

### 重要な特性

1. **プロンプトキャッシュ共有**: `CacheSafeParams` でメインの会話と同じキャッシュキーを使用。フォーク固有のツールリストにすると**キャッシュが壊れる**ため、ツール制限は `canUseTool` 関数で行う
2. **トランスクリプト独立**: `skipTranscript: true` でメインのトランスクリプトに記録しない（レース条件防止）
3. **ターン制限**: `maxTurns` で暴走を防止
4. **AbortController**: ユーザーが UI から中断可能

## 使用箇所

| 機能 | forkLabel | maxTurns | ツール制限 |
|---|---|---|---|
| extractMemories | `extract_memories` | 5 | Read/Grep/Glob無制限、Bash読取専用、Edit/Writeメモリ内のみ |
| autoDream | `auto_dream` | なし | 同上 |
| confidence rating | 不明 | 不明 | 不明 |

## canUseTool パターン

`createAutoMemCanUseTool(memoryDir)` が共通で使われる:

```
Read / Grep / Glob → 常に許可（読み取り専用）
Bash → isReadOnly(parsed) なら許可（ls, find, grep, cat, stat, wc, head, tail）
Edit / Write → file_path がメモリディレクトリ内なら許可
REPL → 許可（内部で各ツールの canUseTool を再呼び出し）
その他 → 拒否
```

## mutual exclusion パターン

extractMemories はメインエージェントとの排他制御を持つ:

- `hasMemoryWritesSince()`: メインエージェントがメモリに書き込んだか確認
- 書き込んでいたらフォークをスキップし、カーソルだけ進める
- メインとフォークが同時にメモリを書かないようにする

## trailing extraction パターン

- フォーク実行中に新しいリクエストが来たら `pendingContext` にスタッシュ
- 完了後に trailing run として実行
- カーソルが進んでいるので新規メッセージのみ処理

## FORK_SUBAGENT（ユーザー向けフォーク）

`feature('FORK_SUBAGENT')` でゲート。
Agent ツールで `subagent_type` なしだとフォークとして動作:

> 「Calling Agent without a subagent_type creates a fork, which runs in the background
>  and keeps its tool output out of your context — so you can keep chatting with the
>  user while it works.」

## 出典

- `src/utils/forkedAgent.ts`
- `src/services/extractMemories/extractMemories.ts`
- `src/services/autoDream/autoDream.ts`
- `src/tools/AgentTool/forkSubagent.ts`
