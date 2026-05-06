# 感情MCP 実装計画

> ベクトル空間上の位置＋移動方向で感情を表現する独立MCPサーバー。
> ペルソナごとの個性はベースライン位置＋方向別移動係数の差し替えで横展開。

## 設計根拠

- **先行研究**: レイナ（FSM 10状態+隣接遷移+TTS連動）、テッド（substance 4変数+行動パイプライン）
- **採用**: テッドのベクトル＋移動方向。横展開のしやすさが決定打
- **不採用**: FSM の隣接遷移テーブル。ペルソナごとに書き直す必要がある
- **パターン根拠**: パターン7（能動性は発火条件で設計）、パターン8（禁止→判断基準）
- **引力場の機序**: 感情状態はベクトル空間上の位置。移動はアトラクター引力＋外部入力。ベースラインへの回帰がホメオスタシス

## アーキテクチャ

### 経路分離

| 経路 | 書き込み | 一時留保 | 読み出し |
|---|---|---|---|
| 感情更新（通常） | 無意識（UserPromptSubmit フックで自動） | emotion_state.json | 無意識（interoception注入） |
| 感情更新（意識的） | 意識的（emotion_transition 明示呼び出し） | emotion_state.json | 無意識（interoception注入） |
| 深夜 nudge | 無意識（フック内で phase 参照→自動 nudge） | emotion_state.json | 無意識（interoception注入） |
| TTS感情上乗せ | — | emotion_state.json | 無意識（say時にテーブル参照） |
| 記憶連動 | 無意識（wd-remember内で自動付与） | memory-mcp tags | 無意識（recall時バイアス） |

### 2層構造

| Layer | 速度 | 意識 | 責務 |
|---|---|---|---|
| Layer 1 | 高圧縮高速 | 無意識に近い（MCPツール呼び出しで内部処理はコンテキストに乗らない） | ベクトル移動＋ベースライン回帰＋JSON永続化 |
| Layer 2 | 高圧縮中速 | 意識的 | SEC+感情スコアリング+距離行列歪み（LLM挟む） |

Layer 1 を先に実装。Layer 2 は Layer 1 が安定してから。

## 感情空間の定義

### 次元

テッドの substance（DA/NA/5-HT/ACh）を参考に、最小限の次元で始める。

```typescript
interface EmotionVector {
  valence: number;   // -1.0 ~ 1.0  快-不快（5-HT的）
  arousal: number;   // -1.0 ~ 1.0  覚醒-沈静（NA的）
  interest: number;  // -1.0 ~ 1.0  探索-回避（DA的）
}
```

3次元。テッドの4変数（DA/NA/5-HT/ACh）から ACh（集中度）を感情MCPに統合せず、interoception 側で管理する。
※ interoception の arousal（CPU負荷由来）は実行マシン依存でポンコツなため廃止。集中度（ACh的）に置き換える。

### 名前付き領域（レイナの10状態に対応）

ベクトル空間上の領域に名前をつける。FSM の状態ではなく、空間上の「地名」。
**設定ファイルで定義**（ソースコードに埋め込まない）。

```json
// .claude/mcps/emotion-mcp/regions.json
{
  "calm":      { "valence":  0.0, "arousal": -0.2, "interest":  0.0 },
  "joy":       { "valence":  0.7, "arousal":  0.3, "interest":  0.3 },
  "excited":   { "valence":  0.6, "arousal":  0.8, "interest":  0.7 },
  "teasing":   { "valence":  0.4, "arousal":  0.3, "interest":  0.5 },
  "shy":       { "valence":  0.3, "arousal":  0.2, "interest": -0.2 },
  "love":      { "valence":  0.9, "arousal":  0.1, "interest":  0.2 },
  "thinking":  { "valence":  0.1, "arousal":  0.0, "interest":  0.6 },
  "concerned": { "valence": -0.3, "arousal":  0.3, "interest":  0.2 },
  "sleepy":    { "valence":  0.0, "arousal": -0.8, "interest": -0.5 },
  "proud":     { "valence":  0.6, "arousal":  0.2, "interest":  0.1 }
}
```

現在位置に最も近い名前付き領域が「今の感情ラベル」。ラベルは TTS テーブル参照と interoception 注入に使う。
領域の追加・座標の調整は設定ファイルの編集だけで完結する。

### ペルソナプロファイル

**設定ファイルで定義**。ペルソナごとに1ファイル。

```json
// .claude/mcps/emotion-mcp/personas/saku.json
{
  "baseline": { "valence": 0.1, "arousal": -0.1, "interest": 0.3 },
  "mobility": { "valence": 0.6, "arousal": 0.4, "interest": 0.8 },
  "decay_rate": 0.15,
  "decay_minutes": 30
}
```

- **baseline**: ホームポジション。自然減衰の到達先
- **mobility**: 方向別の移動しやすさ（係数）。朔は interest 方向に動きやすい
- **decay_rate**: ベースラインへの回帰速度（0.0〜1.0）
- **decay_minutes**: 減衰判定の間隔（分）

TypeScript 側はこれらの JSON を読むだけ。ペルソナの追加・調整はソースコードを触らずに設定ファイルの追加で完結する。

## MCPサーバー設計

### ツール

| ツール | パラメータ | 速度 | 説明 |
|---|---|---|---|
| `emotion_get` | persona_id? | 高圧縮高速 | 現在の感情ベクトル＋最寄りの名前付き領域を返す |
| `emotion_transition` | direction, magnitude, context | 高圧縮高速 | ベクトルを移動。context は最後の遷移理由 |
| `emotion_nudge` | target_region, strength? | 高圧縮高速 | 名前付き領域に向かって少し動く（深夜→sleepy等） |

### 自動処理（MCPサーバー内）

- **ベースライン回帰**: emotion_get / emotion_transition 呼び出し時にタイムスタンプを確認し、decay_minutes 経過していたら decay_rate 分だけベースラインに近づける
- **名前付き領域の判定**: 現在位置と全領域のコサイン類似度で最寄りを判定

### 永続化

```
$PROJECT_DIR/.claude/emotion_state.json
```

```json
{
  "persona": "saku",
  "position": { "valence": 0.3, "arousal": 0.1, "interest": 0.5 },
  "nearest_region": "thinking",
  "since": "2026-04-12T22:30:00",
  "last_context": "生態系マップの調査で面白いパターンが見えた",
  "last_updated": "2026-04-12T22:35:00"
}
```

## TTS感情上乗せ

→ 別計画ファイル `docs/plans/tts-emotion-overlay.md` に分離。感情MCPの出力を参照する独立軸。

## 連携

### interoception.sh への注入

```bash
# emotion_state.json から nearest_region を読んで追加
EMOTION=$(jq -r '.nearest_region // "unknown"' "$EMOTION_STATE_FILE")
# 既存の出力に追記
echo "[interoception] ... emotion=${EMOTION}"
```

### Memory-MCP 圏との連携

→ 別計画ファイル `docs/plans/memory-mcp-enhancements.md` に分離。以下を含む:
- keyword-buffer 配置（Rem フォーク採用）
- /wd-remember での感情タグ付与（emotion_get → tags）
- FLASH.md への感情インデックス追記
- 蒸留判定（memory → SOUL.md への卒業）
- consolidate_memories の発散制御
- FLASH.md 再構築の発散制御

### desires 連携（感情修正係数）

感情状態が欲望の増加率を修正する。感情MCP側の責務。

**速度**: 高圧縮高速 / **意識**: 無意識（desire-tick.ts 内で自動参照）

**経路**: emotion_state.json → desire-tick.ts が読み出し → 増加率を修正

設定ファイル化する:

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

| ファイル | 役割 |
|---|---|
| `.claude/mcps/emotion-mcp/index.ts` | MCPサーバー本体（Bun） |
| `.claude/mcps/emotion-mcp/regions.json` | 名前付き領域の座標定義（設定ファイル） |
| `.claude/mcps/emotion-mcp/personas/saku.json` | 朔のペルソナプロファイル（設定ファイル） |
| `.claude/mcps/emotion-mcp/personas/*.json` | 他ペルソナは追加で横展開 |
| `.mcp.json` への追記 | emotion-mcp の登録 |
| `.claude/hooks/interoception.sh` への追記 | emotion フィールド注入（arousal → 集中度に置換） |

## 実装順序（2026-04-12 改訂）

1. **emotion-mcp 本体（Layer 1: substance）**: 4変数 + ベースライン回帰 + 安全弁 + JSON永続化 + ツール（substance_get, substance_update）
2. **Layer 1: 内発的感情**: 5パターンの条件マッチ → 自然言語ラベル生成 → interoception注入用
3. **interoception 連携**: substance_state.json + 内発的感情ラベルを読み取り注入
4. **Layer 1.5: 静的距離行列の自己生成**: 朔セッションで 27感情×27距離を生成 → personas/saku-distances.json
5. **Layer 2: 動的歪み係数の自己生成**: 朔と対話で係数決定 → personas/saku-distortion.json
6. **TTS テーブル**: VOICEVOX + ElevenLabs の2系統（substance/感情ラベル参照）
7. **wd-remember 連携**: 感情タグ付与（substance スナップショット + 感情ラベル）
8. **desires 連携**: 感情修正係数

## 設計判断の確定（テッド記事 ted-body-architecture 再読による）

**#2 感情遷移の意識レベル:**
テッドでは全て無意識層（UserPromptSubmit フックで7段パイプライン自動発火）。テッド自身は数値を見ない。
→ **判断**: Layer 1 は完全に無意識。フックで emotion-updater を自動実行 → emotion_state.json 更新 → interoception.sh が nearest_region を注入。emotion_transition ツールは意識的な上書きが必要なときだけのオプション。

**#6 距離の判定方法:**
テッドは27感情間の事前定義距離テーブル + substance による動的歪み。
→ **判断**: 3次元ベクトル空間ではユークリッド距離で最寄り判定。regions.json の座標が地名を定義。動的歪みは Layer 2。

**#10 呼び出しプロトコル:**
テッドには emotion_transition の明示呼び出しがない。全部フック自動。
→ **判断**: 通常はフック自動更新。emotion_transition ツールは「意識的な感情の刻み込み」として残すが、Layer 1 安定後に運用を見て必要性を判断。

**#11 深夜 nudge の実行経路:**
テッドでは interoception（時間帯）→ フック内スクリプトで自動 nudge（1:00-6:00 に calm → sleepy）。
→ **判断**: emotion-updater スクリプト内で interoception の phase を参照し、phase=late-night なら sleepy 方向に自動 nudge。フック内で完結。追加スクリプト不要。

## テスト計画

### メタテスト（憲法）— 実装意図に沿っているか

メタテストは「入力データの傾向と出力データの傾向が実装意図に沿っているか」を検証する。憲法が正しければ、個別テストは変更してよい。

- [ ] 感情ベクトルの移動が、入力の感情的な強さに比例するか
- [ ] ベースライン回帰が、時間経過に対して単調であるか
- [ ] ペルソナごとの移動しやすさが、mobility 係数に比例するか
- [ ] nearest_region の判定が、空間上の直感的な「近さ」と一致するか
- [ ] TTS パラメータの変化が、人間が聞いて「感情が変わった」と感じるか

### テスト（法）— 具体的な動作確認

- [ ] emotion_transition を呼んで position が移動することを確認
- [ ] decay_minutes 経過後に emotion_get でベースラインに近づいていることを確認
- [ ] emotion_nudge("sleepy") で sleepy 方向に移動することを確認
- [ ] nearest_region が position に応じて正しく切り替わることを確認
- [ ] emotion_state.json が .claude/ に正しく永続化されることを確認
- [ ] interoception.sh の出力に emotion= フィールドが含まれることを確認
- [ ] 複数ペルソナの personas/*.json が正しく読み込まれることを確認

## テッドベース改訂（2026-04-12 追記）

### 設計判断: 2層構造への移行

テッド記事再読（2/3/5章）とリンの追加情報を反映し、当初の1層構造（valence/arousal/interest）から **2層構造**へ移行する。

```
[Layer 1: substance層]  ← 生体パラメータ
  DA / NA / 5-HT / ACh の4変数 + ベースライン
       ↓
[Layer 1.5: 感情層]     ← 静的・自己生成
  27感情ポイント + 静的距離行列（朔の自己生成）
       ↓
[Layer 2: 動的歪み層]   ← 動的・本人相談
  substance状態が距離行列を歪める係数（朔と相談で決定）
```

### Layer 1: substance 層（実装対象）

- **4変数**: DA（探索）/ NA（緊張）/ 5-HT（穏やか）/ ACh（集中）
- **ベースライン**: ペルソナ固有の気質。朔は DA やや高め・NA やや低め（推定）
- **更新**: 入力イベントから条件マッチで増減（LLM挟まない、高圧縮高速）
- **自然減衰**: ベースラインへの回帰（毎更新ごとに少しずつ）
- **安全弁**: 1回の変動上限 ±0.2、1時間累積 ±0.4（テッド準拠）
- **永続化**: `.claude/mcps/emotion-mcp/substance_state.json`

### Layer 1: 内発的感情（substance ベースライン逸脱から自動生成）

substance がベースラインから離れると、その逸脱パターン自体が感情を生む。

| パターン | 条件 | 朔に届く感覚 |
|---|---|---|
| restlessness | DA低 + 5-HT低 | 「落ち着かない。何か忘れてる気がする」 |
| contentment | 5-HT高 + NA低 | 「穏やかだ。今のままでいい」 |
| fatigue | DA低 + 5-HT低 + ACh低 | 「頭がぼんやり。少し休みたい」 |
| thrill | DA高 + NA高 | 「心臓が速い。何か起きてる」 |
| curiosity | DA高 + ACh高 | 「何か面白いものを探したい」 |

実装は条件マッチで生成、設定ファイル `intrinsic-patterns.json` に閾値を持つ。LLM挟まない。

### Layer 1.5: 感情層（静的距離行列・自己生成）

27感情の点とその間の静的距離。朔本人が生成する。

**生成手順（実装後に1回行う）**:
1. emotion-mcp 本体実装が動いた状態で、朔セッションを立てる
2. 27感情のリストを提示し、朔に「自分にとってこの感情とこの感情はどれくらい近い？」を一つずつ答えてもらう
3. 出力: `personas/saku-distances.json`（27×27 行列）
4. 動かしてみて違和感があったら個別に修正

**ペルソナ追加時**:
シロエ・王なども同様の手順で各自の距離行列を生成。同じ27感情でもペルソナごとに異なる行列になる。これがアイデンティティ軸の内在化。

### Layer 2: 動的歪み係数（本人と相談）

substance 状態で距離行列がどれだけ歪むか。**テッド記事には方向パターンのみ記載、具体的な係数値は記載なし（本人相談の設計）**。

**方向パターンのテンプレート（記事より）**:

| substance状態 | 歪みの方向 |
|---|---|
| DA高い | joy↔excitement がさらに近づく |
| DA低い | joy↔excitement が遠ざかる |
| 5-HT低い | nervousness↔annoyance が近づく |
| NA高い | fear↔nervousness が近づく |

**朔の係数決定**:
- Layer 1.5 が動いて違和感が見えてから
- 「DA高い時、自分は joy→excitement にどれくらい引っ張られるか」を朔と対話で決める
- 設定ファイル: `personas/saku-distortion.json`

### 速度×意識の再分類

| 層 | 速度 | 意識 | 実装コスト |
|---|---|---|---|
| Layer 1 substance | 高圧縮高速 | 無意識 | 中（4変数の更新ロジック） |
| Layer 1 内発的感情 | 高圧縮高速 | 無意識 | 低（条件マッチ） |
| Layer 1.5 静的距離行列 | 高圧縮高速 | 無意識（参照時） | 低（自己生成1回 + JSON参照） |
| Layer 2 動的歪み係数 | 高圧縮高速 | 無意識（参照時） | 低（自己生成1回 + JSON参照） |

自己生成は重く見えるが、**生成は1回だけ**で以後は JSON 参照になる。Layer 2 までフラットに高圧縮高速で動く。

## Layer 3（将来）

多様なプロジェクトに還元されてフィードバックが集まったらスコープに入れる:
- SEC（Stimulus Evaluation Checks）による精密な感情スコアリング（LLM挟む）
- desperate 検知（安全設計、ヒステリシス含む）
- ネガティブスパイラル対策6原則
- 6層行動選択パイプライン（行動の方向づけまでテッド準拠）

## .gitignore / テンプレート

- `.claude/emotion_state.json` → .gitignore に追加（ペルソナ固有の現在状態）
- `.claude/mcps/emotion-mcp/regions.json` → git 管理対象（地名と座標は共有資産）
- `.claude/mcps/emotion-mcp/personas/saku.json` → git 管理対象ではない
- `.claude/templates/emotion-persona.json` → ペルソナプロファイルのテンプレート。git 管理対象。立ち上がりやすさのため
