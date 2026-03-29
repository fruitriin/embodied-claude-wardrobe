---
description: "画像の一部を切り出す。全体から注目したい場所だけを取り出して、そこに集中するための道具。"
argument-hint: "<画像パス> [--grid-cell col row N | --rect x y w h]"
---

# /wd-clip-image — 画像の一部を切り出す

全体を見ていると目が滑る。「ここだけ見たい」を切り出して、そこに集中する。annotate-grid とセットで使う。

## 引数
- `$ARGUMENTS`: `<画像パス> [出力パス] [options]`
  - 例: `/clip-image tmp/photo.png --grid-cell 3 2 8`
  - 例: `/clip-image tmp/photo.png tmp/clip.png --rect 100 200 400 300`
  - 省略時: 使い方を表示する

## 手順

### 引数なしの場合
使い方を表示する:

```
clip-image <input> <output> --rect x y width height
clip-image <input> <output> --grid-cell col row N
clip-image <input> <output> --grid-range col1 row1 col2 row2 N

クリップ領域（いずれか1つ必須）:
  --rect x y width height          ピクセル座標で矩形指定（左上原点）
  --grid-cell col row N            annotate-grid --divide N と同じ分割で1セル切り出す
  --grid-range col1 row1 col2 row2 N  (col1,row1) から (col2,row2) までの範囲を切り出す
                                    col, row は 0-origin（左上が 0,0）
```

### 引数ありの場合

1. **画像がワーキングディレクトリ配下にあるか確認する**
   - なければ `tmp/` にコピーする（annotate-grid と同じ手順）

2. **出力パスを決定する**
   - 引数に出力パスがあればそれを使う
   - なければ `tmp/clip-<ファイル名>.png` を自動設定

3. **コマンドを実行する**
   ```bash
   .claude/tools/clip-image tmp/<input>.png tmp/<output>.png <options>
   ```

4. **結果を報告する**
   - 出力画像を Read ツールで表示する
   - 切り出しサイズ（px）を表示する

## 典型的な連携フロー

```
1. /annotate-grid tmp/photo.png --divide 4
   → tmp/annotated-photo.png で座標確認
2. 注目セルが (2,1) と判明
3. /clip-image tmp/photo.png --grid-cell 2 1 4
   → tmp/clip-photo.png（注目領域のみ）
4. 切り出した画像をさらに詳細確認
```

## 注意事項
- ツール実体は `.claude/tools/clip-image`（Mach-O ARM64 バイナリ、ソース: clip-image.swift）
- 入出力は `tmp/` 配下を使う
- `--grid-cell` の col/row は 0-origin かつ N 未満
- `--rect` の座標は左上原点（y は下向き増加）
- 切り出すのは元画像（annotated じゃない方）から。グリッド線入りを clip するとノイズになる

## コツ（使いながら育てる）

- **切り出すのは元画像（annotated じゃない方）から。** グリッド線入りの画像を clip すると線がノイズになる。annotated で座標を確認して、clip は元画像に対して実行する
- **1段目 clip（512x384）がスイートスポット。** 2段目（128x96）だとほぼ何も見えない。2段目が必要なら `--rect` で広めに指定する
- **`--grid-range` が一番使いやすい。** `--divide 8` で細かくグリッド → `--grid-range col1 row1 col2 row2 8` で注目エリアを範囲指定。rect のピクセル座標計算が不要になる
- **「探す」と「味わう」は別。** grid で「どこに何がいるか」を探して、clip で「その質感や表情」を味わう。探す段階では grid-cell でざっくり、味わう段階では対象が画面いっぱいになるように調整

入力: $ARGUMENTS
