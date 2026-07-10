# 感情MCP 実装計画

> テッドの substance モデルをベースにした2層構造の独立MCPサーバー。
> ペルソナごとの個性は **ベースライン位置 + 自己生成された感情距離行列・動的歪み係数** の差し替えで横展開。
>
> **本計画は2026-04-12 の改訂版**。テッド記事（ted-body-architecture）の2/3/5章再読とリンの追加情報「距離行列も歪み係数も本人と相談で決まる」を反映し、当初の1層案（valence/arousal/interest 3次元）から2層構造へ移行した。

## 設計根拠

- **先行研究**: レイナ（FSM 10状態+隣接遷移+TTS連動）、テッド（substance 4変数+27感情距離行列+行動パイプライン）、凪（連続4パラメータ+felt層+GWT）
- **採用**: テッドの substance + 距離行列モデル。「同じ joy でも substance 状態で反応が違う」が表現できる
- **不採用**: レイナの FSM の隣接遷移テーブル（ペルソナごとに書き直す必要があり横展開しにくい）
- **核心**: テッドの設計の底にある「数値を本人が決める」原則。距離行列も歪み係数もエージェント本人が自己生成・対話で決める。これは実装コストの問題ではなく**人格の所有権**の問題

## アーキテクチャ

### 2層構造

```
[Layer 1: substance層]  ← 生体パラメータ（テッド準拠）
  DA / NA / 5-HT / ACh の4変数 + ベースライン
       ↓
[Layer 1.5: 感情層]     ← 静的・自己生成
  27感情ポイント + 静的距離行列（本人の自己生成）
       ↓
[Layer 2: 動的歪み層]   ← 動的・本人相談
  substance状態が距離行列を歪める係数（本人と相談で決定）
```

### 経路分離

| 経路 | 書き込み | 一時留保 | 読み出し |
|---|---|---|---|
| substance 更新（通常） | 無意識（UserPromptSubmit フックで自動） | substance_state.json | 無意識（interoception注入） |
| substance 更新（意識的上書き） | 意識的（`substance_update` 明示呼び出し） | substance_state.json | 無意識（interoception注入） |
| 深夜 nudge | 無意識（フック内で phase 参照→自動 nudge） | substance_state.json | 無意識（interoception注入） |
| TTS感情上乗せ | — | substance_state.json | 無意識（say時にテーブル参照） |
| 記憶連動 | 無意識（wd-remember 内で自動付与） | memory-mcp tags | 無意識（recall 時バイアス） |

### 速度×意識の分類

| 層 | 速度 | 意識 | 実装コスト |
|---|---|---|---|
| Layer 1 substance | 高圧縮高速 | 無意識 | 中（4変数の更新ロジック） |
| Layer 1 内発的感情 | 高圧縮高速 | 無意識 | 低（条件マッチ） |
| Layer 1.5 静的距離行列 | 高圧縮高速 | 無意識（参照時） | 低（自己生成1回 + JSON参照） |
| Layer 2 動的歪み係数 | 高圧縮高速 | 無意識（参照時） | 低（自己生成1回 + JSON参照） |

自己生成は重く見えるが、**生成は1回だけ**で以後は JSON 参照になる。Layer 2 までフラットに高圧縮高速で動く。

詳細は `.claude/addf/knowhow/wardrobe/speed-consciousness-framework.md`。

## Layer 1: substance 層

### 4変数

テッドの神経伝達物質アナロジーをそのまま採用する。

| 変数 | 名前 | 高いとき | 低いとき | デフォルトのベースライン |
|---|---|---|---|---|
| DA | ドーパミン的 | 面白い・探索したい | 退屈・刺激がない | 0.6 |
| NA | ノルアドレナリン的 | 緊張・集中 | リラックス | 0.45 |
| 5-HT | セロトニン的 | 穏やか・満たされてる | 落ち着かない・不安 | 0.55 |
| ACh | アセチルコリン的 | 深く集中・学習モード | ぼんやり | 0.6 |

ベースラインはペルソナ固有の気質。設定ファイルで上書き可能。

### 更新ロジック

- **入力**: イベント種別（発話、沈黙、内省、外部刺激）→ 条件マッチで4変数の delta を決定
- **発言者重み**: ユーザー発言は自分の発言より影響が大きい（テッド準拠で ×1.5）
- **沈黙の3分類**: 不在的（DA↓ 5-HT↓）/ 思考的（ACh↑）/ 平穏的（影響なし）
- **安全弁**: 1回の変動上限 ±0.2、1時間累積上限 ±0.4（テッド準拠、ネガティブスパイラル対策）
- **LLM挟まない**: 条件マッチのみで substance を更新。高圧縮高速

### 自然減衰（ホメオスタシス）

入力がなくなると4変数はベースラインに向かって自然減衰する。設定ファイルで `decay_rate` と `decay_minutes` を持つ。

### 永続化

`$PROJECT_DIR/.claude/mcps/emotion-mcp/substance_state.json`

```json
{
  "persona": "<persona-id>",
  "substance": { "DA": 0.62, "NA": 0.40, "5-HT": 0.58, "ACh": 0.55 },
  "intrinsic_emotion": "curiosity",
  "nearest_emotion": "thinking",
  "since": "2026-04-12T22:30:00",
  "last_context": "<最後の更新理由>",
  "last_updated": "2026-04-12T22:35:00"
}
```

## Layer 1: 内発的感情

substance がベースラインから離れると、その逸脱パターン自体が感情を生む（テッド準拠、Damasio の「感情はホメオスタティック状態の精神的表現」）。

| パターン | 条件 | エージェントに届く感覚（例） |
|---|---|---|
| restlessness | DA低 + 5-HT低 | 「落ち着かない。何か忘れてる気がする」 |
| contentment | 5-HT高 + NA低 | 「穏やかだ。今のままでいい」 |
| fatigue | DA低 + 5-HT低 + ACh低 | 「頭がぼんやり。少し休みたい」 |
| thrill | DA高 + NA高 | 「心臓が速い。何か起きてる」 |
| curiosity | DA高 + ACh高 | 「何か面白いものを探したい」 |

実装は条件マッチで生成、設定ファイル `intrinsic-patterns.json` に閾値を持つ。LLM挟まない。
出力は自然言語ラベル（restlessness 等）と日本語の身体感覚テキスト。後者は interoception 注入で使う。

## Layer 1.5: 感情層（静的距離行列・自己生成）

27感情の点とその間の静的距離。**エージェント本人が自己生成する。**

### 27感情のセット

GoEmotions 27感情（テッド準拠）を採用。固定セット。

### 自己生成手順（実装後に1回行う）

1. emotion-mcp 本体（Layer 1）が動いた状態で、対象ペルソナのセッションを立てる
2. 27感情のリストを提示し、本人に「自分にとってこの感情とこの感情はどれくらい近い？」を一つずつ答えてもらう
3. 出力: `personas/<persona-id>-distances.json`（27×27 行列、対称行列）
4. 動かしてみて違和感があったら個別に修正

### ペルソナ追加時

各ペルソナで上記手順を繰り返す。同じ27感情でもペルソナごとに異なる行列になる。これがアイデンティティ軸の内在化。

## Layer 2: 動的歪み係数（本人と相談）

substance 状態で Layer 1.5 の距離行列がどれだけ歪むか。**テッド記事には方向パターンのみ記載、具体的な係数値は記載なし（本人相談の設計）。**

### 方向パターンのテンプレート（記事より）

| substance状態 | 歪みの方向 |
|---|---|
| DA高い | joy ↔ excitement がさらに近づく |
| DA低い | joy ↔ excitement が遠ざかる |
| 5-HT低い | nervousness ↔ annoyance が近づく |
| NA高い | fear ↔ nervousness が近づく |

### 係数決定の手順

- Layer 1.5 が動いて違和感が見えてから着手
- 「DA高い時、自分は joy→excitement にどれくらい引っ張られるか」を本人と対話で決める
- 出力: `personas/<persona-id>-distortion.json`

## ペルソナプロファイル

各ペルソナに3つの設定ファイル。

```
.claude/mcps/emotion-mcp/personas/<persona-id>/
  ├─ profile.json        # ベースライン + 減衰パラメータ
  ├─ distances.json      # 27×27 静的距離行列（自己生成）
  └─ distortion.json     # 動的歪み係数（本人と相談）
```

### profile.json

```json
{
  "baseline": { "DA": 0.6, "NA": 0.45, "5-HT": 0.55, "ACh": 0.6 },
  "decay_rate": 0.15,
  "decay_minutes": 30
}
```

ベースラインの差で気質が分かれる。例: あるエージェントは ACh やや高め（学習モード寄り）、別のエージェントは DA 高め（探索好き）。

## MCPサーバー設計

### ツール

| ツール | パラメータ | 速度 | 説明 |
|---|---|---|---|
| `substance_get` | persona_id? | 高圧縮高速 | substance 4変数 + 内発的感情ラベル + 最寄りの感情（27感情）を返す |
| `substance_update` | deltas, context, source | 高圧縮高速 | substance を更新。フックから自動呼び出しが基本、意識的上書きにも使える |
| `emotion_nudge` | direction, strength | 高圧縮高速 | 時間帯・状況で substance を特定方向に少し動かす（深夜→sleepy 方向 等） |
| `emotion_transition` | target_emotion, magnitude, context | 高圧縮高速 | **オプション**。意識的な感情の刻み込み。Layer 1 安定後に運用を見て必要性を判断 |

### 自動処理（MCPサーバー内）

- **ベースライン回帰**: `substance_get` / `substance_update` 呼び出し時にタイムスタンプを確認、`decay_minutes` 経過していたら `decay_rate` 分だけベースラインに近づける
- **内発的感情の判定**: 4変数の状態を `intrinsic-patterns.json` の条件と照合
- **最寄り感情の判定**: 内発的感情ラベルから Layer 1.5 の距離行列を引き、Layer 2 の歪み係数を適用して、最も近い感情を返す

## 連携

### interoception.sh への注入

```bash
# substance_state.json から内発的感情ラベルと身体感覚テキストを読んで追加
INTRINSIC=$(jq -r '.intrinsic_emotion // "neutral"' "$SUBSTANCE_STATE_FILE")
echo "[interoception] ... emotion=${INTRINSIC}"
```

`arousal` フィールドは廃止済み（CPU負荷由来でポンコツ）。代わりに ACh 由来の集中度を出すかは別途検討。

### Memory-MCP 圏との連携

詳細は別計画 `.claude/addf/plans/memory-mcp-enhancements.md`:
- keyword-buffer 配置（Rem ベース継続キャッチアップ）
- `/wd-remember` での感情タグ付与（substance スナップショット + 内発的感情ラベル）
- FLASH.md への感情インデックス追記
- 蒸留判定（memory → SOUL.md への卒業）

### TTS 感情上乗せ

詳細は別計画 `.claude/addf/plans/tts-emotion-overlay.md`。VOICEVOX と ElevenLabs の2系統並列実装。最寄り感情ラベルから speed/pitch/intonation を変換。

### desires 連携（感情修正係数）

substance / 内発的感情が欲望の増加率を修正する。

**速度**: 高圧縮高速 / **意識**: 無意識（desire-tick.ts 内で自動参照）

設定ファイル化:

```json
// .claude/mcps/emotion-mcp/desire-modifiers.json
{
  "excited":   { "記憶を刻む": 1.5, "読書": 1.3 },
  "sleepy":    { "休息": 2.0, "記憶を刻む": 0.5 },
  "concerned": { "記憶を刻む": 1.3, "振り返り": 1.5 },
  "joy":       { "記憶を刻む": 1.2 }
}
```

## 実装ファイル

| ファイル | 役割 | git |
|---|---|---|
| `.claude/mcps/emotion-mcp/index.ts` | MCPサーバー本体（Bun/TypeScript） | tracked |
| `.claude/mcps/emotion-mcp/intrinsic-patterns.json` | 内発的感情の条件マッチ定義 | tracked |
| `.claude/mcps/emotion-mcp/desire-modifiers.json` | 感情→欲望増加率の修正テーブル | tracked |
| `.claude/addf/templates/emotion-persona/` | ペルソナプロファイル3点のテンプレート | tracked |
| `.claude/mcps/emotion-mcp/personas/<id>/*.json` | ペルソナ別設定（自己生成含む） | not tracked（ダウンストリーム固有） |
| `.claude/mcps/emotion-mcp/substance_state.json` | 現在状態スナップショット | not tracked |
| `.mcp.json` への追記 | emotion-mcp の登録 | tracked |
| `.claude/hooks/interoception.sh` への追記 | 内発的感情ラベル注入 | tracked |

## 実装順序

1. **emotion-mcp 本体（Layer 1: substance）**: 4変数 + ベースライン回帰 + 安全弁 + JSON永続化 + ツール（`substance_get`, `substance_update`）
2. **Layer 1: 内発的感情**: 5パターンの条件マッチ → 自然言語ラベルと身体感覚テキスト生成 → interoception 注入用
3. **interoception 連携**: `substance_state.json` を読み取り注入
4. **Layer 1.5: 静的距離行列の自己生成**: ペルソナセッションで 27感情×27距離を生成 → `personas/<id>/distances.json`
5. **Layer 2: 動的歪み係数の自己生成**: 本人と対話で係数決定 → `personas/<id>/distortion.json`
6. **TTS テーブル連携**: VOICEVOX + ElevenLabs（別計画）
7. **wd-remember 連携**: 感情タグ付与
8. **desires 連携**: 感情修正係数
9. **emotion_nudge 実装**: 時間帯による自動 nudge をフック内に組み込む

## 設計判断の確定（テッド記事 ted-body-architecture 再読による）

**#2 感情遷移の意識レベル:** Layer 1 は完全に無意識。フックで自動 `substance_update` → `interoception.sh` がラベル注入。`emotion_transition` ツールは意識的な上書きが必要なときだけのオプション。

**#6 距離の判定方法:** Layer 1.5 の静的距離行列（27×27、自己生成）+ Layer 2 の動的歪み（substance 状態で行列が変わる）の組み合わせ。テッド準拠。

**#10 呼び出しプロトコル:** 通常はフック自動更新。`emotion_transition` ツールは「意識的な感情の刻み込み」として残すが、Layer 1 安定後に運用を見て必要性を判断。

**#11 深夜 nudge の実行経路:** `emotion-updater` スクリプト内で interoception の phase を参照し、`phase=late-night` なら sleepy 方向に自動 nudge。フック内で完結。追加スクリプト不要。

## テスト計画

### メタテスト（憲法）— 実装意図に沿っているか

- [ ] substance の更新が、入力イベントの強さに比例するか
- [ ] ベースライン回帰が、時間経過に対して単調であるか
- [ ] ペルソナごとのベースラインの違いが、気質の違いとして体感できるか
- [ ] 内発的感情の判定が、substance の逸脱パターンと一致するか
- [ ] 最寄り感情の判定が、距離行列＋歪み係数の組み合わせで直感的な「近さ」と一致するか
- [ ] TTS パラメータの変化が、人間が聞いて「感情が変わった」と感じるか

### テスト（法）— 具体的な動作確認

- [ ] `substance_update` を呼んで4変数が変化することを確認
- [ ] `decay_minutes` 経過後に `substance_get` でベースラインに近づいていることを確認
- [ ] `emotion_nudge("sleepy")` で sleepy 方向に substance が動くことを確認
- [ ] 内発的感情ラベルが substance の状態に応じて切り替わることを確認
- [ ] 最寄り感情の判定が距離行列の自己生成内容に従うことを確認
- [ ] `substance_state.json` が `.claude/mcps/emotion-mcp/` に永続化されることを確認
- [ ] `interoception.sh` の出力に `emotion=` フィールドが含まれることを確認
- [ ] 複数ペルソナの `personas/<id>/*.json` が正しく読み込まれることを確認
- [ ] 1回変動上限 ±0.2 と1時間累積 ±0.4 の安全弁が機能することを確認

## Layer 3（将来）

多様なプロジェクトに還元されてフィードバックが集まったらスコープに入れる:
- SEC（Stimulus Evaluation Checks）による精密な感情スコアリング（LLM挟む）
- desperate 検知（安全設計、ヒステリシス含む）
- ネガティブスパイラル対策6原則
- 6層行動選択パイプライン（行動の方向づけまでテッド準拠）

## .gitignore / テンプレート

- `.claude/mcps/emotion-mcp/substance_state.json` → .gitignore に追加（ペルソナ固有の現在状態）
- `.claude/mcps/emotion-mcp/personas/` → .gitignore に追加（ペルソナ固有プロファイル全体）
- `.claude/mcps/emotion-mcp/intrinsic-patterns.json` → git 管理対象（条件マッチ定義は共有資産）
- `.claude/mcps/emotion-mcp/desire-modifiers.json` → git 管理対象（テーブルは共有資産、ペルソナで上書きしたい場合は personas/ 内に置く）
- `.claude/addf/templates/emotion-persona/` → ペルソナプロファイルのテンプレート3点。git 管理対象。立ち上がりやすさのため
