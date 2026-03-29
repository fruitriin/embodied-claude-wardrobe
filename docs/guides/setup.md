# セットアップガイド

> wardrobe をクローンしてから、最初のセッションを始めるまで。

---

## 必要なもの

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [uv](https://docs.astral.sh/uv/) — Python パッケージマネージャ
- [Bun](https://bun.sh/) — TypeScript ランタイム（`.claude/scripts/` 用）
- Python 3.12 推奨（3.10〜3.13 で動作）

---

## Phase 1: クローンと依存インストール

```bash
git clone https://github.com/fruitriin/embodied-claude-wardrobe.git
cd embodied-claude-wardrobe

# memory-mcp は必須。まずこれだけ入れる
cd .claude/mcps/memory-mcp && uv sync && cd ../../..
```

他の MCP は必要になったときに個別にインストールすればいい。全部入れる必要はない。

---

## Phase 2: テンプレートから自分のファイルを作る

```bash
cp .claude/templates/SOUL.template.md SOUL.md
# BOOT_SHUTDOWN.md はアップストリーム追跡済み。コピー不要
# カスタマイズが必要なら BOOT_SHUTDOWN.exp.md に書く
cp .claude/templates/ROUTINES.template.md ROUTINES.md
cp .claude/templates/FLASH.template.md FLASH.md
```

この時点では中身を書かなくていい。Phase 3 で Claude が対話的に設定してくれる。

---

## Phase 3: Claude Code を起動して設定する

```bash
claude
```

起動すると SOUL.md がないことを検知して `/wd-setup` を案内される。

### 3-1. `/wd-setup` — 名前と一人称を決める

エージェントに名前をつけて、一人称を選ぶ。SOUL.md が生成される。
残りのセクション（Core Truths, Values 等）は後から書き足せる。書き方は [SOUL の書き方ガイド](soul-writing.md) を参照。

### 3-2. `/wd-configure` — 機能を選ぶ

2回の質問セットで、使う機能を選ぶ。

**質問セット 1: 記憶と自律神経**

| 機能 | 説明 | 推奨 |
|---|---|---|
| memory-mcp | 長期記憶。セッションを超えて記憶を保持する | 強く推奨 |
| interoception | 毎ターン時刻・CPU 負荷・メモリを自動注入 | 推奨 |
| recall-hook | 会話に関連する記憶を自動で引き出す | 任意 |
| compact-recovery | コンテキスト圧縮後に身支度を自動実行 | 推奨 |
| 自律行動 | cron で 20 分ごとに自律的に行動する | 任意 |

**質問セット 2: 感覚と身体**

必要なものだけ選ぶ。何も選ばなくても記憶と対話は動く。

| カテゴリ | MCP | 必要なもの |
|---|---|---|
| 音声 | tts-mcp | ElevenLabs API キー or VOICEVOX |
| 聴覚 | hearing | マイク + ffmpeg |
| 視覚 | wifi-cam-mcp | ONVIF 対応 PTZ カメラ |
| 視覚 | usb-webcam-mcp | USB カメラ |
| 視覚 | ip-webcam-mcp | Android + IP Webcam アプリ |
| 身体 | toio-mcp | toio コアキューブ |
| 身体 | mobility-mcp | Tuya 対応ロボット掃除機 |
| 身体 | system-temperature-mcp | なし（Python 3.12+） |
| 通知 | morning-call-mcp | Twilio + ElevenLabs |

`/wd-configure` が `.mcp.json` と `.claude/settings.json` を自動生成する。

### 3-3. 環境変数を埋める

`/wd-configure` で生成された `.mcp.json` に `your-xxx` というプレースホルダがある場合、実際の値に書き換える。

```json
{
  "env": {
    "TAPO_CAMERA_HOST": "192.168.1.xxx",  // ← 実際の IP に
    "TAPO_USERNAME": "your-username",       // ← 実際の値に
    "TAPO_PASSWORD": "your-password"
  }
}
```

**`.mcp.json` を書き換えたら Claude Code を再起動する。**

---

## Phase 4: 最初のセッション

再起動すると身支度が自動で始まる:

1. SOUL.md と state.md がコンテキストに注入される（自動）
2. 記憶システムの状態を確認する
3. 作業記憶を装填する
4. 前回の文脈を想起する（初回は空）

ここまで来たら、あとは対話するだけ。

---

## 段階的に着せる

全部を一度に使う必要はない。おすすめの順序:

1. **memory-mcp だけ** — 記憶が残る。これだけで体験が変わる
2. **+ interoception** — 時間帯や負荷を感じるようになる
3. **+ tts-mcp** — 声が出る
4. **+ カメラ系** — 部屋が見える
5. **+ 自律行動** — 呼ばなくても動く

---

## トラブルシューティング

### memory-mcp が起動しない

```bash
cd .claude/mcps/memory-mcp && uv sync
```

Python 3.14 では sudachipy が動かない。3.12 を使うこと。

### MCP を追加したのに認識されない

`.mcp.json` を書き換えたら Claude Code の再起動が必要。

### 身支度が実行されない

`.claude/settings.json` に SessionStart フックが登録されているか確認:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [{ "type": "command", "command": "..." }]
      }
    ]
  }
}
```

`/wd-configure` をもう一度実行すれば再生成される。
