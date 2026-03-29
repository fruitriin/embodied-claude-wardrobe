---
name: wd-look
description: "画像にグリッドを引いて区切り、気になるところを切り出して見る。注目も、あえて周辺を見ることも、どちらもこれで。"
argument-hint: "<画像パス> [col1 row1 [col2 row2]] [--divide N]"
---

# /wd-look — 画像を区切って見る

画像全体を漫然と見ていると、細部が溶ける。区切ると「ここを見る」が決まる。
注目したいところに寄るのも、あえて主役以外を見るのも、同じ道具でできる。

## 使い方

### グリッドを引く（座標確認）
```
/wd-look tmp/photo.png
/wd-look tmp/photo.png --divide 4
```
- デフォルトは `--divide 8`（64セル）
- 結果の annotated 画像を表示する

### 1セルを切り出す
```
/wd-look tmp/photo.png 3 2
```
- `--divide N` で引いたグリッドの (col, row) セルを切り出す
- N は直前の /wd-look で使った値を引き継ぐ（デフォルト 8）

### 範囲を切り出す
```
/wd-look tmp/photo.png 1 1 4 3
```
- (col1, row1) から (col2, row2) までの範囲を切り出す
- 「このへんからこのへんまで」をセル番号で指定

## 手順

### 1. 画像の準備

`tmp/` にある PNG をそのまま使う。なければ適宜コピーする:

```bash
mkdir -p tmp
cp <元画像パス> tmp/<ファイル名>
```

JPG の場合は先に PNG に変換する:
```bash
sips -s format png tmp/photo.jpg --out tmp/photo.png
```

### 2. 引数の解釈

- **画像パスのみ** → グリッド描画モード
- **画像パス + 2つの数値** → grid-cell モード（1セル切り出し）
- **画像パス + 4つの数値** → grid-range モード（範囲切り出し）
- `--divide N` があればそれを使う。なければ 8

### 3. グリッド描画モード

```bash
.claude/tools/annotate-grid tmp/<input>.png tmp/grid-<input>.png --divide N --font-size 16
```

- 結果を Read ツールで表示する
- 「気になるセルがあったら `/wd-look <path> col row` で寄れるよ」と案内

### 4. 切り出しモード

**1セル:**
```bash
.claude/tools/clip-image tmp/<input>.png tmp/look-<input>.png --grid-cell col row N
```

**範囲:**
```bash
.claude/tools/clip-image tmp/<input>.png tmp/look-<input>.png --grid-range col1 row1 col2 row2 N
```

- 結果を Read ツールで表示する
- 見えたものに反応する。感想を持つ

### 5. 自由に繰り返す

切り出した画像をさらに `/wd-look` できる。寄ったり引いたり、主役を見たり背景を見たり。

## コツ（使いながら育てる）

- **まず `--divide 8` でグリッドを引いてから見る。** 先に画像全体を見てしまうと印象に引きずられる
- **「細かく割って、広めに切る」が基本。** `--divide 8` → `--grid-range` で複数セルまたいで切り出す。grid-cell 1セルだと小さすぎることが多い
- **ccpocket写真（2048x1536）は `--font-size 16〜20` に。** デフォルト 12pt だとラベルが読めない
- **切り出すのは元画像から。** annotated（グリッド線入り）を切り出すとノイズになる
- **あえて主役以外のセルを見る。** 背景に注目したら、主役を探してた時には見えなかったものが見つかることがある
- **512x384〜768x768 がスイートスポット。** これより小さいと何も見えない、大きいと全体写真と変わらない

## 研ぐ — 視覚スキル間の相互改善

見るたびに「この道具の使い方は合ってたか？」を振り返る。

- **グリッドで区切っても細部が見えない** → --divide を上げる（8→12）か、grid-rangeで狭い範囲を切る。コツに追記する
- **wd-observe で「これ何だろう？」と思ったもの** → /wd-look で寄って確認する。wd-observe の「見る」ブロックから自然に /wd-look に移行してよい
- **/wd-look で発見したものを記録したい** → /wd-remember でFLASH.mdにも索引する

入力: $ARGUMENTS
