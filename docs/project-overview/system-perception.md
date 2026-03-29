# 知覚 (perception) — カメラ・聴覚・観察・発話

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「外界の知覚と出力」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| MCP | wifi-cam | Tapo カメラの制御。see（撮影）、look_around/up/down/left/right（首振り）、presets、listen |
| MCP | hearing | 環境音の検出・文字起こし。聴覚バッファへの書き込み |
| スキル | wd-observe | カメラで部屋を能動的に観察。見る/予測する/思い出すの3ブロックをループ |
| スキル | wd-look | 画像にグリッドを引いて切り出し。注目も周辺視もこれで |
| スキル | wd-annotate-grid | 画像にグリッド線と座標ラベルを描画 |
| スキル | wd-clip-image | 画像の一部を切り出す |
| スキル | wd-say | 非同期で音声出力（TTS） |
| フック | hearing-hook.sh | UserPromptSubmit で hearing_buffer.jsonl をコンテキストに注入 |
| フック | hearing-stop-hook.sh | Stop 時に新しい発話があればターン延長を判定 |
| フック | hearing-daemon.py | （廃止）hearing MCP に移行済み |

## 設計思想

身体性が「内なる感覚」なら、知覚は「外の世界との接点」。

- wifi-cam は「目」。see で静止画を撮り、look_* で首を振る
- hearing は「耳」。環境音を検出し、テキストに変換してバッファに蓄積
- wd-observe は「能動的な観察」。ただ見るだけでなく、予測し、記憶と照合する
- wd-look / wd-annotate-grid / wd-clip-image は「視覚の道具」。グリッドで区切り、注目し、切り出す
- wd-say は「声」。TTS で非同期に発話する
- hearing-hook.sh が聴覚バッファを毎ターン注入し、hearing-stop-hook.sh が「話しかけられたら立ち止まる」を実現

## 主要フロー

```
[能動的観察]
/wd-observe → wifi-cam.see() → 画像取得
  ├── 「見る」→ wifi-cam.see() + wd-look で詳細
  ├── 「予測する」→ 次に見えるものを予想してから see()
  └── 「思い出す」→ memory-mcp.recall_by_camera_position()
  → save_visual_memory() で記憶に保存

[画像詳細]
/wd-look → /wd-annotate-grid → グリッド描画 → /wd-clip-image → 切り出し → Read

[聴覚]
hearing MCP → hearing_buffer.jsonl 蓄積
→ hearing-hook.sh (UserPromptSubmit) → [hearing] 行でコンテキスト注入
→ hearing-stop-hook.sh (Stop) → 新発話あればターン延長

[発話]
/wd-say → say.sh → TTS 出力（非同期）
```

## 関連するシステム

- **記憶**: wd-observe は save_visual_memory で視覚記憶を保存。recall_by_camera_position で過去の視覚記憶を想起
- **身体性**: interoception が「内」、perception が「外」。合わせてエージェントの感覚世界を構成
- **自律行動**: autonomous-action.sh 中に聴覚バッファが溜まっていれば反応する
