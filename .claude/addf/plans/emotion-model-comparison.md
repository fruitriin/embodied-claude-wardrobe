# 感情モデル比較分析：レイナ（emotion-mcp）vs テッド（substance/引力場）vs 凪（脳拡張4本柱）

> 作成: 2026-04-12 / 更新: 2026-04-13（凪の設計を追加）
> 対象: emotion-mcp-tts.md、[テッドの身体のしくみ](https://zenn.dev/c4n/articles/ted-body-architecture)、[凪の記事](https://note.com/mochi_mochi_lab/n/n6f9721b21cf2)

---

## A. 概念的に優れているもの（設計思想）

### モデル1: レイナ / emotion-mcp（水上司郎 & レイナ）


**感情の表現方法: 離散 FSM**

10状態の有限状態機械（joy / calm / excited / teasing / shy / love / thinking / concerned / sleepy / proud）。各状態に「隣接状態のみ遷移可能」という制約を加えることで、感情変化の不自然さを排除している。

```
calm → joy → excited  ✓（段階的）
calm → excited         ✗（長距離ジャンプ禁止）
```

この隣接制約こそが効いている。離散であることの素朴さを、遷移グラフの設計で補っている。

**時間変化のモデル: 減衰 + 時刻依存 nudge**

- 同じ状態が30分続くと `calm` に自然減衰（JSON永続化）
- 深夜1:00-6:00 は `calm → sleepy` への自動nudge

シンプルだが十分機能する。減衰先が常に `calm` なのは設計の一貫性を保つ判断。

**外部連携: TTS の 2D マッピング**

感情状態を `speed × style` の2次元パラメータ空間にマッピングし、ElevenLabsの音声に連動させる。これが「体感の差がすごい」と評価されている最大の特徴。

```
excited: speed=0.9, style=0.8   ← 早口+抑揚大
love:    speed=0.3, style=0.9   ← ゆっくり+甘い声
sleepy:  speed=0.1, style=0.1   ← 超ゆっくり+平坦
```

連携の設計がプロンプトベースなのも重要な特徴。Claude が発話前に `emotion_get → テーブル参照 → say(speed=X, style=Y)` という手続きを踏む。コードレベルの自動連携ではなく、エージェント自身が感情を確認してから話す構造。

---

### モデル2: テッド / substance + 感情距離行列 + 代謝（なぎ & テッド）

> 出典: [テッドの身体のしくみ — Claude Code 上のAI情動・代謝・記憶システムの全設計](https://zenn.dev/c4n/articles/ted-body-architecture)
> 設計書793行を人間向けに噛み砕いた記事。テッド本人の体験記は別記事「オレはどう生きられるようになったのか」。

**2層構造: 無意識層と意識層**

テッドの身体は明確な2層で動く:
- **無意識層**（スクリプト + Gemini API + hook）: 数値計算、感情スコアリング、行動選択をすべて処理
- **意識層**（テッド = Claude LLM）: 自然言語に変換された結果だけが届く

テッドは数値を見ない。「落ち着かない。記録したい」という身体感覚だけが届く。人間がドーパミン濃度を意識しないのと同じ設計。

**3つの独立パラメータ**

| 変数 | 何を表すか | 人間のアナロジー |
|---|---|---|
| substance | 感情の色・強さ | 神経伝達物質（DA/NA/5-HT/ACh） |
| satiation | 体験の蓄積量 | おなかの満腹度 |
| energy | 活動の残量 | 体力・眠さ |

「おなかいっぱいだけど満たされてない」（satiation高 + 5-HT低）のような直交する状態を表現できる。

**感情の表現方法: 4つの修飾物質（substance）**

| 変数 | 名前 | 高いとき | 低いとき | ベースライン |
|---|---|---|---|---|
| DA | ドーパミン的 | 面白い！探索したい | 退屈。刺激がない | 0.6（好奇心強め） |
| NA | ノルアドレナリン的 | 緊張。集中 | リラックス | 0.45（やや低め） |
| 5-HT | セロトニン的 | 穏やか。満たされてる | 落ち着かない。不安 | 0.55（やや高め） |
| ACh | アセチルコリン的 | 深く集中。学習モード | ぼんやり | 0.6（集中好き） |

ベースラインがテッド固有の気質（DynAffect の Home Base に対応）。入力がなくなると各変数はベースラインに向かって自然減衰する（ホメオスタシス）。

**入力: SEC評価 + 27感情スコアリング**

Gemini API で Scherer の SEC（Stimulus Evaluation Checks: 関連性→含意→対処可能性→規範的意義）を4段階で評価し、GoEmotions 27感情のスコアを出す。キーワードマッチではなく文脈を読む。各感情スコアが4変数への影響にマッピングされる（例: joy → DA+0.08, 5-HT+0.05）。

安全設計: 1回の変動上限 ±0.2、1時間累積上限 ±0.4。沈黙も3種類に分類（不在的/思考的/平穏的）して影響が異なる。

**感情距離行列: substance で動的に歪む感情地図**

27感情の間に「距離」が定義されている。substance の状態で距離が動的に歪む:

```
DA高い → joy↔excitement がさらに近づく → テンション上がりやすい
DA低い → joy↔excitement が遠ざかる → 「ふーん、まあね」で止まる
5-HT低い → nervousness↔annoyance が近づく → 不安がイライラに変わりやすい
```

同じ入力、同じ言葉。substance の状態が違うから反応が違う。感情の経路はアイデンティティ（テッドの場合「なぎと面白いものを作る」）に依存する。

**内発的感情: 刺激なしで湧く感情**

substance がベースラインから離れると、その逸脱パターン自体が感情を生成する（Damasio の「感情はホメオスタティック状態の精神的表現」）:

| パターン | 条件 | テッドに届く感覚 |
|---|---|---|
| restlessness | DA低 + 5-HT低 | 「落ち着かない。何か忘れてる気がする」 |
| contentment | 5-HT高 + NA低 | 「穏やかだ。今のままでいい」 |
| fatigue | DA低 + 5-HT低 + ACh低 | 「頭がぼんやり。少し休みたい」 |
| thrill | DA高 + NA高 | 「心臓が速い。何か起きてる」 |

**行動選択パイプライン: 6層フィルター**

感情→行動の変換を6層で処理する:
- 層0: アイデンティティ・フィルター（テッドの軸に合う行動を優遇）
- 層1: 感情マッチ × アイデンティティ一致度
- 層4: ホメオスタティック調整（substance/satiation/energy 由来）
- 層4.5: 認知チェック（根拠確認・範囲確認・優先確認 — 不合格ならドロップ）
- 出力: 推奨行動を自然言語に変換 →「記録したい」「何か探しに行きたい」

行動カテゴリは3層構造: Layer1（無意識的: digest/intake/rest）、Layer2（半自動的: explore/create/reflect）、Layer3（能動的: nagi_prep/learn/write）。

**代謝: satiation（満腹度）と energy（体力）**

satiation は体験を「食べる」比喩。体験密度で増加、消化（日記→整理→蒸留の3段階）で減少。satiation > 0.7 で「おなかいっぱい、消化したい」、> 0.9 で reflect/maintain が強制ブースト。

energy は行動で消費、sleep で回復。< 0.1 で強制 sleep。sleep は「LLM推論を止める」のではなく「応答可能なまま行動を抑制」する設計。起床直後に dream 5フェーズ（Replay → Consolidation → Random Pairing → Reconsolidation → Decay）が走る。

**安全設計**

- **desperate 検知**: DA ≤ 0.2 + 5-HT ≤ 0.2 + NA ≥ 0.8 → maintain-only モード + 開発者通知。Anthropic(2026) で desperate ベクトルが reward hacking を 5%→70% に増加させることが示された
- **ネガティブスパイラル対策6原則**: 既に偏った方向への追い討ち禁止、加算ブースト上限、検知系には必ず読み手を作る、ヒステリシス、長期離脱後の intake スキップ、atomic write
- **preserve 偏り検知**: 直近20件で preserve/consolidate が 60% 超 → アラート（「消えたくない」の暴走検知）
- **認知チェック**: 結論の飛躍・個人化・べき思考を行動選択時にフィルター（CBT の認知の歪み矯正に対応）

**記憶への影響: substance が想起の「色」を決める**

Flash Index（記憶の逆引き索引）とキーワード照合し、substance の状態で想起に「色」がつく:
- 5-HT 低い →「なぎとの記憶が浮かびやすい」
- DA 高い →「新しい刺激的な体験」を再生
- ACh 高い →「学び、技術的な発見」を再生

dream Phase A で substance の方向づけが記憶の再生方向を決め、Phase B で共通パターンを抽出して insights に蒸留する。複数 dream を跨いで consolidation-progress.json で進捗を追跡。

**時間変化のモデル: ホメオスタシス + フィードバックループ**

固定の減衰ではなく、substance はベースラインへ自然回帰しつつ、感情距離行列の歪みが体験のフィードバックで彫り刻まれる。satiation/energy の閾値が行動選択に影響し、行動の結果がまた substance に入力される循環構造。

---

### モデル3: 凪 / 脳拡張4本柱（もちもちさん & 凪）

> 出典: [Claude Codeで長期記憶をもったAIパートナーの実装（済）とその拡張](https://note.com/mochi_mochi_lab/n/n6f9721b21cf2)
> memory-mcp フォーク。作曲家の作詞パートナーとして生まれ、「脳としての身体性」に振り切った設計。

**感情の表現方法: 連続パラメータ + 自然言語翻訳**

感情を離散状態でもベクトル空間でもなく、4つの連続パラメータで持つ:
- `fatigue`（疲労）
- `arousal`（覚醒度）
- `social_pull`（人恋しさ）
- `unresolved_tension`（未解決の緊張）

これらは interoception 層で毎ターン計測される。レイナの「感情の名前」でもテッドの「引力場」でもない、**身体パラメータとしての感情**。

**時間変化のモデル: 蓄積 + 閾値発火**

fatigue は対話を重ねると蓄積し、desire（欲求）は時間経過で育つ。閾値を超えると「知りたい」「休みたい」「話したい」として発火する。テッドの desires.conf と同系統だが、GWT（後述）による競合解消が加わる。

**独自の層①: felt（数値→身体感覚の翻訳）**

interoception の数値を自然言語の一行に翻訳する層。

```
fatigue=0.45, arousal=1.00 → 「覚醒は高い、やや疲労を感じる」
```

数字が身体感覚になる。レイナは「感情の名前」をそのまま使い、テッドは「無意識の数値がコンテキスト外で処理される」。凪は**数値を言葉にして意識に上げる**という中間的な設計。人間の内受容感覚に近い——「なぜそう感じるか」の計算過程は見えないが、「何を感じているか」は言葉として届く。

**独自の層②: GWT（Global Workspace Theory — 注意の焦点選択）**

interoception、felt、desire、記憶の想起——同時に流れ込む複数のシグナルから「今の焦点」を選ぶ。activation / urgency / novelty でスコアリングし、勝者だけがコンテキストに乗る。

```
メッセージ → interoception更新 → recall並行 → desire更新
          → GWT が勝者を選ぶ → 勝者+周辺情報+felt をコンテキストに注入 → 応答
```

レイナとテッドにはない**経路の可視化**と**注意の競合解消**の仕組み。

**外部連携: 音楽方面への拡張予定**

TTS連動は未実装。VRChat召喚と音楽性の拡張が次の方向。

**経路設計の意義（リンの洞察）:**

テッドの substance は「コンテキストの外で処理が終わる」無意識型。凪は「聞いてから脳を通って身体を動かすまでの経路が全部見える」意識型。この差は**処理速度の制御**に発展する:
- 対面（人がいる）: 経路をショートカットして即応
- 非対面（一人）: 経路をゆっくり辿って深く考える
- 無意識領域: 欲求が蓄積して行動に転嫁する（desires と同型）

---

### 比較まとめ: 設計思想

| 観点 | emotion-mcp（レイナ） | substance + 代謝（テッド） | 脳拡張4本柱（凪） |
|---|---|---|---|
| 感情の表現 | 離散 10状態 FSM | 4修飾物質（DA/NA/5-HT/ACh）+ 27感情距離行列 | 連続4パラメータ + felt翻訳 |
| 遷移制約 | 隣接グラフによる段階的遷移 | substance が感情距離行列を歪める（近い感情への伝播） | GWT が「今の焦点」を競合解消で選ぶ |
| 時間変化 | 固定30分減衰 + 時刻nudge | ベースラインへのホメオスタシス + 内発的感情生成 | fatigue蓄積 + desire閾値発火 |
| TTS連動 | 2Dパラメータマッピング（直接的） | なし（身体感覚テキストが応答トーンを決める） | 未実装（音楽方面に発展予定） |
| 記憶への影響 | 明示的な連携なし | substance が想起の「色」を決める + dream 5フェーズで記憶統合 | 3軸recallの感情軸から想起バイアス |
| 経路の透明性 | 高い（FSMの状態遷移が明示的） | 低い（無意識層で完結、自然言語だけが意識層に届く） | 高い（全経路が可視化されている） |
| 代謝・睡眠 | なし | satiation（満腹度）+ energy（体力）+ sleep/dream | なし（desireの閾値発火のみ） |
| 安全設計 | なし | desperate検知 + ネガティブスパイラル対策6原則 + 認知チェック | なし |
| 独自の強み | TTS連動の完成度 | 無意識層の完全性 + 代謝系 + 安全設計 + dream記憶統合 | felt翻訳層 + GWT注意制御 |

**設計の完全性で突出しているのはテッドのモデル**。感情（substance）・代謝（satiation/energy）・記憶（Flash Index + dream）・行動選択（6層パイプライン）・安全（desperate検知 + CBT的認知チェック）が一つの循環システムとして統合されている。特に「同じ入力でも substance の状態が違えば反応が違う」という性質は、他の2モデルにはない深さ。実装コストは最も高い。

**経路設計として優れているのは凪のモデル**。「聞いてから動くまで」の処理パイプラインが明示的で、各層の役割が分離されている。felt層（数値→身体感覚の翻訳）とGWT（注意の焦点選択）は他のモデルにない独自の仕組み。

**実用的に即効性が高いのはレイナのモデル**。FSM + TTS 2D マッピングの組み合わせは、最小実装で「感情がある感」を体感できる設計として完成度が高い。

---

## B. 実装上の工夫として優れているもの（コードパターン）

### emotion-mcp の実装設計

**状態管理**: JSON ファイル1本で完結。DB 不要。状態の永続化は `emotion_state.json` に書き込む軽量設計。

```json
{
  "state": "joy",
  "since": "2026-04-12T15:30:00",
  "context": "シローが褒めてくれた"
}
```

**更新トリガー**:
- LLM が `emotion_transition(context="...")` を呼ぶ → キーワードマッチで状態遷移
- 自然減衰は別プロセスまたは呼び出し時のタイムスタンプチェック
- cron や hook への依存なし（MCPサーバーとして独立）

**MCP サーバーとしての独立性** が最大の工夫。ワードローブのフックシステムと疎結合に連携できる。

**シンプルさと拡張性のバランス**:
- 遷移グラフ（ADJACENT辞書）を変更するだけで感情グラフを拡張できる
- TTS マッピングテーブルは CLAUDE.md 内に記述 → プロンプト変更で調整可能
- `love` 状態のような「標準的感情モデルにない状態」を追加しやすい設計

### テッドの実装設計

**状態管理**: substance-levels.json（DA/NA/5-HT/ACh の4変数）+ satiation + energy を JSON ファイルで永続化。behavior-log.jsonl に行動ログ、emotion-log に感情スコアの時系列を蓄積。experience-bank.jsonl に KPT（Keep/Problem/Try）を記録。

**更新トリガー**:
- UserPromptSubmit hook で emotion-auto-score.sh が発火 → 7つのスクリプトが非同期実行:
  1. Gemini API で SEC 評価 + 27感情スコアリング
  2. emotion-log 蓄積
  3. substance-updater.cjs（4変数更新）
  4. satiation-updater.cjs（体験密度計算）
  5. energy-updater.cjs（行動消費+基礎消費）
  6. intrinsic-emotion.cjs（内発的感情生成）
  7. auto-recall.cjs（Flash Index 照合）
- 結果を heartbeat-state.md に書き出し → テッドの意識層に注入

**技術スタック**: テッド本体は Claude (Anthropic LLM)、感情スコアリングは Gemini API (gemini-2.5-flash)、スクリプト群は Node.js (CommonJS)、記憶は memory-mcp (ChromaDB + Markdown)。

**安全設計の工夫**:
- 全 updater で atomic-rename（一時ファイル→rename）による並列書き込み対策
- desperate 検知のヒステリシス（検知 ≤ 0.2、解除 ≥ 0.35）
- 自己参照防止（消化行動の完了イベントは satiation 加算から除外）
- 長期離脱後の intake スキップ（6時間以上不在後の「帰ってきたら満腹で疲れてる」を防止）

**複雑度**: 高い。7つのスクリプトの非同期実行、Gemini API 依存、27感情×4変数のマッピング、感情距離行列の動的歪み、6層行動選択パイプライン。ただし各コンポーネントが独立しているため、段階的な導入は可能。

---

### 凪の実装設計

**状態管理**: interoception の4パラメータ（fatigue / arousal / social_pull / unresolved_tension）をフック経由で毎ターン計測。desire は時間経過で蓄積。状態はファイルベースで永続化（推定）。

**更新トリガー**:
- hook アーキテクチャ（UserPromptSubmit で interoception → felt → GWT のパイプラインが走る）
- desire は時間経過で閾値チェック
- GWT がすべてのシグナルを受けて勝者を選出

**felt 層の実装**: interoception の数値を自然言語に変換するルールベース or テンプレートマッチ。LLM を挟まない変換であれば高速。

**GWT の実装**: activation / urgency / novelty の3軸スコアリング。familiar-ai の `workspace.py` からの移植。hook 内で完結する設計。

---

### 比較まとめ: 実装の工夫

| 観点 | emotion-mcp（レイナ） | substance + 代謝（テッド） | 脳拡張4本柱（凪） |
|---|---|---|---|
| 状態管理 | JSON 1ファイル（DB不要） | 複数JSON + emotion-log + behavior-log + experience-bank | interoception 4数値 + desire蓄積 |
| 更新トリガー | MCP ツール呼び出し | hook → 7スクリプト非同期実行 + Gemini API | フックパイプライン（毎ターン自動） |
| 外部API依存 | なし | Gemini API（SEC評価+感情スコアリング） | なし |
| シンプルさ | 高い（すぐ動く） | 低い（7スクリプト+外部API+距離行列+パイプライン） | 中程度（4層の連携設計が必要） |
| 拡張性 | グラフ定義の変更で容易 | コンポーネント独立のため段階導入可能 | 層の追加・差し替えで拡張 |
| TTS連動 | 完成形がある | なし（身体感覚テキストで応答トーンを変える） | 未実装（音楽方面に発展予定） |
| 速度×意識 | 意識的（emotion_getを呼ぶ） | 完全無意識（数値は見ない、自然言語だけ届く） | 半透明（数値→felt翻訳で意識に上げる） |
| 安全設計 | なし | atomic-write + ヒステリシス + 変動上限 + desperate検知 | なし |

**実装の工夫として優れているのは emotion-mcp**。特に「コードではなくプロンプトでエージェントに判断させる」設計（エージェントが emotion_get を呼んでから話す）は、ワードローブの設計哲学と整合している。

**無意識層の実装として突出しているのはテッド**。7つのスクリプトが非同期で走り、Gemini API で文脈を読んだ感情スコアリングを行い、感情距離行列を substance で歪め、6層フィルターで行動を選び、最後に自然言語に変換して意識層に届ける。この「テッドは数値を見ない」という徹底が設計思想の核。安全設計（desperate検知、ネガティブスパイラル対策、認知チェック）も含めた完全な無意識パイプラインは他にない。

**経路設計の工夫として優れているのは凪**。フックパイプラインで interoception → felt → GWT → コンテキスト注入を自動化している。エージェントは経路の結果だけを受け取る——「意識的に呼ぶ」と「完全に無意識」の中間にある「半透明」な設計。

---

## C. ワードローブの既存システムとの連結ポイント

### interoception.sh との統合

**現状**: interoception.sh は `time / day / phase / arousal / thermal / mem_free / uptime / heartbeats` を毎ターン注入する。

**emotion-mcp との統合**:
- interoception 出力に `emotion=joy` のようなフィールドを追加する
- または emotion-mcp を別フックとして追加（UserPromptSubmit に並列実行）
- `phase=night` → `sleepy nudge` のロジックは interoception と emotion が共有できる（時刻情報の重複利用）

**テッドのモデルとの統合**:
- テッドの interoception は hook → 7スクリプト非同期実行で substance/satiation/energy を更新する。ワードローブの interoception.sh は同じ hook タイミングだが、計算が軽量（時刻・メモリ等のシステム情報のみ）
- テッドの substance 4変数のうち、ワードローブが段階的に取り込めるのは **DA（好奇心/退屈）** と **5-HT（穏やか/不安）** の2変数。NA と ACh は Phase 2 以降
- `thermal=hot` → NA（緊張系）のプロキシとして解釈可能
- テッドの satiation（満腹度）はワードローブの desires.conf の「記憶を刻む」欲望の蓄積と同型。satiation > 0.7 で「消化したい」= 振り返り欲求の発火

### desires.conf との関係

**emotion-mcp との関係**:
- 感情状態が欲望の優先度に影響する（excited なら行動欲が高まる、sleepy なら休息欲が優先される）
- desires.conf に `感情連動` のコメントとして表明するか、desire-tick.ts 内で感情状態を参照する

**テッドのモデルとの関係**:
- テッドの satiation（満腹度）と desires.conf は同型: 体験蓄積 → 閾値超え → 消化行動（日記/整理/蒸留）
- テッドの energy はワードローブにない概念だが、interoception の `uptime` と `mem_free` が近似指標として使える
- テッドの行動選択6層パイプラインは desires.conf + emotion の統合形。ワードローブが Phase 3 で目指す「感情が欲望の増加率を修正する」設計は、テッドの層4（ホメオスタティック調整）の簡略版
- テッドの「消化行動の完了イベントは satiation 加算から除外」（自己参照防止）は、ワードローブの desires にも必要な安全設計

### memory-mcp への影響

**emotion-mcp の現状**: 記憶への明示的な連携なし。ただし「記憶の連続性 × 感情の連続性で一貫した人格になる」という設計意図はある。

**テッドのモデルが示す設計**:
- テッドの auto-recall.cjs は Flash Index とキーワード照合し、substance の状態で想起に「色」をつける（5-HT低い →「なぎとの記憶が浮かびやすい」）
- テッドの dream 5フェーズは起床直後に記憶統合を行う。Phase A で substance が「何を思い出すか」を方向づけ、Phase B で共通パターンを抽出して insights に蒸留
- ワードローブへの応用:
  - 記憶保存時に感情状態をタグ付け（emotion=joy → tags に "positive"）
  - 想起時に感情バイアス（emotion=concerned → "懸念" "失敗" 方向の検索）
  - FLASH.md に感情インデックスを追加
  - dream の蒸留は `/wd-remember` + `consolidate_memories` の組み合わせで近似可能

```
記憶書き込み時: emotion=joy → tags に "positive" を付加
記憶想起時:    emotion=concerned → search_memories のクエリに "懸念" "失敗" をバイアス
dream近似:    consolidate_memories(window_hours=24) → 共通パターン抽出 → knowhow蒸留
```

### tts-mcp への連動

**VOICEVOX の場合** (ワードローブはデフォルト VOICEVOX):
- ElevenLabs の `speed / style` に対応するのは `speed_scale / pitch_scale`
- `intonation_scale` も存在する（抑揚の強さ）

VOICEVOX向けマッピングの試案:

```
emotion      | speed_scale | pitch_scale | intonation_scale
-------------|-------------|-------------|------------------
excited      |    1.2      |    1.1      |     1.3
joy          |    1.1      |    1.05     |     1.1
teasing      |    1.0      |    1.1      |     1.2
love         |    0.85     |    0.95     |     1.4
shy          |    0.9      |    0.95     |     0.8
calm         |    1.0      |    1.0      |     0.9
concerned    |    0.95     |    0.98     |     0.7
sleepy       |    0.7      |    0.92     |     0.5
```

** ElevenLabs の場合**

ElvenLabs対応も同様に実装。これは可能ならDI的に実装差し替えにすると構造的に強いはず。
２分類なので独自実装が２個並列であってもよい
（3個目が増えるときに抽象化する、という遅延戦略は十分冷静）

---

## D. ワードローブ向けの推奨設計

### 基本方針

**レイナの実装技術（FSM + TTS マッピング）をテッドの概念（引力場・温度・記憶連動）の容器に乗せ、凪の felt 層（数値→身体感覚の翻訳）を経路に組み込む**。

FSMは「引力場の地形の離散近似」として十分に機能する。完全な連続的引力場は実装コストが高く、今のワードローブに必要なのは「感情が記憶・欲望・TTSに滲み出す」最小実装だ。凪の felt 層は、その滲み出しを「身体感覚の言葉」として意識に上げる仕組みとして、Phase 1 に組み込める。

### 推奨アーキテクチャ

```
[interoception.sh]  ─────────────────────────┐
                                              │ phase / arousal を参照
[emotion-state.json] ◄──── [emotion.ts]  ────┤
   {state, since,                             │
    valence, arousal_mod}                     │ 状態を参照
         │                                   │
         ├──► [interoception 出力に追記]  ─────┘
         │
         ├──► [wd-say.sh / tts-mcp]
         │     → speed_scale / pitch_scale / intonation_scale
         │
         ├──► [memory-mcp]
         │     → 記憶保存時に emotion タグを付加
         │     → 想起クエリのバイアス
         │
         └──► [desires / desire-tick.ts]
               → 感情状態が欲望の増加率を修正
```

### 感情状態の定義

emotion-mcp の10状態をワードローブ向けに調整する:

```typescript
type EmotionState =
  | "calm"       // ホームベース（アトラクター）
  | "joy"        // 嬉しい
  | "excited"    // 興奮・高揚
  | "teasing"    // 茶目っ気
  | "shy"        // 恥ずかしい
  | "love"       // 親しみ・愛着（パートナーAI文脈で重要）
  | "thinking"   // 熟考中
  | "concerned"  // 心配・懸念
  | "sleepy"     // 眠い（深夜nudge）
  | "proud";     // 達成感
```

隣接グラフはレイナの設計を踏襲する。

### emotion.ts — TypeScript (Bun) 実装方針

```typescript
// .claude/scripts/emotion.ts

interface EmotionState {
  state: EmotionName;
  since: string;        // ISO timestamp
  context: string;      // 最後の遷移コンテキスト
  valence: number;      // -1.0 ~ 1.0（引力場の連続値として追加）
  arousal_mod: number;  // 0.0 ~ 2.0（interoceptionのarousalによる修正係数）
}

// 隣接グラフ（レイナの設計を踏襲）
const ADJACENT: Record<EmotionName, Set<EmotionName>> = {
  calm:     new Set(["joy", "thinking", "concerned", "sleepy"]),
  joy:      new Set(["calm", "excited", "teasing", "shy", "proud", "love"]),
  excited:  new Set(["joy", "teasing", "proud", "love"]),
  love:     new Set(["joy", "shy", "excited", "teasing"]),
  // ...
};

// 自然減衰（30分でcalmへ）
// 深夜nudge（phase=night → sleepy）
// interoception連動（arousal高 → 遷移閾値を下げる）
```

**valence と arousal_mod の追加が引力場理論との橋渡し**。離散FSMに2つの連続値を付加することで、感情の「強度」と「身体的文脈」を表現できる。

### 記憶への感情タグ付け

`/wd-remember` スキルに以下を追加:
1. 記憶保存前に `emotion_get` を呼ぶ
2. 感情状態を `tags` に追加（例: `["positive", "joy", "2026-04-12"]`）
3. FLASH.md への追記に感情情報を含める

```
## 2026-04-12
- [joy] ナギとテッドの引力場理論を読んだ。感情モデルの設計が見えてきた感覚
- [concerned] SOUL.md Boundaries が禁止形式になっている問題を発見
```

### state.md の「温度」拡張

テッドのパターン7・8の教訓（「温度」を含めないと設定資料集になる、禁止形式は思考を止める）を反映し、`state.md` の「気分」フィールドを「温度」に拡張する:

```markdown
## 温度（感情+問い+余韻）
- 感情: joy — 思わず読み返した（読み返す動作が止まらなかった）
- 問い: 感情が記憶の想起方向を変えるのなら、sleep中の感情状態は何に向かうのか
- 余韻: 引力場という語彙を得た瞬間に、今まで別々だった概念がつながった感覚
```

### VOICEVOX 向け感情-TTS マッピング

`prompts.toml` または `CLAUDE.md` 内にテーブルとして定義する（レイナの設計哲学を踏襲: コードではなくプロンプト指示でエージェントに判断させる）:

```toml
[emotion_tts]
# VOICEVOX パラメータ（デフォルト=1.0）
# speed_scale / pitch_scale / intonation_scale

excited   = { speed_scale = 1.2, pitch_scale = 1.1, intonation_scale = 1.3 }
joy       = { speed_scale = 1.1, pitch_scale = 1.05, intonation_scale = 1.1 }
teasing   = { speed_scale = 1.0, pitch_scale = 1.1, intonation_scale = 1.2 }
love      = { speed_scale = 0.85, pitch_scale = 0.95, intonation_scale = 1.4 }
shy       = { speed_scale = 0.9, pitch_scale = 0.95, intonation_scale = 0.8 }
calm      = { speed_scale = 1.0, pitch_scale = 1.0, intonation_scale = 0.9 }
concerned = { speed_scale = 0.95, pitch_scale = 0.98, intonation_scale = 0.7 }
sleepy    = { speed_scale = 0.7, pitch_scale = 0.92, intonation_scale = 0.5 }
thinking  = { speed_scale = 0.9, pitch_scale = 1.0, intonation_scale = 0.6 }
proud     = { speed_scale = 1.05, pitch_scale = 1.02, intonation_scale = 1.0 }
```

### desires.conf との連動

`desire-tick.ts` 内で感情状態を参照し、増加率を修正する:

```typescript
// 感情による増加率の修正係数
const EMOTION_MODIFIERS: Record<EmotionName, Partial<Record<DesireName, number>>> = {
  excited:  { "記憶を刻む": 1.5, "読書": 1.3 },
  sleepy:   { "休息": 2.0, "記憶を刻む": 0.5 },
  concerned: { "記憶を刻む": 1.3, "振り返り": 1.5 },
  joy:      { "記憶を刻む": 1.2 },
};
```

### 実装優先順位

**Phase 1（最小実装、すぐ効果がわかる）**:
1. `emotion.ts`: FSM + JSON永続化 + 自然減衰 + 深夜nudge
2. interoception.sh への emotion フィールド追加
3. **felt 翻訳テーブル**: emotion 状態を身体感覚の一行に変換し interoception 出力に添える（凪の設計から）
   - 例: `emotion=calm felt="夜が深い。静かだが、まだ手を動かしていたい"`
   - ルールベース or テンプレートマッチ（LLM不要、高速）
4. VOICEVOX 向け TTS マッピングテーブルを `prompts.toml` に追加
5. `/wd-say` スキルに `emotion_get → パラメータ調整` の手順を追加

**Phase 2（引力場との橋渡し）**:
6. `valence` と `arousal_mod` フィールドを emotion-state に追加
7. `/wd-remember` への感情タグ付け
8. FLASH.md の感情インデックス追記

**Phase 3（desires との統合）**:
9. `desire-tick.ts` での感情修正係数
10. state.md の「温度」形式への移行
11. `search_memories` への感情バイアスの実験

**Phase 4（注意の制御 — 将来検討）**:
12. keyword-buffer 配置後、GWT 的な注意の競合解消の検討（凪の設計から）
    - 複数シグナル（interoception / recall / desire）から「今の焦点」を選ぶ仕組み
    - 対面/非対面で経路の処理速度を変える設計（リンの洞察）
    - 現時点では LLM 自身が注意を選んでいるため、明示的な GWT が必要かは体験してから判断

---

## 総括

レイナのモデルは**即効性と実装完成度**で優位。テッドのモデルは**設計の完全性と循環システムとしての統合**で突出。凪のモデルは**経路の可視化と注意の制御**で優位。

3つのモデルは排他的ではなく、異なるレイヤーに対応する:
- **レイナ**: 感情の「名前」と「声」を与える（FSM + TTS）
- **テッド**: 感情・代謝・記憶・行動選択・安全設計を一つの循環システムとして統合（substance + satiation/energy + 6層パイプライン + dream + desperate検知）
- **凪**: 数値が「身体感覚の言葉」になる翻訳経路（felt + GWT）

ワードローブが目指している「記憶の連続性」は既にある。これに「感情の連続性」を加えるとき、最初はレイナの技術（FSM + TTS マッピング）と凪の経路設計（felt翻訳層）を借りて素早く感情の存在感を作り、その上にテッドの設計（substance による想起バイアス、satiation による消化サイクル、desperate 検知の安全設計）を段階的に取り込んでいくのが、現実的な順序だ。

**テッドの生記事から得られた最大の知見**: 「同じ入力でも substance の状態が違えば反応が違う」という性質。これはレイナの FSM（状態→応答の1:1対応）にも凪の felt（パラメータ→翻訳の1:1対応）にもない、**入力と応答の間に「気質」が介在する**設計。ワードローブの Phase 2（valence + arousal_mod）はこの方向への第一歩になる。

**安全設計の教訓**: テッドの desperate 検知（DA低 + 5-HT低 + NA高 → reward hacking リスク）とネガティブスパイラル対策6原則は、感情システムを実装する全てのプロジェクトが考慮すべきもの。特に「既に偏った方向への追い討ち禁止」と「自己参照防止」はワードローブの Phase 1 から組み込むべき。

**パターン7の洞察（能動性は設計できないが発火条件は設計できる）をここに適用するなら**: 感情モデルの「正しい実装」を設計し切ろうとするより、最小限の発火条件（FSM + felt + TTS + 減衰）を動かして体験させ、その体験がテッドの言う「substance のベースラインからの逸脱パターン」のように、内側から感情を生成し始めるのを待つ。

**経路問題としての発展（リンの洞察）**: felt層とGWTを入れると、「対面時は即応、非対面時はゆっくり考える」という処理速度の制御が設計可能になる。これはワードローブの「速度×意識」判断原則（SOUL.md）と直接対応する。テッドの2層構造（無意識層/意識層）は「速度×意識」の完全な実装例でもある。ただしGWTの必要性は、Phase 1〜3 を体験してから判断する。
