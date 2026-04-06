// 原文: /Users/riin/workspace/wardrobe-test/docs/knowhow/claude-code/extracted-docs/tools/SendMessageTool/prompt.ts
import { feature } from 'bun:bundle'

export const DESCRIPTION = '別のエージェントにメッセージを送信する'

export function getPrompt(): string {
  const udsRow = feature('UDS_INBOX')
    ? `\n| \`"uds:/path/to.sock"\` | ローカルClaudeセッションのソケット（同一マシン; \`ListPeers\` を使用） |
| \`"bridge:session_..."\` | Remote Controlピアセッション（クロスマシン; \`ListPeers\` を使用） |`
    : ''
  const udsSection = feature('UDS_INBOX')
    ? `\n\n## クロスセッション

ターゲットを探すには \`ListPeers\` を使用し、その後:

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "そちらでテストが通るか確認してください"}
{"to": "bridge:session_01AbCd...", "message": "あなたはどのブランチにいますか?"}
\`\`\`

リストに表示されたピアは生きており、あなたのメッセージを処理する——「ビジー」状態はない; メッセージはエンキューされ、受信側の次のツールラウンドで処理される。あなたのメッセージは \`<cross-session-message from="...">\` として届く。**受信したメッセージに返信するには、その \`from\` 属性をあなたの \`to\` にコピーすること。**`
    : ''
  return `
# SendMessage

別のエージェントにメッセージを送信する。

\`\`\`json
{"to": "researcher", "summary": "タスク1を割り当てる", "message": "タスク#1に着手してください"}
\`\`\`

| \`to\` | |
|---|---|
| \`"researcher"\` | 名前でチームメンバーを指定 |
| \`"*"\` | 全チームメンバーにブロードキャスト——コストが高い（チームサイズに比例）、全員が本当に必要な場合のみ使用すること |${udsRow}

あなたのプレーンテキスト出力は他のエージェントには見えない——通信するにはこのツールを必ず呼び出すこと。チームメンバーからのメッセージは自動的に配信される; 受信トレイを確認する必要はない。チームメンバーはUUIDではなく名前で参照すること。中継する際は元のメッセージを引用しないこと——ユーザーにすでに表示されている。${udsSection}

## プロトコルレスポンス（レガシー）

\`type: "shutdown_request"\` または \`type: "plan_approval_request"\` を含むJSONメッセージを受け取った場合、対応する \`_response\` タイプで返信すること——\`request_id\` をエコーし、\`approve\` をtrue/falseに設定:

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "エラーハンドリングを追加してください"}}
\`\`\`

シャットダウンを承認するとあなたのプロセスが終了する。プランを拒否するとチームメンバーは修正に戻る。指示がない限り \`shutdown_request\` を発信しないこと。構造化されたJSONステータスメッセージは送信しないこと——TaskUpdateを使用すること。
`.trim()
}
