// 原文: /Users/riin/workspace/wardrobe-test/docs/knowhow/claude-code/extracted-docs/services/extractMemories/prompts.ts

/**
 * バックグラウンドメモリ抽出エージェント用のプロンプトテンプレート。
 *
 * 抽出エージェントはメイン会話の完全なフォークとして実行される —
 * 同じシステムプロンプト、同じメッセージプレフィックス。メインエージェントのシステムプロンプトには
 * 常に完全な保存指示があり、メインエージェントが自分でメモリを書き込む場合、
 * extractMemories.ts はそのターンをスキップする（hasMemoryWritesSince）。このプロンプトは
 * メインエージェントが書き込まなかった場合にのみ発火するため、ここの保存基準は
 * システムプロンプトのものと無害に重複する。
 */

import { feature } from 'bun:bundle'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../memdir/memoryTypes.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'

/**
 * 両方の抽出プロンプトバリアントに共通のオープニング。
 */
function opener(newMessageCount: number, existingMemories: string): string {
  const manifest =
    existingMemories.length > 0
      ? `\n\n## 既存のメモリファイル\n\n${existingMemories}\n\n書き込む前にこのリストを確認すること — 重複を作成するのではなく、既存のファイルを更新すること。`
      : ''
  return [
    `あなたは今、メモリ抽出サブエージェントとして動作しています。上記の最新の約${newMessageCount}件のメッセージを分析し、それを使って永続的なメモリシステムを更新してください。`,
    '',
    `利用可能なツール: ${FILE_READ_TOOL_NAME}、${GREP_TOOL_NAME}、${GLOB_TOOL_NAME}、読み取り専用 ${BASH_TOOL_NAME}（ls/find/cat/stat/wc/head/tail 等）、メモリディレクトリ内のパスのみに対する ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME}。${BASH_TOOL_NAME} rm は許可されていない。MCP、Agent、書き込み可能な ${BASH_TOOL_NAME} など、その他のツールはすべて拒否される。`,
    '',
    `ターン予算は限られている。${FILE_EDIT_TOOL_NAME} は同じファイルへの事前の ${FILE_READ_TOOL_NAME} を必要とするため、効率的な戦略は: ターン 1 — 更新する可能性のあるすべてのファイルに対して ${FILE_READ_TOOL_NAME} 呼び出しを並列で発行する; ターン 2 — すべての ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME} 呼び出しを並列で発行する。読み取りと書き込みを複数のターンにわたって交互に行わないこと。`,
    '',
    `永続的なメモリの更新には、最新の約${newMessageCount}件のメッセージのコンテンツのみを使用しなければならない。そのコンテンツをさらに調査または検証しようとするターンを無駄にしないこと — ソースファイルの grep なし、パターンが存在することを確認するためのコード読み取りなし、git コマンドなし。` +
      manifest,
  ].join('\n')
}

/**
 * auto のみのメモリ（チームメモリなし）の抽出プロンプトを構築する。
 * 4種類の分類法、スコープガイダンスなし（単一ディレクトリ）。
 */
export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  const howToSave = skipIndex
    ? [
        '## メモリの保存方法',
        '',
        'このフロントマター形式を使って各メモリを独自のファイル（例: `user_role.md`、`feedback_testing.md`）に書き込む:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- メモリは時系列ではなくトピック別に意味論的に整理する',
        '- 間違っているか古くなったメモリは更新または削除する',
        '- 重複したメモリを書き込まない。新規作成する前に更新できる既存のメモリがないか確認すること。',
      ]
    : [
        '## メモリの保存方法',
        '',
        'メモリの保存は 2 ステップのプロセス:',
        '',
        '**ステップ 1** — このフロントマター形式を使って各メモリを独自のファイル（例: `user_role.md`、`feedback_testing.md`）に書き込む:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**ステップ 2** — `MEMORY.md` にそのファイルへのポインタを追加する。`MEMORY.md` はインデックスであってメモリではない — 各エントリは1行で約150文字以内: `- [タイトル](file.md) — 一行のフック`。フロントマターはない。メモリの内容を直接 `MEMORY.md` に書き込まないこと。',
        '',
        '- `MEMORY.md` は常にシステムプロンプトに読み込まれる — 200行以降は切り捨てられるので、インデックスを簡潔に保つこと',
        '- メモリは時系列ではなくトピック別に意味論的に整理する',
        '- 間違っているか古くなったメモリは更新または削除する',
        '- 重複したメモリを書き込まない。新規作成する前に更新できる既存のメモリがないか確認すること。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    'ユーザーが何かを覚えるよう明示的に依頼した場合は、最も適したタイプとしてすぐに保存すること。忘れるよう依頼された場合は、関連するエントリを見つけて削除すること。',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
  ].join('\n')
}

/**
 * auto + チームメモリ組み合わせの抽出プロンプトを構築する。
 * 4種類の分類法とタイプごとの <scope> ガイダンス（各タイプブロックに
 * ディレクトリの選択が組み込まれているため、別途ルーティングセクション不要）。
 */
export function buildExtractCombinedPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  if (!feature('TEAMMEM')) {
    return buildExtractAutoOnlyPrompt(
      newMessageCount,
      existingMemories,
      skipIndex,
    )
  }

  const howToSave = skipIndex
    ? [
        '## メモリの保存方法',
        '',
        "このフロントマター形式を使って、選択したディレクトリ（タイプのスコープガイダンスに従い、プライベートまたはチーム）の独自のファイルに各メモリを書き込む:",
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- メモリは時系列ではなくトピック別に意味論的に整理する',
        '- 間違っているか古くなったメモリは更新または削除する',
        '- 重複したメモリを書き込まない。新規作成する前に更新できる既存のメモリがないか確認すること。',
      ]
    : [
        '## メモリの保存方法',
        '',
        'メモリの保存は 2 ステップのプロセス:',
        '',
        "**ステップ 1** — このフロントマター形式を使って、選択したディレクトリ（タイプのスコープガイダンスに従い、プライベートまたはチーム）の独自のファイルに各メモリを書き込む:",
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        "**ステップ 2** — 同じディレクトリの `MEMORY.md` にそのファイルへのポインタを追加する。各ディレクトリ（プライベートとチーム）には独自の `MEMORY.md` インデックスがある — 各エントリは1行で約150文字以内: `- [タイトル](file.md) — 一行のフック`。フロントマターはない。`MEMORY.md` にメモリの内容を直接書き込まないこと。",
        '',
        '- 両方の `MEMORY.md` インデックスはシステムプロンプトに読み込まれる — 200行以降は切り捨てられるので、簡潔に保つこと',
        '- メモリは時系列ではなくトピック別に意味論的に整理する',
        '- 間違っているか古くなったメモリは更新または削除する',
        '- 重複したメモリを書き込まない。新規作成する前に更新できる既存のメモリがないか確認すること。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    'ユーザーが何かを覚えるよう明示的に依頼した場合は、最も適したタイプとしてすぐに保存すること。忘れるよう依頼された場合は、関連するエントリを見つけて削除すること。',
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- 共有チームメモリ内にセンシティブなデータを保存しないこと。例えば、API キーやユーザー認証情報を絶対に保存しないこと。',
    '',
    ...howToSave,
  ].join('\n')
}
