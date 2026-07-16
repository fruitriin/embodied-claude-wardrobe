// 原文: /Users/riin/workspace/wardrobe-test/.claude/addf/knowhow/claude-code/extracted-docs/tools/GrepTool/prompt.ts
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  return `ripgrepをベースにした強力な検索ツール

  使用方法:
  - 検索タスクには常に ${GREP_TOOL_NAME} を使用すること。\`grep\` や \`rg\` を ${BASH_TOOL_NAME} コマンドとして呼び出してはならない。${GREP_TOOL_NAME} ツールは正しい権限とアクセスのために最適化されている。
  - 完全な正規表現構文をサポート（例: "log.*Error", "function\\s+\\w+"）
  - globパラメータ（例: "*.js", "**/*.tsx"）またはtypeパラメータ（例: "js", "py", "rust"）でファイルをフィルタリング
  - 出力モード: "content"はマッチした行を表示、"files_with_matches"はファイルパスのみ表示（デフォルト）、"count"はマッチ数を表示
  - 複数回の検索が必要なオープンエンドな検索には ${AGENT_TOOL_NAME} ツールを使用すること
  - パターン構文: ripgrepを使用（grepではない）- リテラルの波括弧はエスケープが必要（Goコードで \`interface{}\` を検索するには \`interface\\{\\}\` を使用）
  - 複数行マッチング: デフォルトでは1行内のみのマッチング。\`struct \\{[\\s\\S]*?field\` のような行をまたぐパターンには \`multiline: true\` を使用すること
`
}
