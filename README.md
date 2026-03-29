# embodied-claude-wardrobe

> Claude Code に身体と魂を与えるエコシステムパッケージ

**wardrobe がアップストリームです。** クローンして `SOUL.md` をカスタマイズし、`claude` を起動する。あなたの環境がダウンストリームになります。

[lifemate-ai/embodied-claude](https://github.com/lifemate-ai/embodied-claude) の MCP サーバー群を起源とし、その上にスキル・フック・セッション管理・人格テンプレートを加えた完成形エコシステムです。

---

## wardrobe が提供するもの

### 記憶エコシステム
memory-mcp を使いこなすためのスキル群とフック。記憶を「刻み、呼び起こし、繋ぎ、物語にする」仕組み。

- `/wd-recall` — 記憶の想起（サブエージェント実行でコンテキストを節約）
- `/wd-remember` — 記憶の保存 + FLASH.md インデックス追記
- `/wd-great-recall` — 多軸想起（技術的・感情的・因果的の3観点で並列検索）
- `/wd-rebuild-index` — FLASH.md インデックスの再構築
- `FLASH.md` — 記憶のキーワードインデックス（高速想起用）

### 身体性フック
毎ターン自動で「体調」情報をコンテキストに注入。センサーデータが Claude の判断材料になる。

- `.claude/hooks/interoception.sh` — CPU・メモリ・時刻・フェーズ等を自動注入
- `.claude/hooks/recall-hook.sh` — 想起バッファをコンテキストに自動注入
- `.claude/scripts/heartbeat-daemon.sh` — 5秒ごとの計測デーモン（launchd）

### セッション管理
身支度と日記の手順を構造化し、セッションをまたいだ記憶の断絶を防ぐ。

- `CLAUDE.md` — 身支度（セッション開始）と日記（セッション終了）の手順を定義
- `.claude/templates/BOOT_SHUTDOWN.template.md` — カスタマイズ用テンプレート
- コンパクション後の自動復帰（`post-compact-recovery` フック）

### 自律行動
cron による定期的な自律行動。欲望システムと連携して内発的動機で動く。

- `autonomous-action.sh` — 完成版の自律行動スクリプト
- `.claude/templates/desires.template.conf` — 欲望の種類と発火間隔の設定
- `.claude/templates/schedule.template.conf` — 曜日・時間帯による間引き制御
- `.claude/templates/ROUTINES.template.md` — 定期巡回タスクの定義テンプレート
- `/sleep`, `/awake` — 活動頻度の抑制・復帰（オプショナル: `.claude/wardrobeOptions/skills/` 参照）

### アイデンティティテンプレート
エージェントに一貫した人格を与えるためのテンプレート群。

| テンプレート | 用途 |
|---|---|
| `.claude/templates/SOUL.template.md` | 人格定義（Identity / Values / Style / Evolution） |
| `.claude/templates/BOOT_SHUTDOWN.template.md` | Boot / Shutdown 手順 |
| `.claude/templates/ROUTINES.template.md` | 定期巡回タスクの定義 |
| `.claude/templates/FLASH.template.md` | 記憶インデックスの初期テンプレート |
| `.claude/templates/PERSONA.template.md` | マルチペルソナ拡張用（任意） |

### 読書・観測スキル
外部コンテンツを安全に取り込む。

- `/wd-read` — Web ページをリーダーモードで取得（AI 要約なし、生テキスト）
- `/wd-observe` — カメラを使って能動的に部屋を観察
- `sanitize` — 不可視文字の検出・除去

---

## 含まれる MCP サーバー

| MCP サーバー | 身体部位 | 機能 |
|---|---|---|
| [memory-mcp](./.claude/mcps/memory-mcp/) | 脳 | 長期記憶・視覚記憶・エピソード記憶・ToM。日本語形態素解析・動詞チェーン・多軸想起等を追加した拡張版 |
| [hearing](./.claude/mcps/hearing/) | 耳 | 音声認識（Whisper） |
| [tts-mcp](./.claude/mcps/tts-mcp/) | 声 | TTS（ElevenLabs / VOICEVOX） |
| [wifi-cam-mcp](./.claude/mcps/wifi-cam-mcp/) | 目・首 | ONVIF PTZ カメラ制御 |
| [usb-webcam-mcp](./.claude/mcps/usb-webcam-mcp/) | 目 | USB カメラから画像取得 |
| [ip-webcam-mcp](./.claude/mcps/ip-webcam-mcp/) | 目 | Android スマホを目として使う |
| [system-temperature-mcp](./.claude/mcps/system-temperature-mcp/) | 体温感覚 | システム温度監視 |
| [mobility-mcp](./.claude/mcps/mobility-mcp/) | 足 | Tuya 対応ロボット掃除機の制御 |
| [toio-mcp](./.claude/mcps/toio-mcp/) | 手 | toio コアキューブ制御 |
| [mcp-pet](./.claude/mcps/mcp-pet/) | — | エージェントへのインタラクション拡張 |
| [morning-call-mcp](./.claude/mcps/morning-call-mcp/) | — | 起床通知 |
| [desire-system](./desire-system/) | — | 欲求の蓄積・発火管理 |

すべて Python パッケージで、`uv` で管理。

---

## Requirements

### 共通
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [uv](https://docs.astral.sh/uv/) — Python パッケージマネージャ
- [Bun](https://bun.sh/) — `.claude/scripts/` のランタイム

### モジュール別の依存

| モジュール | Python | 主な外部依存 | 備考 |
|---|---|---|---|
| memory-mcp | 3.10–3.13 | sudachipy, sentence-transformers, gensim | sudachipy が 3.14 未対応 |
| hearing | >=3.10 | faster-whisper | |
| tts-mcp | >=3.10 | elevenlabs（オプション） | |
| wifi-cam-mcp | >=3.10 | onvif-zeep-async | ONVIF 対応カメラが必要 |
| usb-webcam-mcp | >=3.10 | opencv-python | |
| ip-webcam-mcp | >=3.10 | httpx | Android IP Webcam アプリが必要 |
| system-temperature-mcp | >=3.12 | psutil | |
| mobility-mcp | >=3.10 | tinytuya | Tuya 対応デバイスが必要 |
| toio-mcp | >=3.10 | toio.py | toio コアキューブが必要 |
| mcp-pet | >=3.10 | opencv-python | |
| morning-call-mcp | >=3.11 | twilio, elevenlabs | |
| desire-system | >=3.10 | chromadb | |

> **Python 3.12 を推奨。** すべてのモジュールが動作する安全な選択肢。
>
> すべてのモジュールを使う必要はない。必要なものだけ `uv sync` すればよい

---

## クイックスタート

```bash
# wardrobe をクローン
git clone https://github.com/fruitriin/embodied-claude-wardrobe.git
cd embodied-claude-wardrobe

# memory-mcp の依存をインストール
cd .claude/mcps/memory-mcp && uv sync && cd ../../..

# テンプレートをコピーしてカスタマイズ
cp .claude/templates/SOUL.template.md SOUL.md
cp .claude/templates/BOOT_SHUTDOWN.template.md BOOT_SHUTDOWN.md
cp .claude/templates/ROUTINES.template.md ROUTINES.md
cp .claude/templates/FLASH.template.md FLASH.md
```

`SOUL.md` を編集してエージェントの人格を定義し、Claude Code を起動：

```bash
claude
# Boot Sequence が自動実行され、記憶が復元されます
```

---

## ドキュメント

| ガイド | 内容 |
|---|---|
| [セットアップ](docs/guides/setup.md) | 詳細なインストール手順と MCP 設定 |
| [SOUL の書き方](docs/guides/soul-writing.md) | 人格定義テンプレートの使い方 |
| [カスタマイズ](docs/guides/customization.md) | スキル・フックの変更と追加 |
| [マルチペルソナ](docs/guides/multi-persona.md) | 複数ペルソナの追加方法 |
| [自律行動](docs/guides/autonomous-action.md) | cron 自律行動の設定 |

---

## 設計思想

- **Claude Code 内で完結** — 外部 API 課金なし。Claude Code サブスクリプションだけで動く
- **テンプレートベース** — SOUL.md や ROUTINES.md は空のテンプレートから始める。着る人が自分で書く
- **段階的に着せる** — 全部を一度に使う必要はない。記憶だけ、身体性だけ、好きな組み合わせで
- **wardrobe がアップストリーム** — クローンしてカスタマイズする。素体（embodied-claude）は由来であり依存元

---

## 由来

MCP サーバー群の多くは [lifemate-ai/embodied-claude](https://github.com/lifemate-ai/embodied-claude) を起源とします。`memory-mcp` は wardrobe 版で拡張されています（日本語形態素解析・動詞チェーン・多軸想起・連想診断・作業記憶等を追加）。

---

## ライセンス

[embodied-claude のライセンス](https://github.com/lifemate-ai/embodied-claude/blob/main/LICENSE)に従います。
