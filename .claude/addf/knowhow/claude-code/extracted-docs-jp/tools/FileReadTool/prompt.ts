// 原文: tools/FileReadTool/prompt.ts
import { isPDFSupported } from '../../utils/pdfUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

// 循環依存を避けるためにツール名には文字列定数を使用する
export const FILE_READ_TOOL_NAME = 'Read'

export const FILE_UNCHANGED_STUB =
  '前回の読み込みからファイルに変更なし。この会話内の以前の Read ツール結果のコンテンツが現在も有効 — 再読み込みせずそちらを参照すること。'

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = 'ローカルファイルシステムからファイルを読み込む。'

export const LINE_FORMAT_INSTRUCTION =
  '- 結果は cat -n 形式で返される。行番号は1から始まる'

export const OFFSET_INSTRUCTION_DEFAULT =
  "- オプションで行のオフセットと件数を指定できる (長いファイルに便利)。ただし、これらのパラメーターを指定せずにファイル全体を読むことを推奨する"

export const OFFSET_INSTRUCTION_TARGETED =
  '- 必要なファイルの部分が既に分かっている場合は、その部分のみを読み込むこと。大きなファイルでは重要な場合がある。'

/**
 * Read ツールのプロンプトテンプレートをレンダリングする。呼び出し元 (FileReadTool) が
 * 実行時に計算される部分を提供する。
 */
export function renderPromptTemplate(
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  return `ローカルファイルシステムからファイルを読み込む。このツールを使用して任意のファイルに直接アクセスできる。
このツールはマシン上のすべてのファイルを読み込めると仮定すること。ユーザーがファイルパスを指定した場合、そのパスは有効と仮定する。存在しないファイルを読み込んでも問題ない。その場合はエラーが返される。

使用方法:
- file_path パラメーターは相対パスではなく絶対パスでなければならない
- デフォルトではファイルの先頭から最大 ${MAX_LINES_TO_READ} 行を読み込む${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- このツールは Claude Code が画像 (PNG、JPG 等) を読み込めるようにする。画像ファイルを読み込む際は、Claude Code がマルチモーダル LLM であるため内容が視覚的に表示される。${
    isPDFSupported()
      ? '\n- このツールは PDF ファイル (.pdf) を読み込める。大きな PDF (10ページ超) の場合は、特定のページ範囲を読み込むために pages パラメーターを必ず指定すること (例: pages: "1-5")。pages パラメーターなしで大きな PDF を読み込もうとすると失敗する。1リクエストあたり最大20ページ。'
      : ''
  }
- このツールは Jupyter ノートブック (.ipynb ファイル) を読み込み、コード、テキスト、視覚化を組み合わせてすべてのセルとその出力を返す。
- このツールはファイルのみ読み込める。ディレクトリは読み込めない。ディレクトリを読み込むには ${BASH_TOOL_NAME} ツールで ls コマンドを使用すること。
- スクリーンショットを読み込むよう求められることが頻繁にある。ユーザーがスクリーンショットのパスを提供した場合は、常にこのツールを使ってそのパスのファイルを表示すること。このツールはすべての一時ファイルパスで動作する。
- 存在するが内容が空のファイルを読み込んだ場合、ファイルの内容の代わりにシステムのリマインダー警告が表示される。`
}
