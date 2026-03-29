# テストシナリオ — wardrobe 動作確認

> `/wardrobe-configure` のカテゴリ分けに準拠。
> 各セクションの前提条件を満たしたうえで、チェック項目を順に確認する。

---

## 0. 基盤（セットアップ・ブート）

### 前提条件
- Python 3.12、uv、Bun がインストール済み
- リポジトリをクローン済み

### チェック項目

- [ ] `/wardrobe-setup` で SOUL.md が生成される
- [ ] `/wardrobe-configure` で .mcp.json と settings.json が正しく生成される
- [ ] `.mcp.json` の args のコマンド名が pyproject.toml の `[project.scripts]` と一致している
- [ ] セッション起動時にブートシーケンス（SOUL.md → 記憶確認 → 作業記憶 → 想起 → state.md）が実行される
- [ ] `state.md` が読み込まれ、前回の引き継ぎ事項が把握できる
- [ ] コンパクション後に `post-compact-recovery.sh` が発火し、ブートが再実行される

---

## 1. 記憶と自律神経

### 1-1. memory-mcp

#### 前提条件
- `uv sync` 済み（memory-mcp ディレクトリ）
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

---

## 2. 発話と聴覚

### 2-1. tts-mcp（声）

#### 前提条件
- `uv sync` 済み（tts-mcp ディレクトリ）
- ElevenLabs API キー or VOICEVOX が利用可能

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] テキストを音声で読み上げられる

### 2-2. hearing（聴覚）

#### 前提条件
- `uv sync` 済み（hearing ディレクトリ）
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
- `uv sync` 済み（wifi-cam-mcp ディレクトリ）
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
- `uv sync` 済み（usb-webcam-mcp ディレクトリ）
- USB ウェブカメラが接続済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] スナップショットが取得できる

### 3-3. ip-webcam-mcp

#### 前提条件
- `uv sync` 済み（ip-webcam-mcp ディレクトリ）
- Android + IP Webcam アプリが起動済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] スナップショットが取得できる

### 3-4. mcp-pet

#### 前提条件
- `uv sync` 済み（mcp-pet ディレクトリ）
- SkyWay キー + トンネル設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる

---

## 4. 身体

### 4-1. toio-mcp

#### 前提条件
- `uv sync` 済み（toio-mcp ディレクトリ）
- toio コアキューブが BLE 接続可能

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] キューブの制御ができる

### 4-2. mobility-mcp

#### 前提条件
- `uv sync` 済み（mobility-mcp ディレクトリ）
- Tuya 対応ロボット掃除機が設定済み

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] 掃除機の制御ができる

### 4-3. system-temperature-mcp

#### 前提条件
- `uv sync` 済み（system-temperature-mcp ディレクトリ）

#### チェック項目
- [ ] MCP サーバーが connected 状態になる
- [ ] システム温度が取得できる

### 4-4. morning-call-mcp

#### 前提条件
- `uv sync` 済み（morning-call-mcp ディレクトリ）
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
- [ ] `/remember` — 記憶保存 + FLASH.md インデックス追記
- [ ] `/recall` — FLASH.md をガイドにサブエージェントで検索
- [ ] `/great-recall` — 3軸並列想起（技術的・感情的・因果的）
- [ ] `/rebuild-index` — FLASH.md の再構築

**セットアップ・設定スキル**
- [ ] `/wardrobe-setup` — SOUL.md の初期設定
- [ ] `/wardrobe-configure` — MCP・フック・自律行動の設定
- [ ] `/wardrobe-migrate` — アップストリームからの更新取り込み

**読書・観測スキル**
- [ ] `/read [URL]` — Web ページをリーダーモードで取得
- [ ] `/observe` — カメラで部屋を観察（視覚 MCP 必要）

**セッション管理**
- [ ] シャットダウン手順で state.md が更新される
- [ ] シャットダウン手順で記憶が保存される
