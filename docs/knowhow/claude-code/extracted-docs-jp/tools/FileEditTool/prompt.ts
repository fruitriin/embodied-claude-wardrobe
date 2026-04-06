// 原文: tools/FileEditTool/prompt.ts
import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- 編集前に会話の中で \`${FILE_READ_TOOL_NAME}\` ツールを少なくとも1回使用しなければならない。ファイルを読まずに編集しようとするとこのツールはエラーになる。 `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? '行番号 + タブ'
    : 'スペース + 行番号 + 矢印'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- 明確に一意となる最小の old_string を使用すること — 通常は隣接する2〜4行で十分。対象を一意に特定するために10行以上のコンテキストを含めることは避けること。`
      : ''
  return `ファイル内の文字列を正確に置換する。

使用方法:${getPreReadInstruction()}
- Read ツールの出力からテキストを編集する際は、行番号のプレフィックスの後に表示される正確なインデント (タブ/スペース) を保持すること。行番号プレフィックスのフォーマット: ${prefixFormat}。その後のすべてがマッチングすべき実際のファイルコンテンツ。old_string や new_string に行番号プレフィックスの一部を含めないこと。
- コードベース内の既存ファイルの編集を常に優先する。明示的に必要でない限り新しいファイルを作成しないこと。
- ユーザーが明示的に求めた場合のみ絵文字を使用する。求められない限りファイルに絵文字を追加しないこと。
- \`old_string\` がファイル内で一意でない場合、編集は失敗する。一意にするためにより多くの前後のコンテキストを含む文字列を提供するか、\`old_string\` のすべてのインスタンスを変更するために \`replace_all\` を使用すること。${minimalUniquenessHint}
- ファイル全体で文字列の置換とリネームには \`replace_all\` を使用する。このパラメーターは変数名のリネームなどに便利。`
}
