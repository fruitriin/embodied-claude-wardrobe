// 原文: /Users/riin/workspace/wardrobe-test/.claude/addf/knowhow/claude-code/extracted-docs/tools/GlobTool/prompt.ts
export const GLOB_TOOL_NAME = 'Glob'

export const DESCRIPTION = `- どんな規模のコードベースでも動作する高速ファイルパターンマッチングツール
- "**/*.js" や "src/**/*.ts" のようなglobパターンをサポート
- マッチしたファイルパスを更新日時順で返す
- ファイル名パターンでファイルを検索する際に使用するツール
- globとgrepを複数回繰り返す可能性のあるオープンエンドな検索には、代わりにAgentツールを使用すること`
