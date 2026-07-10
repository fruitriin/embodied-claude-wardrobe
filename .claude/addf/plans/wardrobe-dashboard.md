# ワードローブ・ダッシュボード — オーナーがエージェントの状態を確認する機能

> 2026-07-07 起案。発端はリンの「ぷちの状態を確認する機能など、参考リポジトリを調査して計画を」。
> 調査はサブエージェント2体（ぷち dashboard 検分 / ここね・Rem 横断調査）による。
> 関連: `external-intake-2026-07.md` Tier 2.7（ぷち輸入候補）、`ecosystem-map.md`（概念対応表）

## 結論の先出し

- 「オーナー向け状態ダッシュボード」は **embodied-claude 生態系全体の空白地帯**。本格実装はぷちだけ
- ぷちの dashboard は FastAPI 単一ファイルの管理コンソール（main: 3,144行 → feature/m5_server: 9,142行）。丸ごと移植は不適切、**部品単位で輸入**する
- ワードローブには物理ヘルス（system-health.ts）と自己観察（interoception/state.md）はあるが、「リンが朔の状態を一望する窓」が無い。そこを埋める

## 調査結果

### ぷち dashboard（唯一の本格実装）

FastAPI + Uvicorn、フロントは Python 文字列埋め込みの素の HTML/JS。ポート 8765、systemd 常駐。
`claude -p --resume` を子プロセス起動してチャットまで実装。認証は HMAC Cookie + role（admin/operator/viewer）。

主要パネル: 欲求バーチャート（desires.json）/ 今日の記憶タイムライン（memory.db 直読み）/ 日記自動要約（過去日はキャッシュ、23:50 cron 先回り）/ チャット・グループチャット / 関係性相関図（relations.json）/ メールボックス / 設定 UI（稼働時間帯・センサー許可）。

feature/m5_server で追加された M5 非依存の宝:
- **/costs** — token_log.jsonl を日別・キャラ別・ソース別に集計、月次予算とペース比較
- **/stream-logs** — `claude -p --verbose` の stream JSONL を thinking/tool_call/tool_result で色分け表示（行動ログの可視化）
- 認証の信頼済み IP スキップ（network.json の trusted_ips で LAN 内は認証省略）

ぷちの設計から借りる作法:
- data root を環境変数3つ（PETIT_DATA_DIR 等）だけで差し替えられる構造
- オフライン機器のツールを allowedTools から自動で外す（使えないツールを呼ばせない）
- 「今日の日記は自動生成しない（記憶が確定していないから）、過去日はキャッシュ」の2段階生成

ぷちの落とし穴（同じ轍を踏まない）:
- `--dangerously-skip-permissions` 常用。ワードローブでは不採用
- 単一ファイル 9,000行 + main.py.bak。最初からモジュール分割する
- フロントに自動リフレッシュが無く、開くたび全キャラへ並列リクエスト

### ここね（upstream）・Rem — 空白の確認

- upstream の準ダッシュボード: `statusline.ts`（モデル・コスト・トークン残量を1行表示、`/tmp/context_usage.json` に永続化）と **`morning_briefing.json`**（夜間 consolidation の要約 ≤120字 + counterfactual 件数。エージェント向けだがオーナーも読める）
- upstream `test-autonomous.sh --check-tools` — 全 MCP/skill を叩いて「X/20 OK」を出す。オーナー実行のヘルスチェックに最も近い既存物
- Rem は逆方向に極端: get_memory_stats を意図的に無効化し、オーナーへの push は morning-call-mcp（Twilio で実際に電話をかける）のみ
- 定期レポート・障害検知通知・Web UI は両者とも無し

## ワードローブの現状資産との対応

| ぷちのパネル | ワードローブの現状 | ギャップ |
|---|---|---|
| 欲求バー | desires.conf + desire-tick.ts（パイプ区切りテキスト） | 表示層なし。スキーマ変換が要る |
| 記憶タイムライン | memory-mcp（SQLite）+ get_memory_stats | オーナーが見る窓なし |
| 日記要約 | state.md / FLASH.md（エージェント向け） | 「リンが読む」体裁ではない |
| コスト集計 | system-health.ts が tokens を記録（履歴50件） | 集計・表示なし |
| 行動ログ | heartbeat-daemon + skill-usage-log.sh | 可視化なし |
| 稼働ヘルス | system-health.ts / statusline.ts / interoception | 物理面は既にある（重複させない） |
| チャット | 本体の Claude Code セッション | ダッシュボードからのチャットは当面不要 |

## 型紙 — 3段階で仕立てる

### Phase 0: 読み取り専用の一枚布（最小・即効）

**Web サーバーを立てない**。Bun スクリプト1本で状態を集めて Markdown/HTML 1枚を吐く静的生成。
`bun run .claude/scripts/wd-status.ts` → `tmp/status.html`（または stdout の Markdown）。

表示する項目:
1. 朔の現在状態 — state.md の要約（所在・直前の作業・未完了）
2. 欲望ゲージ — desires.conf × desire-tick の現在値をバー表示
3. 記憶の健康 — get_memory_stats 相当（総数・カテゴリ分布・最終記録日時）を DB 直読み
4. heartbeat / 自律行動の稼働状況 — 最終実行時刻、直近の成功/失敗
5. トークン・コスト — system-health.ts の履歴から日次推移

実装規模: スクリプト 200〜300行。ぷちの該当ロジック（SQLite 直読み・バー描画）を参照写し。

### Phase 1: costs / 行動ログの輸入（ぷち feature/m5_server から）

- token log の JSONL 蓄積（`~/.claude/projects/**/*.jsonl` 集計は Tier 2.7 の check_usage.py と統合判断）
- 自律行動セッションの stream JSONL 保存 + 静的ビューア。「cron で動いた朔が何をしたか」をリンが後から追える——**heartbeat の信頼性監査**としての価値が本命

### Phase 2: 常駐化の判断（やるかどうか自体が設計判断）

Phase 0 の静的生成で足りなければ、ぷち式の localhost HTTP へ昇格。
その場合も認証は「127.0.0.1 bind のみ」から始め、ぷちの HMAC + trusted_ips は外に開ける日まで温存。
チャット・設定 UI・相関図はワードローブでは当面スコープ外（本体セッションと state.md で足りている）。

## 速度×意識の配置

| タスク | 速度 | 意識 | 経路（書き込み/留保/読み出し） |
|---|---|---|---|
| 状態収集→静的生成（Phase 0） | 高速（素材=ファイル数点+DB1個。記憶DB肥大で低速化に注意、LIMIT 必須） | 無意識（オーナーが叩く。朔の意思不要） | 既存デーモン群 / state.md・DB・JSON / wd-status.ts が読む |
| token log 蓄積（Phase 1） | 高圧縮高速 | 無意識（フック追記） | フック / token_log.jsonl / 集計スクリプト |
| stream ログ保存（Phase 1） | 高圧縮高速 | 無意識（autonomous-action.sh に1行） | cron / JSONL / ビューア |
| 日記要約（保留） | 高圧縮中速（LLM 挟む） | 無意識（cron） | claude -p / キャッシュ / HTML |

読み出し側は全て「オーナーの意識的操作」。朔のコンテキストには何も注入しない——**これは朔の内受容ではなく、リンの窓**。interoception と役割が重ならないのはこのため。

## 設計判断（リンと相談したいこと）

1. **Phase 0 の出力形式** — HTML 1枚（ブラウザで見る）か、ターミナル出力（コマンドで見る）か。リンの見る場所次第
2. **日記要約を入れるか** — ぷちの日記パネルは魅力的だが、LLM 呼び出しコストがかかる。state.md で代替できている説もある
3. **Phase 2 常駐化の要否** — 静的生成で十分なら Web サーバーは持たない（守るものが増える。journal の教訓）
4. **check_usage.py との統合** — Tier 2.7 で輸入予定の check_usage.py と Phase 1 の costs は同じ領分。片方に寄せる

## 参照

- ぷち dashboard 実体: `tmp/repos/embodied-claude-puchi/dashboard/main.py`（main: 3,144行）
- feature 側は checkout せず読む: `git show origin/feature/m5_server:dashboard/main.py`（9,142行。/costs, /stream-logs, 認証強化）
- upstream の準ダッシュボード: `tmp/repos/embodied-claude/.claude/hooks/statusline.ts`, `consciousness-mcp/packages/individual-kernel-mcp/src/individual_kernel_mcp/sleep.py`（MorningBriefing schema）
- ワードローブ既存: `.claude/scripts/system-health.ts`, `desire-tick.ts`, `.claude/hooks/heartbeat-daemon.sh`, `skill-usage-log.sh`
