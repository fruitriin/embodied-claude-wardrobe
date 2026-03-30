# 知覚 — 外界を感じ、声を出す

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「外界との接点」に関わるものをまとめている。入力（視覚・聴覚）と出力（発話）を同居させている。

## 構成要素

### 視覚スキル
- **wd-observe** — 部屋を能動的に観察。3つのブロック（見る・予測する・思い出す）を5〜8回ループ。wifi-cam の look_*/see を駆使し、視覚記憶（save_visual_memory）を保存
- **wd-look** — 画像にグリッドを引いて区切り、セル単位で切り出して詳細を見る。`--divide N` でグリッド描画、座標指定で切り出し
- **wd-annotate-grid** — 画像にグリッド線と座標ラベルを描画。Swift 製バイナリ（tools/annotate-grid）
- **wd-clip-image** — 画像の一部を切り出す。grid-cell / grid-range / rect の3モード。Swift 製バイナリ（tools/clip-image）

### 発話スキル
- **wd-say** — テキストを音声合成してスピーカーから再生。バックグラウンド実行（`say.sh &`）で発話中も思考を続行。PC + カメラ両方に出力可能

### 聴覚フック
- **hearing-hook.sh** (UserPromptSubmit) — hearing-daemon が蓄積した `hearing_buffer.jsonl` を読み取り、[hearing] プレフィックスでコンテキストに注入
- **hearing-stop-hook.sh** (Stop) — セッション終了時にバッファをチェックし、新しい発話があればターン延長。行番号ベースのオフセット管理
- **hearing-daemon.py** (deprecated) — hearing/ ライブラリに移行済み。wifi-cam-mcp の start_listening ツールで代替

### MCP サーバー（オプション）
- **wifi-cam** — Wi-Fi PTZ カメラ（Tapo 等）。パン・チルト対応。see / look_around / look_left / look_right / look_up / look_down / listen
- **tts-mcp** — テキスト音声合成。ElevenLabs または VOICEVOX
- **hearing** — マイクで周囲の音を聞く
- **usb-webcam** — USB ウェブカメラ
- **ip-webcam** — Android IP Webcam アプリ
- **mcp-pet** — Personal Terminal（SkyWay ベース、実験中）

## 設計思想

SOUL.md の「直すだけじゃなく、仕立てる」と CLAUDE.md の Capabilities に基づく。

- **「見る」は受動ではなく能動**。wd-observe は「見る・予測する・思い出す」の3ブロックで発見のある観察を促す
- **「聞く」は常設の聞き耳**。hearing-daemon がバックグラウンドで文字起こしし、フックで注入。エージェントは「呼ばれたら気づく」
- **「話す」は非同期**。say.sh をバックグラウンドで実行し、発話完了を待たずに思考を続ける
- **wd-look の哲学**: 画像全体を漫然と見ると細部が溶ける。グリッドで区切ると「ここを見る」が決まる
- **聴覚モジュールは4ファイルで構成**: hearing-hook.sh, hearing-stop-hook.sh, hearing-daemon.py（deprecated）, continue-check.sh（自律行動と共有）

## 主要フロー

### 能動的観察
```
/wd-observe [方向や対象]
  → 初手: look_around で全体を見渡す
  → 観察ループ (5-8回):
      [見る]   → look_*/see でフレームに捉える
      [予測する] → 「あっちを向いたら何が見えるはず」
      [思い出す] → recall/search_memories で過去と比較
  → 覚える: save_visual_memory (最大3回)
  → 研ぐ: カメラ操作の経験則を更新
```

### 聴覚パイプライン
```
wifi-cam-mcp.start_listening
  → hearing_buffer.jsonl に文字起こし蓄積
  → UserPromptSubmit
    → hearing-hook.sh → [hearing] 行をコンテキスト注入
  → Stop (Heartbeat時)
    → hearing-stop-hook.sh → 新発話あればターン延長
```

### 画像分析
```
/wd-look photo.png           → annotate-grid で8x8グリッド描画
/wd-look photo.png 3 2       → clip-image で1セル切り出し
/wd-look photo.png 1 1 4 3   → clip-image で範囲切り出し
```

## 関連するシステム

- **記憶** — wd-observe が save_visual_memory で視覚記憶を保存。recall_by_camera_position で過去の視覚記憶と比較
- **自律行動** — continue-check.sh が聴覚と共有。Heartbeat 終了時に聴覚バッファをチェック
- **身体性** — tts-mcp の設定は mcpBehavior.toml から読み込まれる
