# 知覚 (Senses) — 見る・聞く・話す

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「知覚」に関わるものをまとめている。

## 構成要素

### 視覚スキル
- **observe** (.claude/commands/observe.md) — 部屋を能動的に観察する。カメラのパン/チルトを操作し、「見る」「予測する」「思い出す」の3ブロックを5-8回ループ。+.exp.md
- **look** (.claude/commands/look.md) — 画像にグリッドを引いて区切り、気になるところを切り出して見る。annotate-grid + clip-image を統合した高レベルスキル
- **annotate-grid** (.claude/commands/annotate-grid.md) — 画像にグリッド線と座標ラベルを描画。--divide N で等分、--every N でピクセル間隔
- **clip-image** (.claude/commands/clip-image.md) — 画像の一部を切り出す。--grid-cell, --grid-range, --rect の3モード

### 聴覚フック
- **hearing-hook.sh** (.claude/hooks/hearing-hook.sh) — UserPromptSubmit で発火。hearing-daemon が蓄積した hearing_buffer.jsonl を読み取り、[hearing] プレフィックス付きでコンテキストに注入
- **hearing-stop-hook.sh** (.claude/hooks/hearing-stop-hook.sh) — Stop hook で聴覚バッファをチェック。新しい発話があればターンを延長
- **hearing-daemon.py** (.claude/hooks/hearing-daemon.py) — 聴覚デーモン（hearing/ ライブラリに移行済み。wifi-cam-mcp の start_listening から起動）

### 発話
- **say** (.claude/commands/say.md) — テキストを音声合成してスピーカーから再生。バックグラウンド実行で発話中も思考を続けられる
- **say.sh** (.claude/scripts/say.sh) — TTS CLI ラッパー。tts-mcp/.env から設定読み込み。--speaker camera|local|both で出力先選択

### ネイティブツール（Swift バイナリ）
- **annotate-grid** (.claude/tools/annotate-grid) — Mach-O ARM64 バイナリ。ソース: annotate-grid.swift
- **clip-image** (.claude/tools/clip-image) — Mach-O ARM64 バイナリ。ソース: clip-image.swift

## 設計思想

embodied AI の「感覚器」。身体性（embodied）が内部感覚なら、知覚（senses）は外部との接点。

1. **視覚は能動的**。observe は受動的なスナップショットではなく、カメラを動かして「見に行く」。予測→確認のループで発見を生む
2. **画像は区切って見る**。annotate-grid で座標確認 → clip-image で切り出し → 詳細確認。全体を漫然と見ると細部が溶ける
3. **聴覚はバッファ経由**。デーモンが常時文字起こしを蓄積し、フックが定期的にコンテキストに注入。1ターン遅延だが自然な「聞こえてきた」体験
4. **発話は非同期**。say は fire-and-forget で、話しながら考え続けられる
5. **Swift ネイティブツール**。画像処理は Python/Bun ではなく macOS ネイティブの Swift バイナリで高速に実行

## 主要フロー

### 能動的観察フロー（observe）
```
/observe [方向]
   │
   ├─ 引数チェック → look_around or look_left/right/up/down
   │
   ▼
┌──────────────────────────────┐
│  [ 見る / 予測する / 思い出す ]│◀──┐
│   3択から1つ選ぶ              │    │
└──────────┬───────────────────┘    │
           │                        │
           ├── 5〜8回ループ ────────┘
           ▼
   save_visual_memory() で記憶に残す
```

### 画像詳細確認フロー（look）
```
/look image.png              → annotate-grid (座標確認)
/look image.png 3 2          → clip-image (1セル切り出し)
/look image.png 1 1 4 3      → clip-image (範囲切り出し)
   │
   ▼
切り出した画像をさらに /look → 再帰的に詳細化
```

### 聴覚フロー
```
wifi-cam-mcp start_listening
   │
   ▼
hearing-daemon (常駐) → hearing_buffer.jsonl に蓄積
   │
   ▼ (UserPromptSubmit)
hearing-hook.sh → [hearing] テキストをコンテキスト注入
   │
   ▼ (Stop hook)
hearing-stop-hook.sh → 新規発話あればターン延長
```

## 関連するシステム

- **記憶** — observe の「思い出す」ブロックが recall / search_memories を呼ぶ。save_visual_memory で視覚記憶を保存
- **身体性** — observe は interoception の時間感覚と連動。「この時間なら人がいるはず」という予測に使う
- **読書** — slide-watch で使う reader.ts と、observe で使うカメラは別系統だが、「1つずつ体験する」思想は共通
