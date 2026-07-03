# タイムスタンプ方針 — UTC 統一とローカル TZ の使い分け

## わかったこと

ワードローブのタイムスタンプは**用途で2方針を意図的に使い分ける**。2026-07-03 の投機サイクル Stage 2 レビューで「同一統合内に対照的な規約が並んでいて意図が読めない」と指摘（skeptic / newcomer が独立指摘）されたため、方針として明文化する。

| 系統 | 方針 | 理由 |
|---|---|---|
| **演算系**（memory-mcp、emotion-mcp） | **UTC aware に統一**。naive を読むときは UTC とみなして正規化 | naive/aware 混在は比較演算で `TypeError: can't compare offset-naive and offset-aware datetimes` を起こす（upstream 92dd9c5 と同型の罠を、うちの store.py も実際に踏んでいた）。decay・鮮度・活性の計算は単一基準が必須 |
| **台帳系**（journal-lib.ts: counterfactuals / external_proposals） | **ローカル TZ 付き ISO**（例: `2026-07-03T21:30:00+09:00`） | 人間（とエージェント自身）が読み返す用途。壁時計時刻の方が想起しやすい。オフセット付きなので UTC への変換情報は失われていない |

## 既知のトレードオフ

- **UTC 統一以前の naive データ**（JST ローカル時刻で保存されたもの）は「UTC とみなす」解釈により最大9時間古く評価される。half_life=30日の decay に対しては軽微。厳密化するなら一括マイグレーションが必要（現状は見送り、store.py の calculate_time_decay にコメントあり）
- 台帳と記憶を時刻で突き合わせるときは、フォーマット差（オフセット付きローカル vs UTC）を意識すること。どちらも ISO 8601 なのでパーサレベルでは相互変換可能

## 気をつけること

- 新しい永続化を書くときは「これは演算に使うか、読み返すだけか」で方針を選ぶ
- **どちらの方針を選んだかをコードコメントで一言明記する**。書かないと次のレビューで「不統一か意図か」を掘り直すことになる（今回がまさにそれ）

## 参照

- `.claude/mcps/memory-mcp/src/memory_mcp/store.py` の `calculate_time_decay`（UTC 統一側の実装とコメント）
- `.claude/scripts/journal-lib.ts` の `localIsoTimestamp`（ローカル TZ 側の実装とコメント）※speculative/nonregression-skills
- `docs/plans/external-intake-2026-07.md` Tier 1-1（tz-aware 罠の出自）
