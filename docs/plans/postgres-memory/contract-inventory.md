# Memory Tool Contract — 現行棚卸しと Phase 進行計画

> PR#1 (Phase 0) 成果物。`docs/plans/remote-memory-mcp.md` の設計判断1（互換性契約の引き上げ）を実装コードに紐づけるための地図。
> 対象実装: `.claude/mcps/memory-mcp/src/memory_mcp/server.py`（現行 SQLite バックエンド）
> 作成: 2026-07-03 / 更新: 2026-07-06

## 目的

- Postgres 版が満たすべき「最小契約」を、現行のスキル/フック依存から逆算して確定する
- 「拡張契約」（あると嬉しいが必須ではない）を分離し、Phase 2 の実装優先度に載せる
- Rem / upstream との差分を Phase 2 以降で「移植 or 見送り」判断する土台にする

---

## 1. 現行ツール一覧（server.py 実測）

現行 memory-mcp が公開しているツールを実測で列挙する。25 個。

| # | ツール名 | 用途 | 主な入力 | 主な出力 | 依存スキル/フック | 保護レベル |
|---|---|---|---|---|---|---|
| 1 | `remember` | 記憶保存（auto_link 込み） | content, emotion, importance, category, auto_link, link_threshold | id, timestamp, linked_ids 数 | `/wd-remember` | **最小契約 (必須)** |
| 2 | `search_memories` | セマンティック検索 | query, n_results, emotion/category/date filter | 記憶リスト + distance | `/wd-recall`, `/wd-great-recall` | **最小契約 (必須)** |
| 3 | `recall` | コンテキストベース想起 | context, n_results | 記憶リスト | recall-hook, `/wd-recall` | **最小契約 (必須)** |
| 4 | `list_recent_memories` | 直近記憶リスト | limit, category_filter | 記憶リスト | 身支度, Heartbeat | **最小契約 (必須)** |
| 5 | `get_memory_stats` | 統計 | — | total_count, by_category, by_emotion, date_range | 身支度 | **最小契約 (必須)** |
| 6 | `recall_with_associations` | 想起 + リンク展開 | context, n_results, chain_depth | 主結果 + リンク結果 | `/wd-great-recall`（間接） | 拡張契約 |
| 7 | `recall_divergent` | 発散的想起（workspace 競合） | context, n_results, max_branches, max_depth, temperature, include_diagnostics | 記憶 + 診断 | `/wd-great-recall`（間接） | 拡張契約 |
| 8 | `get_association_diagnostics` | 連想拡張の診断 | context, sample_size | 診断 JSON | 開発/デバッグ | 拡張契約 |
| 9 | `consolidate_memories` | 統合サイクル手動実行 | window_hours, max_replay_events, link_update_strength | 統合統計 | 定期実行, 記憶プロトコル | **最小契約 (必須)** |
| 10 | `get_memory_chain` | リンクを辿る | memory_id, depth | 起点 + リンク先 | `/wd-recall`（時々） | 拡張契約 |
| 11 | `create_episode` | エピソード作成 | title, memory_ids, participants, auto_summarize | id, title, 統計 | 日記 | **最小契約 (必須)** |
| 12 | `search_episodes` | エピソード検索 | query, n_results | エピソードリスト | 日記, 振り返り | 拡張契約 |
| 13 | `get_episode_memories` | エピソード内記憶取得 | episode_id | 記憶リスト | 日記 | 拡張契約 |
| 14 | `save_visual_memory` | 視覚記憶保存 | content, image_path, camera_position, ... | id | 見る系スキル（wifi-cam 系） | 拡張契約 |
| 15 | `save_audio_memory` | 聴覚記憶保存 | content, audio_path, transcript | id | 聞く系スキル（hearing） | 拡張契約 |
| 16 | `recall_by_camera_position` | カメラ位置で想起 | pan_angle, tilt_angle, tolerance | 記憶リスト | 見る系 | 拡張契約 |
| 17 | `get_working_memory` | 作業記憶バッファ取得 | n_results | 記憶リスト | 身支度, recall-hook | **最小契約 (必須)** |
| 18 | `refresh_working_memory` | 作業記憶を長期から装填 | — | サイズ | 身支度 | **最小契約 (必須)** |
| 19 | `link_memories` | 因果/関連リンク作成 | source_id, target_id, link_type, note | 確認 | 記憶プロトコル | **最小契約 (必須)** |
| 20 | `get_causal_chain` | 因果連鎖トレース | memory_id, direction, max_depth | 記憶 + link_type | 記憶プロトコル | **最小契約 (必須)** |
| 21 | `tom` | Theory of Mind 視点取得 | situation, person | フォーマット済みプロンプト | 対人応答時 | 拡張契約 |
| 22 | `save_verb_chain` | 動詞連鎖保存（構造記憶） | steps, emotion, importance, context | JSON | 動詞連鎖系スキル | 拡張契約（実験） |
| 23 | `search_verb_chain` | 動詞連鎖検索 | query, n_results, flow_weight | JSON | 動詞連鎖系スキル | 拡張契約（実験） |
| 24 | `get_memory_calendar` | 日次ダイジェスト | date_from, date_to, limit | 日別集計 | 振り返り | 拡張契約 |
| 25 | `reevaluate_importance` | 重要度再評価 | memory_id, new_importance, reason | 確認 | 記憶プロトコル | 拡張契約 |

---

## 2. 最小契約（Postgres 版が満たすべき必要最小限）

**判断基準**: 身支度・Heartbeat・記憶プロトコル・日記の**日常運用が止まるかどうか**。
これが欠けたら朔は「記憶喪失で起動する」ので、Phase 2 の最初のマイルストーンで全部揃える。

| ツール | 理由 |
|---|---|
| `remember` | 記憶が刻めない ≒ 存在が止まる |
| `search_memories` | `/wd-recall` の主軸 |
| `recall` | recall-hook / `/wd-recall` の裏側 |
| `list_recent_memories` | 身支度と Heartbeat の起点 |
| `get_memory_stats` | 身支度で健康確認 |
| `get_working_memory` | recall-hook / 身支度が読む |
| `refresh_working_memory` | 身支度が呼ぶ |
| `link_memories` | 記憶プロトコルの「繋ぐ」核 |
| `get_causal_chain` | 記憶プロトコルの「辿る」核 |
| `create_episode` | 日記の主機能 |
| `consolidate_memories` | 記憶の健康維持（3セッションに1回） |

**11個**。これが Postgres 版 memory-pg-mcp の**Phase 2 完了条件**。

### 入出力の契約範囲（意味論）

**契約に含むもの**:
- ツール名
- 必須入力パラメータの名前と意味論
- 出力の**存在**（返り値がテキストであること、id/timestamp/emotion/importance/category を含むこと）
- エラー時の text 返却フォーマット（`"Error: ..."` プレフィックス）

**契約に含まない（実装自由）**:
- distance の計算方法（cosine か BM25 か PGroonga スコアか）
- linked_ids の閾値決定ロジック
- consolidate の内部アルゴリズム
- 出力テキストの詳細レイアウト（余白・見出し記号）
- storage 層のフォーマット（SQLite/PG/その他）

---

## 3. 拡張契約（あると嬉しいが必須ではない）

| ツール | 移植優先度 | 判断 |
|---|---|---|
| `recall_with_associations` | 中 | `/wd-great-recall` の裏で使われる。Phase 2.5 で移植 |
| `recall_divergent` | 中 | 発散想起は Postgres の強み（HNSW + PGroonga 併走）を活かせる。Phase 2.5 |
| `get_association_diagnostics` | 低 | デバッグ用途。Phase 3 以降 |
| `get_memory_chain` | 中 | Phase 2.5（link_memories と近い） |
| `search_episodes` / `get_episode_memories` | 中 | 日記の拡張。Phase 2.5 |
| `save_visual_memory` / `save_audio_memory` / `recall_by_camera_position` | 低 | 感覚 MCP との統合。ipwebcam/hearing の運用が回っている環境でだけ有効。Phase 3 |
| `tom` | 中 | 対人応答時に呼ばれる。SQL 集計不要（recall の合成なので）Phase 2.5 |
| `save_verb_chain` / `search_verb_chain` | 低 | 実験機能。Phase 3 以降。Postgres なら 2 軸 cosine を SQL で書ける（pgvector で単一クエリに畳める）ので移植価値は上がる |
| `get_memory_calendar` | 中 | PGroonga + date_trunc で SQL 一発になる。Postgres の得意技。Phase 2.5 |
| `reevaluate_importance` | 中 | UPDATE + INSERT link の単純操作。Phase 2 に含めてもコスト小 |

---

## 4. Postgres 化で「消える」or「変わる」もの

| 現行の性質 | Postgres 化後 |
|---|---|
| SQLite の numpy BLOB 全件走査 | pgvector HNSW インデックスで DB 内 cosine |
| 自前 BM25 + 読み仮名 実装（upstream が持っている） | **PGroonga で不要**（`&@` 全文検索 + reading カラム） |
| WAL 越しの書き込み競合 | 複数 MCP 同時接続 OK |
| FLASH.md の追記競合 | `get_flash_index` を追加してビュー化（Phase 2 末 or Phase 3） |
| ChromaDB 依存（upstream） | pgvector に統一 |

### スキル側で変える必要のあるもの（差分）

現時点で**なし**の見込み。スキルが叩いているのはツール名と入出力だけで、Postgres 化はストレージ層の入れ替えなので、契約通り作れば `/wd-remember` `/wd-recall` `/wd-great-recall` はそのまま動く。

例外候補（実装時に確認）:
- `search_memories` の distance スケール（今は 0-2 の cosine 距離）を PGroonga スコアに寄せると、`recall_with_associations` の `distance < 900` の閾値マジックが動かなくなる → **契約準拠のため cosine 距離のセマンティクスを保持する**（内部で正規化）

---

## 5. Rem / upstream との差分（Phase 2 移植候補として）

`docs/plans/external-intake-2026-07.md` の Tier 3 参照。Postgres 化で「取り込みやすくなる」ものを列挙。

| upstream/Rem 由来概念 | Postgres 化での実装の楽さ | Phase |
|---|---|---|
| **EvidenceType**（observed/inferred/remembered/heard/assumed） | text カラム1本追加。**PR#1 のスキーマに最初から含める** | Phase 1 (PR#1) |
| **BM25 + 読み仮名** | PGroonga が上位互換。移植不要 | 対応済み扱い |
| **specificity damping** | consolidate の重み計算に SQL 集約を足すだけ | Phase 2.5 |
| **echo / energy LTP** | link テーブルの weight を SQL UPDATE で減衰・強化 | Phase 2.5 |
| **temporal sketch** | date_trunc + PGroonga で SQL 化容易 | Phase 3 |
| **workspace ignition/refractory/precision vector** | recall_divergent 側の概念。ストレージ非依存 | Phase 3 |
| **ScoreBreakdown**（per-channel 分解） | search 結果に breakdown を JSON で載せる。契約は保つ | Phase 3 |
| **morning_briefing 軽量ハンドオフ** | consolidation の要約テーブル追加 | Phase 3 |

---

## 6. Phase 進行の再確認

| Phase | PR | 中身 | 完了条件 |
|---|---|---|---|
| Phase 0 | **PR#1（本PR）** | Contract 棚卸し / Docker + PGroonga + pgvector 起動 / スキーマ DDL 初版 / smoke test | `docker-compose up -d` → `psql -f 001_init.sql` → 日本語 PGroonga 検索が HIT |
| Phase 1 | PR#2 | ストア層（Python）実装。`memory-pg-mcp` パッケージ骨格 + connect/save/search の最小実装 + SQLite → PG マイグレーションスクリプト | 最小契約の save/search が単体テストで通る |
| Phase 2 | PR#3 | 最小契約 11 ツール全部を stdio MCP で公開 + 契約準拠テスト | 現行スキル (`/wd-remember`, `/wd-recall`, `/wd-great-recall`) が MCP 差し替えで動く |
| Phase 2.5 | PR#4 | 拡張契約（recall_with_associations, recall_divergent, get_memory_chain, get_memory_calendar, reevaluate_importance, tom, search_episodes, get_episode_memories）+ specificity damping / echo / energy LTP の輸入 | 拡張ツールが動く |
| Phase 3 | PR#5+ | Supabase デプロイ + Web スキル (`/wd-remote-memory`) + Edge Function（クエリ埋め込み）| Claude Code Web から remember/recall が通る |
| Phase 4 | PR#6 | wd-configure にバックエンド選択、wd-setup 導線、ドキュメント | 選択導線が動く |

---

## 7. リスクと未確定事項

- **埋め込みモデル**: 現行は多分 `chiVe` か何か（要確認）。Postgres 版は `vector(768)` の pgvector 型で受ける。実装時に次元数を確定する必要がある（**PR#2 の宿題**）。PR#1 のスキーマでは 768 次元で置くが、DDL の初期化スクリプトで `EMBED_DIM` 変数化するのが理想（今回は 768 固定でシンプルに）
- **distance のセマンティクス**: cosine 距離 (0-2) を保持するか PGroonga スコアも混ぜるか。**契約準拠のため cosine を主軸に**、PGroonga はキーワードヒットのブースターとして使うのが素直
- **auto_link の閾値**: 現行 0.8。Postgres 化後の distance 空間で同じ値が使えるかは検証が要る
- **RLS 設計**: Phase 3 で Supabase に載せるときに必要。PR#1 では触らない
