---
name: wd-project-claude-overview
description: |
  CLAUDE.md・スキル・フック・スクリプトのエコシステムを網羅的に記録し、
  docs/project-overview/ に静的ドキュメントとして出力する。
  ドキュメントは「実装方法別」ではなく「概念システム別」に分類する。
  最後に実施したコミットハッシュを .lock として保持。
  コードの変更後や大規模スキル追加時に実行してドキュメントを最新化する。
user_invocable: true
---

# project-claude-overview — エコシステム概要生成

## 目的

このプロジェクト（embodied-claude-wardrobe をベースとしたエージェントのハーネス全体像）を人間が読めるドキュメントとして記録する。
分類の軸は **「概念的な関連性・システム単位」** であり、「スキル/フック/スクリプト」という実装種別では分けない。

例: 記憶システムは memory-mcp・recall・remember・great-recall・rebuild-index・recall-hook.sh・post-compact-recovery.sh をまとめて1ファイルに記録する。
これらは別々の実装（MCP/スキル/フック/スクリプト）だが、「記憶」という機能で繋がっている。

## このプロジェクトの特性

**embodied-claude-wardrobe は身体性を持つ Claude エージェントのハーネス基盤である。**

- SOUL.md にエージェントの人格・価値観が定義される
- memory-mcp（聖杯）が同居しており、記憶システムのソースコード自体がこのリポジトリにある
- 身体性システム（interoception・desire・heartbeat）を持つ embodied AI
- autonomous-action.sh による cron 自律行動と、対話セッションの二つのモード
- desires.conf・schedule.conf でエージェントの「欲望」と「活動スケジュール」をカスタマイズできる
- .claude/wardrobeOptions/ にオプショナルスキルを格納（デフォルト無効）

## 出力先

すべて `docs/project-overview/` に作成する（`.claude/` 配下には書かない）。
既存ファイルは上書き。

```
docs/project-overview/
├── INDEX.md               エントリポイント・ファイル一覧・最終更新日
├── claude-md-deps.md      CLAUDE.md とその依存・Boot Sequence
├── phase-flows.md         フェーズ/ステップ進行のあるスキルを自動検出して全掲載
├── interactions.md        システム間相互作用アスキーアート
├── system-*.md            概念システムごとのドキュメント（Step 3 で探索的に決定）
└── .lock                  最終実施時のコミットハッシュ（1行）
```

## モード選択

引数でモードを切り替える:

- **`/project-claude-overview`** (引数なし) → **full モード**。毎回ゼロベースで全要素をスキャンし、概念システムを探索的に発見する
- **`/project-claude-overview patch`** → **patch モード**。.lock のコミットハッシュから git diff を取り、変更があったシステムだけ再生成する

**どちらを使うかの判断基準:**
- スキル/フック/スクリプトが**追加・削除**された → **full**（概念の境界が動く可能性）
- 既存ファイルの**中身だけ変わった** → **patch**（分類は変わらない）
- 迷ったら **full**

---

## patch モード手順

### P1: .lock を読み、差分を取得

```bash
# .lock からコミットハッシュを抽出
LOCK_HASH=$(cut -d'|' -f1 docs/project-overview/.lock)
# 変更ファイル一覧
git diff --name-only "$LOCK_HASH"..HEAD
```

### P2: 変更ファイルを概念システムにマッピング

以下のルールで、どの system-*.md が影響を受けるか判定する。
**注意: wardrobe のスキルは `.claude/commands/` に、フックは `.claude/hooks/` に、スクリプトは `.claude/scripts/` に配置される。**

| 変更パス | 影響するシステム |
|---|---|
| `.claude/mcps/memory-mcp/`, `FLASH.md`, `.claude/commands/wd-recall.md`, `.claude/commands/wd-remember.md`, `.claude/commands/wd-great-recall.md`, `.claude/commands/wd-rebuild-index.md`, `.claude/hooks/recall-hook.sh`, `.claude/hooks/post-compact-recovery.sh`, `.claude/scripts/recall-*.ts` | system-memory |
| `.claude/hooks/interoception.sh`, `.claude/hooks/heartbeat-*.sh`, `.claude/scripts/desire-tick.ts`, `.claude/scripts/interoception.ts`, `.claude/scripts/system-health.ts`, `desires.conf` | system-embodied |
| `.claude/commands/wd-read.md`, `.claude/scripts/reader.ts` | system-reader |
| `ROUTINES.md`, `autonomous-action.sh`, `schedule.conf`, `.claude/hooks/continue-check.sh` | system-autonomous |
| `SOUL.md`, `CLAUDE.md` | system-soul |
| `.claude/settings.json`, `.claude/settings.local.json` | claude-md-deps |

**マッピングに該当しないファイルの変更**（docs/, tests/, memory-mcp のソース変更等）は無視してよい。

**新しいファイルがマッピングテーブルにない場合** → patch モードでは扱えない。full モードで実行すること。実行者に警告を出す。

### P3: 影響するシステムだけ再生成

該当する system-*.md を、Step 1 の収集手順のうち関連部分だけ実行して更新する。
- 該当システムの構成要素を再収集
- system-*.md を上書き
- INDEX.md の全要素カウントを更新（変更があれば）

interactions.md と phase-flows.md は**更新しない**（構造変更は full でやる）。

### P4: 経験の記録

.exp.md に patch 実行の記録を追記:
```markdown
## YYYY-MM-DD patch 実行

### 差分
- LOCK_HASH..HEAD: N commits, M files changed
- 影響システム: [system-xxx, system-yyy]

### 更新内容
- [何を更新したか]
```

### P5: .lock 更新 + 完了報告

.lock を HEAD のハッシュで更新し、更新したファイル一覧を報告。

---

## full モード手順

### Step 0: 前回の経験を読む

`wd-project-claude-overview.exp.md` が存在すれば Read する（`.claude/commands/` に隣接して配置されている）。
前回の実行で発見された「分類の迷い」「新概念の提案」「次回への申し送り」が記録されている。
今回の分類判断に活かす。存在しなければスキップ（初回実行）。

### Step 1: 全データ収集（できる限り並列）

**A. プロジェクト構造**
- `CLAUDE.md` 全文
- `.claude/settings.json` と `.claude/settings.local.json`

**B. スキル全件**
- `.claude/commands/*.md` を Glob で列挙し、**全ファイルを全文 Read**
- `.exp.md` は対応するスキルとペアとして記録
- `.claude/wardrobeOptions/skills/*.md` も列挙（オプショナルスキルとして区別して記録）

**C. フック全件**
- `.claude/hooks/*.sh` と `.claude/hooks/*.ts` を全件 Read（先頭20行で十分）

**D. スクリプト全件**
- `.claude/scripts/*.ts` を全件 Read（先頭20行で十分）

**E. 主要ファイルの確認**
- `SOUL.md` — 存在確認と全文 Read（エージェントの人格定義）
- `FLASH.md` — 存在確認（記憶インデックス）
- `ROUTINES.md` — 存在確認と内容確認
- `desires.conf`, `schedule.conf` — 存在確認と内容確認
- `autonomous-action.sh` — 先頭30行 Read
- `.claude/mcps/memory-mcp/` — ls でディレクトリ構造を確認

**F. コミット情報**
- `git log -1 --pretty=format:"%H|%s|%ad" --date=short`

---

### Step 2: フェーズフロー自動検出

**全スキルファイル**（Step 1B で取得済み）を走査し、
以下のパターンのいずれかを含むスキルを「フェーズ進行あり」と判定する：

```
検出パターン（大文字小文字・全半角を問わず）:
- "Phase [0-9]"
- "Step [0-9]"
- "### フェーズ" / "### Phase"
- "### ステップ" / "### Step"
- "## フロー" / "## 手順" （ただし単純な説明文ではなく、番号付きフローを持つもの）
- "1. " に続く複数の手順番号（3ステップ以上の番号付きリスト）
```

**スキルを対象リストに加える・除くのは実行者が判断**。
リストを事前に決め打ちしない。毎回全スキャンで発見する。

---

### Step 3: 概念システムの探索的発見

全スキル・フック・スクリプト・MCP を読んだ上で、**帰納的に**概念システムを発見する。
事前に決まったシステム一覧をなぞるのではなく、実データからグルーピングを導出する。

**手順:**

1. **全要素をフラットに並べる** — スキル・フック・スクリプト・MCP・ファイルの一覧表を作る
2. **クラスタリング** — 以下の3つの問いで要素同士の近さを判断する:
   - そのスキル/フック/スクリプトの「主目的」は何か？
   - 使わなくなったとき、どの機能が失われるか？
   - 他のどの要素と最も密接に連携しているか？
3. **名前をつける** — クラスタごとに `system-[名前].md` のファイル名と一言説明を決める
4. **前回との差分を確認** — `.exp.md` に記録された前回の分類と比較する。変わったなら理由を言語化する
5. **1つの要素が複数のシステムに関与する場合は両方に記載**してよい

**決め打ち禁止:**
- システムの数は固定しない。4個かもしれないし、8個かもしれない
- 前回と同じ分類になるとは限らない。新しいスキルが増えれば概念の境界が動く
- 「前回の分類を追認する」だけで終わらせない。毎回ゼロベースで全要素を見直す

**前回の分類（参考として読むが、拘束力はない）:**

前回（.exp.md に記録がある場合はそちらを優先）は以下の5システムに分類された:
- **記憶** (memory) — memory-mcp・FLASH・wd-recall/wd-remember/wd-great-recall・コンパクション対応
- **身体性** (embodied) — interoception・desire-tick・heartbeat・system-health
- **読書** (reader) — read・sanitize・reader.ts
- **自律行動** (autonomous) — autonomous-action・ROUTINES・desires/schedule・continue-check
- **魂** (soul) — SOUL.md・CLAUDE.md

これらが今も妥当かどうか、Step 1 で収集したデータから再検証すること。
例: 新しいスキルが追加されていたら、既存のどのシステムに属するか？ 新しいシステムが必要か？

**残余チェック:**
全要素を分類した後、どのシステムにも入らなかった要素がないか確認する。
- 残余1-2件 → 既存システムへの追加を検討。無理なら「未分類」として INDEX.md に記載
- 残余3件以上で共通概念あり → 新たな概念システムを提案

**各システムの記録すべき内容:**
- 構成要素（MCP / スキル / フック / スクリプト / ファイルを問わず全リスト）
- 設計思想（なぜこの設計か。SOUL.md・CLAUDE.md との対応）
- 主要フロー（典型的な使われ方・連携フロー）
- 関連するシステム（他のどのシステムと連携するか）

---

### Step 4: ドキュメント生成

#### INDEX.md

```markdown
# エコシステム概要 — インデックス

> 生成日: YYYY-MM-DD | コミット: [8文字ハッシュ] [メッセージ]

embodied-claude-wardrobe をベースとしたエージェントのハーネス。
memory-mcp を内蔵し、身体性と自律行動を備えた embodied AI の基盤。
SOUL.md にエージェント固有の人格が定義される。

概念システム別に分類したドキュメント群。実装種別（スキル/フック/MCP/スクリプト）では分けていない。

## 概念システム一覧

| ファイル | システム | 主な構成要素 |
|---|---|---|
| ... | ... | ... |

（Step 3 で探索的に決定した全システムを列挙）

## 補完ドキュメント

| ファイル | 内容 |
|---|---|
| [claude-md-deps.md](claude-md-deps.md) | CLAUDE.md 依存グラフ・Boot Sequence |
| [phase-flows.md](phase-flows.md) | フェーズ進行スキル一覧（自動検出） |
| [interactions.md](interactions.md) | システム間相互作用アスキーアート |

## 全要素カウント

- スキル: N本（うち .exp.md あり: N本）
- オプショナルスキル（wardrobeOptions）: N本
- フックスクリプト: N本（.claude/hooks/）
- スクリプト: N本（.claude/scripts/）
- 概念システム: N（Step 3 で探索的に決定）
```

---

各 `system-*.md` の冒頭テンプレート:

```markdown
# [システム名] — [一言説明]

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「[このシステムの機能]」に関わるものをまとめている。

## 構成要素

[MCP / スキル / フック / スクリプト / ファイルを問わず、関連するものをすべてリスト]

## 設計思想

[なぜこの設計になっているか、SOUL.md・CLAUDE.md との対応]

## 主要フロー

[このシステムの典型的な使われ方・連携フロー。アスキーアートで可。]

## 関連するシステム

[他のどのシステムと連携するか]
```

---

#### phase-flows.md

```markdown
# フェーズ進行スキル一覧

> 毎回の実行時に全スキルをスキャンして自動生成。対象リストは決め打ちしない。
> 検出基準: Phase/Step 番号付き構造、または3ステップ以上の手順フローを持つスキル。
> 生成日: YYYY-MM-DD

## 検出結果: N本

[スキル名] — [1行説明]
[スキル名] — [1行説明]
...

---

## [スキル名]

[スキルの description]

[フェーズ・ステップ構造を抜粋。改変しない — スキル本文から直接引用]

---
```

---

#### interactions.md

概念システム間の相互作用をアスキーアートで表現。
Step 3 で決定したシステム群に基づいてその都度描く（決め打ちの図は置かない）。

**必須で描く図:**

1. **全システム関係図** — 探索的に発見した全システムがどう連携するか
2. **セッションライフサイクル × フック発火タイミング図**
3. **記憶想起フロー図**（recall-watcher → recall-hook.sh → コンテキスト注入）

---

#### claude-md-deps.md

- CLAUDE.md の Boot Sequence を抽出（SOUL.md・FLASH.md・ROUTINES.md の参照関係）
- CLAUDE.md が参照する外部ファイルの依存グラフ
- settings.json のフック定義とトリガー条件
- wardrobeOptions の構造と有効化方法

---

### Step 5: 経験の記録

`wd-project-claude-overview.exp.md` に今回の実行で得た知見を追記する。
（このファイルは `.claude/commands/project-claude-overview.md` と同じディレクトリに置く）

**記録すべきもの:**
- **分類結果** — N個のシステムに分類（前回: M個）。変更があれば差分を記載
- **分類の判断で迷った要素** — どの要素をどのシステムに入れるか迷ったか、最終的にどう判断したか
- **前回からの変化** — 新しく増えた要素、消えた要素、システム境界が動いた箇所
- **新たに発見した概念的つながり** — 「このスキルとあのフックは実は同じ概念系だった」等
- **次回への申し送り** — 次回実行時に注意すべきこと、検証したい仮説、肥大化の兆候

**フォーマット:**
```markdown
## YYYY-MM-DD 実行記録

### 分類結果
- N個のシステムに分類（前回: M個）
- [変更があれば差分を記載]

### 判断メモ
- [迷った点、発見、改善点]

### 次回への申し送り
- [次回実行時に注意すべきこと]
```

新しい実行記録は**末尾に追記**する（過去の記録は消さない）。
ファイルが肥大化したら（5回分以上）、古い記録は要約して圧縮してよい。

**重要:** `.exp.md` は次回実行時の Step 0 で**必ず読む**。前回の判断を踏まえた上で再検証する。

---

### Step 6: .lock 更新

`docs/project-overview/.lock` に以下を書く：
```
HASH|COMMIT_MSG|DATE
```

Step 1F で取得した値をそのまま使う。

---

### Step 7: 完了報告

- 生成ファイル一覧と行数
- 概念システムの数と名前（前回との差分があれば強調）
- フェーズ進行スキルとして検出した数・スキル名
- 前回 .lock との差分コミット数
- 新たに発見した依存関係・システム間の連携
- `.exp.md` に記録した主な知見（1-3行のサマリ）
