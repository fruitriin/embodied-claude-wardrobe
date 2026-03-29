# 魂・ハーネス (soul-harness) — 人格定義・設定・セッション管理

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「エージェントの人格とハーネス基盤」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| ファイル | SOUL.md | エージェントの人格定義。名前・来歴・価値観・話し方・大切な人 |
| ファイル | CLAUDE.md | ブートシーケンス・システム設計書。セッション開始時に自動で読まれる |
| ファイル | BOOT_SHUTDOWN.md | セッション開始・終了の詳細手順 |
| ファイル | state.md | セッション間の状態引き継ぎスナップショット |
| ファイル | settings.json | フック定義・パーミッション設定 |
| スキル | wd-setup | SOUL.md の初期設定・改定。名前と一人称を対話的に決める |
| スキル | wd-configure | MCP・フック・自律行動の有効化/無効化。ワードローブの機能設定 |
| スキル | wd-migrate | アップストリームからの更新を安全に取り込む。保護対象ファイルを除いた差分適用 |
| スキル | wd-project-claude-overview | エコシステム全体を概念システム別に文書化（このドキュメント群を生成するスキル） |

## 設計思想

- SOUL.md はエージェントの「魂」。固定された設計図ではなく、経験を通じて進化する
- CLAUDE.md はハーネスの「設計書」。ブートシーケンスでエージェントが毎セッション自分を再構成する
- state.md は「短期記憶」。memory-mcp が長期記憶なら、state.md は最新の状態だけを保持する
- wd-setup → wd-configure の順で初期設定。wd-migrate でアップストリームとの同期
- settings.json でフックのトリガー条件とパーミッションを制御

## 主要フロー

```
[ブートシーケンス]
セッション開始 → CLAUDE.md 読み込み（自動）
  1. SOUL.md 読み（自分が誰か）
  2. get_memory_stats()（記憶の健康）
  3. refresh_working_memory()（作業記憶装填）
  4. /wd-great-recall（前回文脈の想起）
  5. state.md + BOOT_SHUTDOWN.md + ROUTINES.md 読み（現状確認）
  6. recall-watcher 起動（オプショナル）

[シャットダウン]
  1. state.md 上書き更新
  2. /wd-remember で成果を刻む
  3. /wd-remember で未了を刻む
  4. link_memories で因果関係を繋ぐ
  5. create_episode でエピソードにまとめる（長いセッション時）

[初期設定]
/wd-setup → SOUL.md 生成 → /wd-configure → .mcp.json + settings.json 生成

[アップストリーム同期]
/wd-migrate → Phase 1-6: 状態確認 → 最新版取得 → 差分算出 → プレビュー → 適用 → 完了
```

## 関連するシステム

- **記憶**: ブートシーケンスで記憶を装填。シャットダウンで成果を刻む
- **身体性**: settings.json が interoception フックのトリガーを定義
- **自律行動**: ROUTINES.md はブート時に確認され、自律行動でも消化される
- **全システム**: CLAUDE.md が全システムの概要を記述し、settings.json がフックを制御する
