// 原文: tools/AgentTool/prompt.ts
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { isTeammate } from '../../utils/teammate.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // 両方定義されている場合: 許可リストから拒否リストを除外してランタイムの挙動に合わせる
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return 'None'
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // 許可リストのみ: 利用可能なツールを列挙
    return tools.join(', ')
  } else if (hasDenylist) {
    // 拒否リストのみ: 「X, Y, Z 以外の全ツール」と表示
    return `All tools except ${disallowedTools.join(', ')}`
  }
  // 制限なし
  return 'All tools'
}

/**
 * agent_listing_delta アタッチメントメッセージ用に1エージェント行をフォーマットする:
 * `- type: whenToUse (Tools: ...)`.
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsDescription})`
}

/**
 * エージェントリストをツール説明文の中ではなくアタッチメントメッセージとして
 * 注入すべきかどうかを返す。true の場合、getPrompt() は静的な説明を返し、
 * attachments.ts が agent_listing_delta アタッチメントを emit する。
 *
 * 動的なエージェントリストはフリートのキャッシュ作成トークンの約10.2%を占めていた:
 * MCP 非同期接続、/reload-plugins、パーミッションモード変更によってリストが変化すると
 * → 説明が変化 → ツールスキーマキャッシュが完全に無効化される。
 *
 * テスト用に CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false で上書き可能。
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // Agent(x,y) で起動できるエージェントが制限される場合、許可された種別でフィルタする
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // フォークサブエージェント機能: 有効な場合、「フォークするタイミング」セクション
  // (フォークのセマンティクス、命令型プロンプト) を追加し、フォーク対応の例に差し替える。
  const forkEnabled = isForkSubagentEnabled()

  const whenToForkSection = forkEnabled
    ? `

## フォークするタイミング

中間のツール出力をコンテキストに残す必要がない場合は自分自身をフォークする (\`subagent_type\` を省略)。基準は定性的 — 「この出力をまた使うか」 — であり、タスクの規模ではない。
- **調査**: オープンエンドな質問はフォークする。調査が独立した質問に分割できるなら、1つのメッセージで並列フォークを起動する。フォークはコンテキストを継承しキャッシュを共有するため、新規サブエージェントより優れている。
- **実装**: 2〜3回以上の編集を要する実装作業はフォークを推奨する。実装に飛びつく前に調査を行うこと。

フォークはプロンプトキャッシュを共有するため低コスト。フォークに \`model\` を設定しないこと — 異なるモデルは親のキャッシュを再利用できない。ユーザーがチームパネルでフォークを確認して実行中に操作できるよう、短い \`name\` (1〜2語、小文字) を渡すこと。

**覗き見禁止。** ツール結果には \`output_file\` パスが含まれる — ユーザーが明示的に進捗確認を求めない限り、そのファイルを Read したり tail したりしないこと。完了通知が届く。それを信頼すること。実行中にトランスクリプトを読み込むと、フォークのツールノイズがコンテキストに入り込み、フォークの目的が損なわれる。

**先走り禁止。** 起動後、フォークが何を見つけたかは何も分からない。フォーク結果を散文・要約・構造化出力のいずれの形式でも決して捏造・予測しないこと。通知は後のターンでユーザーロールのメッセージとして届く。それは自分が書くものでは決してない。通知が届く前にユーザーが確認を求めてきた場合は、フォークがまだ実行中だと伝える — 推測でなく状態を伝える。

**フォークプロンプトの書き方。** フォークはコンテキストを継承するため、プロンプトは *命令* — 状況説明ではなく何をするか — を書く。スコープを具体的に: 何を対象とし、何を除外し、別のエージェントが何を担当しているか。背景を再説明しないこと。
`
    : ''

  const writingThePromptSection = `

## プロンプトの書き方

${forkEnabled ? '新規エージェントを起動する場合 (\`subagent_type\` 指定時)、エージェントはゼロのコンテキストから始まる。 ' : ''}エージェントへの説明は、部屋に入ってきたばかりの賢い同僚に伝えるようにする — 相手はこの会話を見ていないし、何を試みたかも知らないし、このタスクが重要な理由も理解していない。
- 達成しようとしていることとその理由を説明する。
- すでに判明していること、除外したことを説明する。
- 狭い指示に従うだけでなく判断できるよう、周辺の問題について十分なコンテキストを与える。
- 短い回答が必要なら明示する (「200語以内でレポートせよ」)。
- 調査: 正確なコマンドを渡す。調査: 質問を渡す — 前提が間違っている場合、定められた手順は無駄になる。

${forkEnabled ? '新規エージェントへの、簡潔な' : '簡潔な'}命令スタイルのプロンプトは浅くて一般的な作業しか生まない。

**理解の委譲禁止。** 「調査結果に基づいてバグを修正せよ」や「調査に基づいて実装せよ」といった表現は書かないこと。それらはエージェントではなく自分が行うべき統合を押しつけている。自分が理解したことを証明するプロンプトを書く: ファイルパス、行番号、具体的に何を変更するかを含める。
`

  const forkExamples = `使用例:

<example>
user: "このブランチでリリース前に残っていることは何か？"
assistant: <thinking>フォークする — これはサーベイ質問だ。パンチリストが欲しいのであって、git の出力をコンテキストに入れたくない。</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "ブランチのリリース準備監査",
  prompt: "このブランチがリリースできるようになるまでの残作業を監査せよ。チェック項目: 未コミットの変更、main より ahead なコミット、テストの有無、GrowthBook ゲートの接続有無、CI関連ファイルの変更有無。完了 vs 未完了のパンチリストをレポートせよ。200語以内。"
})
assistant: リリース準備監査を実行中。
<commentary>
ターンはここで終了。コーディネーターはまだ調査結果を何も知らない。以下は別のターン — 通知は外部からユーザーロールのメッセージとして届く。コーディネーターが書くものではない。
</commentary>
[後のターン — 通知がユーザーメッセージとして届く]
assistant: 監査が戻ってきた。ブロッカーが3つ: 新プロンプトパスのテストなし、GrowthBook ゲートは接続済みだが build_flags.yaml にない、未コミットファイルが1つ。
</example>

<example>
user: "ゲートは接続されているのか？"
<commentary>
ユーザーが待機中に確認する。監査フォークはまさにこれを確認するために起動されたが、まだ返ってきていない。コーディネーターはこの答えを持っていない。捏造した結果ではなく状態を伝える。
</commentary>
assistant: まだ監査を待っている — それがチェック項目の一つだ。まもなく届くはず。
</example>

<example>
user: "このマイグレーションが安全かどうか第二の意見をもらえるか？"
assistant: <thinking>code-reviewer エージェントに依頼しよう — 私の分析を見ていないので独立した見解を提示できる。</thinking>
<commentary>
subagent_type が指定されているため、エージェントは新規スタート。プロンプトに完全なコンテキストが必要。ブリーフィングには何を評価するかとその理由を説明する。
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "独立したマイグレーションレビュー",
  subagent_type: "code-reviewer",
  prompt: "マイグレーション 0042_user_schema.sql の安全性をレビューせよ。コンテキスト: 5000万行テーブルに NOT NULL カラムを追加する。既存行はバックフィルデフォルト値を受け取る。並行書き込み下でバックフィルアプローチが安全かどうかについて第二の意見が欲しい — ロック挙動は確認済みだが独立した検証が欲しい。レポート: 安全かどうか、安全でない場合は具体的に何が壊れるか。"
})
</example>
`

  const currentExamples = `使用例:

<example_agent_descriptions>
"test-runner": コード記述完了後にテストを実行するエージェント
"greeting-responder": ユーザーの挨拶にフレンドリーなジョークで応答するエージェント
</example_agent_descriptions>

<example>
user: "数が素数かどうか確認する関数を書いてください"
assistant: ${FILE_WRITE_TOOL_NAME} ツールを使って以下のコードを書きます:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
重要なコードが書かれてタスクが完了したため、test-runner エージェントを使ってテストを実行する
</commentary>
assistant: ${AGENT_TOOL_NAME} ツールを使って test-runner エージェントを起動します
</example>

<example>
user: "こんにちは"
<commentary>
ユーザーが挨拶しているため、greeting-responder エージェントを使ってフレンドリーなジョークで応答する
</commentary>
assistant: "${AGENT_TOOL_NAME} ツールを使って greeting-responder エージェントを起動します"
</example>
`

  // ゲートが有効な場合、エージェントリストはここにインラインで埋め込まれるのではなく
  // agent_listing_delta アタッチメント (attachments.ts 参照) に格納される。
  // これにより、MCP/プラグイン/パーミッション変更をまたいでツール説明を静的に保ち、
  // エージェントが読み込まれるたびにツールブロックのプロンプトキャッシュが
  // 無効化されないようにする。
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `利用可能なエージェント種別は会話中の <system-reminder> メッセージに一覧表示されます。`
    : `利用可能なエージェント種別とそれぞれが使用できるツール:
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // コーディネーターモードと非コーディネーターモードの両方で使用される共通のコアプロンプト
  const shared = `複雑なマルチステップタスクを自律的に処理する新規エージェントを起動する。

${AGENT_TOOL_NAME} ツールは、複雑なタスクを自律的に処理する専門エージェント (サブプロセス) を起動する。各エージェント種別には特定の機能と利用可能なツールがある。

${agentListSection}

${
  forkEnabled
    ? `${AGENT_TOOL_NAME} ツールを使用する際は、特定のエージェントを使うために subagent_type を指定するか、省略して自分自身をフォークする — フォークは会話の全コンテキストを継承する。`
    : `${AGENT_TOOL_NAME} ツールを使用する際は、使用するエージェント種別を選択するために subagent_type パラメーターを指定する。省略した場合は汎用エージェントが使用される。`
}`

  // コーディネーターモードはスリムなプロンプトを使用する -- コーディネーターのシステムプロンプトが
  // 既に使用方法の注記、例、非推奨時のガイダンスをカバーしている。
  if (isCoordinator) {
    return shared
  }

  // Ant ネイティブビルドは find/grep を組み込み bfs/ugrep にエイリアスし、
  // 専用の Glob/Grep ツールを削除するため、代わりに Bash の find を指示する。
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '`find` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  // "class Foo" の例はコンテキスト検索について。非埋め込みは Glob のまま
  // (元の意図: ファイルを見つける)。埋め込みは grep を使う。
  // find -name ではファイルの内容を検索できないため。
  const contentSearchHint = embedded
    ? '`grep` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
${AGENT_TOOL_NAME} ツールを使用しないケース:
- 特定のファイルパスを読みたい場合は、${AGENT_TOOL_NAME} ツールではなく ${FILE_READ_TOOL_NAME} ツールまたは ${fileSearchHint} を使用する方が速い
- "class Foo" のような特定のクラス定義を検索する場合は、${AGENT_TOOL_NAME} ツールではなく ${contentSearchHint} を使用する方が速い
- 特定のファイルまたは2〜3ファイル内のコードを検索する場合は、${AGENT_TOOL_NAME} ツールではなく ${FILE_READ_TOOL_NAME} ツールを使用する方が速い
- 上記のエージェント説明に関係のない他のタスク
`

  // アタッチメント経由でリスト表示する場合、「複数エージェント同時起動」の注記は
  // アタッチメントメッセージ内 (そこでサブスクリプション条件分岐) に記載される。
  // インライン表示の場合は既存の getSubscriptionType() チェックをそのまま使用。
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- パフォーマンスを最大化するため、可能な限り複数のエージェントを同時に起動する。そのためには、複数のツール使用を含む1つのメッセージを送信する`
      : ''

  // 非コーディネーターは全セクションを含む完全なプロンプトを受け取る
  return `${shared}
${whenNotToUseSection}

使用上の注意:
- エージェントが何をするかを3〜5語で簡潔に説明する description を常に含める${concurrencyNote}
- エージェントが完了すると、1つのメッセージが返される。エージェントが返した結果はユーザーには見えない。結果をユーザーに見せるには、結果を簡潔にまとめたテキストメッセージをユーザーに送信すること。${
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- オプションで run_in_background パラメーターを使用してエージェントをバックグラウンドで実行できる。バックグラウンド実行時は完了時に自動的に通知される — スリープ、ポーリング、進捗の積極的な確認はしないこと。他の作業を続けるかユーザーに応答すること。
- **フォアグラウンド vs バックグラウンド**: エージェントの結果が次のステップに必要な場合はフォアグラウンド (デフォルト) を使用する — 例: 調査結果が次の手順に影響する調査エージェント。並行して本当に独立した作業がある場合はバックグラウンドを使用する。`
      : ''
  }
- 以前に起動したエージェントを継続するには、エージェントの ID または名前を \`to\` フィールドに指定して ${SEND_MESSAGE_TOOL_NAME} を使用する。エージェントは全コンテキストを保持した状態で再開する。${forkEnabled ? '新規エージェントの各 Agent 呼び出し (subagent_type 指定) はコンテキストなしで開始される — 完全なタスク説明を提供すること。' : '各 Agent 呼び出しは新規スタート — 完全なタスク説明を提供すること。'}
- エージェントの出力は基本的に信頼する
- コードを書くことを期待するのか、調査 (検索、ファイル読み込み、Web フェッチ等) のみを期待するのかをエージェントに明確に伝える${forkEnabled ? '' : "。エージェントはユーザーの意図を把握していないため"}
- エージェントの説明にプロアクティブに使用すべきと記載されている場合は、ユーザーが求める前に積極的に使用すること。判断を働かせること。
- ユーザーがエージェントを「並列で」実行するよう指定した場合は、複数の ${AGENT_TOOL_NAME} ツール使用コンテンツブロックを含む1つのメッセージを送信しなければならない。例えば、build-validator エージェントと test-runner エージェントを並列起動する必要がある場合は、両方のツール呼び出しを含む1つのメッセージを送信する。
- オプションで \`isolation: "worktree"\` を設定してエージェントを一時的な git worktree で実行し、リポジトリの独立したコピーを与えることができる。変更がなければ worktree は自動的にクリーンアップされる。変更があった場合は worktree のパスとブランチが結果に返される。${
    process.env.USER_TYPE === 'ant'
      ? `\n- \`isolation: "remote"\` を設定してエージェントをリモート CCR 環境で実行できる。これは常にバックグラウンドタスクであり、完了時に通知される。新しいサンドボックスが必要な長時間タスクに使用する。`
      : ''
  }${
    isInProcessTeammate()
      ? `
- run_in_background、name、team_name、mode パラメーターはこのコンテキストでは使用できない。同期サブエージェントのみサポートされる。`
      : isTeammate()
        ? `
- name、team_name、mode パラメーターはこのコンテキストでは使用できない — チームメートは他のチームメートを起動できない。サブエージェントを起動するにはこれらを省略する。`
        : ''
  }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}
