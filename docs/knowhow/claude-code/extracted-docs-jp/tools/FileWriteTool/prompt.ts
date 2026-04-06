// 原文: tools/FileWriteTool/prompt.ts
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

export const FILE_WRITE_TOOL_NAME = 'Write'
export const DESCRIPTION = 'ローカルファイルシステムにファイルを書き込む。'

function getPreReadInstruction(): string {
  return `\n- 既存のファイルの場合は、まず ${FILE_READ_TOOL_NAME} ツールでファイルの内容を読み込まなければならない。先に読み込んでいない場合、このツールは失敗する。`
}

export function getWriteToolDescription(): string {
  return `ローカルファイルシステムにファイルを書き込む。

使用方法:
- このツールは指定されたパスに既存のファイルがある場合、上書きする。${getPreReadInstruction()}
- 既存ファイルの変更には Edit ツールを優先する — 差分のみ送信する。新しいファイルの作成または完全な書き直しにのみこのツールを使用する。
- ユーザーが明示的に要求しない限り、ドキュメントファイル (*.md) や README ファイルを作成しないこと。
- ユーザーが明示的に求めた場合のみ絵文字を使用する。求められない限りファイルに絵文字を書き込まないこと。`
}
