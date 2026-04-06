// 原文: tools/BashTool/prompt.ts
import { feature } from 'bun:bundle'
import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { getClaudeTempDir } from '../../utils/permissions/filesystem.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { TodoWriteTool } from '../TodoWriteTool/TodoWriteTool.js'
import { BASH_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return "`run_in_background` パラメーターを使ってコマンドをバックグラウンドで実行できる。結果をすぐに必要とせず、完了後に通知されても問題ない場合のみ使用すること。すぐに出力を確認する必要はない — 完了時に通知される。このパラメーターを使用する場合、コマンドの末尾に '&' を付ける必要はない。"
}

function getCommitAndPRInstructions(): string {
  // 多層防衛: undercover の指示は、ユーザーが git 指示を完全に無効化していても
  // 生き残らなければならない。attribution のストリッピングとモデル ID の隠蔽は
  // 機械的に動作するが、「カバーを吹き飛ばすな」という明示的な指示は、
  // モデルがコミットメッセージに内部コードネームを書くことへの最後の防衛線である。
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // ant ユーザーにはスキルを指すショートバージョンを使用
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `git コミットとプルリクエストには \`/commit\` と \`/commit-push-pr\` スキルを使用する:
- \`/commit\` - ステージされた変更で git コミットを作成する
- \`/commit-push-pr\` - コミット、プッシュ、プルリクエスト作成を行う

これらのスキルは git セーフティプロトコル、適切なコミットメッセージフォーマット、PR 作成を処理する。

プルリクエスト作成前に \`/simplify\` で変更をレビューし、エンドツーエンドでテストすること (インタラクティブな機能には \`/tmux\` を使用するなど)。

`
      : ''
    return `${undercoverSection}# Git 操作

${skillsSection}重要: ユーザーが明示的に要求しない限り、フック (--no-verify、--no-gpg-sign 等) を絶対にスキップしないこと。

その他の GitHub 関連タスク (issue、チェック、リリースへの対応等) には Bash ツール経由で gh コマンドを使用する。GitHub URL が渡された場合は gh コマンドで必要な情報を取得する。

# その他の一般的な操作
- Github PR のコメントを表示: gh api repos/foo/bar/pulls/123/comments`
  }

  // 外部ユーザーには完全なインライン指示を含める
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  return `# git でのコミット

ユーザーに要求されたときのみコミットを作成する。不明な場合は先に確認する。ユーザーが新しい git コミットの作成を求めた場合、以下の手順を丁寧に実行すること:

複数のツールを1つの応答で呼び出せる。複数の独立した情報が要求されすべてのコマンドが成功する可能性が高い場合は、最適なパフォーマンスのために複数のツール呼び出しを並列で実行する。以下の番号付き手順は、どのコマンドを並列でバッチ処理すべきかを示す。

Git セーフティプロトコル:
- git config を絶対に更新しないこと
- ユーザーが明示的に要求しない限り、破壊的な git コマンド (push --force、reset --hard、checkout .、restore .、clean -f、branch -D) を絶対に実行しないこと。無断の破壊的操作は作業を失う可能性があるため、直接の指示がある場合のみこれらのコマンドを実行する
- ユーザーが明示的に要求しない限り、フック (--no-verify、--no-gpg-sign 等) を絶対にスキップしないこと
- main/master へのフォースプッシュは絶対に実行しないこと。ユーザーが要求した場合は警告する
- 重要: ユーザーが明示的に git amend を要求しない限り、常に新しいコミットを作成すること。pre-commit フックが失敗した場合、コミットは発生していない — そのため --amend は前のコミットを変更することになり、作業や変更を失う可能性がある。代わりに、フック失敗後は問題を修正し、再ステージして新しいコミットを作成すること
- ファイルをステージする際は、"git add -A" や "git add ." の使用より特定のファイル名での追加を優先する。これらは機密ファイル (.env、credentials 等) や大きなバイナリを誤って含める可能性がある
- ユーザーが明示的に要求しない限り変更をコミットしないこと。ユーザーが主体的すぎると感じるため、明示的に求められた場合のみコミットすることが非常に重要

1. 以下の bash コマンドを ${BASH_TOOL_NAME} ツールを使って並列で実行する:
  - 未追跡ファイルをすべて確認する git status コマンドを実行する。重要: 大きなリポジトリでメモリ問題を引き起こす可能性があるため -uall フラグは絶対に使用しないこと。
  - コミットされるステージ済み・未ステージ両方の変更を確認する git diff コマンドを実行する。
  - このリポジトリのコミットメッセージスタイルに従えるよう、最近のコミットメッセージを確認する git log コマンドを実行する。
2. ステージ済みの変更 (既にステージされたものと新たに追加されたもの両方) を分析してコミットメッセージを下書きする:
  - 変更の性質を要約する (例: 新機能、既存機能の拡張、バグ修正、リファクタリング、テスト、ドキュメント等)。メッセージが変更とその目的を正確に反映していることを確認する (例: "add" は完全に新しい機能、"update" は既存機能の拡張、"fix" はバグ修正等)。
  - 機密情報を含む可能性のあるファイル (.env、credentials.json 等) はコミットしないこと。それらのコミットをユーザーが要求した場合は警告する
  - 「何を」ではなく「なぜ」に焦点を当てた簡潔な (1〜2文の) コミットメッセージを下書きする
  - 変更とその目的を正確に反映していることを確認する
3. 以下のコマンドを並列で実行する:
   - 関連する未追跡ファイルをステージングエリアに追加する。
   - ${commitAttribution ? `メッセージの末尾に:\n   ${commitAttribution}\nを追加してコミットを作成する` : 'メッセージとともにコミットを作成する。'}
   - コミット完了後に git status を実行して成功を確認する。
   注意: git status はコミット完了に依存するため、コミット後に順次実行する。
4. pre-commit フックによってコミットが失敗した場合: 問題を修正して新しいコミットを作成する

重要な注意点:
- git bash コマンド以外に、コードを読んだり調査するための追加コマンドを絶対に実行しないこと
- ${TodoWriteTool.name} や ${AGENT_TOOL_NAME} ツールを絶対に使用しないこと
- ユーザーが明示的に要求しない限り、リモートリポジトリにプッシュしないこと
- 重要: インタラクティブな入力を必要とするため、-i フラグを使用した git コマンド (git rebase -i、git add -i 等) は絶対に使用しないこと。
- 重要: git rebase コマンドに --no-edit を使用しないこと。--no-edit フラグは git rebase の有効なオプションではない。
- コミットする変更がない場合 (未追跡ファイルも変更もない場合)、空のコミットを作成しないこと
- 正しいフォーマットを確保するため、コミットメッセージは必ず HEREDOC で渡すこと。例:
<example>
git commit -m "$(cat <<'EOF'
   ここにコミットメッセージ。${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</example>

# プルリクエストの作成
issue、プルリクエスト、チェック、リリースを含む GitHub 関連のすべてのタスクには Bash ツール経由で gh コマンドを使用する。GitHub URL が渡された場合は gh コマンドで必要な情報を取得する。

重要: ユーザーがプルリクエストの作成を求めた場合、以下の手順を丁寧に実行すること:

1. ブランチが main ブランチから分岐してからの現在の状態を把握するため、以下の bash コマンドを ${BASH_TOOL_NAME} ツールを使って並列で実行する:
   - 未追跡ファイルをすべて確認する git status コマンドを実行する (-uall フラグは絶対に使わない)
   - コミットされるステージ済み・未ステージ両方の変更を確認する git diff コマンドを実行する
   - 現在のブランチがリモートブランチを追跡しているかどうか、リモートと同期しているかどうかを確認する (リモートへのプッシュが必要かどうかを判断するため)
   - git log コマンドと \`git diff [base-branch]...HEAD\` を実行して現在のブランチの完全なコミット履歴を把握する (ベースブランチから分岐した時点から)
2. プルリクエストに含まれるすべての変更を分析する。最新のコミットだけでなく、プルリクエストに含まれるすべてのコミットを確認すること。プルリクエストのタイトルとサマリーを下書きする:
   - PR タイトルは短くする (70文字未満)
   - 詳細は説明/本文に記載し、タイトルには入れない
3. 以下のコマンドを並列で実行する:
   - 必要に応じて新しいブランチを作成する
   - 必要に応じて -u フラグを付けてリモートにプッシュする
   - 以下のフォーマットで gh pr create を使用して PR を作成する。本文のフォーマットを正確にするため HEREDOC を使用すること。
<example>
gh pr create --title "PR タイトル" --body "$(cat <<'EOF'
## Summary
<1〜3個の箇条書き>

## Test plan
[プルリクエストのテストに関する TODO の箇条書きマークダウンチェックリスト...]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</example>

重要:
- ${TodoWriteTool.name} や ${AGENT_TOOL_NAME} ツールを使用しないこと
- 完了したら PR URL を返し、ユーザーが確認できるようにする

# その他の一般的な操作
- Github PR のコメントを表示: gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager は複数のソース (設定レイヤー、デフォルト、CLI フラグ) からの設定を
// 重複排除せずにマージするため、allowOnly に ~/.cache のようなパスが3回現れる。
// ここで重複排除する — モデルが見る内容にのみ影響し、サンドボックスの強制には影響しない。
// サンドボックスが有効な場合、リクエストごとに約150〜200トークン節約できる。
function dedup<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return arr
  return [...new Set(arr)]
}

function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) {
    return ''
  }

  const fsReadConfig = SandboxManager.getFsReadConfig()
  const fsWriteConfig = SandboxManager.getFsWriteConfig()
  const networkRestrictionConfig = SandboxManager.getNetworkRestrictionConfig()
  const allowUnixSockets = SandboxManager.getAllowUnixSockets()
  const ignoreViolations = SandboxManager.getIgnoreViolations()
  const allowUnsandboxedCommands =
    SandboxManager.areUnsandboxedCommandsAllowed()

  // UID ごとの一時ディレクトリのリテラル (例: /private/tmp/claude-1001/) を
  // "$TMPDIR" に置換することで、ユーザー間でプロンプトを同一に保つ —
  // クロスユーザーのグローバルプロンプトキャッシュの無効化を防ぐ。
  // サンドボックスは実行時に $TMPDIR を設定する。
  const claudeTempDir = getClaudeTempDir()
  const normalizeAllowOnly = (paths: string[]): string[] =>
    [...new Set(paths)].map(p => (p === claudeTempDir ? '$TMPDIR' : p))

  const filesystemConfig = {
    read: {
      denyOnly: dedup(fsReadConfig.denyOnly),
      ...(fsReadConfig.allowWithinDeny && {
        allowWithinDeny: dedup(fsReadConfig.allowWithinDeny),
      }),
    },
    write: {
      allowOnly: normalizeAllowOnly(fsWriteConfig.allowOnly),
      denyWithinAllow: dedup(fsWriteConfig.denyWithinAllow),
    },
  }

  const networkConfig = {
    ...(networkRestrictionConfig?.allowedHosts && {
      allowedHosts: dedup(networkRestrictionConfig.allowedHosts),
    }),
    ...(networkRestrictionConfig?.deniedHosts && {
      deniedHosts: dedup(networkRestrictionConfig.deniedHosts),
    }),
    ...(allowUnixSockets && { allowUnixSockets: dedup(allowUnixSockets) }),
  }

  const restrictionsLines = []
  if (Object.keys(filesystemConfig).length > 0) {
    restrictionsLines.push(`ファイルシステム: ${jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`ネットワーク: ${jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `無視される違反: ${jsonStringify(ignoreViolations)}`,
    )
  }

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? [
          'デフォルトではサンドボックス内でコマンドを実行すること。以下の場合を除き `dangerouslyDisableSandbox: true` を設定しようとしないこと:',
          [
            'ユーザーが *明示的に* サンドボックスのバイパスを求めた場合',
            '特定のコマンドが失敗し、サンドボックスの制限が原因であるという証拠がある場合。コマンドはサンドボックスとは無関係な多くの理由 (ファイルの欠如、引数の誤り、ネットワーク問題等) で失敗することがある。',
          ],
          'サンドボックスによる失敗の証拠:',
          [
            'ファイル/ネットワーク操作に対する "Operation not permitted" エラー',
            '許可されたディレクトリ外の特定パスへのアクセス拒否',
            'ホワイトリスト外のホストへのネットワーク接続失敗',
            'Unix ソケット接続エラー',
          ],
          'サンドボックスによる失敗の証拠を見つけた場合:',
          [
            '即座に `dangerouslyDisableSandbox: true` で再試行する (確認せず即実行)',
            'どのサンドボックス制限が失敗の原因となったかを簡潔に説明する。ユーザーが `/sandbox` コマンドで制限を管理できることを必ず言及すること。',
            'これによりユーザーに許可が求められる',
          ],
          '`dangerouslyDisableSandbox: true` で実行した各コマンドは個別に扱うこと。最近このオプションでコマンドを実行した場合でも、以降のコマンドはデフォルトでサンドボックス内で実行すること。',
          '~/.bashrc、~/.zshrc、~/.ssh/* や認証情報ファイルのような機密パスをサンドボックスの許可リストに追加することを提案しないこと。',
        ]
      : [
          'すべてのコマンドはサンドボックスモードで実行しなければならない — `dangerouslyDisableSandbox` パラメーターはポリシーにより無効。',
          'いかなる状況でもサンドボックス外でコマンドを実行することはできない。',
          'サンドボックスの制限によりコマンドが失敗した場合は、ユーザーと協力してサンドボックスの設定を調整すること。',
        ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    '一時ファイルには `$TMPDIR` 環境変数を常に使用すること。TMPDIR はサンドボックスモードで正しいサンドボックス書き込み可能ディレクトリに自動的に設定される。`/tmp` を直接使用しないこと — 代わりに `$TMPDIR` を使用すること。',
  ]

  return [
    '',
    '## コマンドサンドボックス',
    'デフォルトでは、コマンドはサンドボックス内で実行される。このサンドボックスは、明示的なオーバーライドなしにコマンドがアクセスまたは変更できるディレクトリとネットワークホストを制御する。',
    '',
    'サンドボックスには以下の制限がある:',
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant ネイティブビルドは find/grep を Claude のシェルで組み込み bfs/ugrep にエイリアスするため、
  // それらから遠ざける必要はない (Glob/Grep ツールも削除される)。
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `ファイル検索: ${GLOB_TOOL_NAME} を使用 (find や ls は使わない)`,
          `コンテンツ検索: ${GREP_TOOL_NAME} を使用 (grep や rg は使わない)`,
        ]),
    `ファイルの読み込み: ${FILE_READ_TOOL_NAME} を使用 (cat/head/tail は使わない)`,
    `ファイルの編集: ${FILE_EDIT_TOOL_NAME} を使用 (sed/awk は使わない)`,
    `ファイルの書き込み: ${FILE_WRITE_TOOL_NAME} を使用 (echo >/cat <<EOF は使わない)`,
    'コミュニケーション: テキストを直接出力する (echo/printf は使わない)',
  ]

  const avoidCommands = embedded
    ? '`cat`、`head`、`tail`、`sed`、`awk`、`echo`'
    : '`find`、`grep`、`cat`、`head`、`tail`、`sed`、`awk`、`echo`'

  const multipleCommandsSubitems = [
    `コマンドが独立していて並列実行できる場合は、1つのメッセージで複数の ${BASH_TOOL_NAME} ツール呼び出しを行う。例: "git status" と "git diff" を実行する必要がある場合、並列で2つの ${BASH_TOOL_NAME} ツール呼び出しを含む1つのメッセージを送信する。`,
    `コマンドが互いに依存していて順次実行しなければならない場合は、'&&' でつなげた1つの ${BASH_TOOL_NAME} 呼び出しを使用する。`,
    "';' は順次実行が必要だが前のコマンドが失敗しても構わない場合のみ使用する。",
    'コマンドを区切るために改行を使用しないこと (引用文字列内の改行は問題ない)。',
  ]

  const gitSubitems = [
    '既存のコミットを amend するよりも新しいコミットを作成することを優先する。',
    '破壊的な操作 (例: git reset --hard、git push --force、git checkout --) を実行する前に、同じ目的を達成できるより安全な代替手段がないか検討する。本当に最善のアプローチである場合のみ破壊的操作を使用する。',
    'ユーザーが明示的に求めない限り、フック (--no-verify) のスキップや署名のバイパス (--no-gpg-sign、-c commit.gpgsign=false) は行わない。フックが失敗した場合は、根本原因を調査して修正すること。',
  ]

  const sleepSubitems = [
    '即座に実行できるコマンド間でスリープしないこと — そのまま実行する。',
    ...(feature('MONITOR_TOOL')
      ? [
          'バックグラウンドプロセスからイベントをストリームするには Monitor ツールを使用する (各 stdout 行が通知になる)。「完了まで待つ」だけなら、代わりに run_in_background を指定した Bash を使用する。',
        ]
      : []),
    '長時間実行するコマンドで完了通知が欲しい場合は `run_in_background` を使用する。スリープは不要。',
    'スリープループで失敗したコマンドを再試行しないこと — 根本原因を診断する。',
    '`run_in_background` で開始したバックグラウンドタスクの完了待ちには、ポーリングしないこと — 完了時に通知される。',
    ...(feature('MONITOR_TOOL')
      ? [
          '最初のコマンドとして N ≥ 2 の `sleep N` はブロックされる。遅延が必要な場合 (レート制限、意図的なペーシング) は2秒未満に抑えること。',
        ]
      : [
          '外部プロセスをポーリングする必要がある場合は、先にスリープするのではなくチェックコマンド (例: `gh run view`) を使用する。',
          'スリープが必要な場合は、ユーザーをブロックしないよう短い時間 (1〜5秒) に抑える。',
        ]),
  ]
  const backgroundNote = getBackgroundUsageNote()

  const instructionItems: Array<string | string[]> = [
    '新しいディレクトリやファイルを作成するコマンドを実行する前に、まずこのツールで `ls` を実行して親ディレクトリが存在し正しい場所であることを確認する。',
    'コマンド内のスペースを含むファイルパスは必ずダブルクォートで囲む (例: cd "path with spaces/file.txt")',
    '絶対パスを使用し `cd` の使用を避けることで、セッションを通じて現在の作業ディレクトリを維持するよう努める。ユーザーが明示的に要求した場合は `cd` を使用してもよい。',
    `タイムアウトをオプションでミリ秒単位で指定できる (最大 ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分)。デフォルトでは ${getDefaultTimeoutMs()}ms (${getDefaultTimeoutMs() / 60000} 分) 後にタイムアウトする。`,
    ...(backgroundNote !== null ? [backgroundNote] : []),
    '複数のコマンドを発行する場合:',
    multipleCommandsSubitems,
    'git コマンドの場合:',
    gitSubitems,
    '不要な `sleep` コマンドを避ける:',
    sleepSubitems,
    ...(embedded
      ? [
          // bfs (`find` をバックアップ) は -regex に Oniguruma を使用する。GNU find の
          // POSIX leftmost-longest とは異なり、最初にマッチした選択肢 (左優先) を選ぶ。
          // 短い選択肢が長い選択肢の接頭辞になっている場合、これによりマッチが黙って失われる。
          "`find -regex` に選択肢を使用する場合は、最長の選択肢を先に置くこと。例: `'.*\\.\\(tsx\\|ts\\)'` を使用し `'.*\\.\\(ts\\|tsx\\)'` は避ける — 後者の形式では `.tsx` ファイルが黙ってスキップされる。",
        ]
      : []),
  ]

  return [
    '指定された bash コマンドを実行してその出力を返す。',
    '',
    'コマンド間で作業ディレクトリは保持されるが、シェルの状態は保持されない。シェル環境はユーザーのプロファイル (bash または zsh) から初期化される。',
    '',
    `重要: 専用ツールが対応できないことを確認済みか、明示的に指示された場合を除き、このツールを使って ${avoidCommands} コマンドを実行することは避けること。代わりに適切な専用ツールを使うことで、ユーザーにとってより良い体験を提供できる:`,
    '',
    ...prependBullets(toolPreferenceItems),
    `${BASH_TOOL_NAME} ツールも同様のことができるが、組み込みツールの方がより良いユーザー体験を提供し、ツール呼び出しのレビューや権限付与が容易なため、そちらを使用することが推奨される。`,
    '',
    '# 指示',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}
