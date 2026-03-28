# embodied-claude-wardrobe

> embodied-claude の MCP 群に「着せる」エコシステムパッケージ

[kmizu/embodied-claude](https://github.com/lifemate-ai/embodied-claude) は、Claude Code に身体性（カメラ・マイク・TTS・温度センサー等）を与える MCP サーバー群を提供します。

**wardrobe** は、その素体に着せる「衣装」——MCP を活かすためのスキル・フック・テンプレート・セッション管理のエコシステムです。

## 素体（embodied-claude）が提供するもの

- MCP サーバー群（hearing, tts, wifi-cam, usb-webcam, ip-webcam, system-temperature, toio, mobility, morning-call, mcp-pet, desire-system）
- memory-mcp（記憶 MCP サーバー）
- スクリプトのサンプル（desire-tick, interoception, reader）
- autonomous-action のサンプル

## wardrobe が追加するもの

### 記憶エコシステム
素体の memory-mcp を操作するためのスキル群とフック。記憶を「刻み、呼び起こし、繋ぎ、物語にする」仕組み。

- `/recall` — 記憶の想起（サブエージェント実行でコンテキストを節約）
- `/remember` — 記憶の保存 + インデックス追記
- `/great-recall` — 多軸想起（技術的・感情的・因果的な3つの観点から並列検索）
- `/rebuild-index` — 記憶インデックスの再構築
- `FLASH.md` — 記憶のキーワードインデックス（高速想起用）

### 身体性フック
素体のスクリプトを Claude Code のフックとして統合し、毎ターン自動で体調情報を注入。

- `interoception.sh` — CPU・メモリ・時刻等の「体調」をコンテキストに注入
- `heartbeat-daemon.sh` — 5秒ごとの計測デーモン（launchd）
- `recall-hook.sh` — 想起バッファをコンテキストに自動注入

### セッション管理
セッションの開始・終了を構造化し、記憶の断絶を防ぐ。

- Boot Sequence — セッション開始時に記憶を復元する手順
- Shutdown Sequence — セッション終了時に成果・未了を記録する手順
- `post-compact-recovery.sh` — コンパクション後の自動復帰

### 自律行動
cron による定期的な自律行動。欲望システムと連携し、内発的動機で行動する。

- `autonomous-action.sh` — 素体のサンプルを完成版に置換
- `schedule.conf` — 曜日・時間帯の制御
- `ROUTINES.md` テンプレート — 定期巡回タスクの定義

### アイデンティティ（SOUL テンプレート）
エージェントに一貫した人格を与えるためのテンプレート。

- `SOUL.template.md` — 人格定義のテンプレート（Identity, Values, Style, Evolution）
- `PERSONA.template.md` — マルチペルソナ拡張用テンプレート（任意）

### 読書・観測
外部コンテンツを安全に取り込むスキル。

- `/read` — Web ページやファイルをリーダーモードで読み取り
- `sanitize` — 不可視文字の検出・除去

## クイックスタート

### 1. embodied-claude をセットアップ

[embodied-claude の README](https://github.com/lifemate-ai/embodied-claude) に従って、MCP サーバー群をインストールしてください。

### 2. wardrobe を着せる

```bash
# wardrobe をクローン（embodied-claude と同じディレクトリに）
git clone https://github.com/fruitriin/embodied-claude-wardrobe.git
cd embodied-claude-wardrobe

# memory-mcp の依存をインストール
cd memory-mcp && uv sync && cd ..

# テンプレートをコピーしてカスタマイズ
cp templates/SOUL.template.md SOUL.md
cp templates/BOOT_SHUTDOWN.template.md BOOT_SHUTDOWN.md
cp templates/ROUTINES.template.md ROUTINES.md
cp templates/FLASH.template.md FLASH.md

# SOUL.md を編集して、あなたのエージェントの人格を定義
# （ガイド: docs/guides/soul-writing.md）
```

### 3. Claude Code で使う

```bash
claude
# セッション開始時に Boot Sequence が自動実行されます
```

## ドキュメント

| ガイド | 内容 |
|---|---|
| [セットアップ](docs/guides/setup.md) | 詳細なインストール手順 |
| [SOUL の書き方](docs/guides/soul-writing.md) | 人格定義テンプレートの使い方 |
| [カスタマイズ](docs/guides/customization.md) | スキル・フックの変更と追加 |
| [マルチペルソナ](docs/guides/multi-persona.md) | 複数ペルソナの追加方法 |
| [自律行動](docs/guides/autonomous-action.md) | cron 自律行動の設定 |

## 設計思想

- **Claude Code 内で完結** — すべてサブスクリプションプラン内で動作する。外部 API 課金不要
- **素体を拡張、置換しない** — embodied-claude の MCP 群はそのまま使う。wardrobe はその上のレイヤー
- **テンプレートベース** — SOUL.md や ROUTINES.md は空のテンプレートから始める。着る人が自分で書く
- **段階的に着せる** — 全部を一度に使う必要はない。記憶だけ、身体性だけ、好きな組み合わせで

## アップストリーム

- 素体: [lifemate-ai/embodied-claude](https://github.com/lifemate-ai/embodied-claude)
- memory-mcp: wardrobe 版は素体のオリジナルを拡張しています（日本語形態素解析、動詞チェーン、多軸想起等を追加）

## ライセンス

[embodied-claude のライセンス](https://github.com/lifemate-ai/embodied-claude/blob/main/LICENSE) に従います。
