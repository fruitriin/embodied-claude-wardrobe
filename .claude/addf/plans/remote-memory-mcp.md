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

### Phase 0: Memory Tool Contract の確定（設計のみ）— 棚卸し完了（2026-07-14）

現行 memory-mcp（`.claude/mcps/memory-mcp/src/memory_mcp/server.py`）は全25ツールを実装。スキル・フック・CLAUDE.md/BOOT_SHUTDOWN.md を全数 grep して実呼び出しを突き合わせた結果、当初案の8種より多い**14ツール**が実運用で使われていた。

**契約に含める（実運用で呼ばれている14ツール）:**

| ツール | 依存元 |
|---|---|
| `remember` | /wd-remember |
| `search_memories` | /wd-recall, /wd-rebuild-index, /wd-observe |
| `recall` | /wd-great-recall（3圧縮器共通）, CLAUDE.md Heartbeat, recall-watcher.ts, /wd-observe |
| `recall_with_associations` | /wd-great-recall（技術的圧縮器） |
| `recall_divergent` | /wd-great-recall（感情的圧縮器） |
| `get_causal_chain` | /wd-great-recall（因果的圧縮器） |
| `list_recent_memories` | CLAUDE.md Heartbeat |
| `get_memory_stats` | 身支度, /wd-rebuild-index |
| `refresh_working_memory` | 身支度 |
| `link_memories` | 日記, CLAUDE.md |
| `create_episode` | 日記, CLAUDE.md |
| `consolidate_memories` | 日記（3セッションに1回）, CLAUDE.md |
| `save_visual_memory` | /wd-observe |
| `recall_by_camera_position` | /wd-observe（定点カメラ時） |

`search_memories` と `recall` は契約表では1行にまとめていたが、実装は別ツール（前者はdistance付き+フィルタあり、後者はシンプル版）で両方とも実呼び出しあり。**契約は2ツールとして分離する。**

**契約に含めない（実装はあるが呼び出し元なし。11ツール）:**
`get_association_diagnostics` / `get_memory_chain` / `search_episodes` / `get_episode_memories` / `save_audio_memory` / `get_working_memory` / `save_verb_chain` / `search_verb_chain` / `get_memory_calendar` / `reevaluate_importance` / `tom`

Postgres移植では上記14ツールを優先実装し、未使用11ツールは「Phase 2 で契約準拠テストを書く段になったら個別に要否判断」とする（動詞チェーン系はRem由来のアルゴリズム資産で将来輸入予定のため完全に切り捨てない）。

**設計上の注意点（移植時に踏むべき地雷）:**
- `get_memory_chain`（`Memory.linked_ids` を辿る）と `get_causal_chain`（`Memory.links`/`MemoryLink` の `link_type` を辿る）は**別々のデータモデルで同じような役割を果たしている**。great-recall は `get_causal_chain` のみ使用。Postgres移植を機に統合するか、2系統を維持するかは設計判断が必要 → **調査結果と推奨案は下記「`linked_ids`/`links` 統合調査」節を参照**
- 現行ツールの返り値は全て `list[TextContent]`（人間可読テキスト or `json.dumps` 文字列）。構造化レスポンス（JSON schema）にするかどうかは移植時の設計判断点
- `Memory` 型（`types.py`）は SQLite 特有のフィールドが少なく、素直に Postgres の列/JSONB へ移せる形

#### `linked_ids`/`links` 統合調査（2026-07-14、朔調査）

`store.py` を実際に読むと、2系統は**役割そのものが違う**——「同じ役割を別モデルで実装している」のではなく「別の性質のリンクを別モデルで実装している」。

| | `linked_ids`（`Memory.linked_ids`） | `links`（`Memory.links` / `MemoryLink`） |
|---|---|---|
| 生成契機 | `remember` 時に埋め込み類似度で**自動**（`save_with_auto_link`, 閾値0.8, 最大5件）+ consolidate の coactivation 経由 | `link_memories` ツールで**明示的**に張る（+ consolidate 内で `link_type="related"` として自動追加される経路もある。`add_causal_link` 呼び出し, `store.py:1106-1111`） |
| 方向性 | 無向・双方向（`_add_bidirectional_link` で両側に書く） | 有向（`source→target`、`link_type` で意味づけ） |
| 型情報 | なし（類似というだけ） | `caused_by` / `leads_to` / `related` / `similar`（`LinkType` enum） |
| メタデータ | なし | `created_at` / `note` |
| 呼び出し元 | `get_memory_chain`（未使用ツール） | `get_causal_chain`（great-recall の因果的圧縮器が使用） |

**推奨案（Phase1のスキーマ確定前にリン確認）**: ストレージは**単一の edge テーブルに統合**する（`memory_links(source_id, target_id, link_type, created_at, note)` 相当）。`linked_ids` の自動類似リンクは `link_type='similar_auto'`（または既存の `similar` を流用）として同テーブルに書き込む形に寄せれば、無向性は「両方向に1行ずつ挿入」で表現でき、`_add_bidirectional_link` のロジックはそのまま使える。トラバース側は `get_causal_chain` を汎用化した1関数に統合できる——`link_type` フィルタなし（全件）なら現行 `get_memory_chain` 相当、`{caused_by}`/`{leads_to}` フィルタなら現行 `get_causal_chain` 相当。**`get_memory_chain` 自体は契約14ツールに含まれていない（呼び出し元なし）ため、Postgres版で独立ツールとして残す必要はなく、トラバースロジックの共通化だけで足りる**。

### Rem / 本家との差分表（2026-07-14 完了）

wardrobe現行25ツール・upstream本家27ツール・Rem `wave-exp`（12ツール、ローカルクローン `origin/wave-exp` から新規checkout して調査）を突き合わせた。

**A. 契約14ツール × upstream本家 × Rem wave-exp**

| 契約ツール | upstream本家 | Rem wave-exp |
|---|:---:|:---:|
| `remember` | ○ 同名 | △ `diary` に統合（visual/audio/動詞チェーンも同時保存） |
| `search_memories` | ○ 同名 | ✕ 廃止（`recall` に統合、とコメントにあり） |
| `recall` | ○ 同名 | ○ 同名（`quadrant`/`freshness_min/max` 付きに拡張） |
| `recall_with_associations` | ○ 同名 | ✕ 実体なし（コメントは「`recall`の`chain_depth`に統合」と主張するが、実装に`chain_depth`パラメータが存在しない。ドキュメントと実装の乖離、要検証） |
| `recall_divergent` | ○ 同名 | ○ 同名（概ね同等） |
| `get_causal_chain` | ○ 同名 | ✕ 実体なし（Remの`graph.py`は動詞/名詞ノードのグラフで、Memory↔Memoryリンクの概念自体が存在しない） |
| `list_recent_memories` | ○ 同名 | ○ 同名 |
| `get_memory_stats` | ○ 同名 | ✕ コメントアウトで無効化（"rarely used"） |
| `refresh_working_memory` | ○ 同名 | ✕ 実体なし |
| `link_memories` | ○ 同名 | ✕ 実体なし（上記と同じグラフモデルの違い） |
| `create_episode` | ○ 同名 | ✕ デッドコード（`EpisodeManager`はimport・生成されるが呼び出し箇所なし） |
| `consolidate_memories` | ○ 同名 | ○ 同名（`n_layers`等パラメータ拡張あり） |
| `save_visual_memory` | ○ 同名 | △ `diary` に統合 |
| `recall_by_camera_position` | ○ 同名 | ✕ 実体なし |

**upstream本家は契約14ツール全て保有。Rem wave-expは同名一致4本・部分統合2本・実体なし8本**（うち1本はドキュメントと実装が食い違う要検証項目）。**設計判断8への重要な留保**: 「link_memories/get_causal_chain（記憶間リンク）」「create_episode（エピソード化）」は wave-exp の設計思想の外側にある機能——Remの動詞/名詞グラフモデルとwardrobeのMemory↔Memoryリンクモデルは別物。この2機能は wave-exp を参照できず、upstream本家またはwardrobe現行実装をそのまま踏襲するしかない。

**B. upstream本家にあるがwardrobe現行にないツール**
`delete_memory` / `update_memory` / `joint_attention` / `hypothesize` / `verify_hypothesis` / `get_metacognition`（メタ認知系。Postgres移植で契約に加えるか検討余地あり）

**C. Rem wave-expにあるがwardrobe現行にない独自ツール（輸入候補）**

| ツール | 用途 |
|---|---|
| `wave_recall` | 2パス波動伝播想起。specificity damping/echo/energy LTP/temporal sketch を内部で使う中核ツール |
| `crystallize` | 感覚バッファ→動詞チェーン変換の自動化（wardrobeの`save_verb_chain`は手動） |
| `update_diary` | 削除せず取り消し線+追記で記憶を訂正する非破壊UX。wardrobeに相当機能なし |
| `create_category` / `list_categories` | 動詞/名詞ノードのグラフカテゴリ管理 |
| `recall_experience` | `search_verb_chain`の発展版（time decay/emotion boost付き） |
| `rebuild_recall_index` | recall用の事前計算インデックス再構築 |

**D. 「diary系」の実体**: `diary`（remember+visual+audio+動詞チェーンの統合入口）・`update_diary`（非破壊訂正）・`diary-wave.py`フック（PostToolUseで波動位相グラフへ学習させる連携）。MCPツール2本＋hooks連携1本のセット。

**結論（Phase 1設計への申し送り）**: wave-exp は「想起・統合（consolidate）・波動系の内部アルゴリズム」の参照元として有効。ただし「記憶リンク・エピソード化・カメラ位置検索・working memory」はupstream本家またはwardrobe現行実装をベースにする必要がある——**設計判断8は「全面的にwave-exp」ではなく「機能ごとに参照元を選ぶハイブリッド」に訂正する**。
- **ここでリンのレビューを挟む**（互換性契約の改定は確定事項の変更なので）

### Phase 1: Postgres スキーマ + ストア層
- スキーマ設計: memories / embeddings(pgvector) / links / episodes / coactivation / flash_index
- PGroonga インデックス（content, tags）+ HNSW（embedding）
- SQLite → Postgres 移行スクリプト（既存記憶の全件移行、非破壊）
- ペルソナ分離: DB or スキーマ単位（keyword-buffer のペルソナ分離と同じ思想）

### Phase 2: memory-pg-daemon（Bun/TypeScript 常駐プロセス、設計判断9・10反映）
- 既存 memory-mcp のツール面を契約通りに再実装（Rem `wave-exp` のアルゴリズムを TS へ移植。設計判断8）
- Daemon 本体（Bun）+ 接続アダプタ（MCP stdio/HTTP・Skill 両対応）に分離実装
- 埋め込み計算の TS 側代替手段を確定（設計判断9の課題）
- 既存テストの移植 + 契約準拠テスト
- ローカルで Daemon 運用に切り替えて実戦検証

### Phase 3: Web 経路（スキル・ファースト、Daemon 共通化の可能性を検討）
- Supabase プロジェクト作成、PGroonga / pgvector 有効化（Phase 1 のスキーマをここに張る）
- `/wd-remote-memory` 系スキルの実装（curl → PostgREST / RPC。remember / recall / stats / flash_index）
- Edge Function: クエリ埋め込み（gte-small）と insert 時の自動埋め込み
- 秘密鍵の扱いを確定（Web セッションへの鍵の渡し方、RLS 設計）
- Claude Code Web で実接続テスト
- Phase 2 の Daemon を HTTP 経由で Web からも叩けるか検討（設計判断10）。不足が見えたらリモート MCP サーバー（方式 C）を追加

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

## 設計判断 8 — 実装ベースは機能ごとのハイブリッド参照（2026-07-14、リン方針 → 差分表調査で訂正）

**方針**: 「REM ベースのほうが筋がよい」＝コードベースの直接継承ではなく、**設計思想・アルゴリズムロジックの継承**。ただし Phase 0 差分表調査（上記）の結果、**「全面的に wave-exp」ではなく「機能ごとに参照元を選ぶハイブリッド」に訂正する。**

- **wave-exp を参照**: 想起（recall・recall_divergent）・consolidate・波動系内部アルゴリズム（specificity damping・echo reverb persistence・energy LTP・temporal sketch・bipartite wave recall。`wave_recall`ツールに集約）・diary統合パターン・非破壊訂正（update_diary）
- **upstream本家 or wardrobe現行を参照**（wave-expに実体なし）: 記憶間リンク（link_memories/get_causal_chain）・エピソード化（create_episode）・working memory（refresh_working_memory）・カメラ位置検索（recall_by_camera_position）。Remの動詞/名詞グラフモデルと wardrobe の Memory↔Memory リンクモデルは設計が別物のため、この4機能は wave-exp を土台にできない

**`main` ではなく `wave-exp` を参照する理由（波動系機能に限る。2026-07-14 調査で確定）**:
- `tmp/repos/embodied-claude-rem` はローカル・リモートとも `main` は最新（`origin/main` と差分ゼロ）
- ブランチ比較: `lite`（2026-03-07・main より16コミット遅れ、劣後版）／`main`（2026-04-14）／`wave-exp`（**2026-04-18・最新**、main を実質内包した上で独自24コミット）
- `wave-exp` の中身は Kuramoto 振動子・Graph Wavelet NN（論文2505.20034）を参照した実験的拡張で、`external-intake-2026-07.md` が既に取り込み候補として挙げていた「wave-exp 副産物」の実体そのものと確認できた
- README上は明示的に "experimental feature" 位置づけ。**安定性・採用範囲は Phase 1 のスキーマ設計時に個別評価する**（全部を輸入するのではなく、Postgres+PGroonga 化で不要になる部分〔自作 BM25・正規化など〕を除いて取捨選択）

参照パス: `tmp/repos/embodied-claude-rem`（`git checkout wave-exp` または `git log origin/main..origin/wave-exp` で差分参照。upstream本家は `tmp/repos/embodied-claude/memory-mcp`）

## 設計判断 9 — 実装言語は Bun/TypeScript + Vite（HotReload 優先、2026-07-14 リン方針）

現行 memory-mcp・Rem 実装は共に Python(uv)。本計画では **Bun/TypeScript + Vite ベースで書き直す**（Rem のアルゴリズムをそのまま流用せず移植）。

理由: HotReload のしやすさ。emotion-mcp（既に Bun/TypeScript で計画中）とのランタイム統一。

**移植時の課題（要検討・未確定）**:
- chiVe（gensim word2vec, 300次元）・multilingual-e5-base 埋め込み計算の TS 側代替手段（ONNX Runtime 等での推論、または埋め込み計算だけ Python/Edge Function に残す分離案も検討余地）
- numpy 依存の行列演算（異方的距離の主成分軸計算等）を TS でどう再現するか
- PGroonga 採用でテキスト検索・正規化の相当部分は DB 側に移るため、TS 側が担う計算量は「動詞チェーンのベクトル計算」「波動位相モデル系の状態更新」に絞られる見込み——後述の Daemon 化と合わせて Phase 1 のスキーマ設計時に負荷を見積もる

## 設計判断 10 — MCP ではなく常駐 Daemon 化、接続層は交換可能に（2026-07-14 リン方針）

memory-mcp を stdio MCP サーバーとしてではなく、**常駐 Daemon プロセス**として実装する。Claude Code 側との接続方式（Skill 経由 or MCP 経由）は Daemon 本体から分離し、後から選べる/両方使えるようにする。

- Daemon 本体: 記憶ストア・検索・consolidate 等のロジックを持つ常駐プロセス（HTTP or Unix ソケット等で待受）
- 接続アダプタ: Skill（curl 的な手順書）または MCP（stdio/HTTP どちらも）のどちらでも Daemon を叩けるようにする。Phase 3 の Web 経路（スキル・ファースト方針）とも自然に合流する構造
- ローカル・Web 両方から同じ Daemon を叩ける形にできれば、設計判断2で示した「ローカル stdio MCP／Web スキル+Edge Functions」の二重実装を避けられる可能性がある——**Phase 1–2 のアーキテクチャ設計で具体化する**

### wave_recall のメモリ展開方式 — 3択（2026-07-14、Pending）

Rem実装（`wave-exp`）の `wave_recall` は `lt_sentences`（長期記憶全文）を無条件で全件 SELECT → numpy 配列に展開してから物理シミュレーション計算する設計（コメント曰く「freshness decay が自然なフィルタ」）。SQLite・個人記憶量だから成立している前提で、Postgres移植・Daemon化ではこのままだとスケールの天井になる。検討した3方式:

1. **DB側で粗く絞ってから展開** — PGroonga全文検索/pgvector近傍検索で候補プールをN件に絞る一次フィルタをDB側に足し、その結果だけアプリメモリに展開してwave計算にかける（`_two_phase_recall`のPhase1がLT文をTop-Kに絞る仕組みと相性がいい）
2. **Daemonが全記憶を常時メモリに保持** — 起動時に一度だけ全ロードし、書き込みのたびに増分更新。wave_recallの「新鮮度の自然減衰で選別する」設計思想に最も忠実だが、記憶量が数十万行規模になると起動コスト・常駐メモリが問題になりうる
3. **オプトイン式の動的ロード/free（リン方針、2026-07-14）** — wave_recall を使うときだけ記憶をメモリに展開し、しばらく使われなければ解放する。常駐はするが全記憶を常に保持しない。1・2の中間——Daemon化とは相性がよく、記憶量が増えてもメモリ使用量を抑えられる

**現時点はPending**。具体的な展開/解放のトリガー（アイドル時間・LRU的な扱い等）とキャッシュ粒度（記憶単位か、頻出語彙のみか）は Phase 1–2 のアーキテクチャ設計で確定する。

## リンに確認したいこと（残り）

1. **秘密鍵の形**: A 案（能力トークン + Edge Function ゲート）でよいか。※Claude Code Web の Secret 対応有無は裏取り中——対応があればこの節ごと不要になる
2. ~~感情MCP実装との順序~~ → **2026-07-14 確定: メモリMCP改修を優先**
3. **Daemon 化の具体的な待受方式**: HTTP か Unix ソケットか（ローカル専用なら Unix ソケットが軽量だが、将来 Web 経路と共通化するなら HTTP に寄せる選択肢もある）— Phase 1–2 で検討
4. **`linked_ids`/`links` の統合方針**: 上記「`linked_ids`/`links` 統合調査」節の推奨案（単一 edge テーブルへの統合、`get_memory_chain` は独立ツールとして残さない）でよいか — Phase 1 のスキーマ確定前に

## 参照

- `.claude/addf/plans/memory-mcp-enhancements.md` — 既存の Memory-MCP 圏計画（本計画で互換性契約を改定）
- `.claude/addf/plans/external-intake-2026-07.md` — エンジン層の輸入候補（specificity damping / echo / energy LTP は Postgres 化後も有効）
- `.claude/addf/knowhow/wardrobe/speed-consciousness-framework.md` — 配置判断の基準
- upstream auto-recall HTTP 同居パターン: `tmp/repos/embodied-claude/memory-mcp/src/memory_mcp/server.py`
- Rem 波動位相モデル系拡張: `tmp/repos/embodied-claude-rem`（`wave-exp` ブランチ、2026-07-14時点で main+独自24コミット）
