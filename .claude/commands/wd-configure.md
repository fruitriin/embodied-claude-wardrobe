---
name: wd-configure
description: "MCP・フック・自律行動の有効化/無効化。ワードローブの機能設定。"
argument-hint: ""
user_invocable: true
---

# /wd-configure — 機能の設定

MCP サーバー、フック、自律行動の有効化/無効化を対話的に行う。
SOUL.md の設定は `/wd-setup` で行う。

---

## 0. 現状の読み取り

以下を読んで現在の設定状態を把握する:

- `.mcp.json` — 現在有効な MCP サーバー
- `.claude/settings.json` — 現在有効なフック
- `.claude/commands/sleep.md` の存在 — 自律行動スキルが有効か
- `autonomous-action.sh` の存在 — 自律行動が有効か

プロジェクトルートの各 MCP ディレクトリの存在も確認し、利用可能なものを特定する。

**MCP 名・ディレクトリ名・コマンド名の対応表**:

`.mcp.json` の `args` には **コマンド名**（`pyproject.toml` の `[project.scripts]`）を使うこと。ディレクトリ名とコマンド名が異なるものがあるので注意。

| MCP 名 | ディレクトリ名 | コマンド名（args に使う） |
|---|---|---|
| memory | `memory-mcp` | `memory-mcp` |
| tts | `tts-mcp` | `tts-mcp` |
| hearing | `hearing` | `hearing-mcp` |
| usb-webcam | `usb-webcam-mcp` | `usb-webcam-mcp` |
| wifi-cam | `wifi-cam-mcp` | `wifi-cam-mcp` |
| ip-webcam | `ip-webcam-mcp` | `ip-webcam-mcp` |
| mcp-pet | `mcp-pet` | `mcp-pet` |
| toio | `toio-mcp` | `toio-mcp` |
| mobility | `mobility-mcp` | `mobility-mcp` |
| system-temperature | `system-temperature-mcp` | `system-temperature-mcp` |
| morning-call | `morning-call-mcp` | `morning-call-mcp` |

ディレクトリ存在チェックは **この表のディレクトリ名** で行うこと。MCP 名で探すと見落とす。

---

## 0.5. ガイダンス表示

質問に入る前に、テキスト出力で全体像を伝える:

> これから **2回の質問**（計5問）で、使える機能を選んでいきます。
>
> 1. **記憶と自律神経** — 記憶・フック・自律行動（2問）
> 2. **感覚と身体** — 音声・視覚・身体（3問）
>
> 迷ったら「使わない」を選べば OK。あとから `/wd-configure` でいつでも変更できます。

---

## 1. 記憶と自律神経

MCP とそれに連動するフックをひとまとめにして聞く。

AskUserQuestion **1回** で以下 **2問**:

### Q1: 「記憶と自律神経 — 何を有効にする？」 (header: "記憶", multiSelect: true)

記憶 MCP と、記憶に連動するフック群。これらはセットで意味を持つ。

| label | description |
|---|---|
| 記憶 (memory-mcp) | 長期記憶。セッションを超えて記憶を保持する（推奨） |
| 内受容感覚 (interoception) | 毎ターン時刻・CPU負荷・メモリを自動注入。フック |
| 追想 (recall-hook) | 会話に関連する記憶を自動で引き出す。フック |
| コンパクション復帰 | コンテキスト圧縮後に身支度を自動実行。フック |

現在有効なものは description に「（現在: 有効）」を付ける。

### Q2: 「自律行動 — cron で定期的に動く？」 (header: "自律行動")

| label | description |
|---|---|
| 有効にする | cron で20分ごとに自律行動。sleep/awake スキルも追加される |
| 無効 / 後で設定する | 今は手動操作のみ |

---

## 2. 発話と聴覚

MCP とフックが連動する2つ目のグループ。

AskUserQuestion **1回** で以下 **3問**:

### Q1: 「発話と聴覚 — コミュニケーション機能は？」 (header: "音声", multiSelect: true)

MCP とフックが連動するグループ。聴覚 MCP を選ぶと聴覚フックも自動で有効になる。

| label | description |
|---|---|
| 声 (tts-mcp) | テキストを音声で読み上げる。要: ElevenLabs API キー or VOICEVOX |
| 聴覚 (hearing) | マイクで周囲の音を聞く。聴覚フックも自動で有効になる。要: ffmpeg + フック設定 |
| 使わない | 音声機能なし |

### Q2: 「視覚 — カメラは？」 (header: "視覚", multiSelect: true)

| label | description |
|---|---|
| USB カメラ (usb-webcam) | 要: USB ウェブカメラ接続 |
| Wi-Fi カメラ (wifi-cam) | 要: Tapo 等の Wi-Fi PTZ カメラ + LAN 接続情報 |
| IP カメラ (ip-webcam) | 要: Android + IP Webcam アプリ（iOS 非対応） |
| PET (mcp-pet) | Personal Terminal — 要: SkyWay キー + トンネル。デバイス不問だが SkyWay Personal 終了予定のため移植必須（実験中） |
| 使わない | カメラなし |

### Q3: 「身体 — 移動やインタラクションは？」 (header: "身体", multiSelect: true)

| label | description |
|---|---|
| toio キューブ (toio-mcp) | 小さなロボットを動かす |
| ロボット掃除機 (mobility-mcp) | 掃除機ロボットで部屋を移動する |
| 温度感覚 (system-temperature) | マシンの発熱・冷却を感じる |
| モーニングコール (morning-call) | 電話で目覚まし通知。要: Twilio API キー + トンネル (cloudflared 等) |
| 使わない | 身体機能なし |


**注意**: 各質問で、ディレクトリが物理的に存在しない MCP は選択肢に出さない。
選択肢が2つ未満になる質問は丸ごとスキップする。

---

## 3. ファイル生成・更新

回答に基づいてファイルを更新する。

### 3a. .mcp.json（プロジェクトルート）

選択された MCP サーバーだけを含む `.mcp.json` を生成/更新する。

- `.claude/templates/mcp.json.template` を参考にエントリの書式を合わせる
- 環境変数が必要なもの（カメラ URL、API キー等）はテンプレート値（`your-xxx`）を入れる
- 既存の `.mcp.json` がある場合: 選択されたものを追加、選択解除されたものを削除、既存の設定値は保持

### 3b. .claude/settings.json

選択されたフックを hooks セクションに設定する。

**フックの構成ルール:**

| 選択 | イベント | コマンド |
|---|---|---|
| interoception | UserPromptSubmit | `interoception.sh` (timeout: 5) |
| recall-hook | UserPromptSubmit | `recall-hook.sh` (timeout: 5) |
| コンパクション復帰 | SessionStart | `post-compact-recovery.sh` (trigger: compact) |
| 聴覚 | UserPromptSubmit | `hearing-hook.sh` (timeout: 5) |
| 聴覚 | Stop | `hearing-stop-hook.sh` (timeout: 20) |

**常に設定する項目:**
- `autoMemoryEnabled: false`
- 既存の permissions は維持しつつ、選択した MCP のパーミッション (`mcp__<name>__*`) を追加

### 3c. 自律行動（有効にした場合のみ）

- `autonomous-action.sh` が存在しなければ `.claude/templates/autonomous-action.template.sh` からコピー＋実行権限付与
- `desires.conf` が存在しなければ `.claude/templates/desires.template.conf` からコピー
- `schedule.conf` が存在しなければ `.claude/templates/schedule.template.conf` からコピー
- `.claude/commands/sleep.md` が存在しなければ `.claude/wardrobeOptions/skills/sleep.md` へのシンボリックリンク作成
- `.claude/commands/awake.md` が存在しなければ `.claude/wardrobeOptions/skills/awake.md` へのシンボリックリンク作成

自律行動を無効にした場合:
- シンボリックリンク（sleep.md, awake.md）を削除する（存在する場合）
- autonomous-action.sh, desires.conf, schedule.conf は残す（ユーザーのカスタマイズがある可能性）

---

## 4. 完了メッセージ

設定結果をサマリーとして表示する:

```
## 設定完了

### 有効な機能
- **記憶**: memory-mcp ✓, interoception ✓, recall-hook ✓, compact-recovery ✓
- **音声**: tts ✓, hearing ✓ (+ hearing-hook)
- **視覚**: usb-webcam ✓
- **身体**: なし
- **自律行動**: 有効

### 次にやること
- [ ] .env に API キー・接続情報を設定する
  - ELEVENLABS_API_KEY（tts-mcp 用）
  - ...
- [ ] crontab に autonomous-action.sh を登録する
```

環境変数が必要な MCP を有効にした場合は、具体的に何を `.env` に設定すべきかを列挙する。

`.mcp.json` を変更した場合は、以下を必ず表示する:

> ⚠ `.mcp.json` を変更しました。MCP サーバーの追加・削除を反映するには **Claude Code の再起動**（セッション再起動）が必要です。

最後に一言添える:

> 増やしたり減らしたくなったら、いつでも `/wd-configure` でやり直せます。

---

## 注意事項

- AskUserQuestion は **2回** に抑える（記憶・自律 → 音声・視覚・身体・その他）
- 物理的にディレクトリが存在しない MCP は選択肢に出さない。選択肢が2つ未満になる質問はスキップする
- 既存の設定値（カメラURL等のカスタマイズ済み値）は保持する
- ファイル書き込みにはすべて Write / Edit ツールを使う
- このスキルは MCP・フック・自律行動の設定のみを担当する。SOUL.md の設定は `/wd-setup` に委譲する

入力: $ARGUMENTS
