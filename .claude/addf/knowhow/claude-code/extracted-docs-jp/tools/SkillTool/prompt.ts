// 原文: /Users/riin/workspace/wardrobe-test/docs/knowhow/claude-code/extracted-docs/tools/SkillTool/prompt.ts
import { memoize } from 'lodash-es'
import type { Command } from 'src/commands.js'
import {
  getCommandName,
  getSkillToolCommands,
  getSlashCommandToolSkills,
} from 'src/commands.js'
import { COMMAND_NAME_TAG } from '../../constants/xml.js'
import { stringWidth } from '../../ink/stringWidth.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { count } from '../../utils/array.js'
import { logForDebugging } from '../../utils/debug.js'
import { toError } from '../../utils/errors.js'
import { truncate } from '../../utils/format.js'
import { logError } from '../../utils/log.js'

// スキル一覧はコンテキストウィンドウの1%（文字数）を使用
export const SKILL_BUDGET_CONTEXT_PERCENT = 0.01
export const CHARS_PER_TOKEN = 4
export const DEFAULT_CHAR_BUDGET = 8_000 // フォールバック: 200k × 4 の1%

// エントリーごとのハードキャップ。一覧は発見のためのもの——Skillツールは
// 呼び出し時にフルコンテンツを読み込むため、冗長なwhenToUse文字列は
// マッチ率を改善せずにターン1のcache_creationトークンを無駄にする。
// バンドルされたエントリーを含む全エントリーに適用。
// キャップはコアユースケースを保持するのに十分な大きさ。
export const MAX_LISTING_DESC_CHARS = 250

export function getCharBudget(contextWindowTokens?: number): number {
  if (Number(process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET)) {
    return Number(process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET)
  }
  if (contextWindowTokens) {
    return Math.floor(
      contextWindowTokens * CHARS_PER_TOKEN * SKILL_BUDGET_CONTEXT_PERCENT,
    )
  }
  return DEFAULT_CHAR_BUDGET
}

function getCommandDescription(cmd: Command): string {
  const desc = cmd.whenToUse
    ? `${cmd.description} - ${cmd.whenToUse}`
    : cmd.description
  return desc.length > MAX_LISTING_DESC_CHARS
    ? desc.slice(0, MAX_LISTING_DESC_CHARS - 1) + '\u2026'
    : desc
}

function formatCommandDescription(cmd: Command): string {
  // デバッグ: プラグインスキルでuserFacingNameがcmd.nameと異なる場合にログ
  const displayName = getCommandName(cmd)
  if (
    cmd.name !== displayName &&
    cmd.type === 'prompt' &&
    cmd.source === 'plugin'
  ) {
    logForDebugging(
      `Skill prompt: showing "${cmd.name}" (userFacingName="${displayName}")`,
    )
  }

  return `- ${cmd.name}: ${getCommandDescription(cmd)}`
}

const MIN_DESC_LENGTH = 20

export function formatCommandsWithinBudget(
  commands: Command[],
  contextWindowTokens?: number,
): string {
  if (commands.length === 0) return ''

  const budget = getCharBudget(contextWindowTokens)

  // まずフル説明で試みる
  const fullEntries = commands.map(cmd => ({
    cmd,
    full: formatCommandDescription(cmd),
  }))
  // join('\n') はN個のエントリーに対してN-1個の改行を生成
  const fullTotal =
    fullEntries.reduce((sum, e) => sum + stringWidth(e.full), 0) +
    (fullEntries.length - 1)

  if (fullTotal <= budget) {
    return fullEntries.map(e => e.full).join('\n')
  }

  // バンドルされたもの（切り詰めなし）とそれ以外に分割
  const bundledIndices = new Set<number>()
  const restCommands: Command[] = []
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!
    if (cmd.type === 'prompt' && cmd.source === 'bundled') {
      bundledIndices.add(i)
    } else {
      restCommands.push(cmd)
    }
  }

  // バンドルされたスキルが使用するスペースを計算（フル説明、常に保持）
  const bundledChars = fullEntries.reduce(
    (sum, e, i) =>
      bundledIndices.has(i) ? sum + stringWidth(e.full) + 1 : sum,
    0,
  )
  const remainingBudget = budget - bundledChars

  // バンドルされていないコマンドの最大説明長を計算
  if (restCommands.length === 0) {
    return fullEntries.map(e => e.full).join('\n')
  }

  const restNameOverhead =
    restCommands.reduce((sum, cmd) => sum + stringWidth(cmd.name) + 4, 0) +
    (restCommands.length - 1)
  const availableForDescs = remainingBudget - restNameOverhead
  const maxDescLen = Math.floor(availableForDescs / restCommands.length)

  if (maxDescLen < MIN_DESC_LENGTH) {
    // 極端なケース: バンドルされていないものは名前のみ、バンドルされたものは説明を保持
    if (process.env.USER_TYPE === 'ant') {
      logEvent('tengu_skill_descriptions_truncated', {
        skill_count: commands.length,
        budget,
        full_total: fullTotal,
        truncation_mode:
          'names_only' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        max_desc_length: maxDescLen,
        bundled_count: bundledIndices.size,
        bundled_chars: bundledChars,
      })
    }
    return commands
      .map((cmd, i) =>
        bundledIndices.has(i) ? fullEntries[i]!.full : `- ${cmd.name}`,
      )
      .join('\n')
  }

  // バンドルされていないものの説明をバジェット内に収まるよう切り詰める
  const truncatedCount = count(
    restCommands,
    cmd => stringWidth(getCommandDescription(cmd)) > maxDescLen,
  )
  if (process.env.USER_TYPE === 'ant') {
    logEvent('tengu_skill_descriptions_truncated', {
      skill_count: commands.length,
      budget,
      full_total: fullTotal,
      truncation_mode:
        'description_trimmed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      max_desc_length: maxDescLen,
      truncated_count: truncatedCount,
      // このプロンプトに含まれるバンドルされたスキルの数（disableModelInvocationのスキルを除く）
      bundled_count: bundledIndices.size,
      bundled_chars: bundledChars,
    })
  }
  return commands
    .map((cmd, i) => {
      // バンドルされたスキルは常にフル説明を使用
      if (bundledIndices.has(i)) return fullEntries[i]!.full
      const description = getCommandDescription(cmd)
      return `- ${cmd.name}: ${truncate(description, maxDescLen)}`
    })
    .join('\n')
}

export const getPrompt = memoize(async (_cwd: string): Promise<string> => {
  return `メインの会話内でスキルを実行する

ユーザーがタスクの実行を依頼した場合、利用可能なスキルに一致するものがないか確認すること。スキルは特化した機能とドメイン知識を提供する。

ユーザーが「スラッシュコマンド」または「/<何か>」（例: "/commit", "/review-pr"）と言及した場合、それはスキルを指している。このツールを使って呼び出すこと。

呼び出し方:
- スキル名とオプションの引数でこのツールを使用する
- 例:
  - \`skill: "pdf"\` - pdfスキルを呼び出す
  - \`skill: "commit", args: "-m 'Fix bug'"\` - 引数付きで呼び出す
  - \`skill: "review-pr", args: "123"\` - 引数付きで呼び出す
  - \`skill: "ms-office-suite:pdf"\` - 完全修飾名で呼び出す

重要:
- 利用可能なスキルは会話のsystem-reminderメッセージに一覧表示される
- スキルがユーザーのリクエストに一致する場合、これは必須要件: タスクについて他の応答を生成する前に関連するSkillツールを呼び出すこと
- スキルについて言及するだけでこのツールを実際に呼び出さないことは絶対にしないこと
- すでに実行中のスキルを呼び出さないこと
- 組み込みCLIコマンド（/help、/clear等）にはこのツールを使用しないこと
- 現在の会話ターンで <${COMMAND_NAME_TAG}> タグが表示されている場合、スキルはすでに読み込まれている——このツールを再度呼び出す代わりに指示に直接従うこと
`
})

export async function getSkillToolInfo(cwd: string): Promise<{
  totalCommands: number
  includedCommands: number
}> {
  const agentCommands = await getSkillToolCommands(cwd)

  return {
    totalCommands: agentCommands.length,
    includedCommands: agentCommands.length,
  }
}

// SkillToolプロンプトに含まれるコマンドを返す。
// 全コマンドは常に含まれる（説明はバジェットに収まるよう切り詰められることがある）。
// analyzeContextがスキルトークンをカウントするために使用される。
export function getLimitedSkillToolCommands(cwd: string): Promise<Command[]> {
  return getSkillToolCommands(cwd)
}

export function clearPromptCache(): void {
  getPrompt.cache?.clear?.()
}

export async function getSkillInfo(cwd: string): Promise<{
  totalSkills: number
  includedSkills: number
}> {
  try {
    const skills = await getSlashCommandToolSkills(cwd)

    return {
      totalSkills: skills.length,
      includedSkills: skills.length,
    }
  } catch (error) {
    logError(toError(error))

    // 例外をスローせずにゼロを返す——呼び出し元がどう処理するか判断する
    return {
      totalSkills: 0,
      includedSkills: 0,
    }
  }
}
