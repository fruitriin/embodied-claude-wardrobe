# Claude Code エージェントチーム — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/agent-teams + CHANGELOG 1.0.0〜2.1.87 (2026-03-29 取得)

## 導入・進化の経緯

| バージョン | 変更 |
|---|---|
| 2.1.32 | エージェントチーム（実験的、CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1） |
| 2.1.33 | TeammateIdle/TaskCompleted フック、tmux メッセージ修正 |
| 2.1.34 | エージェントチーム設定変更時のクラッシュ修正 |
| 2.1.36 | Fast mode for Opus 4.6 |
| 2.1.41 | Bedrock/Vertex/Foundry での model identifier 修正 |
| 2.1.45 | Bedrock/Vertex/Foundry メイトに API 環境変数を伝播 |
| 2.1.47 | メイトナビゲーションを Shift+Down のみに統一、custom agent model がメイトに反映 |
| 2.1.50 | メイト完了タスクのメモリリーク修正 |
| 2.1.63 | auto-memory がワークツリー間で共有 |
| 2.1.69 | メイトが誤ってネストメイトをスポーンする問題修正 |

## 概要

**実験的機能**（デフォルト無効）。複数の Claude Code インスタンスが協調して作業する。

有効化:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

## サブエージェントとの違い

| | サブエージェント | エージェントチーム |
|---|---|---|
| コンテキスト | 自前。結果は呼び出し元に戻る | 自前。完全に独立 |
| 通信 | 呼び出し元にのみ報告 | チームメイト同士で直接通信 |
| 調整 | メインエージェントが管理 | 共有タスクリストで自己調整 |
| 適用場面 | 結果だけ要るフォーカスタスク | 議論・コラボが必要な複雑作業 |
| トークンコスト | 低い | 高い（各メイトが別インスタンス） |

## アーキテクチャ

| コンポーネント | 役割 |
|---|---|
| Team lead | メインセッション。チーム作成・スポーン・調整 |
| Teammates | 独立した Claude Code インスタンス |
| Task list | 共有タスクリスト（pending → in_progress → completed）、依存関係追跡あり |
| Mailbox | エージェント間メッセージング |

保存場所:
- チーム設定: `~/.claude/teams/{team-name}/config.json`
- タスクリスト: `~/.claude/tasks/{team-name}/`

## 表示モード

| モード | 説明 |
|---|---|
| in-process | 全メイトが同一ターミナル。Shift+Down で切り替え |
| tmux/iTerm2 | 各メイトが分割ペイン |
| auto（デフォルト） | tmux セッション内なら split、そうでなければ in-process |

## フック連携

| イベント | 用途 | 追加時期 |
|---|---|---|
| TeammateIdle | メイト待機時。exit 2 でフィードバック送信 | 2.1.33 |
| TaskCreated | タスク作成時。exit 2 で作成ブロック | 2.1.33 |
| TaskCompleted | タスク完了時。exit 2 で完了ブロック | 2.1.33 |

TeammateIdle/TaskCompleted は `{"continue": false, "stopReason": "..."}` でメイト停止可能 (2.1.69〜)。

## 制限事項

- セッション再開時に in-process メイトは復元されない
- タスクステータスが遅延することがある
- シャットダウンに時間がかかる場合がある
- セッション1つにつきチーム1つ
- ネストしたチームは不可
- リードは固定（移譲不可）
- パーミッションはスポーン時に固定
- split pane は tmux or iTerm2 が必要（VS Code/Ghostty/Windows Terminal は非対応）

## ベストプラクティス

- チームサイズは 3-5 人が最適
- メイト1人あたり 5-6 タスクが生産的
- 同一ファイルの編集を避ける
- 研究・レビューから始めるのが安全
- リードが自分で実装し始めたら「メイトの完了を待て」と指示

## ワードローブ固有のメモ

- 実験的機能のため、ワードローブでは積極的に使っていない
- 並列リサーチ（cc-tracker 等）やコードレビューの並列化に適している可能性
- CLAUDE.md はメイトにも通常通り読まれる
- ワードローブの MCP サーバーもメイトに継承される
- Ctrl+F で全バックグラウンドエージェントをキル (2.1.47〜)
