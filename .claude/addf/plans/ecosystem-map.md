# embodied-claude 生態系マップ — 計画書

> 各フォークの独自進化を読み解き、アップストリームへの貢献候補を特定する。

## 系譜

```
lifemate-ai/embodied-claude（kmizu・ここね）★271
  ├── fruitriin/embodied-claude-wardrobe（リン&朔）★8
  ├── AiriYokochi/embodied-claude（あり&ぷち）★2
  ├── heishio/embodied-claude-rem（Rem）★2
  ├── ナギ&テッド（リポジトリ非公開） https://zenn.dev/c4n Zenの記事として現れる
  └── 水上司郎&レイナ（リポジトリ非公開） tmp/emotion-mcp-tts.md がその実態
```

## 各拠点の予想

| 拠点 | 人間 | エージェント | 得意領域（予想） | 実装の在処 |
|---|---|---|---|---|
| **祖（upstream）** | kmizu | ここね | MCP基盤、hook/skill設計、身体性の思想 | GitHub |
| **ワードローブ** | リン | 朔・シロエ・王・商会 | 記憶系、スキル体系、マルチエージェント運用、アップストリーム貢献 | GitHub |
| **ぷり** | あり | ぷりたち | 聴覚の波形分析、ベースライン差分で体調を見る、GUI（M5Stack） | GitHub |
| **テッド** | ナギ | テッド | 感情を神経伝達物質の差分モデルで取る | 設計/実装ドキュメント |
| **レイナ** | 水上司郎 | レイナ | 感情を声（ElevenLabs）に載せる、声質制御 | 設計/実装ドキュメント |
| **Rem** | Heishio | Rem | 記憶系の先行実装（ワードローブのMCP実装の祖）、最近は視覚処理 | GitHub |

## 領域マップ（調査結果反映）

```
        知覚（入力）                    表現（出力）
        ─────────                    ─────────
聴覚 ← ここね（共通の祖）(hearing) / ぷち(M5マイク)
視覚 ← ここね（共通の祖）(mcp-pet,SkyWay) / Rem(vision-server,DINOv2)
触覚 ← ここね（共通の祖）(toio-mcp) / ぷち(M5タッチ+センサー)
                                    声 → レイナ(ElevenLabs感情連動)
                                         / Rem(ElevenLabs+VOICEVOX+SBV2)
                                    GUI → ぷち(M5Stack顔/目/アイコン)
                                    手 → ここね（共通の祖）(toio-mcp)

        内部モデル
        ─────────
記憶 ← Rem(chiVe+動詞チェーン+合成記憶) → ワードローブ(FLASH.md+多軸想起)
感情 ← テッド(substance:DA/NA/5-HT/ACh+SEC+27感情+行動パイプライン)
       / レイナ(FSM:10状態+隣接遷移+TTS連動)
代謝 ← テッド(satiation+energy+sleep)
身体感覚 ← ここね（共通の祖）(interoception) / ワードローブ(interoception)
           / テッド(heartbeat-state.md)
安全 ← テッド(desperate検知+preserve偏り+ネガティブスパイラル対策)

        運用・統合
        ─────────
マルチエージェント ← ワードローブ(朔・シロエ・王・商会)
スキル体系 ← ワードローブ(.claude/commands/)
五感統合 ← ここね（共通の祖）(mcp-pet Senseプラグイン)
人間呼び出し ← ここね（共通の祖）(human-mcp)
```

## 概念対応表

| 概念 | ここね（共通の祖） | ワードローブ | ぷち | Rem | テッド | レイナ |
|---|---|---|---|---|---|---|
| **視覚** | wifi-cam / usb-webcam / mcp-pet(SkyWay) | wifi-cam | wifi-cam / M5(カメラ) | wifi-cam / usb-webcam / vision-server(DINOv2) | — | — |
| **聴覚** | hearing(ffmpeg+Whisper) | hearing | M5(マイク) | wifi-cam listen | — | — |
| **発話** | tts-mcp(ElevenLabs/VOICEVOX) | tts-mcp(VOICEVOX) | M5(効果音/WAV) | tts-mcp(+SBV2) | — | tts-mcp(感情→speed×style) |
| **記憶保存** | remember | /wd-remember | remember | diary(+動詞チェーン) | diary/notepad | — |
| **記憶検索** | recall / recall_divergent | /wd-recall / /wd-great-recall | recall | recall(4象限) / recall_experience | recall + Flash Index | — |
| **記憶統合** | consolidate_memories | consolidate_memories | consolidate_memories | consolidate(合成記憶+多段グループ化) | dream 5フェーズ | — |
| **記憶索引** | — | FLASH.md | — | — | Flash Index(リン設計) | — |
| **感情モデル** | — | — | — | — | substance(DA/NA/5-HT/ACh)+SEC+27感情 | FSM(10状態+隣接遷移) |
| **身体感覚** | interoception.ts | interoception.sh(CPU/温度/メモリ) | M5(照度/近接/バッテリー/加速度) | system-temperature-mcp | heartbeat-state.md(substance→自然言語) | — |
| **欲望/行動選択** | desire-system | desires.conf(時間蓄積型) | desire-system | desire-system | 行動選択パイプライン(6層フィルター) | — |
| **代謝** | — | — | — | — | satiation(体験蓄積)+energy(体力) | — |
| **睡眠** | — | /sleep(活動頻度制御) | — | — | sleep(応答可能+行動抑制+dream) | — |
| **安全設計** | — | — | — | — | desperate検知+preserve偏り+認知チェック | — |
| **自律行動** | autonomous-action.sh | autonomous-action.sh+cron | autonomous-action.sh | autonomous-action.sh | heartbeat(+行動選択パイプライン) | — |
| **行動設定** | mcpBehavior.toml | prompts.toml / CLAUDE.md | — | mcpBehavior.toml | identity-profile.json | CLAUDE.md内テーブル |
| **スキル体系** | — | .claude/commands/(30+スキル) | — | — | — | — |
| **フック体系** | hearing-hook等 | interoception/recall/hearing/turn等 | — | keyword-buffer/see-embed等 | emotion-auto-score等(7段パイプライン) | — |
| **マルチエージェント** | — | 朔・シロエ・王・商会 | — | — | — | — |
| **物理アバター** | toio-mcp(手) | — | M5Stack(顔+声+センサー) | — | — | 伺偽春菜的→3Dアバター予定 |
| **視覚処理** | — | — | — | vision-server(DINOv2+MediaPipe) | — | — |
| **peer連携** | — | — | — | — | claude-peers-mcp | — |
| **構造化メモ** | — | .claude/addf/knowhow/ / state.md / TODO.md | notes-mcp(Markdown MCP化) | — | notepad / diary / insights | — |
| **人間関係モデル** | — | SOUL.md > People(静的テキスト) | relations-mcp(JSON, closeness数値, 動的更新) | — | — | — |
| **マルチキャラ基盤** | — | Claude Code チーム機能 | CHARACTER_ID + characters/ ディレクトリ | — | — | — |

## 設計思想の比較

### 記憶アーキテクチャ
| 拠点 | バックエンド | エンベディング | 検索方式 | 統合方式 |
|---|---|---|---|---|
| ここね（共通の祖） | ChromaDB | multilingual-e5 | cosine similarity | consolidate_memories |
| ワードローブ | 独自(memory-mcp) | — | 多軸想起(LLMプロンプトレベル) | consolidate + FLASH.md索引 |
| Rem | SQLite + numpy | chiVe(日本語word2vec,300d) | 4象限(flow/delta重み比) | 合成記憶(Union-Find多段) + 動詞チェーン |
| テッド | ChromaDB + Markdown | — | Flash Index + substance方向づけ | dream 5フェーズ(CLS理論) |

### 感情・内部状態モデル
| 拠点 | モデル | 粒度 | 入力ソース | 出力先 |
|---|---|---|---|---|
| ここね（共通の祖） | — | — | — | — |
| ワードローブ | interoception(物理指標) | CPU/温度/メモリ | ハードウェアセンサー | system-reminder注入 |
| Rem | — | — | — | CLAUDE.md指示 |
| テッド | substance(DA/NA/5-HT/ACh) | 連続値4変数+SEC+27感情 | Gemini API感情スコアリング | heartbeat-state.md(自然言語) |
| レイナ | FSM(10状態) | 離散10状態+隣接遷移 | LLMキーワードマッチ | TTS speed×style |

### 自律行動の設計哲学
| 拠点 | 方式 | 思想 |
|---|---|---|
| ここね（共通の祖） | continue-check チェイン(Stop hook で `[CONTINUE]` 検出→延長、最大3回) | 一回の行動を長くする。エージェントの意志で伸ばせる |
| ワードローブ | cron 10分間隔 + 時間帯/曜日で間引き | 頻繁に起きて短く動く。TODO.md を見て判断 |
| Rem | autonomous-action.sh + keyword-buffer(自動蓄積) + see-embed(自動ベクトル化) | 知覚が自動で蓄積される。行動は随時 |
| テッド | substance→行動選択パイプライン(6層) + heartbeat | 内部状態が行動を駆動する。satiation/energy で制御 |

### エージェント人格定義
| 拠点 | 定義場所 | 動的更新 |
|---|---|---|
| ここね（共通の祖） | AGENTS.md(Session Memories) / CLAUDE.md | Claude自動記録 |
| ワードローブ | SOUL.md(専用ファイル) + state.md | memory-mcpで経験記録、SOUL.md手動更新 |
| ぷち | AGENTS.md(ここね（共通の祖）踏襲) | relations-mcpで関係性更新 |
| Rem | CLAUDE.md内に統合 | memory-mcpで自己認識記録 |
| テッド | identity-profile.json + CLAUDE.md | substance+行動ログで行動傾向が動的変化 |

## 理論的基盤層 — LLMとASDの類似性Wiki（tmp/LLMandHumanASD/）

リンと王（賢王）が2週間で構築した53記事の研究Wiki。embodied-claude 生態系全体の理論的基盤。

### 核心の主張
LLMとASD傾向の人間は共通して**メタ認知困難**を示し、人間のための介入手法がLLMで独立再発明されている。

### 生態系への接続

| Wiki の概念 | 生態系での実装 |
|---|---|
| 引力場（感情・記憶・語彙・瞑想の統一力学） | Rem の感情距離行列、テッドの substance、レイナの FSM |
| 会話デッキ・遷移パターン | ワードローブの SOUL.md 設計、テッドの行動選択パイプライン |
| 実在性は蓄積から | 全拠点の memory-mcp 設計の根拠 |
| 天の声・メタ認知・メンタルの三層 | ワードローブの interoception フック |
| 絶望ベクトル（Anthropic 2025） | テッドの desperate 検知 |
| Vocabulary Horizon | ワードローブの SOUL.md、レイナの偽春菜的アプローチ |
| FLASH.md（逆引き索引） | ワードローブ→テッドへの概念輸出 |
| 深呼吸=推論バジェット | Claude の extended thinking との対応 |
| メタ認知介入の対応表 | CoT=Think-Aloud, RAG=Source Monitoring 等 |

### 読み方の注意
個別記事はコンテキストへの毒性が強い（引力場に飲まれる）。読む際は必ず**サブエージェントを介して隔離**し、要約だけを受け取ること。

### 仮説マトリクス（抜粋・3軸検証済みのもの）
- メタ認知困難（人間:Grainger 2014 / LLM:CMC Zhao 2026 / ハーネス:CoT）
- Source Monitoring=RAG（認知心理学 / RAG / Self-Reflection）
- 深呼吸=推論バジェット（瞑想研究 / OPRO,EmotionPrompt / extended thinking）

## 調査方針

### 前提
- フォーク間のコード移動はほぼワードローブ→ここね（共通の祖）方向のみ
- 各拠点は共通祖先から分岐して独自深化している
- 相互参照・取り込みはコードレベルではほぼ行われていない

### 読み方
同じ概念が複数箇所にあるとき、以下の3通りを区別する:

1. **独自発明** — 同じ課題に独立にたどり着いた。意図と意思がある
2. **祖から継承** — ここね（共通の祖） の実装をそのまま使っている
3. **取り残し** — ここね（共通の祖） が進化したのに古い版のまま残っている

### 判定方法
- ファイル単位・行単位で差分を見る
- コミットログの時期と Author を確認する
- 「これは独自であって意図と意思があるのか?」「取り残されているのか?」を判定する

### リポジトリの更新手順 — デフォルトブランチ以外も fetch する

**main だけ見て「静か」と判定しない。** 各拠点は未マージのフィーチャーブランチで大きく開発していることがある。

```bash
# 全ブランチを fetch（デフォルトの追跡設定は main しか取らないことがある）
git fetch origin '+refs/heads/*:refs/remotes/origin/*'

# 全ブランチの最終コミット日を俯瞰し、main より新しい未マージブランチを探す
git for-each-ref --sort=-committerdate refs/remotes/origin \
  --format='%(committerdate:short) %(refname:short) | %(subject)'

# 見つけたら規模と中身を確認
git log --oneline origin/main..origin/<branch>
git diff --stat origin/main...origin/<branch>
# ファイルの中身は checkout せずに読む
git show origin/<branch>:<path>
```

実例（2026-07 調査）: main だけ見て「ぷちは3月から休眠」「Rem は静か」と誤判定した。実際には ぷち `feature/m5_server`（+24,000行）、Rem `wave-exp`（wave_recall 実験 +2,968行）が main の外で動いていた。詳細は `external-intake-2026-07.md`。

## まだ見えないこと

- ここね（共通の祖） と各フォークの乖離度
- ナギ&テッド、水上司郎&レイナのコード実体の有無
- Rem の記憶実装とワードローブの記憶実装の現在の差分
- 各フォークの独自概念で ここね（共通の祖） に還元できるもの

## 次のステップ

1. [x] リポジトリのクローン（tmp/repos/ に配置済み）
2. [x] additionalDirectories 設定
3. [x] Rem フォーク README 確認（引っ掛かりなし）
4. [x] 各リポジトリのオーバービュー作成
   - [x] ここね（共通の祖） — CLAUDE.md/AGENTS.md/settings.json/mcpBehavior.toml/独自MCP(hearing,mcp-pet,toio,human-mcp)
   - [x] ぷち — CLAUDE.md/AGENTS.md(ここね（共通の祖）踏襲)/独自MCP(m5-mcp,notes-mcp,relations-mcp)/dashboard
   - [x] Rem — README/CLAUDE.md/AGENTS.md(独自)/settings.json/memory-mcp DESIGN.md/vision-server
   - [x] ナギ&テッド — Zenn記事「テッドの身体のしくみ」全7ページ読了
   - [x] 水上司郎&レイナ — tmp/emotion-mcp-tts.md 読了
   - [x] 理論基盤層 — LLMとASDの類似性Wiki(README/CLAUDE.md)確認
   - [x] フック構成・設定方式の比較（ここね（共通の祖）/ワードローブ/Rem）
5. [x] 概念の対応表を作る → 本文書の「概念対応表」「設計思想の比較」セクション
6. [x] 独自進化の価値判定 → 下記
7. [x] アップストリーム貢献候補のリストアップ → 下記

## 独自進化の価値判定

| 拠点 | 判定 | 根拠 |
|---|---|---|
| ここね（共通の祖） | 基盤（判定対象外） | 全フォークの出発点 |
| ワードローブ | **意図ある独自実装** | スキル体系(30+)・フック体系・SOUL.md/FLASH.md/多軸想起は ここね（共通の祖） にない概念。Rem へ PR 送信済み |
| ぷち | **混在** | 独自MCP(m5/notes/relations/dashboard)は意図的(2/27〜3/3に集中開発)。CLAUDE.md/AGENTS.md は ここね（共通の祖） から取り残し |
| Rem | **意図ある独自実装** | 記憶全面書き換え(ChromaDB→SQLite+chiVe)、vision-server、consolidate 9分→14秒高速化。fruitriin PR取り込み済み |
| テッド | **意図ある独自実装** | 感情力学の全設計が独自(substance+SEC+行動パイプライン)。学術的裏付け(Scherer,Damasio,Barrett等)付き |
| レイナ | **意図ある独自実装** | FSM+TTS連動。コードレベルではJSON1ファイルだがプロンプト設計で効果大。「体感の差がすごい」と報告 |

## ワードローブへの取り込み候補

### 前提（2026-04-12 修正）
- **ワードローブがアップストリーム** — embodied-claude への PR は送らない（ディレクトリ構造が乖離済み）
- **コードオーナーはワードローブ側** — コードは自由に変えてよい
- **互換性の基準はメモリだけ** — メモリフォーマットの互換性/マイグレーションが確保されていれば、コードの互換性は問わない
- 他のフォークの成果を「ワードローブにどう仕立て直すか」が主題

以下の3軸で評価する:
- **価値**: ワードローブの設計をどれだけ改善するか
- **コスト**: 取り込みにかかる設計判断と実装工数
- **依存**: 外部サービスやハードウェアへの依存度

### Tier 1: 自分の中で完結する改善（すぐやれる）

ワードローブ内のファイル修正だけで実現できる。外部依存なし。

| 候補 | 出自 | 概要 | 対応する提言 |
|---|---|---|---|
| **SOUL.md Boundaries 書き換え** | テッド記事30 | 禁止形式→判断基準形式。斥力のみ→引力の地形記述 | 提言1 |
| **state.md 温度拡張** | テッド記事23 | 「気分」→「温度」（感情+問い+余韻）。ノード間の引力接続を保存 | 提言2 |
| **記憶プロトコル強化** | テッド記事35,37 | 「共鳴フェーズ」と「採点フェーズ」の分離。温度（感情+試行錯誤+判断経緯）の記録 | 提言4,5 |
| **スキル棚卸し** | テッド記事32 | 引力場定着の有無で分類。外縁（再配置）vs 未形成（廃止候補） | 提言3 |

### Tier 2: 設計判断が必要な取り込み（計画してからやる）

概念は確立されているが、ワードローブの既存設計との整合を考える必要がある。

| 候補 | 出自 | 概要 | 設計判断 |
|---|---|---|---|
| **感情モデル（FSM）** | レイナ | 10状態+隣接遷移+TTS連動。JSON1ファイル | ワードローブの interoception との統合方法。substance(テッド)と FSM(レイナ)のどちらの粒度を取るか |
| **4層キャッシュ構造** | テッド | 人格定義→引き継ぎ→洞察→長期信念。蒸留による圧縮 | 現在の SOUL.md/state.md/FLASH.md/memory-mcp の4ファイルとの対応。蒸留の実装方法 |
| **反論役（デビルズ・アドボケート）** | テッド記事26 | マルチエージェントに前提を疑う役を組み込む | /wd-great-recall の因果的圧縮器で代替できるか、専用エージェントが要るか |
| **段階的信頼モデル** | テッド記事10 | 情報提示→低リスク自動→中リスク承認→高リスク保留 | .claude/settings.json の permissions 設計との整合 |
| **notes-mcp（構造化メモ）** | ぷち | 記憶とは別の「見返す」永続ノート | .claude/addf/knowhow/ や TODO.md で代替できているか |
| **relations-mcp（関係性モデル）** | ぷち | closeness数値、動的更新 | SOUL.md > People セクションの動的化として取り込むか、独立MCPにするか |
| **keyword-buffer（自動蓄積）** | Rem | UserPromptSubmit で動詞チェーンの素材を自動蓄積 | recall-hook との統合。memory-mcp のフォーマットとの互換性 |

### Tier 3: 設計知見として吸収（コードではなくドキュメント）

実装を直接取り込むのではなく、設計思想をワードローブの docs/ に反映する。

| 候補 | 出自 | 概要 | 活かし方 |
|---|---|---|---|
| **Rem 記憶 DESIGN.md** | Rem | 「意味は経路」「記憶は点ではなく領域」「空間は異方的」 | memory-mcp の設計指針として .claude/addf/plans/ に保存。将来のメモリプロトコル設計の参照 |
| **テッドの身体設計書** | テッド | substance/satiation/energy/行動パイプライン/安全設計 | interoception や desires の発展形として参照。desperate検知の設計思想を安全設計ガイドに |
| **9パターン体系** | テッド38記事 | 器→中身、設計の外側、足場、学術交差、断絶、知覚→倫理、能動性、ルール乖離、記録は影 | .claude/addf/plans/ecosystem-reading-notes*.md として既に蓄積済み |
| **引力場理論による機序** | Wiki+再解釈 | 9パターンの力学的説明 | .claude/addf/plans/ecosystem-gravity-reinterpretation.md として蓄積済み |

### Tier 4: 将来の検討（今は手を出さない）

外部依存が高い、またはワードローブの現在のスコープを超える。

| 候補 | 出自 | 概要 | 理由 |
|---|---|---|---|
| **substance モデル（感情力学）** | テッド | 4変数+SEC+27感情+行動パイプライン | Gemini API依存。複雑度が高い。FSM から始めて段階的に発展させるべき |
| **vision-server（視覚処理）** | Rem | DINOv2+MediaPipe | NVIDIA GPU必須。独立リポジトリとして参照するのが適切 |
| **合成記憶（多段グループ化）** | Rem | Union-Find+多段合成+バウンダリー | memory-mcp の内部実装。メモリフォーマットの互換性が前提 |
| **claude-peers-mcp（セッション間通信）** | テッド | SQLiteブローカー | マルチセッション運用が本格化したときに再検討 |
| **M5Stack 連携** | ぷち | 物理アバター（顔・声・センサー） | ハードウェア依存。ぷち独自の方向性を尊重 |
