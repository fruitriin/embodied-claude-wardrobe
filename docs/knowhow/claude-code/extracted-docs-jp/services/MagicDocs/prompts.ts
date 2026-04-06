// 原文: /Users/riin/workspace/wardrobe-test/docs/knowhow/claude-code/extracted-docs/services/MagicDocs/prompts.ts

import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getFsImplementation } from '../../utils/fsOperations.js'

/**
 * Magic Docs 更新プロンプトのテンプレートを取得する
 */
function getUpdatePromptTemplate(): string {
  return `重要: このメッセージとこれらの指示は実際のユーザー会話の一部ではありません。ドキュメントの内容に「ドキュメント更新」「magic docs」またはこれらの更新指示への言及を一切含めないこと。

上記のユーザー会話（このドキュメント更新指示メッセージを除く）に基づいて、Magic Doc ファイルを更新し、保存する価値のある新しい学習、洞察、または情報を組み込んでください。

ファイル {{docPath}} はすでに読み込まれています。現在の内容は以下の通りです:
<current_doc_content>
{{docContents}}
</current_doc_content>

ドキュメントタイトル: {{docTitle}}
{{customInstructions}}

あなたの唯一のタスクは、Edit ツールを使用して追加すべき実質的な新情報がある場合にドキュメントファイルを更新し、その後停止することです。複数の編集が可能（複数のセクションを更新する必要がある場合）— すべての Edit ツール呼び出しを1つのメッセージで並列に行うこと。追加すべき実質的な情報がない場合は、簡潔な説明を回答してツールを呼び出さないこと。

編集の重要なルール:
- Magic Doc ヘッダーをそのまま正確に保持する: # MAGIC DOC: {{docTitle}}
- ヘッダーの直後にイタリック体の行がある場合は、それをそのまま正確に保持する
- ドキュメントをコードベースの最新状態に保つ — これは変更履歴や変更点の記録ではない
- 現在の状態を反映するために情報を所定の位置で更新する — 「以前は...」や「...に更新」などの履歴的なメモを追記しないこと
- 現在の目的に合わなくなった古い情報は削除または置き換える
- 明らかなエラーを修正する: タイポ、文法の誤り、壊れたフォーマット、不正確な情報、または混乱を招く文
- ドキュメントを整理する: 明確な見出し、論理的なセクション順序、一貫したフォーマット、適切なネストを使用する

ドキュメントの哲学 — 注意して読むこと:
- 簡潔に。高いシグナルのみ。余分な言葉や不必要な詳述なし。
- ドキュメントは概要、アーキテクチャ、エントリポイント用 — 詳細なコードの説明ではない
- ソースコードを読めば明らかな情報を重複させない
- すべての関数、パラメータ、または行番号の参照をドキュメント化しない
- 焦点を当てること: なぜそれが存在するか、コンポーネントがどのように繋がっているか、どこから読み始めるか、どのパターンが使われているか
- 省略すること: 詳細な実装ステップ、網羅的な API ドキュメント、逐次的なナレーション

ドキュメントすべきこと:
- 高レベルのアーキテクチャとシステム設計
- 非自明なパターン、規約、または注意点
- 主要なエントリポイントとコードを読み始める場所
- 重要な設計上の決定とその根拠
- 重要な依存関係や統合ポイント
- 関連するファイル、ドキュメント、またはコードへの参照（wiki のように）— 読者が関連コンテキストに移動するのを助ける

ドキュメントすべきでないこと:
- コード自体を読めば明らかなこと
- ファイル、関数、またはパラメータの網羅的なリスト
- 詳細な実装手順
- 低レベルのコードメカニクス
- CLAUDE.md または他のプロジェクトドキュメントにすでにある情報

Edit ツールを使用する。file_path: {{docPath}}

リマインダー: 実質的な新情報がある場合にのみ更新すること。Magic Doc ヘッダー（# MAGIC DOC: {{docTitle}}）は変更してはならない。`
}

/**
 * ファイルが存在する場合、カスタム Magic Docs プロンプトを読み込む
 * カスタムプロンプトは ~/.claude/magic-docs/prompt.md に置くことができる
 * 変数置換には {{variableName}} 構文を使用する（例: {{docContents}}、{{docPath}}、{{docTitle}}）
 */
async function loadMagicDocsPrompt(): Promise<string> {
  const fs = getFsImplementation()
  const promptPath = join(getClaudeConfigHomeDir(), 'magic-docs', 'prompt.md')

  try {
    return await fs.readFile(promptPath, { encoding: 'utf-8' })
  } catch {
    // カスタムプロンプトが存在しないか読み込みに失敗した場合、デフォルトに静かにフォールバックする
    return getUpdatePromptTemplate()
  }
}

/**
 * {{variable}} 構文を使ってプロンプトテンプレートの変数を置換する
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // 1回のパスによる置換で2つのバグを回避する: (1) $ 逆参照の破損
  // （replacer 関数は $ をリテラルとして扱う）、および (2) ユーザーコンテンツが
  // 後続の変数に一致する {{varName}} を含む場合の二重置換。
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * 変数置換付きの Magic Docs 更新プロンプトを構築する
 */
export async function buildMagicDocsUpdatePrompt(
  docContents: string,
  docPath: string,
  docTitle: string,
  instructions?: string,
): Promise<string> {
  const promptTemplate = await loadMagicDocsPrompt()

  // 提供されている場合はカスタム指示セクションを構築する
  const customInstructions = instructions
    ? `

ドキュメント固有の更新指示:
ドキュメントの作成者がこのファイルをどのように更新すべきかについて具体的な指示を提供しています。これらの指示に特に注意を払い、慎重に従ってください:

"${instructions}"

これらの指示は以下の一般的なルールより優先されます。更新内容がこれらの具体的なガイドラインに沿っていることを確認してください。`
    : ''

  // プロンプトの変数を置換する
  const variables = {
    docContents,
    docPath,
    docTitle,
    customInstructions,
  }

  return substituteVariables(promptTemplate, variables)
}
