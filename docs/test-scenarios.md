# テストシナリオ — wardrobe 動作確認

> `/wd-configure` のカテゴリ分けに準拠。
> 各セクションの前提条件を満たしたうえで、チェック項目を順に確認する。

---

## 0. 基盤（セットアップ・身支度）

### 前提条件
- Python 3.12、uv、Bun がインストール済み
- リポジトリをクローン済み

### チェック項目

- [ ] `/wd-setup` で SOUL.md が生成される
- [ ] `/wd-configure` で .mcp.json と settings.json が正しく生成される
- [ ] `.mcp.json` の args のコマンド名が pyproject.toml の `[project.scripts]` と一致している
- [ ] セッション起動時に身支度（SOUL.md → 記憶確認 → 作業記憶 → 想起 → state.md）が実行される
- [ ] `state.md` が読み込まれ、前回の引き継ぎ事項が把握できる
- [ ] コンパクション後に `post-compact-recovery.sh` が発火し、身支度が再実行される

---

## 1. 記憶と自律神経

### 1-1. memory-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/memory-mcp ディレクトリ）
- MCP サーバーが connected 状態

#### チェック項目

**基本操作**
- [ ] `get_memory_stats` — 統計が返る
- [ ] `remember` — 記憶が保存され ID が返る
- [ ] `list_recent_memories` — 直近の記憶が一覧できる
- [ ] `refresh_working_memory` — 作業記憶が装填される

**検索・想起**
- [ ] `recall` — コンテキストに関連する記憶が返る
- [ ] `search_memories` — クエリに基づくセマンティック検索が動作する
- [ ] `recall_divergent` — 多軸想起で記憶が返る
- [ ] `recall_with_associations` — 連想付きの想起が動作する
- [ ] `recall_by_camera_position` — カメラ位置での想起が動作する（wifi-cam 連携時）

**構造化**
- [ ] `link_memories` — 2つの記憶をリンクできる
- [ ] `create_episode` — 複数の記憶をエピソードにまとめられる
- [ ] `search_episodes` — エピソードを検索できる
- [ ] `get_episode_memories` — エピソード内の記憶を取得できる
- [ ] `get_causal_chain` — 因果チェーンを辿れる
- [ ] `get_memory_chain` — 記憶チェーンを辿れる

**メンテナンス**
- [ ] `consolidate_memories` — 記憶の統合が実行できる
- [ ] `reevaluate_importance` — 重要度の再評価が動作する
- [ ] `get_association_diagnostics` — 連想診断が返る
- [ ] `get_memory_calendar` — カレンダー表示が返る

**既知の問題**
- [ ] 埋め込みベクトルの次元不一致（768 vs 600）が発生しないこと。`scripts/migrate_embeddings.py` で修復可能

### 1-2. interoception フック

#### 前提条件
- `.claude/hooks/interoception.sh` が settings.json に登録済み
- `.claude/scripts/heartbeat-daemon.sh` が動作中（launchd）

#### チェック項目
- [ ] UserPromptSubmit で `[interoception] time=... day=... phase=... arousal=... thermal=... mem_free=...` が注入される
- [ ] 時間帯 (phase) が実際の時刻と一致する

### 1-3. recall-hook（追想フック）

#### 前提条件
- `.claude/hooks/recall-hook.sh` が settings.json に登録済み
- memory-mcp が接続済み

#### チェック項目
- [ ] UserPromptSubmit で関連記憶がコンテキストに自動注入される
- [ ] 記憶がないときは何も注入されない（エラーにならない）

### 1-4. 自律行動

#### 前提条件
- `autonomous-action.sh` が存在し実行権限あり
- `desires.conf`、`schedule.conf` が存在
- crontab に登録済み

#### チェック項目
- [ ] cron 実行で `autonomous-action.sh` が動作する
- [ ] 時間帯・曜日に応じて間引かれる
- [ ] `/sleep` で活動頻度が下がる
- [ ] `/awake` で活動頻度が戻る

### 1-5. 自律行動シナリオ走破テスト（test-autonomous.sh）

`test-autonomous.sh` を使った autonomous-action.sh のシナリオ走破テスト。
MCP 非依存（`--dry-run` モード）で実行可能。

#### 前提条件
- `test-autonomous.sh` が存在し実行権限あり
- `autonomous-action.sh` が存在し実行権限あり
- `.env` が存在（`source` される）
- `prompts.toml`、`desires.conf`、`schedule.conf` が存在

#### dry-run シナリオ走破

**プロンプト組み立て**
- [ ] `./test-autonomous.sh --dry-run` — 通常回のプロンプトが正しく組み立てられる
- [ ] `./test-autonomous.sh --dry-run --force-routine` — ルーチン回のプロンプトが生成される（ROUTINES.md 参照あり）
- [ ] `./test-autonomous.sh --dry-run --force-normal` — 通常回が強制される

**時間帯切り替え**
- [ ] `./test-autonomous.sh --dry-run --date "YYYY-MM-DD 03:00"` — 深夜帯ルール（TIME_RULE が夜用に切り替わる）
- [ ] `./test-autonomous.sh --dry-run --date "YYYY-MM-DD 14:30"` — 昼間帯ルール（TIME_RULE が昼用になる）
- [ ] 深夜帯で interoception テキストが「夜」系のフレーズを含む

**朝の初回セッション**
- [ ] 日付が前回と異なるとき、`morning_section`（prompts.toml の `[morning]`）がプロンプトに合体する
- [ ] `/wd-great-recall` が朝の初回プロンプト内で正しく参照されている

**allowedTools 動的生成**
- [ ] allowedTools が `.claude/settings.json` の `permissions.allow` から動的に生成される
- [ ] スキル参照が `Skill(wd-read)`, `Skill(wd-great-recall)` 等の wd- プレフィックス付きになっている

#### 環境変数チェック

cron は最小限の環境変数しか持たない。autonomous-action.sh が環境差を吸収できるか確認する。

**PATH の復元**
- [ ] `env -i bash -c "./autonomous-action.sh --dry-run"` — PATH なしの空環境で正常動作する
- [ ] `bun`, `jq`, `claude` が PATH 復元後に見つかる（autonomous-action.sh 内で `$HOME/.asdf/shims:/opt/homebrew/bin` を設定）

**カレントディレクトリの違い**
- [ ] `env -i bash -c "cd /tmp && /path/to/autonomous-action.sh --dry-run"` — 別ディレクトリから呼んでも `SCRIPT_DIR` で正しいパスに解決される
- [ ] `cd "$SCRIPT_DIR"` でスクリプト実行前にプロジェクトルートに移動している

**シェルの違い**
- [ ] `env -i bash -c "..."` で bash から起動できる（shebang は `#!/bin/bash`）
- [ ] fish / zsh の対話環境から `./test-autonomous.sh` を起動しても問題ない

**CLAUDE_ 系環境変数**
- [ ] `CLAUDECODE` が `unset` される（claude CLI の再帰呼び出し防止）
- [ ] `.env` で定義された環境変数（API キー等）が正しく `source` される
- [ ] `CLAUDE_PROJECT_DIR` は autonomous-action.sh 自体では設定しない（claude CLI が自動設定する）

#### --check-tools（MCP 依存）

MCP が全て接続された状態でのみ実行可能。

- [ ] `./test-autonomous.sh --check-tools` — 全ツールの動作チェックが実行される
- [ ] チェック結果に `Skill(wd-read)` が含まれる（旧名称 `Skill(read)` ではない）
- [ ] 結果レポートが `=== 合計: X/15 OK ===` 形式で出力される

---

## 2. 発話と聴覚

### 2-1. tts-mcp（声）

#### 前提条件
- `uv sync` 済み（.claude/mcps/tts-mcp ディレクトリ）
- ElevenLabs API キー or VOICEVOX が利用可能

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] テキストを音声で読み上げられる

### 2-2. hearing（聴覚）

#### 前提条件
- `uv sync` 済み（.claude/mcps/hearing ディレクトリ）
- ffmpeg がインストール済み
- マイク or RTSP カメラが利用可能
- `.mcp.json` のコマンド名が `hearing-mcp`（`hearing` ではない）

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] `start_listening` で録音が開始される
- [ ] `/tmp/hearing_buffer.jsonl` にエントリが蓄積される
- [ ] `hearing-hook.sh` (UserPromptSubmit) でバッファが drain され `[hearing]` がコンテキストに注入される
- [ ] `hearing-stop-hook.sh` (Stop) でターン延長が機能する
- [ ] `stop_listening` で録音が停止される
- [ ] ハルシネーションフィルタが適切に動作する

---

## 3. 視覚

### 3-1. wifi-cam-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/wifi-cam-mcp ディレクトリ）
- Tapo カメラが LAN 上で接続可能
- `.mcp.json` に正しい IP・認証情報が設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] `camera_info` でカメラ情報が取得できる
- [ ] `see` でスナップショットが取得できる
- [ ] `look_left` / `look_right` / `look_up` / `look_down` で PTZ 操作ができる
- [ ] `camera_presets` でプリセット一覧が取得できる
- [ ] `camera_go_to_preset` でプリセット位置に移動できる
- [ ] `look_around` で周囲を見回せる
- [ ] `listen` でカメラマイクからの音声を取得できる

### 3-2. usb-webcam-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/usb-webcam-mcp ディレクトリ）
- USB ウェブカメラが接続済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] スナップショットが取得できる

### 3-3. ip-webcam-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/ip-webcam-mcp ディレクトリ）
- Android + IP Webcam アプリが起動済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] スナップショットが取得できる

### 3-4. mcp-pet

#### 前提条件
- `uv sync` 済み（.claude/mcps/mcp-pet ディレクトリ）
- SkyWay キー + トンネル設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる

---

## 4. 身体

### 4-1. toio-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/toio-mcp ディレクトリ）
- toio コアキューブが BLE 接続可能

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] キューブの制御ができる

### 4-2. mobility-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/mobility-mcp ディレクトリ）
- Tuya 対応ロボット掃除機が設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] 掃除機の制御ができる

### 4-3. system-temperature-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/system-temperature-mcp ディレクトリ）

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] システム温度が取得できる

### 4-4. morning-call-mcp

#### 前提条件
- `uv sync` 済み（.claude/mcps/morning-call-mcp ディレクトリ）
- Twilio API キー設定済み
- cloudflared 等でトンネル設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] コール機能が動作する

---

## 5. スキル

### 前提条件
- memory-mcp が接続済み（記憶系スキルに必要）

### チェック項目

**記憶スキル**
- [ ] `/wd-remember` — 記憶保存 + FLASH.md インデックス追記
- [ ] `/wd-recall` — FLASH.md をガイドにサブエージェントで検索
- [ ] `/wd-great-recall` — 3軸並列想起（技術的・感情的・因果的）
- [ ] `/wd-rebuild-index` — FLASH.md の再構築

**セットアップ・設定スキル**
- [ ] `/wd-setup` — SOUL.md の初期設定
- [ ] `/wd-configure` — MCP・フック・自律行動の設定
- [ ] `/wd-migrate` — アップストリームからの更新取り込み

**読書・観測スキル**
- [ ] `/wd-read [URL]` — Web ページをリーダーモードで取得
- [ ] `/wd-observe` — カメラで部屋を観察（視覚 MCP 必要）

**セッション管理**
- [ ] 日記の手順で state.md が更新される
- [ ] 日記の手順で記憶が保存される
