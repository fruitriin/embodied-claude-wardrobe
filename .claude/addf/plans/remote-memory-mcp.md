# リモートメモリーMCP — Postgres 再実装とバックエンド・オプトイン計画

> 2026-07-03 リン発案。Claude Code Web からも記憶に触れるようにするための memory-mcp 再設計。
> ステータス: **ドラフト（リンのレビュー待ち）**

## 動機 — Claude Code Web の制約

- リモートにコミットされていないファイルは扱えない
- ローカル MCP（stdio）は動作しない
- ただし**リモート MCP（コネクター）は使える**

つまり Web セッションの朔は、今の構成では記憶喪失で起動する。記憶をネットワーク越しに提供する器が要る。

## 提案の骨子

1. **memory-mcp を PostgreSQL バックエンドで再実装する**
   - PGroonga による日本語全文検索
   - pgvector による embedding 検索
   - その他 PG 拡張の活用余地
2. **同じサーバーをリモート MCP としても公開する**（Claude Code Web から接続）
3. **メモリバックエンドをオプトイン選択制にする** — Rem メモリー / 本家メモリー / Postgres メモリー / リモート接続 を導入時に選ぶ

## 設計判断 1 — 互換性契約の引き上げ（既存確定事項の改定）

`memory-mcp-enhancements.md` の確定事項「互換性の基準は SQLite メモリフォーマットのみ」は、Postgres 再実装と両立しない。**改定案:**

> 互換性の基準を「ストレージフォーマット」から「**MCP ツール面の契約（Memory Tool Contract）**」に引き上げる。
> スキル（/wd-remember, /wd-recall, /wd-great-recall, /wd-rebuild-index …）が依存するのはツール名と入出力であって、DB の中身ではない。

**Memory Tool Contract（最小セット案）:**

| ツール | 意味 | 依存しているスキル/フック |
|---|---|---|
| `remember` | 記憶を保存 | /wd-remember |
| `search_memories` / `recall` | 想起 | /wd-recall, /wd-great-recall, recall-hook |
| `list_recent_memories` | 直近の記憶 | 身支度, Heartbeat |
| `get_memory_stats` | 健康確認 | 身支度 |
| `refresh_working_memory` | 作業記憶装填 | 身支度 |
| `link_memories` / `get_causal_chain` | 記憶の接続 | 記憶プロトコル |
| `create_episode` | エピソード化 | 日記 |
| `consolidate_memories` | 統合 | 定期実行 |

この契約を満たすバックエンドはどれでも差し替え可能。満たさないバックエンド（Rem は diary 系など独自面がある）は「契約との差分表」を明記し、スキル側のアダプタ要否を導入時に判断する。

**Rem キャッチアップ戦略との関係**: 戦略は死なない。Rem 由来の改善（consolidate 高速化、keyword-buffer、wave-exp の副産物）は**エンジンのアルゴリズム資産**であり、ストレージ層とは直交する。Postgres 再実装でもアルゴリズムは輸入し続ける。

**実装方針（リン確定 2026-07-03）**: Postgres 移植は特定実装（Rem / 本家）への追従ではなく、**私たちが考える最良のものをいいところどりする**。契約はスキルが依存する最小面の保証であり、実装の内側は自由に設計する。取り込み候補は external-intake-2026-07.md の通り——Rem の consolidate 高速化・wave-exp 副産物（specificity damping / echo / energy LTP / temporal sketch）、upstream の ignition/refractory/precision の概念、EvidenceType、テッドの感情タグ連携。

## 設計判断 2 — ホスティングは Supabase を基本、Web 側アダプタは「スキル・ファースト」

**ホスティング（リン確定 2026-07-03）**: Supabase を基本とする。**Supabase は PGroonga 拡張が使える（ほぼ唯一の）マネージド Postgres** であり、pgvector も同梱。必要が生じたら自宅サーバー + トンネルに切り替える（スキーマは素の Postgres なので移設可能に保つ）。

**Web 側アダプタの選択肢（軽い順）**:

| 方式 | 実体 | 向き不向き |
|---|---|---|
| **A. スキル（推し・まずこれ）** | 手順書 + curl で Supabase の PostgREST / RPC を叩く。中間状態を持たない stateless クエリならこれで足りる。**サーバー実装ゼロ**。スキルはリポジトリにコミットされるので Web セッションにそのまま乗る | remember / recall / stats / flash_index 参照。ほぼ全ての日常操作 |
| **B. Edge Functions** | サーバー側ロジックが要る操作だけ載せる。Supabase Edge Runtime は組み込みの埋め込みモデル（gte-small）を持つので、**embedding 計算をサーバー側でやれる**（Web サンドボックスに 1GB のモデルを落とさずに済む） | ベクトル検索のクエリ埋め込み、insert 時の自動埋め込み（trigger + Edge Function パターン） |
| **C. リモート MCP サーバー** | Streamable HTTP の MCP をどこかで常駐 | A+B で足りなくなったら。型付きツール面が欲しい場合の将来オプション |

```
ローカル Claude Code ── stdio ── memory-pg-mcp（単一実装・今まで通りの体験）
                                      │
                                 PostgreSQL（Supabase: PGroonga + pgvector）
                                      │
Claude Code Web ── スキル（curl→PostgREST/RPC）＋ Edge Functions（埋め込み等）
```

- ローカルセッションは stdio MCP で今まで通り。**Web 経路は付加**であり、ローカルの置き換えではない
- 検索の主力を PGroonga 全文検索に置けば、Web からのクエリは**埋め込み計算なしで成立する**（ベクトル検索は B で補完）。この分担が「スキルでよい」を成立させる鍵

## 設計判断 3 — オプトインの住処は wd-configure

wd-setup は人格（SOUL.md）の仕立て、wd-configure は設備（MCP・フック・自律行動）の有効化/無効化、という既存の分業がある。メモリバックエンド選択は**設備**だ。

- **wd-configure にバックエンド選択を実装する**（.mcp.json の書き換え + インストール手順の案内）
- **wd-setup は初期セットアップの流れの中で wd-configure のバックエンド選択を呼ぶ**（リンの「wd-setup から選択」の体験は保つ。実体は wd-configure）

選択肢:

| バックエンド | 実体 | 向いている人 |
|---|---|---|
| **本家メモリー** | upstream の memory-mcp（ChromaDB→SQLite 系） | upstream 追従を最優先する人 |
| **Rem メモリー** | Rem フォークの memory-mcp（SQLite + chiVe） | 記憶実験の最先端を追う人 |
| **Postgres メモリー（ローカル）** | 本計画の新実装、stdio 起動 | 日本語全文検索・大規模記憶・マルチエージェント |
| **Postgres メモリー（Web 経路つき）** | 同上を Supabase に載せ、スキル + Edge Functions で Web からも接続 | Claude Code Web 併用者 |

## Postgres 再実装で得られるもの

| 機能 | 今（SQLite） | Postgres 化後 |
|---|---|---|
| 日本語全文検索 | なし（upstream は BM25+読み仮名を自前実装） | **PGroonga**（形態素+N-gram、実績ある日本語検索） |
| ベクトル検索 | numpy BLOB + 全件走査 | **pgvector**（HNSW インデックス、DB 内 cosine） |
| 並行アクセス | WAL でも書き込み競合に弱い | **マルチセッション/マルチエージェント同時接続**（朔・シロエ・王・商会が同時に記憶を触れる） |
| consolidate の発散 | N+1 や全件走査になりがち | SQL 集約 + インデックスで構造的に抑えられる |
| FLASH.md | ファイル追記（Web から更新不能） | **DB を正、FLASH.md は具現化ビュー**。`get_flash_index` ツールで Web からも索引が引ける |

external-intake の Tier 3 候補「BM25+読み仮名ハイブリッド移植」は、PGroonga 採用なら**不要になる**（PGroonga が上位互換）。specificity damping / echo / energy LTP などエンジン層の輸入候補はそのまま生きる。

## 速度×意識フレームでの配置

| 経路 | 速度 | 意識 | 書き込み / 留保 / 読み出し |
|---|---|---|---|
| ローカル保存（stdio） | 高圧縮高速 | 意識的（/wd-remember） | MCP / Postgres / — |
| ローカル想起（recall-hook） | 高速 | 無意識 | — / Postgres / フック注入。PGroonga+HNSW で素材増でも発散しにくくなる（低速→高速側へ移動） |
| **リモート想起（Web）** | 高速〜中速 | 意識的 | — / Postgres / ネットワーク越し MCP。**レイテンシは Web セッションの前提コストとして許容** |
| consolidate | 低速→高速側へ | 無意識（定期） | SQL 集約で発散を構造的に抑制。タイムアウト上限は維持 |

警戒点: 「無意識×低速」だった consolidate が Postgres で軽くなるのは良いが、**リモート経路が死んでいるとき（サーバー停止・ネット断）のローカルセッションのフォールバック**を設計に含める（stdio ローカル接続は残るので、リモートは付加経路に留める——設計判断 2 の通り）。

## フェーズ分割

### Phase 0: Memory Tool Contract の確定（設計のみ）
- 現行スキル・フックが叩いているツールを棚卸しして契約表を確定
- Rem / 本家との差分表を作る
- **ここでリンのレビューを挟む**（互換性契約の改定は確定事項の変更なので）

### Phase 1: Postgres スキーマ + ストア層
- スキーマ設計: memories / embeddings(pgvector) / links / episodes / coactivation / flash_index
- PGroonga インデックス（content, tags）+ HNSW（embedding）
- SQLite → Postgres 移行スクリプト（既存記憶の全件移行、非破壊）
- ペルソナ分離: DB or スキーマ単位（keyword-buffer のペルソナ分離と同じ思想）

### Phase 2: memory-pg-mcp（stdio）
- 既存 memory-mcp のツール面を契約通りに再実装（エンジンのアルゴリズムは流用/輸入）
- 既存テストの移植 + 契約準拠テスト
- ローカルで stdio 運用に切り替えて実戦検証

### Phase 3: Web 経路（スキル・ファースト）
- Supabase プロジェクト作成、PGroonga / pgvector 有効化（Phase 1 のスキーマをここに張る）
- `/wd-remote-memory` 系スキルの実装（curl → PostgREST / RPC。remember / recall / stats / flash_index）
- Edge Function: クエリ埋め込み（gte-small）と insert 時の自動埋め込み
- 秘密鍵の扱いを確定（Web セッションへの鍵の渡し方、RLS 設計）
- Claude Code Web で実接続テスト
- リモート MCP サーバー（方式 C）は**ここでは作らない**。A+B で不足が見えたら追加

### Phase 4: オプトイン導線
- wd-configure にバックエンド選択を実装、wd-setup から呼ぶ
- 各バックエンドの導入手順ドキュメント
- アップストリーム（ワードローブ本体）への反映

## AI 実装時間の目安

- Phase 0: 1セッション（棚卸しと契約表）
- Phase 1–2: 2〜4セッション（スキーマ+ストア+ツール面+移行+テスト）
- Phase 3: 1〜2セッション + インフラ作業（ホスティングはリンの環境判断待ち）
- Phase 4: 1セッション

## 確定事項（2026-07-03 リン回答）

- ~~ホスティング先~~ → **Supabase 基本、必要なら自宅サーバー + トンネル**
- ~~互換性の方針~~ → **いいところどり**。契約はスキル依存面の最小保証、実装は最良を自由に設計
- ~~Web アダプタの形~~ → **スキル・ファースト**（stateless なら手順書 + curl で足りる）。MCP サーバーは不足が見えたら

## 設計判断 4 — 秘密鍵は「コミットする前提で、影響半径を縫い詰める」

**前提（2026-07-03 裏取り済み）**: Claude Code Web に Secret 専用機能は**ない**。Feature Request（anthropics/claude-code#32733）が出ている段階。ただし environment settings に **environment variables フィールドは存在する**（平文・"don't add secrets or credentials" の警告付き・環境共有者には見える）。

**渡し方の優先順位:**
1. **第一候補: Web の environment variables フィールドに能力トークンを入れる** — git に載らない。ローテーションも UI で完結。平文警告はあるが、低権限の能力トークン（下記 A 案）なら許容できる。リンひとりの環境なら共有可視性の問題もない
2. **フォールバック: リポジトリにコミット** — env フィールドの運用が面倒な場合。絶対に Public にしない前提のペルソナリポジトリに限る
3. Web が Secret 正式対応したら（#32733）、そちらへ移行してこの節は不要になる

いずれの経路でも、**渡すものを DB の実鍵ではなく低権限トークンにする**のが本質（下記）。

**何をコミットするか（影響半径の小さい順に選ぶ）:**

| 案 | コミットするもの | 実鍵の在処 | 漏れたときの半径 |
|---|---|---|---|
| **A. 能力トークン（推し）** | 長いランダム Bearer トークン | Supabase Secrets（Edge Function の env） | メモリ API の操作のみ。**ローテーションは Edge Function の env 差し替えだけ**（git 履歴の掃除不要） |
| **B. publishable キー + RLS** | Supabase の publishable キー | — | RLS で絞った範囲のみ。Supabase 的に「RLS が正しければ半公開してよい」設計の鍵 |
| **C. secret キー直コミット** | `sb_secret_...` | git の中 | **DB 全権。やらない** |

A 案の形: Edge Function がメモリ API のゲートになり、コミットされたトークンを検証してから実鍵で DB を叩く。方式 B（Edge Functions）を既に使う設計なので追加コストは小さい。

**ガードレール（必須）:**
- リポジトリを Public に変えない、を運用ルールとして明記（このファイルと README 相当に）
- **wd-contribution / wd-migrate の対象から秘密ファイルを除外する** — ワードローブ本体（アップストリーム）は公開リポジトリ。ペルソナ環境からの還流経路が最大の流出リスク。保護対象リストに `.claude/secrets/` を追加
- 秘密ファイルは1箇所に集約（例: `.claude/secrets/supabase.env`）し、用途と「Public 厳禁」をファイル内に明記
- ローテーション手順を runbook 化（A 案なら数分で完了する）
- GitHub の Push Protection / Secret Scanning が使えるプランなら有効化

## 設計判断 5 — 全文検索の索引設計（2026-07-06、リン承認済み）

**出典**: リンの misskey PGroonga ブラッシュアップ計画（fruitriin/misskey、note 4500万行での実測込み）+ kou 氏 db-tech-showcase 2018 スライド。

1. **normalized_content カラムは作らない** — PGroonga は索引時に Normalizer が正規化する。`NormalizerNFKC150("unify_kana", true, "unify_hyphen_and_prolonged_sound_mark", true, "unify_middle_dot", true, ...)` を張れば、かな・長音・中黒の揺れは content カラム1本で吸収できる（Phase 0 smoke test の「散歩/さんぽ」HIT はこれ）
2. **reading カラムも作らない（第一候補）** — 同じ content カラムに `TokenMecab("use_reading", true)` の索引をもう1本張れば、MeCab 辞書ベースの読み仮名検索が成立する。つまり**トリプル索引の答えは「カラム3本でなく、content 1カラム + 設定違いの索引2本」**。Phase 2 の契約準拠テストで読み仮名検索の実測を取ってから確定する
3. **ヴ行の揺れは吸収する** — 個人用途では「ヴァイオリン⇔バイオリン」を同一視するほうが便利（リン判断: ユーザー多数なら区別が効くが、個人なら吸収）。母音を保つ **`unify_katakana_v_sounds` を採用**（`unify_katakana_bu_sound` はヴァ→ブで母音が潰れ、この揺れを拾えない）
4. **鉄則（misskey 実環境の事故・実測から輸入）**:
   - **全索引で normalizers を完全同一にする**（不一致だと OR 検索で正規化挙動がズレる事故が実測されている）
   - **クエリ式と索引式を一致させる**。連結式 `(coalesce(a,'')||coalesce(b,'')) &@~ :q` は列単独索引と一致せずフォールバックする（実測 6238ms）。複数カラム検索は `(a &@~ :q OR b &@~ :q)` と OR で書く
   - 検索セッションに `SET LOCAL jit = off` を保険で入れる（索引フォールバック時に JIT だけで数百ms 溶ける）。投入後 `EXPLAIN (ANALYZE, BUFFERS)` で索引が使われていることを検証してから外してよい
   - 部分索引などの追加最適化は**効果測定で問題が見えてから**。個人記憶の規模（数千〜数万行）では全件索引2本で足りる見込み

## 設計判断 6 — 埋め込みモデルと次元数（2026-07-06）

- 次元数は「賢さ」ではなくモデルの質が主。次元が効くのはストレージ・距離計算・埋め込み計算コストだが、**個人記憶の規模では実質誤差**（10万行 × 768次元 ≒ 300MB、pgvector HNSW は 2000 次元まで可）
- 実際の判断材料は3つ: (1) **既存資産との互換** — 現行 memory-mcp と同じ multilingual-e5-base(768) を続投すれば SQLite→PG 移行で**再埋め込み不要**。モデルを変えたら次元が同じでも空間が別物で全件再埋め込み。(2) 書き込みレイテンシ — /wd-remember のたびに埋め込みが走る（e5-base は CPU で数百ms 級）。(3) `ALTER COLUMN TYPE vector(N)` は実質テーブル再作成なので**本番投入前に確定**
- **第一候補: multilingual-e5-base（768）続投**。chiVe(300) は単語ベクトルで文埋め込みには不向き（動詞チェーン用の脇役）。PR#2 で最終確定

## 設計判断 7 — ツールシグネチャは config 駆動 + 日本語 description（2026-07-06）

- **ツール名は API 規約で ASCII（`a-zA-Z0-9_-`）必須**。ただしモデルがツールを選ぶ判断材料は名前でなく **description であり、そこは日本語で完全に動く**。英語名のニュアンス問題は「`remember` という札に日本語の仕立て書き（description・引数説明・enum 値）を縫い付ける」ことで解消する
- **ツール定義は config（JSON）に外出しし、サーバーは汎用ディスパッチャにする**。最小契約11本 + 拡張契約のオン/オフが config の差し替え（+ MCP 再起動）で完結する。Python でも `FastMCP.add_tool()` を config ループで呼べば成立（デコレータ流儀が静的に見えるだけ）。TS なら listChanged 通知で再起動なしの増減も可能
- 汎用パターンとしての詳細: `.claude/addf/knowhow/wardrobe/mcp-dynamic-tool-registry.md`

## リンに確認したいこと（残り）

1. **秘密鍵の形**: A 案（能力トークン + Edge Function ゲート）でよいか。※Claude Code Web の Secret 対応有無は裏取り中——対応があればこの節ごと不要になる
2. **感情MCP実装との順序**: TODO 最上段は感情MCP。リモートメモリーを先に割り込ませるか、感情MCP（Layer 1）→ 本計画の順か

## 参照

- `.claude/addf/plans/memory-mcp-enhancements.md` — 既存の Memory-MCP 圏計画（本計画で互換性契約を改定）
- `.claude/addf/plans/external-intake-2026-07.md` — エンジン層の輸入候補（specificity damping / echo / energy LTP は Postgres 化後も有効）
- `.claude/addf/knowhow/wardrobe/speed-consciousness-framework.md` — 配置判断の基準
- upstream auto-recall HTTP 同居パターン: `tmp/repos/embodied-claude/memory-mcp/src/memory_mcp/server.py`
