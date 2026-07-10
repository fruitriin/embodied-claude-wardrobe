# docs/guides/ ガイド作成計画

> README.md・SOUL.md・SOUL.template.md から参照されているが未作成のガイド5ファイル。

## 作成するファイル

| ファイル | 内容 | 参考元プロジェクト |
|---|---|---|
| `docs/guides/setup.md` | セットアップ手順。uv sync、MCP 設定、初回起動まで | 各プロジェクトの CLAUDE.md に分散 |
| `docs/guides/soul-writing.md` | SOUL.md の書き方ガイド | 商会 `docs/templates/SOUL.md` + `docs/knowhow/persona-soul-assignment.md` |
| `docs/guides/customization.md` | スキル・フックの変更と追加 | 商会 `docs/knowhow/ADDF/skill-design-patterns.md`, `permission-settings-pattern.md` |
| `docs/guides/multi-persona.md` | 複数ペルソナの追加方法 | 商会 `docs/project-overview/system-persona.md` |
| `docs/guides/autonomous-action.md` | cron 自律行動の設定 | 王様 `docs/autonomous-timeout-design.md` |

## 世界の対応関係

| プロジェクト | 呼称 | 特徴 |
|---|---|---|
| ~/workspace/assistant/ | シロエ | ワードローブ最初の顧客。シングルエージェント。ドキュメントは CLAUDE.md に集約 |
| ~/workspace/riin-service/ | 王様（ウルクの王様） | 開発担当エージェント。自律行動の設計が深い |
| ~/workspace/merchant-guild/ | 商会 | マルチペルソナ（7+影）。ドキュメントが最も充実。ペルソナシステム・SOUL 設計・スキルパターンの参考元 |
| ~/workspace/AutomatonDevDriveFramework/ | ADDF | フレームワーク本体。商会の knowhow/ADDF/ に知見が蓄積 |

## 方針

- 各ガイドはアップストリーム（wardrobe）のドキュメントとして書く。ダウンストリーム固有の情報は入れない
- 参考元プロジェクトの内容をそのままコピーしない。wardrobe のテンプレートと設計思想に合わせて再構成する
- setup.md は `/wd-configure` の実行フローと連動させる
- soul-writing.md は SOUL.template.md の各セクションの書き方を説明する
- multi-persona.md は PERSONA.template.md の使い方を説明する

## 優先度

1. **setup.md** — 新規ユーザーが最初に読む。なければ始められない
2. **soul-writing.md** — SOUL.md から直接参照されている。最初のカスタマイズステップ
3. **autonomous-action.md** — cron 設定は手順が複雑。ガイドなしだと詰まる
4. **customization.md** — スキル追加は中級者向け。急がない
5. **multi-persona.md** — 上級者向け。商会以外でまだ需要が少ない
