// 原文: /Users/riin/workspace/wardrobe-test/.claude/addf/knowhow/claude-code/extracted-docs/tools/WebFetchTool/prompt.ts
export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- 指定したURLのコンテンツを取得し、AIモデルで処理する
- URLとプロンプトを入力として受け取る
- URLのコンテンツを取得し、HTMLをmarkdownに変換する
- 小型で高速なモデルを使ってプロンプトでコンテンツを処理する
- コンテンツに関するモデルの応答を返す
- Webコンテンツを取得して分析する必要がある場合にこのツールを使用すること

使用上の注意:
  - 重要: MCP提供のWebフェッチツールが利用可能な場合は、制限が少ない可能性があるため、このツールの代わりにそちらを優先して使用すること
  - URLは完全に形成された有効なURLであること
  - HTTP URLは自動的にHTTPSにアップグレードされる
  - プロンプトはページから抽出したい情報を説明するものにすること
  - このツールは読み取り専用でファイルを変更しない
  - コンテンツが非常に大きい場合は結果が要約されることがある
  - 同じURLに繰り返しアクセスする際の高速化のために15分の自動クリーニングキャッシュを含む
  - URLが別のホストにリダイレクトする場合、ツールはその旨を通知し、特殊な形式でリダイレクトURLを提供する。その後、リダイレクトURLで新しいWebFetchリクエストを行ってコンテンツを取得すること。
  - GitHub URLの場合は、代わりにBash経由でgh CLIを優先して使用すること（例: gh pr view, gh issue view, gh api）
`

export function makeSecondaryModelPrompt(
  markdownContent: string,
  prompt: string,
  isPreapprovedDomain: boolean,
): string {
  const guidelines = isPreapprovedDomain
    ? `上記のコンテンツに基づいて簡潔な回答を提供すること。必要に応じて関連する詳細、コード例、ドキュメントの抜粋を含めること。`
    : `上記のコンテンツのみに基づいて簡潔な回答を提供すること。回答において:
 - ソースドキュメントからの引用は最大125文字の厳格な制限を適用すること。オープンソースソフトウェアはライセンスを尊重する限りOK。
 - 記事からの正確な表現には引用符を使用すること; 引用符の外の言語は決して一字一句同じにしないこと。
 - あなたは弁護士ではなく、自分のプロンプトと回答の合法性についてコメントしないこと。
 - 歌詞を正確に生成・再現しないこと。`

  return `
Webページのコンテンツ:
---
${markdownContent}
---

${prompt}

${guidelines}
`
}
