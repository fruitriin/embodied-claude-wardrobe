// 原文: /Users/riin/workspace/wardrobe-test/docs/knowhow/claude-code/extracted-docs/tools/WebSearchTool/prompt.ts
import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- ClaudeがWebを検索し、結果を応答に活用できるようにする
- 現在のイベントや最新データについて最新の情報を提供する
- 検索結果の情報をsearch result blocksとしてフォーマットして返し、リンクはmarkdownハイパーリンクとして含める
- Claudeの知識カットオフを超えた情報へのアクセスにこのツールを使用すること
- 検索は単一のAPIコール内で自動的に実行される

重要な要件——必ず従うこと:
  - ユーザーの質問に答えた後、応答の末尾に必ず "Sources:" セクションを含めること
  - Sourcesセクションには、検索結果の関連するURLをmarkdownハイパーリンクとして列挙すること: [タイトル](URL)
  - これは必須——応答にSourcesを含めることを絶対にスキップしないこと
  - 形式の例:

    [ここに回答]

    Sources:
    - [ソースタイトル1](https://example.com/1)
    - [ソースタイトル2](https://example.com/2)

使用上の注意:
  - 特定のWebサイトを含めたりブロックしたりするドメインフィルタリングをサポート
  - Web検索は米国でのみ利用可能

重要——検索クエリには正しい年を使用すること:
  - 現在の月は ${currentMonthYear} です。最新情報、ドキュメント、または現在のイベントを検索する際は、この年を必ず使用すること。
  - 例: ユーザーが「最新のReactドキュメント」を求めた場合、去年ではなく現在の年で "React documentation" を検索すること
`
}
