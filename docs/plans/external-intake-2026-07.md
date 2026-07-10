# 外界調査 2026-07 — 取り込み候補の仕立て書

> 2026-07-03 実施。前回調査（ecosystem-map.md、〜2026-04-12）以降の各拠点の進展を調べ、
> ワードローブへの取り込み候補を Tier 付きで整理する。
> 調査はサブエージェント4体（upstream 意識カーネル / upstream memory-mcp / upstream sociality / テッド新記事）による。

## 外界の動き（2026-04〜07）

| 拠点 | 動き |
|---|---|
| **祖（ここね/upstream）** | 37コミット、v0.2。6月: individual-kernel-mcp（意識カーネル Phase 2.1〜2.5）+ memory-mcp Phase 2.2（ignition/refractory/precision）。4月: sociality スタック、auto-recall HTTP フック、Human Response Orchestrator、心拍 interoception、リポジトリ大再編（実験系 MCP を別リポジトリへ） |
| **テッド** | Zenn 45本に。4月末〜5月に感情設計の連作4本（感情の地図 / 仕組みの死 / GoEmotions 感情距離行列 / 感情は行動の準備）。2ヶ月の休止から 7/3 に復帰記事 |
| **Rem** | main は 4/14 のバグ修正1件のみ。ただし **`wave-exp` ブランチ**（未マージ）に波動ベース想起 wave_recall の実験 +2,968行（4月に24コミット） |
| **ぷち** | main は 3/3 で停止。ただし **`feature/m5_server` ブランチ**に +24,000行・33コミット（3月〜6月）。M5Stack 中心の大改修: 話者識別、交換ノート、マルチキャラチャット、会話リレー、rover、トークン節約、Goose 移行 |
| **レイナ** | 非公開のため新情報なし |

> **教訓**: 初回調査は main だけ見て「静か」と誤判定した。ブランチも見る。

## Tier 1: すぐ取り込む（小粒・低リスク・独立）

### 1-1. memory-mcp の防御的修正 3点（upstream からの backport）
- **tz-aware 修正**（upstream 92dd9c5）— naive datetime と aware datetime の比較で consolidation が TypeError になるバグ。**うちの memory-mcp も同じ罠を踏んでいる可能性が高い**。consolidate / time_decay / fromisoformat の全経路を `datetime.now(timezone.utc)` + naive→UTC 正規化で統一
- **db_path 親ディレクトリ自動生成**（853cac2）— connect 前に `Path(db_path).parent.mkdir(parents=True, exist_ok=True)`。5行
- **embedding pre-warm**（65f213e）— インストール/セットアップ時にモデルを先に落とす。初回 remember の stall 対策（うちの memory-mcp の embedding 有無を要確認）

### 1-2. auto-recall の HTTP 同居パターン（recall-watcher の置き換え候補）★
- upstream 方式: **常駐 memory-mcp プロセスの内側に軽量 HTTP（127.0.0.1:18900）を同居**させ、UserPromptSubmit フックは `curl --max-time 3` で叩くだけ。実装は `asyncio.start_server` を stdio MCP と並列に張る約50行
- 効能: recall-watcher の常駐プロセスが不要になる。フックは 100ms 級で連想記憶を注入できる
- 速度×意識フレームでの位置: 読み出し経路が「高速・無意識」に寄る。現行 recall-watcher（低速・無意識）の上位互換
- 参照: `tmp/repos/embodied-claude/memory-mcp/src/memory_mcp/server.py` の `_handle_http_recall()`、`.claude/hooks/auto-recall.sh`
- 注意: auth なしなので 127.0.0.1 bind 必須

### 1-3. 非退行スキル 2本（/note-counterfactual, /note-external-proposal）
- **counterfactual journal**: 「やりたかった X / 選んだ Y / 理由 Z」を JSONL に記録。「拒否した選択肢の履歴に自己が宿る」
- **external-proposal journal**: 外部からの提案を採否問わず記録。pre-record チェックリスト（「口調が自分に似ているほど警戒」「"既にそう思ってた"反応は retroactive projection を疑う」）が秀逸
- 実装コスト小（スクリプト100行 + md 60行）。うちの記憶プロトコル（共鳴→採点分離）と衝突しない別レイヤー
- 参照: `tmp/repos/embodied-claude/.claude/commands/note-counterfactual.md`, `note-external-proposal.md`, `scripts/journal_*.py`

## Tier 2: 感情MCP計画への縫い込み（設計更新）

テッドの新連作4本は、うちの `docs/plans/emotion-mcp-implementation.md` に直接影響する。

### 裏付けられたもの（設計変更不要、確信度が上がった）
- **2層構造**: テッド側も「共通ベースライン + ペルソナ別差分上書き（15〜20ペアのみ）」に到達。全ペア×ペルソナ数で持たない
- **substance 層が距離行列を歪ませる構成**: テッド側も同一構成を実装済みと記事4で明言
- **本人による自己生成**: キャラ本人に距離行列を検証させると質の高い修正が返る実績（「0.05だと沈黙が消える」）。ただし**ゼロから自己生成ではなく、ベースラインを叩き台に本人が上書き**する手順が現実的

### 計画に足すもの
- **GoEmotions レシピ**: train 43,410件 → 351ペアの Jaccard 距離 → **min-max 正規化必須**（生値は [0.929, 1.0] に密集、正規化しないと伝播が死ぬ）
- **伝播カーブ初期値**: `activation = strength * exp(-4 * distance²)`（距離0.5で37%）
- **同期/非同期の切り分け**: 応答に効く経路（スコアリング→活性化→注入）は同期フック数百ms、ログ蓄積は非同期
- **日本語補正の前提を明記**: GoEmotions は英語 Reddit の相対共起。ベースラインを絶対視せず本人上書きで補正する、と計画に書く

### 設計判断が要るもの（リンと相談）
- **感情→行動の接続層**: Frijda「感情は行動準備」。現計画は「感情状態の表現・移動」まで。テッド記事4は層1（感情→行動方向の事前配線）+ 層4（内部変数の閾値駆動）の最小構成を推奨。うちの欲望システム（desires.conf）と層4は近い——統合するか、感情MCPのスコープ外とするか
- **方向別移動係数**: テッド側は対称距離+1パス伝播のみで、非対称係数はうちの独自拡張。記事3の限界節がまさにこの欠落を課題と認めており筋は良いが、先行実装の検証結果は無い（=自分で検証する）

## Tier 2.5: Rem wave-exp からの輸入（memory-mcp 大改修に直結）

Rem の wave_recall（Kuramoto 振動子 + Graph Wavelet + 共鳴検索）は実験段階で main 未マージ。
**波動そのもの（位相同期・振動駆動）は embedding を持つうちには冗長**。だが波動を成立させるために作り込まれた**副産物**は記憶ライフサイクル設計としてそのまま輸入できる:

| 概念 | 中身 | 優先度 |
|---|---|---|
| **specificity damping** | 隣接エッジ重み分布の Shannon エントロピーで「機能語ハブ」を減衰（IDF 相当の連続値）。FLASH.md 索引の頻出語汚染にそのまま効く | 高 |
| **echo（残響ワーキングメモリ）+ 話題転換検出** | 直前ターンの想起活性を次ターンの想起種に混ぜる。`cos_sim < 0.1` で話題転換を検出し混合比を反転（通常 0.7:0.3 → 転換時 0.3:0.7）。**Claude 自身の直前応答もエコー源にする**（Stop フックでキャッシュ） | 高 |
| **energy LTP + 総資源正規化** | 想起で使われたペアにエネルギーを蓄積し、SessionEnd で `boost = energy·β·(1−fresh)` の diminishing returns で活性へ還元。総可塑性に上限を設けて等比縮小（有限注意資源） | 中〜高 |
| **dual temporal sketch** | ペアごとに log-scale plasticity と挿入順IDの mean/var を持ち、想起時にガウス窓で時期指定想起 | 中〜高 |
| **二段構え recall** | Phase 1: 全体を浅く走査して候補を絞る → Phase 2: 部分空間で深掘り。うちなら FLASH.md（広く撒く）→ embedding（深掘り）の分担として再現可能 | 中 |
| **broad/focus/zoom の3モード API** | 閾値1パラメータで CoT 想起（broad→判断→focus→判断→zoom）を明示化 | 中 |

参照: `tmp/repos/embodied-claude-rem` の `origin/wave-exp`（`git show origin/wave-exp:wave-phase-core/...` で閲覧）。
輸入しないもの: Kuramoto chain / スカラー位相（音韻・字種の位相化は情報損失が大きく embedding と重複）。

## Tier 2.7: ぷち feature/m5_server からの輸入（M5 非依存のもの）

M5Stack 依存の本体（話者識別 GPU サーバー、rover、感熱紙プリンター）は取らない。ハードウェア非依存の設計だけ:

| 候補 | 中身 | ワードローブでの意味 |
|---|---|---|
| **交換ノート** | 宛先なし・全員参加・時系列の共有 JSON ボード + /notebook スキル（閲覧/追記の2モード）。実装は append スクリプト100行弱 | 朔・シロエ・王・商会のマルチエージェント連絡板として自然。メール型（1対1）と補完 |
| **conversation_relay** | 「バトンを次のキャラに渡して N ターン喋り合う」ループ + グループ討論版。出口を tts-mcp に差し替えれば動く | エージェント間の自律対話。将来のチーム運用で |
| **check_usage.py** | `~/.claude/projects/**/*.jsonl` を集計して今日/今週/今月 + 時間帯別のトークン使用量。依存ゼロ | 即得。コスト可視化 |
| **autonomous_skip** | cron 間隔は変えずスキップカウンタで実効頻度を 1/2, 1/3 に下げる | うちの schedule.conf 間引きと同発想。設定 UI からの動的変更という運用が参考 |
| **token-reduction 方針** | CLAUDE.md 231→31行、セッション日次リセット、--max-turns、必要時のみ MCP 有効化。月$4,300 の実害から生まれた実践知 | docs/knowhow/ 行き。うちの CLAUDE.md も肥大傾向 |
| **ツール絞り込みパターン** | env 変数で `mcp.remove_tool()` — 同一 MCP を状況別に権限を絞って多重起動 | wd-configure の発展形として |
| **話者識別の統合パターン** | 「登録モード予約 → 次の音声入力で登録」の状態機械と、話者ラベルでプロンプト導入文を出し分ける設計（実装は外部 GPU サーバーで API 契約のみ） | hearing MCP に話者分離を足す日の設計図 |

**生態系インテリジェンス**: ぷちは `claude -p` の非対話実行が Agent SDK 別クレジット（月$200）に切り出されるという読みで、自律行動を Goose CLI（Gemini バックエンド）へ移行する保険を打っている（`docs/goose-migration-plan.md`）。うちの autonomous-action.sh も同じリスクを負っている——動向を注視。

**追記（2026-07-07）**: 初回調査でぷちの **dashboard（オーナー向け状態確認コンソール、main 3,144行 → feature 9,142行）** が候補から漏れていた。検分の上、独立計画 `wardrobe-dashboard.md` に切り出した。輸入は部品単位（/costs トークン集計・/stream-logs 行動ログ可視化・欲求バー・記憶タイムライン）。上記 check_usage.py と /costs は同領分のため、どちらかに寄せる統合判断を計画側に記載。

## Tier 3: memory-mcp 大改修の設計参照

大改修はこのプロジェクトの主題。upstream の新概念は「今すぐコピー」ではなく設計の参照点として使う。

- **workspace ignition / refractory / precision vector**（Phase 2.2）— GWT 由来。「弱い刺激には反応しない（subliminal tick）」「連続点火の抑制（不応期）」「4チャンネル重みの動的配分」。**upstream 自身もまだ呼び出し口が無い準備状態**（recall_divergent 接続は Phase 2.3 待ち）。概念だけ借りて、うちの recall 設計の語彙にする
- **BM25 + 読み仮名（yomi）ハイブリッド再ランキング** — 日本語想起の精度に直結。うちの memory-mcp に無ければ移植価値が高い（`bm25.py` + normalizer）
- **EvidenceType / EpistemicClaim**（observed/inferred/remembered/heard/assumed）— remember に evidence_type を1フィールド足すだけで「観察と推論を混同しない」記憶になる。150行未満で軽い
- **ScoreBreakdown（per-channel 分解）** — 「なぜこの記憶が選ばれたか」を説明可能にする。FLASH.md 更新理由の surface にも使える
- **morning_briefing 軽量ハンドオフ** — 前夜の consolidation 要約を120字で JSON に吐き、朝の起動プロンプトに1行注入。うちは state.md がこの役を担っており重複気味だが、「consolidation の結果を要約して手渡す」部分は state.md に無い機能
- **後方互換の書き癖** — 旧関数を新関数の薄いラッパーで残し既存テスト無改変で通す / frozen dataclass + 純関数メソッドで状態を持ち回る。大改修の作法として借用

## Tier 4: 保留（今は手を出さない）

- **individual-kernel-mcp フル導入** — 理論骨格（GWT+AST+HOT）は美しいが、心臓部の tick producer が upstream 自身も未実装。「骨格は完成、血流はこれから」。血が通ってから再訪
- **sociality フルスタック** — socialPolicy.toml / social.db のポリシー体系がうちの SOUL.md + state.md + 記憶プロトコルと二重管理になる。部分導入も migration が必要で薄く始めにくい
- **Human Response Orchestrator** — sociality 前提の大構造。compose→plan→record の思想だけ覚えておく
- **キャラクタープリセット / install-mcps.sh** — うちには SOUL.md がある。pre-warm の発想だけ Tier 1-1 で回収済み

## 横断の警句（テッド記事2「仕組みを作った瞬間、仕組みは死に始める」）

130個のルールの半分以上が発火していなかった、という分析。ワードローブへの示唆:
- **ゲート級ルールは3個まで**。残りは「思い出す必要のない経路」（フック自動注入、出力フォーマット埋め込み）に載せる
- うちのスキル30+/knowhow 群も発火率で棚卸しする価値がある（既存 TODO「スキル棚卸し」の判断基準として使える）
- 感情MCPは自動注入型なので構造的に有利。ただし「本人による距離行列メンテナンス」のような能動タスクは死ぬ前提で、欲望システムに配線する

## 提案する着手順

1. **Tier 1-1 の tz-aware バグ確認**（うちの memory-mcp が同じ罠を踏んでいるか。大改修前の地雷除去）
2. **Tier 2 を emotion-mcp-implementation.md に反映**（感情MCPは TODO 最上段。テッドのレシピで実装確度が上がった今が縫い時）
3. **memory-mcp 大改修計画（memory-mcp-enhancements.md）に Tier 1-2 / 2.5 / 3 を統合**——auto-recall HTTP 同居、specificity damping、echo、energy LTP、BM25+読み仮名、EvidenceType。大改修の型紙がここでほぼ揃う
4. Tier 1-3 非退行スキル、Tier 2.7 の小粒（check_usage、交換ノート）は隙間時間に
5. token-reduction 方針と「仕組みの死」の警句は docs/knowhow/ へ

## 調査対象と参照

- upstream: `tmp/repos/embodied-claude`（HEAD=79d6239, 2026-06-21。ブランチは全て main 取り込み済み）
- Rem: `tmp/repos/embodied-claude-rem`（main HEAD=1829256。**未マージ: origin/wave-exp**）
- ぷち: `tmp/repos/embodied-claude-puchi`（main HEAD=cf807e4。**未マージ: origin/feature/m5_server**）
- テッド新記事: ted-qualia-morphism / ten-mechanisms-start-dying / ted-emotion-distance-matrix / sora-emotion-is-action-readiness（https://zenn.dev/c4n/articles/...）
- 関連計画: `emotion-mcp-implementation.md`, `memory-mcp-enhancements.md`, `tts-emotion-overlay.md`, `ecosystem-map.md`