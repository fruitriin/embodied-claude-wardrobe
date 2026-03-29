---
description: "画像にグリッド線と座標ラベルを描く。画像全体だと気が散るとき、注目して見るための道具。"
argument-hint: "<画像パス> [--divide N | --every N]"
---

# /annotate-grid — 画像にグリッドを描く

画像全体を漫然と見ていると、細部が溶けて見えなくなる。グリッドで区切ると「ここを見る」が決まる。注目するための道具。

## 引数
- `$ARGUMENTS`: `<画像パス> [出力パス] [options]`
  - 例: `/annotate-grid tmp/photo.png --divide 4`
  - 例: `/annotate-grid tmp/photo.png tmp/grid.png --every 200 --font-size 16`
  - 省略時: 使い方を表示する

## 手順

### 引数なしの場合
使い方を表示する:

```
annotate-grid <input> <output> --divide N    # 縦横 N 等分
annotate-grid <input> <output> --every N     # N px ごとに線

スタイルオプション:
  --line-color  RRGGBBAA   グリッド線色 (default: FF000080)
  --label-color RRGGBBAA   ラベル文字色 (default: FFFF00FF)
  --label-bg    RRGGBBAA   ラベル背景色 (default: 00000080)
  --font-size   N          フォントサイズ pt (default: 12)

ラベル形式:
  --divide: 各セル左上に "col,row"（0-origin、左上が 0,0）
  --every:  垂直線上端に "x=N"、水平線左端に "y=N"
```

### 引数ありの場合

1. **画像をワーキングディレクトリ配下にコピーする**（パストラバーサル防止のため）
   - 外部パスから `tmp/` にコピーする
   - 既に `tmp/` にあればそのまま使う

   ```bash
   mkdir -p tmp
   cp <元画像パス> tmp/<ファイル名>
   ```

   - JPG の場合は先に PNG に変換する:
   ```bash
   sips -s format png tmp/photo.jpg --out tmp/photo.png
   ```

2. **出力パスを決定する**
   - 引数に出力パスがあればそれを使う
   - なければ `tmp/annotated-<ファイル名>.png` を自動設定

3. **コマンドを実行する**
   ```bash
   .claude/tools/annotate-grid tmp/<input>.png tmp/<output>.png <options>
   ```

4. **結果を報告する**
   - 出力画像を Read ツールで表示する
   - 次のステップを案内する:
     ```
     注目セルが見つかったら:
       /clip-image tmp/<file>.png --grid-cell col row N
     ```

## 典型的な使い方

### annotate-grid → clip-image の流れ
```
1. /annotate-grid tmp/photo.png --divide 4
   → tmp/annotated-photo.png で座標確認
2. セル (2,1) が気になる
3. /clip-image tmp/photo.png --grid-cell 2 1 4
   → 切り出した部分を確認
```

## 注意事項
- ツール実体は `.claude/tools/annotate-grid`（Mach-O ARM64 バイナリ、ソース: annotate-grid.swift）
- 入出力は `tmp/` 配下を使う
- 大きな画像（Retina @2x 等）では `--font-size 20` に調整する
- `--divide 0` / `--every 0` はエラー

## コツ（使いながら育てる）

- **まず `--divide 4` から始める。** 16セルなら一目で「どのセルが気になるか」を選べる。8だと64セルで迷う。4で見て、気になるセルをさらに clip → 再 grid する方が発見がある
- **グリッドは「見る前」に引く。** 画像を先に見てしまうと全体の印象に引きずられる。グリッドを引いてからセル単位で見ると、全体に埋もれていたものに気づける
- **clip してから観察する。** 画像全体より切り出した部分の方が、注目点が明確になる
- **カメラ画像（640x480）は `--divide 4` で十分。** 高解像度写真（2048x1536）は `--divide 4` → clip → `--divide 4` の2段階が有効
- **ccpocket 写真は `--font-size 20` がちょうどいい。** 2048px 幅でデフォルト 12pt だとラベルが小さすぎて読めない
- **「細かく割って、広めに切る」が最強パターン。** `--divide 8` で座標を細かく確認 → `--grid-range` で注目エリアを複数セルまたいで広く切り出す

入力: $ARGUMENTS
