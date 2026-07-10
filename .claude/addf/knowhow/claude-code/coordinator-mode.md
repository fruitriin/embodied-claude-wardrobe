# Coordinator Mode（コーディネーターモード）

ソースマップ解析による未公開機能レポート（2026-03-31）

## 概要

Agent Teams（チームモード）とは**別に存在する**オーケストレーションモード。
環境変数 `CLAUDE_CODE_COORDINATOR_MODE=1` で有効化。
`feature('COORDINATOR_MODE')` でゲートされており、外部ビルドにコードは含まれている。

## チームモードとの違い

| 観点 | Team Mode | Coordinator Mode |
|---|---|---|
| 起動方法 | `TeamCreate` ツールでチーム作成 | 環境変数 `CLAUDE_CODE_COORDINATOR_MODE=1` |
| エージェント構成 | リーダー + 名前付き teammate | コーディネーター + 匿名 worker |
| 通信方式 | Mailbox（SendMessage で名前指定） | task-notification XML + SendMessage で agent ID 指定 |
| コーディネーターの役割 | リーダーがタスクを振る | **理解と合成が最重要の仕事**。リサーチ結果を自分で消化し、具体的な実装仕様を書いてから worker に渡す |
| worker の可視性 | teammate は互いに見える | worker はコーディネーターの会話を見られない。プロンプトが自己完結必須 |
| システムプロンプト | 通常のシステムプロンプト + teammate addendum | 専用のコーディネーター用システムプロンプトに**置換** |

## コーディネーターのシステムプロンプト構造

通常のシステムプロンプトを**完全に置換**する（追加ではない）。

### 使えるツール
- `Agent` — worker をスポーン（`subagent_type: "worker"`）
- `SendMessage` — 既存 worker への指示続行（`to: agentId`）
- `TaskStop` — 誤った方向に行った worker を停止
- `subscribe_pr_activity` / `unsubscribe_pr_activity` — GitHub PR イベント購読（利用可能時）

### 4フェーズワークフロー

```
Research（worker並列） → Synthesis（コーディネーター自身） → Implementation（worker） → Verification（worker）
```

**Synthesis がコーディネーターの最も重要な仕事**:
- リサーチ結果を自分で読んで理解する
- ファイルパス、行番号、具体的な変更内容を含む実装仕様を書く
- 「Based on your findings」「Based on the research」は**禁止**（理解を worker に丸投げするアンチパターン）

### 並行性の管理

```
読み取り専用タスク（リサーチ）→ 自由に並列実行
書き込みタスク（実装）       → 同じファイル群につき1つずつ
検証タスク                 → 実装と別ファイル領域なら並行可
```

### Continue vs Spawn の判断基準

| 状況 | 判断 | 理由 |
|---|---|---|
| リサーチが編集対象ファイルを探索済み | Continue | ファイルがコンテキストに載っている |
| リサーチは広範だが実装は狭い | Spawn | 探索ノイズを避ける |
| 失敗の修正 | Continue | エラーコンテキストを活用 |
| 別 worker の成果を検証 | Spawn | 実装の仮定を引き継がない |
| 前回のアプローチが完全に間違い | Spawn | 失敗パスへのアンカリングを避ける |

## 権限ハンドリング

`coordinatorHandler.ts` で専用の権限フローがある:

```
1. Permission Hooks（高速、ローカル）
2. Bash Classifier（低速、推論。feature('BASH_CLASSIFIER') 時のみ）
3. どちらも解決しなければ → インタラクティブダイアログにフォールバック
```

## セッション復元

コーディネーターモードはセッションに `'coordinator' | 'normal'` として保存される。
セッション復元時に環境変数を自動的に切り替え、モード不一致があればメッセージを表示。

## Scratchpad 連携

コーディネーターモードでは Scratchpad ディレクトリが worker に共有される:
「Workers can read and write here without permission prompts. Use this for durable cross-worker knowledge.」

## 出典

- `src/coordinator/coordinatorMode.ts` — モード判定、システムプロンプト
- `src/hooks/toolPermission/handlers/coordinatorHandler.ts` — 権限ハンドリング
- `src/utils/systemPrompt.ts` — システムプロンプト置換ロジック
