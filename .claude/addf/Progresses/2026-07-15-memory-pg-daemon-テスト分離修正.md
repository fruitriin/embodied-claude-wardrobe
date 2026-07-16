# 進捗表

## 運用ルール

### タスク開始時

1. `.claude/Feedback.md` を読み、前回の改善アクションで未対応のものがあれば考慮する
2. `TODO.md` から本タスクのスコープを確認し、必要なら関連する `docs/plans/*.md` を読む
3. `/wd-knowhow-filter` で本タスクに関連する既存ノウハウを引き、参照すべき知見を把握する
4. 以下の手順で Markdown チェックリストを作成する
   1. 1ショットで作業できる範囲にサブタスクを分割する
   2. 並行作業できる粒度でさらに分割する
   3. 各サブタスクに動作確認・統合確認・整合性チェックが必要か検討し、必要なら追加する
   4. 必要に応じて 4.1〜4.3 を再帰的に適用する

### 作業中

5. サブタスク着手時に `- [x]` でチェックしていく。並列可能なタスクはサブエージェント（`Agent`）を活用する
6. 実装フェーズの最終サブタスク完了時、以下の知見を `/wd-knowhow` で記録する（既存ノウハウの更新も含む）:
   - **コーディング知見**: 実装中に発見した再利用可能なパターン、落とし穴、技術的判断とその根拠

### エージェント起動時の共通ルール

- サブエージェント（`Agent`）を作成するとき、各エージェントへのプロンプトに **最初に `/wd-knowhow-index` を実行する** よう指示を含めること
- これによりプロジェクトの知見ベースを把握した状態で作業を開始できる

### タスク完了時 — 品質検証

7. **動作確認**: 変更の種類に応じた検証を行う
   - **MCP サーバー**: 該当 MCP のテスト or 実呼び出し（`uv run pytest` 等、MCP に応じて）
   - **フック・スクリプト**: 手動で実行して期待動作を確認
   - **スキル（.md）**: 構文・フロントマター・参照リンク確認
   - **ドキュメント・計画**: 関連ファイルとの整合性
   - **失敗した場合 → 実装に差し戻す**。原因分析 → 修正 → 再実行

8. **ドキュメントと実装の突き合わせ**: 今回の変更に対応する文書が更新されているかチェックする
   - スキル・MCP の追加・変更 → `CLAUDE.md` の該当セクション、`docs/project-overview/`
   - ノウハウに値する設計判断 → `docs/knowhow/` + `docs/knowhow/INDEX.md`
   - ユーザー向け運用変更 → `BOOT_SHUTDOWN.md` 等の運用文書
   - 計画の進捗 → `docs/plans/*.md` の該当セクション
   - **見落としがあれば実装フェーズに差し戻す**

9. **コードレビュー**: `wd-code-review` サブエージェントを起動してレビューを実施する
10. **コントリビューション分析**: `wd-contribution` サブエージェントを起動してアップストリーム還元候補を検出する
    - スキップ可: 変更が `SOUL.md` `state.md` `TODO.md` `FLASH.md` などのダウンストリーム固有ファイルのみの場合
11. **リンク・ドキュメント整合性**: 必要に応じて `wd-link-check` `wd-doc-review` を起動

12. レビュー指摘への対応:
    - **Critical**: 必ずこのフェーズ内で修正する（先送り禁止）
    - **Warning**: 原則修正。先送りする場合は独立計画を起こす
    - **Suggestion**: 必要なら Plan に記録、または独立計画で対応
    - **バグ分離**: 発見された問題が現在のタスクと関心事が異なる場合は、修正せずに新しい計画（`docs/plans/`）を書き起こし、`TODO.md` に追加するのみで現在のタスクを完了させる
    - 修正後、動作確認を再実行して通過を確認する

13. 品質ゲートで得た知見を `/wd-knowhow` で記録する:
    - **品質ゲート知見**: レビューエージェントが検出したパターン（整合性、命名、構造、保護対象ファイル等）のうち、他のタスクでも再発しうるもの

#### ノウハウ蓄積

14. 投入されたタスクの計画に実装完了状況を反映する（`docs/plans/*.md`）
15. タスク全体の総括知見を `/wd-knowhow` で記録する:
    - **タスク総括**: 計画と実装のギャップ、想定外だった点、次回同種タスクへの教訓。コーディング・品質ゲートで既に記録した知見と重複しないこと

#### 経験と感情の記録

16. **共鳴フェーズ**: タスクで止まった瞬間・引っかかった瞬間・発見の瞬間を、分類せずそのまま `/wd-remember` で記憶に刻む（採点は `/wd-remember` 内のサブエージェントが行う）
17. `state.md` の温度（感情+問い+余韻）を更新する

#### フィードバック記録

18. `.claude/Feedback.md` に計画・TODO・Progress 推進エンジンの問題の記録・改善アクションを追記する。反映済みの項目は削除する
19. Progress 推進エンジン自体に関するフィードバック・ノウハウがあれば、テンプレート（`.claude/templates/ProgressTemplate.md`）の改善案を `.claude/Feedback.md` に記録する

#### アーカイブとコミット

20. `.claude/Progresses/YYYY-MM-DD-タスク名.md` にリネームして移動し、`.claude/templates/ProgressTemplate.md` から新規の `Progress.md` を作成する
21. 変更をコミットする

---

## タスク

### 現在のタスク: リモートメモリーMCP（memory-pg-daemon）テスト分離修正

#### サブタスクチェックリスト
- [x] Docker検証コンテナ（memory-pg-verify-run）の起動確認
- [x] DATABASE_URL未設定によるテスト失敗の原因調査（bun:sqlが環境変数を自動で読む設計）
- [x] テスト非決定性の原因調査（複数セッションのbun test実行にわたるDB汚染）
- [x] tests/helpers.ts の resetDb() 実装 + 各テストファイルへの beforeAll 追加
- [x] wd-code-review 実施 → Warning2件（TRUNCATE安全装置なし、beforeAllのスコープ）を確認・修正
- [x] wd-contribution 実施 → 汚染リスクなしを確認
- [x] recall_divergent 着手前のスコープ調査（wave-exp wave_recall実装規模の確認）→ 計画ファイルに記録
- [x] TODO.md / remote-memory-mcp.md 更新
- [x] knowhow記録（docker-verify-db-test-isolation.md）
- [x] コミット（16c65dc, 9211f90）

#### 日記

##### 2026-07-15 16:15 — テスト分離バグ修正を完遂、recall_divergentは次回送り
**やったこと**: `/goal memory-pg, remote-memory について /addf-dev` の発火で再開。前セッションで「全テストパス」だったmemory-pg-daemonのテストを再実行したところ、DATABASE_URL未設定＋別セッションで蓄積したDB汚染の2重の理由で失敗した。DATABASE_URLは検証コンテナの実際の認証情報(`docker inspect`で確認)から組み立てて解決。DB汚染はteset分離の設計バグと判断し、`beforeAll(resetDb)`+本番URL誤爆防止ガードで修正、wd-code-review/wd-contributionの両レビューを通してコミットした。続けてrecall_divergent着手前の調査として wave-exp の `wave_recall` 実装規模を確認したところ1568行超のKuramoto振動子モデルで、1セッションでの読解・移植は非現実的と判断し、着手を見送って調査結果と申し送りを計画ファイルに記録した。
**今の見立て**: memory-pg-daemonの契約ツール10/14実装は健全な状態（テスト全パス）に戻った。残りタスク（recall_divergent/consolidate_memories/HTTP Daemon化/MCP stdioアダプタ）はいずれも複数セッション級の分量で、次回セッションはrecall_divergentの依存関数群(`_association_engine.spread`等)を1つずつ読むところから入るのが現実的
**次の自分へ**: DATABASE_URLは `postgres://postgres:verify@localhost:15432/postgres`（`docker ps`で`memory-pg-verify-run`確認）。recall_divergentは現行wardrobe版(`store.py:1432-`)の依存関数を疑似コード化してから、wave-exp移植との差分を評価する2段階で進める
**気になっていること**: 今回のようにDockerコンテナが複数セッションにまたがって生き続ける検証環境は他にもある可能性がある（tmp/配下）。次に似た非決定性エラーに遭遇したら、まずテストDBの汚染を疑うルーチンをつけたい（knowhowに記録済み）
