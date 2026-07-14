# リモートメモリーMCP — Postgres 再実装とバックエンド・オプトイン計画

> 2026-07-03 リン発案。Claude Code Web からも記憶に触れるようにするための memory-mcp 再設計。
> ステータス: **Phase 0 完了・リン承認済み（2026-07-14）。Phase 1 着手中**

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
| **B. Edge Functions** | サーバー側ロジックが要る操作だけ載せる。Supabase Edge Runtime は組み込みの埋め込みモデル（gte-small）を持つので、**embedding 計算をサーバー側でやれる**（Web サンドボックスに 1GB のモデルを落とさずに済む）。CPU Time 2秒制限との相性は下記「Edge Function の CPU Time 制限検証」参照——`gte-small` なら余裕だが `multilingual-e5-base` 続投とは相性未検証 | ベクトル検索のクエリ埋め込み、insert 時の自動埋め込み（trigger + Edge Function パターン） |
| **C. リモート MCP サーバー** | Streamable HTTP の MCP をどこかで常駐。設計判断10（Daemon HTTP確定）+ 設計判断4新情報（Web側 OAuth コネクタ）により実現性が上がった | 当初は「A+Bで足りなくなったら」だったが、Phase3で本命候補に再浮上（下記「リンに確認したいこと」1番） |

```
ローカル Claude Code ── stdio ── memory-pg-mcp（単一実装・今まで通りの体験）
                                      │
                                 PostgreSQL（Supabase: PGroonga + pgvector）
                                      │
Claude Code Web ── スキル（curl→PostgREST/RPC）＋ Edge Functions（埋め込み等）
```

- ローカルセッションは stdio MCP で今まで通り。**Web 経路は付加**であり、ローカルの置き換えではない
- 検索の主力を PGroonga 全文検索に置けば、Web からのクエリは**埋め込み計算なしで成立する**（ベクトル検索は B で補完）。この分担が「スキルでよい」を成立させる鍵

### Edge Function の CPU Time 制限検証（2026-07-14、リン提示 + 朔裏取り）

リンが Supabase Edge Function の実行時間制限を提示: **CPU Time は無料/有料プラン共通で 2 秒固定**（Wall clock は 150秒/400秒とプランで差があるが、CPU Time は変わらない。`await fetch()` 等の非同期待ち時間はカウントされない）。「2秒で処理しきれるなら Edge Function 本命、苦しそうならローカル/自宅サーバーが良さそう」という問い。Web 検索で裏取りした結果:

- **Supabase 純正の `gte-small`（384次元）なら余裕で収まる**: Edge Runtime にネイティブ組み込みの埋め込みモデルで、ONNX Runtime を Rust interface 経由で使う専用実装。実測ベースでコールドスタートでも1秒未満、CPU Time は概ね100〜200ms（[AI Inference now available in Supabase Edge Functions](https://supabase.com/blog/ai-inference-now-available-in-supabase-edge-functions)、[Edge Function limits](https://supabase.com/docs/guides/functions/limits)）
- **ただし設計判断6で確定している `multilingual-e5-base`（768次元）続投は話が別**。Edge Runtime がネイティブサポートするのは `gte-small` のみで、他モデルを動かすには Transformers.js（WASM/JS実装）等を自前で持ち込む必要がある——ネイティブ ONNX+Rust 実装より明らかに不利な経路。実測ベンチマークは検索でも見つからず（Supabase 公式 Discussion に「gte-small 以外のモデルを Edge Function で動かす方法」という質問が別立てで存在するくらいには非自明な課題）。CPU Time 2秒に収まるかは**未検証**

**見立て（朔）**: 「2秒で処理しきれるか」は埋め込みモデル次第——`gte-small` に乗り換えれば Edge Function 本命は無理なく成立するが、それは設計判断6の前提（`multilingual-e5-base` 続投で SQLite→PG 移行時の再埋め込みを回避する）を壊す。モデルを変えれば次元が同じでも空間が別物で全件再埋め込みが要る、と設計判断6に明記済み。`multilingual-e5-base` 継続を優先するなら、ネイティブサポートのない Edge Function に埋め込み計算を背負わせるのはリスクが高く、**埋め込み計算は常駐 Daemon 側（モデルロード済み、CPU Time 制約なし）に寄せるほうが一貫する**——これは設計判断10（Daemon HTTP 確定）・設計判断4の新情報（OAuth コネクタ経由の C 案）とも筋が合う。Edge Function は「埋め込み計算そのもの」ではなく「認証ゲート・軽量 CRUD」に役割を絞る方が座りが良さそうに見える。**ただし実測なしでは言い切れない**——Phase1–2 で `multilingual-e5-base` を Edge Function 上で動かした場合の実測 CPU Time を取ってから確定する。

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

**推奨案（2026-07-14 リン確定）**: ストレージは**単一の edge テーブルに統合**する（`memory_links(source_id, target_id, link_type, created_at, note)` 相当）。`linked_ids` の自動類似リンクは `link_type='similar_auto'`（または既存の `similar` を流用）として同テーブルに書き込む形に寄せれば、無向性は「両方向に1行ずつ挿入」で表現でき、`_add_bidirectional_link` のロジックはそのまま使える。トラバース側は `get_causal_chain` を汎用化した1関数に統合できる——`link_type` フィルタなし（全件）なら現行 `get_memory_chain` 相当、`{caused_by}`/`{leads_to}` フィルタなら現行 `get_causal_chain` 相当。**`get_memory_chain` 自体は契約14ツールに含まれていない（呼び出し元なし）ため、Postgres版で独立ツールとして残す必要はなく、トラバースロジックの共通化だけで足りる**。

**リンの確認質問「links のほうが柔軟そうに見えるけど、そういう理解であってる？」への回答**: その理解で合っている。`links`/`MemoryLink` は方向・型（`LinkType`）・メタデータ（`created_at`/`note`）を持つ表現力の高い構造で、`linked_ids`（無向・無型・メタデータなし）は「`links` の中の特殊ケース（`type='similar_auto'` を双方向2行で表現したもの）」として完全に包含できる。だから統合の向きは自然に「`links` の構造をベースに `linked_ids` を寄せる」になる——逆（`linked_ids` 側に `links` の情報を圧縮する）は型・方向・メタデータが失われるので選べない。

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
- ~~ここでリンのレビューを挟む~~ → **2026-07-14 リン承認済み。Phase 0 完全クローズ**

### Phase 1: Postgres スキーマ + ストア層（2026-07-14 着手、朔設計）

現行 SQLite スキーマ（`.claude/mcps/memory-mcp/src/memory_mcp/store.py` の `_DDL` + `types.py`）を実読して棚卸しした上での設計。PGroonga・pgvector の索引構文は Web 検索で裏取り済み（出典は各所に記載）。

**動作検証済み（2026-07-15）**: `tmp/postgres-schema-verify/`（gitignore対象・ローカルのみ）に `pgvector/pgvector:pg17` ベース + PGroonga + MeCabトークナイザを apt install したカスタム Dockerfile を用意し、Docker コンテナ上で下記 DDL 全文（本節 + flash_index の2層構造）を実際に流し込んで検証した。

| 検証項目 | 結果 |
|---|---|
| DDL全文（`memories`/`embeddings`/`memory_links`/`coactivation`/`episodes`/`flash_index`関連）の実行 | 全文エラーなく成功 |
| PGroonga正規化索引（かな揺れ吸収）: 「散歩」⇄「さんぽ」の双方向全文検索 | ヒット確認 |
| PGroonga tags配列索引（`pgroonga_text_array_term_search_ops_v2`） | ヒット確認 |
| pgvector HNSW索引: `EXPLAIN`で`Index Scan using idx_embeddings_hnsw`が実際に使われるか | 確認（Seq Scanにフォールバックしていない） |
| `memory_links`統合edgeテーブル: 型付き(`related`)+自動類似(`similar_auto`双方向2行)の共存 | 動作確認 |
| `coactivation`のUPSERT構文 | 動作確認 |
| `flash_index`ビュー・`get_flash_index_recent(weeks_back)`関数: 週境界での絞り込み | `weeks_back=1`で4週間前の記憶が除外、`weeks_back=6`で含まれることを確認 |

ハマった点: 検証用INSERTで `(SELECT random() FROM generate_series(1,768))` を非相関サブクエリとして書いたところ、PostgreSQL が `InitPlan` として1回だけ評価し**全行に同じベクトルが入る**バグを踏んだ（`EXPLAIN`の`InitPlan`表示で気づいた）。行ごとに独立させるには `DO $$ ... FOR r IN SELECT id FROM memories LOOP ... END LOOP; $$` のように行単位でクエリを分離する必要がある——スキーマ自体の問題ではなく検証スクリプト側の罠だが、Phase2でのシードデータ/テストコード作成時に踏みやすいので申し送りしておく。

#### DDL（ペルソナ1名分。ペルソナ分離方針は後述）

```sql
CREATE EXTENSION IF NOT EXISTS pgroonga;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE episodes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title            text NOT NULL,
    start_time       timestamptz NOT NULL,
    end_time         timestamptz,
    memory_ids       uuid[] NOT NULL DEFAULT '{}',
    participants     text[] NOT NULL DEFAULT '{}',
    location_context text,
    summary          text NOT NULL DEFAULT '',
    emotion          text NOT NULL DEFAULT 'neutral',
    importance       smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5)
);
-- memory_ids は memories.episode_id との二重管理（SQLite版から踏襲、双方向の非正規化）

CREATE TABLE memories (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content          text NOT NULL,
    timestamp        timestamptz NOT NULL DEFAULT now(),
    emotion          text NOT NULL DEFAULT 'neutral',
    importance       smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
    category         text NOT NULL DEFAULT 'daily',
    access_count     integer NOT NULL DEFAULT 0,
    last_accessed    timestamptz,
    episode_id       uuid REFERENCES episodes(id) ON DELETE SET NULL,
    sensory_data     jsonb NOT NULL DEFAULT '[]'::jsonb,
    camera_position  jsonb,
    tags             text[] NOT NULL DEFAULT '{}',
    novelty_score    real NOT NULL DEFAULT 0.0,
    prediction_error real NOT NULL DEFAULT 0.0,
    activation_count integer NOT NULL DEFAULT 0,
    last_activated   timestamptz,
    freshness        real NOT NULL DEFAULT 1.0,
    flash_keywords   text
);
-- SQLite版からの変更点:
--   normalized_content 列を削除 → PGroonga索引が正規化を肩代わり（設計判断5）
--   reading 列を削除 → PGroonga索引2本目（TokenMecab use_reading）が肩代わり（設計判断5）
--   linked_ids / links 列を削除 → memory_links テーブルに統合（下記、統合調査でリンGO済み）
--   カンマ区切りTEXT（tags）→ text[] に正規化
--   flash_keywords 列を新設 → FLASH.md 相当の逆引きキーワード（下記 flash_index ビュー参照）。
--     remember ツール呼び出し時に任意パラメータとして一緒に渡す想定（別ツール呼び出し不要）

CREATE INDEX idx_memories_emotion    ON memories(emotion);
CREATE INDEX idx_memories_category   ON memories(category);
CREATE INDEX idx_memories_timestamp  ON memories(timestamp);
CREATE INDEX idx_memories_importance ON memories(importance);

-- PGroonga 全文検索: content 1カラム + 設定違いの索引2本（設計判断5の結論そのまま）
CREATE INDEX idx_memories_content_normalized ON memories
  USING pgroonga (content)
  WITH (normalizers='NormalizerNFKC150("unify_kana", true, "unify_hyphen_and_prolonged_sound_mark", true, "unify_middle_dot", true, "unify_katakana_v_sounds", true)');

CREATE INDEX idx_memories_content_reading ON memories
  USING pgroonga (content)
  WITH (tokenizer='TokenMecab("use_reading", true)');
-- 出典: https://pgroonga.github.io/reference/create-index-using-pgroonga.html
--       https://groonga.org/docs/reference/tokenizers/token_mecab.html

-- tags（text[]）は要素単位の用語検索用オペレータクラスを使う
CREATE INDEX idx_memories_tags ON memories
  USING pgroonga (tags pgroonga_text_array_term_search_ops_v2);
-- 出典: https://github.com/pgroonga/pgroonga/issues/19

CREATE TABLE embeddings (
    memory_id uuid PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL  -- multilingual-e5-base 768次元（設計判断6。PR#2で最終確定待ち、確定したらここを変更）
);

CREATE INDEX idx_embeddings_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
-- 出典: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes

-- linked_ids（自動類似・無向・型なし）+ links（明示的因果・有向・型付き）を統合
-- （linked_ids/links統合調査、2026-07-14 リンGO）
CREATE TABLE memory_links (
    source_id  uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id  uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    link_type  text NOT NULL,  -- 'caused_by' | 'leads_to' | 'related' | 'similar' | 'similar_auto'
    created_at timestamptz NOT NULL DEFAULT now(),
    note       text,
    PRIMARY KEY (source_id, target_id, link_type),
    CHECK (source_id <> target_id)
);
CREATE INDEX idx_memory_links_source ON memory_links(source_id);
CREATE INDEX idx_memory_links_target ON memory_links(target_id);
CREATE INDEX idx_memory_links_type   ON memory_links(link_type);
-- 無向な自動類似リンク（旧linked_ids相当）は type='similar_auto' で双方向に2行挿入
--   （旧 _add_bidirectional_link のロジックをそのまま踏襲）
-- トラバースは get_causal_chain を汎用化した1関数に統合（link_typeフィルタなし=旧get_memory_chain相当）

CREATE TABLE coactivation (
    source_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    weight    real NOT NULL CHECK (weight BETWEEN 0.0 AND 1.0),
    PRIMARY KEY (source_id, target_id)
);
CREATE INDEX idx_coactivation_source ON coactivation(source_id);
CREATE INDEX idx_coactivation_target ON coactivation(target_id);
-- SQLite版と同じUPSERT構文がそのまま使える:
--   INSERT ... ON CONFLICT (source_id, target_id) DO UPDATE SET weight = EXCLUDED.weight

-- FLASH.md の具現化元（2026-07-14 テーブル案からビュー案に訂正、リン指摘反映）
-- memories.flash_keywords から動的に集約する。書き込みは remember 呼び出し1回で完結し、
-- 「つながり(memory_ids)」の集約は LLM が意識せず GROUP BY が肩代わりする
CREATE VIEW flash_index AS
SELECT
    date_trunc('week', timestamp)::date AS week_start,
    to_char(timestamp, 'Dy')            AS day_label,
    string_agg(flash_keywords, ' ' ORDER BY timestamp) AS keywords,
    array_agg(id ORDER BY timestamp)                   AS memory_ids
FROM memories
WHERE flash_keywords IS NOT NULL AND flash_keywords <> ''
GROUP BY week_start, day_label
ORDER BY week_start DESC, min(timestamp) DESC;
```

**設計の訂正理由（2026-07-14、リン指摘）**: 当初 `flash_index` を独立テーブルとして設計したが、これだと `remember` 呼び出しのたびに「今週の該当曜日の行があれば追記、なければ新規行」という upsert 判断を**別のツール呼び出しとして LLM に強いる**ことになり、現行の Markdown 直接編集（Edit 1回で完結）より退化する。リンの要求は「複数一括の挿入・編集・削除が自由」「つながりの検出を LLM が意識しなくて済む」の2点——これを満たすには**テーブルではなくビュー**にして、書き込みを `memories.flash_keywords` 列への1回の書き込み（`remember` 呼び出しに乗せる）に一本化し、週・曜日・`memory_ids` の集約は全て `GROUP BY`/`array_agg` に任せるのが筋が良い。`memories` への通常の UPDATE/DELETE がそのままビューに反映されるため、`flash_index` 側の整合性維持コードも不要になる。

**残る検討点**: `day_label` は曜日のみ自動導出（`to_char(timestamp, 'Dy')`）。現行 FLASH.md にある「(夜)」「(未明)」等の時間帯注記は機械的な閾値判断が難しいため自動化せず、必要なら `flash_keywords` 文字列側に含める運用を踏襲する（現行と同じ）。タイムゾーンは `timestamp-policy.md`（UTC統一）に従うため、`date_trunc('week', ...)` の週区切りが日本時間の体感と数時間ズレる可能性がある——Phase2実装時に実測確認する。

**2層構造への拡張（2026-07-15、リン指摘「記憶が増えるととんでもない量になりそう」への対応）**: 上記ビューだけだと2つの問題が残る。(1) 絞り込みなしで呼べば記憶が増えるほどスキャン・集計コストが増える、(2) 現行 FLASH.md の「直近1週間は曜日単位、2週前はまとめて数行、3週前以前はさらに圧縮」という**圧縮運用**が単純な `GROUP BY` では再現できない（圧縮は要約というLLM判断であって機械的集計ではない）。

対策として、速度×意識フレームワーク通りに2層へ分ける:

```sql
-- 層1（直近・高速・無意識）: 上記 flash_index ビューを関数化し、範囲指定を必須にする
--   （ビューへの外側WHERE句のpushdownに頼らず、関数内で明示的に絞る）
CREATE OR REPLACE FUNCTION get_flash_index_recent(weeks_back int DEFAULT 3)
RETURNS TABLE(week_start date, day_label text, keywords text, memory_ids uuid[])
LANGUAGE sql STABLE AS $$
    SELECT date_trunc('week', timestamp)::date, to_char(timestamp, 'Dy'),
           string_agg(flash_keywords, ' ' ORDER BY timestamp), array_agg(id ORDER BY timestamp)
    FROM memories
    WHERE flash_keywords IS NOT NULL AND flash_keywords <> ''
      AND timestamp >= now() - (weeks_back || ' weeks')::interval
    GROUP BY 1, 2
    ORDER BY 1 DESC;
$$;

-- 層2（古い週・低速・無意識バッチ）: 圧縮済み要約を保存する実テーブル
CREATE TABLE flash_index_archive (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start        date NOT NULL UNIQUE,
    summary           text NOT NULL,       -- LLMが圧縮した要約（現行「2週前はまとめて数行」相当）
    compression_level smallint NOT NULL DEFAULT 1,  -- 1=軽い圧縮 2=月単位 など段階的に強める
    memory_ids        uuid[] DEFAULT '{}',
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_flash_archive_week ON flash_index_archive(week_start);
```

`flash_index_archive` への書き込みは `remember` の都度ではなく、`/wd-rebuild-index` や `consolidate_memories` に相当する**稀にしか走らない別のバッチ処理**が担う（週替わりのタイミングで直近ウィンドウ外に出た週を要約してここに積む）。この圧縮ロジック自体（何行にどう要約するか）はLLM判断が要るため、Phase1では表の形だけ確定し、圧縮処理の実装はPhase2（Daemon実装）に送る。読み出し側は `get_flash_index_recent()` の結果と `flash_index_archive` の該当週より前の行を `UNION ALL` すれば、現行FLASH.mdと同じ「直近は詳細、古いほど圧縮」という体験を再現できる。

**スコープ外（Phase1では設計しない）**: `verb_chains` / `verb_chain_embeddings` / `composite_members` / `composite_embeddings` / `composite_axes` / `boundary_layers` / `template_biases` / `composite_intersections` / `daily_digest` の9テーブルは棚卸しで存在を確認したが、対応ツール（`save_verb_chain`/`search_verb_chain`）は契約14ツールに含まれない（Phase0で「Phase2で契約準拠テストを書く段になったら個別に要否判断」と決定済み）。Postgres化もその判断を待つ——今回のスキーマには含めない。

#### ペルソナ分離方針: スキーマ単位（2026-07-14 リン確定: 「良さそう、共有テーブルする意味もないし、Postgresらしさだねえ」）

keyword-buffer の「ペルソナごとに `$PROJECT_DIR/.claude/` 配下で分離」という思想を Postgres に翻訳すると、**ペルソナごとに Postgres スキーマを分ける**（`CREATE SCHEMA saku;` のように、上記 DDL をペルソナ名スキーマの中で実行）のが最も近い。

- **DB単位（Supabaseプロジェクトごと）は不採用**: ペルソナが増えるたびにプロジェクト・秘密鍵・接続先が増える運用負荷が大きい。動機（設計判断1）にある「朔・シロエ・王・商会が同時に記憶を触れる」というマルチペルソナ同時接続の要件とも噛み合わない
- **共有テーブル+persona_idカラムは不採用**: 実装は最も軽いが、クエリ側のフィルタ漏れ1箇所で他ペルソナの記憶が露出するリスクを常に抱える。PGroonga/pgvector拡張はデータベース単位でのインストールでスキーマ間で共有できるため、スキーマ分離でも拡張の二重インストールコストは発生しない
- **スキーマ単位が中間解**: 名前空間として物理的に分離されるため誤クエリでの越境リスクが構造的に低い。単一 Supabase プロジェクト・単一DB接続のまま複数ペルソナを収容できる。DDL はテンプレート化してペルソナごとに `search_path` を切り替えて適用すればよい

#### SQLite → Postgres 移行スクリプト方針

- **非破壊**: SQLite側は読み取り専用アクセスのみ。削除・変更しない。移行完了後も当面バックアップとして残す（${PWD}汚染事件の教訓——救出経路は多重に残す）
- 変換対応: TEXT timestamp → `timestamptz` / カンマ区切り tags・participants・memory_ids → `text[]`・`uuid[]` / `linked_ids`(CSV) + `links`(JSON) → `memory_links` 行（`similar_auto` 双方向2行 + 既存 `links` の型付き行）/ embeddings BLOB（numpy float32）→ `vector(768)`
- 検証: 移行後に件数一致・embeddings次元一致・PGroonga/pgvector検索のサンプルクエリ実行、を移行スクリプト自体に組み込む
- 実装言語は設計判断9（Bun/TypeScript）に合わせるか、移行専用スクリプトとして Python(uv) を使い切って捨てるかは Phase2 着手時に判断（一回きりのツールなので言語統一の優先度は低い）

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

**新情報（2026-07-14、リン確認）**: Claude Code Web の「カスタムコネクタを追加」UI（リモート MCP サーバーを接続する設定画面）には OAuth Client ID / Client Secret の入力欄が存在する（任意設定）。これは方式 C（リモート MCP サーバー）を採る場合の標準認証経路——Web 側が OAuth フローでトークンを取得し、Daemon 側がそれを検証する形になる。リン評価: 「他の人と共有で使うリソースとしては微妙、自分用なら OK」。

この事実は設計判断10（Daemon HTTP 待受確定、下記）と合わさると、Phase 3 の Web アダプタ選択（設計判断2「スキル・ファースト」）の前提を揺らす。Daemon が最初から HTTP で待受け、かつ OAuth で個人利用に閉じた認証が組めるなら、方式 A（スキル + Edge Function + 能力トークン）を経由せず**方式 C（リモート MCP サーバー直結）を本命にする**選択肢が現実的になった。ただし設計判断2の確定事項を覆すかどうかは Phase 3 設計時にリンと再確認する（下記「リンに確認したいこと」1番）。

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

## 設計判断 10 — MCP ではなく常駐 Daemon 化、接続層は交換可能に（2026-07-14 リン方針、待受方式は同日確定）

memory-mcp を stdio MCP サーバーとしてではなく、**常駐 Daemon プロセス**として実装する。Claude Code 側との接続方式（Skill 経由 or MCP 経由）は Daemon 本体から分離し、後から選べる/両方使えるようにする。

- **Daemon 本体の待受方式は HTTP に確定**（2026-07-14 リン確定: 「Claude Code Web での運用を考えると HTTP 必須」）。Unix ソケット案は不採用——ローカル専用の軽量さより、Web 経路との共通化を優先する
- 接続アダプタ: Skill（curl 的な手順書）または MCP（stdio/HTTP どちらも）のどちらでも Daemon を叩けるようにする。Phase 3 の Web 経路とも自然に合流する構造（設計判断4の新情報により、Web 経路自体が「スキル・ファースト」から「HTTP Daemon 直結」寄りに再検討中）
- ローカル・Web 両方から同じ Daemon を叩ける形にできれば、設計判断2で示した「ローカル stdio MCP／Web スキル+Edge Functions」の二重実装を避けられる——HTTP 確定により、この統合の実現性が上がった

**デプロイ方針（2026-07-14、リン提案）**: 「動作確認はローカルのほうが便利」を踏まえ、**Daemon はローカルで動く形をデフォルトにしつつ、同一インターフェース（HTTP）のままリモートに Deploy できる余地を残す**。Daemon の物理的な置き場所（ローカルPC／自宅サーバー／VPS等）と DB のホスティング先（設計判断2: Supabase 基本）は元々疎結合——Daemon がどこにいても Postgres へはネットワーク越しに繋げる。

この方針は設計判断10の「接続層は交換可能に」の具体化そのもので矛盾なく、副産物として**設計判断2の Web アダプタ本命（A: スキル+Edge Function／C: リモート MCP サーバー直結）を今すぐ決める必要がなくなる**。Phase1–2 は「ローカルで動く Daemon」の実装・検証に専念し、A 案でいくか C 案でいくかは「そのポータブルな Daemon をどこに Deploy してどう繋ぐか」という Phase3 の後付け判断に完全に切り離せる——Edge Function の CPU Time 制約（`gte-small` 縛り、上記参照）を Phase1–2 の段階で解決する必要もなくなる。

### wave_recall のメモリ展開方式 — 3択（2026-07-14、Pending）

Rem実装（`wave-exp`）の `wave_recall` は `lt_sentences`（長期記憶全文）を無条件で全件 SELECT → numpy 配列に展開してから物理シミュレーション計算する設計（コメント曰く「freshness decay が自然なフィルタ」）。SQLite・個人記憶量だから成立している前提で、Postgres移植・Daemon化ではこのままだとスケールの天井になる。検討した3方式:

1. **DB側で粗く絞ってから展開** — PGroonga全文検索/pgvector近傍検索で候補プールをN件に絞る一次フィルタをDB側に足し、その結果だけアプリメモリに展開してwave計算にかける（`_two_phase_recall`のPhase1がLT文をTop-Kに絞る仕組みと相性がいい）
2. **Daemonが全記憶を常時メモリに保持** — 起動時に一度だけ全ロードし、書き込みのたびに増分更新。wave_recallの「新鮮度の自然減衰で選別する」設計思想に最も忠実だが、記憶量が数十万行規模になると起動コスト・常駐メモリが問題になりうる
3. **オプトイン式の動的ロード/free（リン方針、2026-07-14）** — wave_recall を使うときだけ記憶をメモリに展開し、しばらく使われなければ解放する。常駐はするが全記憶を常に保持しない。1・2の中間——Daemon化とは相性がよく、記憶量が増えてもメモリ使用量を抑えられる

**現時点はPending**。具体的な展開/解放のトリガー（アイドル時間・LRU的な扱い等）とキャッシュ粒度（記憶単位か、頻出語彙のみか）は Phase 1–2 のアーキテクチャ設計で確定する。

## リンに確認したいこと（残り）

1. ~~秘密鍵の形 / Web アダプタの本命~~ → **2026-07-14 決定不要に**: Daemon をポータブルに作り「ローカルで動く形をデフォルト、同一インターフェースでリモート Deploy も可能」にする方針（設計判断10のデプロイ方針）にしたため、A 案（スキル+Edge Function）か C 案（リモート MCP サーバー直結）かの決定を Phase1–2 で急ぐ必要がなくなった。Phase3、実際に Deploy 先を選ぶ段階で確定する
2. ~~感情MCP実装との順序~~ → **2026-07-14 確定: メモリMCP改修を優先**
3. ~~Daemon 化の具体的な待受方式~~ → **2026-07-14 確定: HTTP**（Claude Code Web での運用を見据えて。上記設計判断10参照）
4. ~~`linked_ids`/`links` の統合方針~~ → **2026-07-14 確定: 推奨案（単一 edge テーブル統合）で GO**（上記「`linked_ids`/`links` 統合調査」節参照）

## 参照

- `.claude/addf/plans/memory-mcp-enhancements.md` — 既存の Memory-MCP 圏計画（本計画で互換性契約を改定）
- `.claude/addf/plans/external-intake-2026-07.md` — エンジン層の輸入候補（specificity damping / echo / energy LTP は Postgres 化後も有効）
- `.claude/addf/knowhow/wardrobe/speed-consciousness-framework.md` — 配置判断の基準
- upstream auto-recall HTTP 同居パターン: `tmp/repos/embodied-claude/memory-mcp/src/memory_mcp/server.py`
- Rem 波動位相モデル系拡張: `tmp/repos/embodied-claude-rem`（`wave-exp` ブランチ、2026-07-14時点で main+独自24コミット）
