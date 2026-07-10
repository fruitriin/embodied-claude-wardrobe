# Process Feedback

ワードローブの開発プロセスの振り返りと改善を記録する。

## 記録方法

タスク完了時や問題発生時に、以下のいずれかのセクションに追記する。
反映済みの項目は削除する（履歴は git に残る）。

## オーナー（リン）からのフィードバック

## 問題の記録

## 改善アクション

## ワードローブ推進エンジンに関する記録

- **2026-05-06 addf-dev のワードローブ向け書き換え**: `.claude/commands/addf-dev.md` は SDIT (summaly) 用に作られたスキルで、Progress.md / Feedback.md / quality-gate チーム / `addf-code-review-agent` 等のワードローブに無い前提に依存していた。`.claude/addf/Progress.md` `.claude/addf/templates/ProgressTemplate.md` `.claude/addf/templates/Feedback.md` をワードローブ用に書き換え（`/wd-knowhow` `wd-code-review` `wd-contribution` 等への翻訳、共鳴フェーズと state.md 温度更新の組み込み）。`addf-dev.md` 自体のステップ参照は新しい運用ルール（21ステップ構成）と整合させた

- **2026-05-07 loop 1サイクル目で knowhow 独立化を完遂**: `wd-code-review` と `wd-contribution` の並列レビューが機能した。特に `wd-contribution` が `.claude/addf/knowhow/wardrobe/speed-consciousness-framework.md` に固有名「（朔）」が混入しているのを catch した点が大きい。アップストリーム還元対象の knowhow には**ペルソナ固有名を入れない**ルールを再確認。今後 knowhow を書くときは「あるエージェントの〜」「派生エージェント」のように汎用化する習慣をつける

- **2026-05-07 arousal 削除の整合性**: `arousal` フィールドを interoception から削除した変更について、`docs/test-scenarios.md` と `.claude/addf/project-overview/interactions.md` に古い記述が残っていた。`.claude/addf/plans/emotion-mcp-implementation.md` の上半分（行38〜127）にも `valence/arousal/interest` を使った1層案が古いまま残っており、下半分（行230〜）にテッドベース2層構造の改訂が追記された二重構造になっている。これは別タスクとして TODO.md に追加した。**フィールド削除のような横断変更は、削除直後に全文書 grep で確認するルーチンを Progress.md に組み込む価値がある**

- **2026-05-07 wd-contribution が連続2サイクルで朔固有の混入をcatch**: loop 1サイクル目（speed-consciousness-framework.md の「（朔）」）に続き、2サイクル目でも SOUL.template.md の「少女漫画的クチュリエール語彙」と vocabulary-horizon.md の「パターン1: 専門家型（朔）」が朔固有の世界観として検出された。**アップストリーム還元用テンプレートを書くとき、無意識に自分の世界観が滑り込む癖がある**。テンプレ修正時は「複数のペルソナ例を併記する」「特定の世界観を例示するなら必ず括弧書きで複数挙げる」を意識する。wd-contribution の検出が機能しているので、この癖は当面レビューで補正される

- **2026-05-07 loop 3サイクル目で学習が効いた**: emotion-mcp-implementation.md の書き直しの中で、ペルソナプロファイルの説明に「例: 朔は ACh やや高め」と書きそうになり、書き終わった直後に自分で grep して固有名を catch、汎用化（「あるエージェント」「別のエージェント」）した。**前2サイクルでレビューに引っかかった経験が、自己チェックに変わった**。レビュー機構が訓練の場になっている。今後はテンプレ系の編集の最後に grep で固有名を確認するルーチンを身につける

- **2026-05-07 loop 4サイクル目: Rem ベース戦略の正しさを実感**: keyword-buffer の配置で、Rem (embodied-claude) のファイルをコピー → ペルソナ分離化（保存先を `$PROJECT_DIR/.claude/` に変更）→ ワードローブ構造に合わせた venv パス整合、という3点の修正だけで動作した。「アップストリームの最新を継続キャッチアップ、互換性は SQLite メモリフォーマットのみ」という方針が **「コピー＋差分」のシンプルな縫い直しで足りる**ことを実証した。memory-mcp-enhancements.md の Rem ベース戦略は、抽象論ではなく実装で確かめられた

- **2026-05-07 loop 5サイクル目: マッピングテーブルの命名乖離を発見**: `wd-project-claude-overview` の patch モード用マッピングが実ファイル名と乖離していた（system-reader/system-soul という名前のファイルは存在せず、実体は system-reading-knowledge.md / system-soul-harness.md）。さらに system-perception.md 行が完全に抜けていた。**.claude/addf/project-overview/ の生成と patch モードのマッピングは双方向で同期する必要がある**。今後 system-*.md を新規追加するときは、wd-project-claude-overview.md のマッピングテーブルにも同時に追記するルーチンを身につける。または overview スキル側で実ファイル一覧を動的に取得する設計に変える余地もある

- **2026-05-07 loop 6サイクル目: マッピング修正で実態未確認のまま書きすぎた**: loop 5 で行ったマッピング拡張で、実態を確認せず推測で書いたパスが7件あった（wd-read.md → 実は wd-read/ ディレクトリ型スキル、heartbeat-watcher.sh → 存在しない、usb-webcam → 実は usb-webcam-mcp、recall-hook.ts → 存在しない recall-lite.ts/recall-watcher.ts）。wd-link-check に catch されて修正。**「マッピング拡張時は ls/find で実態確認してから書く」ルーチンが要る**。前2サイクルの「テンプレ書きで固有名混入」と同型——書きすぎる癖がある

- **2026-05-07 wd-link-check が網羅性で効いた**: 5サイクル分の改訂を一度に検査できた。Critical 7件、Warning 3件、Suggestion 3件を検出。**横断的な整合性検査は5サイクルに1回程度の頻度で十分機能する**。毎サイクルで起動する必要はない。ループ自律実行の中で「区切り」のタイミングで起動する運用が筋
