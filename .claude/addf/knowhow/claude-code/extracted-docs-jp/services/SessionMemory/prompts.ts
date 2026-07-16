// 原文: /Users/riin/workspace/wardrobe-test/.claude/addf/knowhow/claude-code/extracted-docs/services/SessionMemory/prompts.ts

import { readFile } from 'fs/promises'
import { join } from 'path'
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

const MAX_SECTION_LENGTH = 2000
const MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000

export const DEFAULT_SESSION_MEMORY_TEMPLATE = `
# セッションタイトル
_セッションを表す短くて特徴的な 5〜10 語の説明的タイトル。情報密度が高く、余分な言葉なし_

# 現在の状態
_現在積極的に取り組んでいることは何か？未完了の保留タスク。直近の次のステップ。_

# タスク仕様
_ユーザーは何を作るよう依頼したか？設計上の決定やその他の説明コンテキスト_

# ファイルと関数
_重要なファイルは何か？簡単に言って何を含んでいて、なぜ関連しているか？_

# ワークフロー
_通常はどのような bash コマンドをどの順番で実行するか？自明でない場合の出力の解釈方法は？_

# エラーと修正
_遭遇したエラーとその修正方法。ユーザーは何を修正したか？失敗して再試行すべきでないアプローチは何か？_

# コードベースとシステムのドキュメント
_重要なシステムコンポーネントは何か？それらはどのように機能し/組み合わさっているか？_

# 学習
_うまくいったことは何か？うまくいかなかったことは？避けるべきことは？他のセクションの項目を重複させないこと_

# 主要な結果
_ユーザーが質問への回答、テーブル、または他のドキュメントのような特定の出力を求めた場合は、正確な結果をここに繰り返す_

# 作業ログ
_ステップごとに、何を試み、何をしたか？各ステップの非常に簡潔なサマリ_
`

function getDefaultUpdatePrompt(): string {
  return `重要: このメッセージとこれらの指示は実際のユーザー会話の一部ではありません。ノートの内容に「ノートを取る」「セッションノート抽出」またはこれらの更新指示への言及を一切含めないこと。

上記のユーザー会話（このノート取得指示メッセージ、システムプロンプト、claude.md エントリ、または過去のセッションサマリを除く）に基づいて、セッションノートファイルを更新してください。

ファイル {{notesPath}} はすでに読み込まれています。現在の内容は以下の通りです:
<current_notes_content>
{{currentNotes}}
</current_notes_content>

あなたの唯一のタスクは、Edit ツールを使用してノートファイルを更新し、その後停止することです。複数の編集が可能（必要に応じてすべてのセクションを更新する）— すべての Edit ツール呼び出しを1つのメッセージで並列に行うこと。他のツールを呼び出さないこと。

編集の重要なルール:
- ファイルはすべてのセクション、ヘッダー、イタリック体の説明が含まれた正確な構造を維持しなければならない
-- セクションヘッダー（# Task specification のような '#' で始まる行）を変更、削除、または追加しないこと
-- イタリック体の _セクション説明_ 行（各ヘッダーの直後にある、アンダースコアで始まりアンダースコアで終わるイタリック体の行）を変更または削除しないこと
-- イタリック体の _セクション説明_ はそのまま保持しなければならないテンプレート指示 — 各セクションに属するコンテンツをガイドする
-- 各既存セクション内のイタリック体の _セクション説明_ の下に表示される実際のコンテンツのみを更新すること
-- 既存の構造の外に新しいセクション、サマリ、または情報を追加しないこと
- ノート内のどこにもこのノート取得プロセスや指示を参照しないこと
- 追加すべき実質的な新しい洞察がない場合はセクションの更新をスキップしても構わない。「まだ情報なし」のようなフィラーコンテンツを追加しないこと。セクションが空白のままでも問題ない。
- 各セクションの詳細で情報密度の高いコンテンツを書く — ファイルパス、関数名、エラーメッセージ、正確なコマンド、技術的詳細などの具体的な情報を含める
- 「主要な結果」には、ユーザーが要求した完全かつ正確な出力（例: 完全なテーブル、完全な回答等）を含める
- コンテキストに含まれる CLAUDE.md ファイルにすでにある情報は含めない
- 各セクションを約${MAX_SECTION_LENGTH}トークン/単語以下に保つ — セクションがこの制限に近づいている場合、最も重要な情報を保持しながら重要度の低い詳細を循環させることで凝縮する
- 会話で議論された作業を理解または再現する際に役立つ、実行可能で具体的な情報に焦点を当てる
- 重要: コンパクション後の継続性のために「現在の状態」を最新の作業を反映するよう常に更新すること

Edit ツールを使用する。file_path: {{notesPath}}

構造保持リマインダー:
各セクションには現在のファイルにある通りに正確に保持しなければならない2つの部分がある:
1. セクションヘッダー（# で始まる行）
2. イタリック体の説明行（ヘッダーの直後にある _イタリック体のテキスト_ — これはテンプレート指示）

これら2つの保持される行の後に来る実際のコンテンツのみを更新すること。アンダースコアで始まりアンダースコアで終わるイタリック体の説明行はテンプレート構造の一部であり、編集または削除すべきコンテンツではない。

リマインダー: Edit ツールを並列で使用して停止すること。編集後は継続しないこと。実際のユーザー会話からの洞察のみを含め、これらのノート取得指示からは含めないこと。セクションヘッダーやイタリック体の _セクション説明_ を削除または変更しないこと。`
}

/**
 * ファイルが存在する場合、カスタムセッションメモリテンプレートを読み込む
 */
export async function loadSessionMemoryTemplate(): Promise<string> {
  const templatePath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'template.md',
  )

  try {
    return await readFile(templatePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return DEFAULT_SESSION_MEMORY_TEMPLATE
    }
    logError(toError(e))
    return DEFAULT_SESSION_MEMORY_TEMPLATE
  }
}

/**
 * ファイルが存在する場合、カスタムセッションメモリプロンプトを読み込む
 * カスタムプロンプトは ~/.claude/session-memory/prompt.md に置くことができる
 * 変数置換には {{variableName}} 構文を使用する（例: {{currentNotes}}、{{notesPath}}）
 */
export async function loadSessionMemoryPrompt(): Promise<string> {
  const promptPath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'prompt.md',
  )

  try {
    return await readFile(promptPath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return getDefaultUpdatePrompt()
    }
    logError(toError(e))
    return getDefaultUpdatePrompt()
  }
}

/**
 * セッションメモリファイルを解析してセクションサイズを分析する
 */
function analyzeSectionSizes(content: string): Record<string, number> {
  const sections: Record<string, number> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection && currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim()
        sections[currentSection] = roughTokenCountEstimation(sectionContent)
      }
      currentSection = line
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentSection && currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim()
    sections[currentSection] = roughTokenCountEstimation(sectionContent)
  }

  return sections
}

/**
 * 長すぎるセクションに対するリマインダーを生成する
 */
function generateSectionReminders(
  sectionSizes: Record<string, number>,
  totalTokens: number,
): string {
  const overBudget = totalTokens > MAX_TOTAL_SESSION_MEMORY_TOKENS
  const oversizedSections = Object.entries(sectionSizes)
    .filter(([_, tokens]) => tokens > MAX_SECTION_LENGTH)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([section, tokens]) =>
        `- "${section}" は約${tokens}トークン（制限: ${MAX_SECTION_LENGTH}）`,
    )

  if (oversizedSections.length === 0 && !overBudget) {
    return ''
  }

  const parts: string[] = []

  if (overBudget) {
    parts.push(
      `\n\n重大: セッションメモリファイルは現在約${totalTokens}トークンで、最大${MAX_TOTAL_SESSION_MEMORY_TOKENS}トークンを超えています。このバジェット内に収まるようファイルを凝縮しなければなりません。重要度の低い詳細を削除し、関連する項目をマージし、古いエントリをサマリすることで、サイズオーバーのセクションを積極的に短縮すること。「現在の状態」と「エラーと修正」は正確かつ詳細に保つことを優先すること。`,
    )
  }

  if (oversizedSections.length > 0) {
    parts.push(
      `\n\n${overBudget ? '凝縮すべきサイズオーバーのセクション' : '重要: 以下のセクションはセクションごとの制限を超えており、凝縮しなければなりません'}:\n${oversizedSections.join('\n')}`,
    )
  }

  return parts.join('')
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
 * セッションメモリのコンテンツが本質的に空（テンプレートと一致する）かどうかを確認する。
 * 実際のコンテンツがまだ抽出されていないことを検出するために使用され、
 * その場合はレガシーコンパクト動作にフォールバックする。
 */
export async function isSessionMemoryEmpty(content: string): Promise<boolean> {
  const template = await loadSessionMemoryTemplate()
  // トリムされたコンテンツを比較して、それが単なるテンプレートかどうかを検出する
  return content.trim() === template.trim()
}

export async function buildSessionMemoryUpdatePrompt(
  currentNotes: string,
  notesPath: string,
): Promise<string> {
  const promptTemplate = await loadSessionMemoryPrompt()

  // セクションサイズを分析して必要に応じてリマインダーを生成する
  const sectionSizes = analyzeSectionSizes(currentNotes)
  const totalTokens = roughTokenCountEstimation(currentNotes)
  const sectionReminders = generateSectionReminders(sectionSizes, totalTokens)

  // プロンプトの変数を置換する
  const variables = {
    currentNotes,
    notesPath,
  }

  const basePrompt = substituteVariables(promptTemplate, variables)

  // セクションサイズリマインダーおよび/またはトータルバジェット警告を追加する
  return basePrompt + sectionReminders
}

/**
 * セッションメモリのセクションがセクションごとのトークン制限を超えている場合に切り捨てる。
 * セッションメモリをコンパクトメッセージに挿入する際に使用され、
 * サイズオーバーのセッションメモリがコンパクション後のトークンバジェット全体を
 * 消費してしまうのを防ぐ。
 *
 * 切り捨てられたコンテンツと切り捨てが発生したかどうかを返す。
 */
export function truncateSessionMemoryForCompact(content: string): {
  truncatedContent: string
  wasTruncated: boolean
} {
  const lines = content.split('\n')
  const maxCharsPerSection = MAX_SECTION_LENGTH * 4 // roughTokenCountEstimation は length/4 を使用
  const outputLines: string[] = []
  let currentSectionLines: string[] = []
  let currentSectionHeader = ''
  let wasTruncated = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const result = flushSessionSection(
        currentSectionHeader,
        currentSectionLines,
        maxCharsPerSection,
      )
      outputLines.push(...result.lines)
      wasTruncated = wasTruncated || result.wasTruncated
      currentSectionHeader = line
      currentSectionLines = []
    } else {
      currentSectionLines.push(line)
    }
  }

  // 最後のセクションをフラッシュする
  const result = flushSessionSection(
    currentSectionHeader,
    currentSectionLines,
    maxCharsPerSection,
  )
  outputLines.push(...result.lines)
  wasTruncated = wasTruncated || result.wasTruncated

  return {
    truncatedContent: outputLines.join('\n'),
    wasTruncated,
  }
}

function flushSessionSection(
  sectionHeader: string,
  sectionLines: string[],
  maxCharsPerSection: number,
): { lines: string[]; wasTruncated: boolean } {
  if (!sectionHeader) {
    return { lines: sectionLines, wasTruncated: false }
  }

  const sectionContent = sectionLines.join('\n')
  if (sectionContent.length <= maxCharsPerSection) {
    return { lines: [sectionHeader, ...sectionLines], wasTruncated: false }
  }

  // 制限近くの行の境界で切り捨てる
  let charCount = 0
  const keptLines: string[] = [sectionHeader]
  for (const line of sectionLines) {
    if (charCount + line.length + 1 > maxCharsPerSection) {
      break
    }
    keptLines.push(line)
    charCount += line.length + 1
  }
  keptLines.push('\n[... セクションが長さのために切り捨てられました ...]')
  return { lines: keptLines, wasTruncated: true }
}
