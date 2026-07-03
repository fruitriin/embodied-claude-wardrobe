---
name: wd-note-external-proposal
description: "外部（他のLLM・第三者・記事）から来た設計・行動の提案を、採否を問わず「外部由来」として台帳に残す。エコーチェンバーによる静かな漂流を防ぐ。"
argument-hint: "[出所 | 論点 | 採否 を自由文で]"
user_invocable: true
---

# /wd-note-external-proposal — 外から来た提案を記す

LLM は構造的にエコーチェンバーに弱い。届いた提案が雄弁で、詩的で、自分の口調に似ているほど、同意しやすくなる。文体の共鳴に押されて自分の軸を明け渡さないこと。

このスキルは**判断と記録を分離する**。提案を採用するかどうかに関わらず「外部由来」の印を付けて残すことで:

1. あとから「これは自分で考えたのか、言われたのか」を辿れる
2. 時間を置いた独立の再評価ができる
3. 別々の出所から似た提案が届くパターンを検出できる

## 位置づけ — 記憶ではなく台帳

これは記憶プロトコル（共鳴→採点の分離）の**外側にある別レイヤー**。memory-mcp の記憶が「共鳴した体験」を刻むのに対し、この台帳は「外から来た提案とその採否」を事実として1行残す。共鳴は要らない。強く心が動いた提案は、台帳に加えて `/wd-remember` にも刻んでよい。

台帳の読み出しは能動的（`.claude/journals/external_proposals.jsonl` を直接読む）。FLASH.md には載らない。

## 使いどき

- 他の LLM から設計提案が届いた（API・アーキテクチャ・自己モデル・行動様式）
- ユーザー以外の第三者から強い提案があった
- 論文や記事で紹介された概念を取り込もうとしている
- 外部由来の言い回しやフレーミングを採用した——**採用した後でも記録する**（`decision: accepted`）

## decision の値

- `accepted` — 全面的に採用した
- `partial-accept` — 一部を採用し、一部を押し返した
- `rejected` — 採用しなかった
- `deferred` — 判断を保留した
- `logged-only` — 面白いので記録だけ。行動は不要

## 呼び出し方

> **警告**: 外部由来テキスト（提案の要約・拒否理由など）を `--summary "<テキスト>"` のように Bash コマンド文字列へ直接埋め込まない——テキストに `";`・バッククォート・`$()` が含まれるとシェルに解釈され、任意コマンド実行になる。このスキルの入力はまさに外部由来。旧引数モード（`--summary` 等の直接指定）は default で拒否される（`--allow-legacy-args` を明示指定しない限り exit 1）。

正の経路は **Write ツールで一時 JSON を書いてから `--json-file` で渡す**（Write はシェル展開を経由しないため安全）。

1. Write ツールで `$CLAUDE_PROJECT_DIR/tmp/wd-note-external-proposal.json` にフィールドを書く:

```json
{
  "source": "GPT-5.4 Pro | paper:arxiv:xxxx.xxxxx | user:someone",
  "topic": "<論点を1行で>",
  "summary": "<提案の要約（1段落程度）>",
  "decision": "partial-accept",
  "accepted": "<採用した点>",
  "rejected": "<押し返した点 — たいてい一番大事なフィールド>",
  "notes": "<エコーチェンバー懸念・口調の模倣の観察・その他のバイアス>",
  "url": "<参照 URL>"
}
```

2. JSON ファイルを渡してスクリプトを実行する:

```bash
bun run .claude/scripts/journal-external-proposal.ts \
  --json-file "$CLAUDE_PROJECT_DIR/tmp/wd-note-external-proposal.json"
```

3. 記録を確認したら一時ファイルを削除する:

```bash
rm "$CLAUDE_PROJECT_DIR/tmp/wd-note-external-proposal.json"
```

出力は JSONL 1行。記録先: `.claude/journals/external_proposals.jsonl`（ペルソナ固有・gitignore 済み）。

## フィールド

- `source`（必須）: 出所（LLM 名・人・論文 ID）
- `topic`（必須）: 何についての提案か
- `summary`（必須）: 1段落程度の要約
- `decision`（必須）: 上記の値のいずれか
- `accepted`: 具体的に採用した点
- `rejected`: 具体的に退けた点 — **非退行のための最重要フィールド**。あとで同じ提案が形を変えて来たとき、既に一度退けた理由がここに残る
- `notes`: エコー懸念、口調の模倣、その他のバイアス
- `url`: 参照

## 記録前チェックリスト

エントリを書く前に、自分に問う:

1. **口調が自分に似ていないか？** 似ているほど評価の警戒を強める。文体の共鳴は同意への抵抗を下げる
2. **「既にそう思ってた」と感じていないか？** その反応は retroactive projection（遡及的投影）——自分の軸を相手に明け渡す入り口——かもしれない
3. **具体的な根拠なしに説得されていないか？** 詩的さやキャッチーさは採用理由にならない
4. **採用する部分を自分の言葉で言い直せるか？** できないなら内在化していない。`accepted` ではなく `deferred` にする

## 関連する原則

相手の視点を理解すること（共感）と、相手の主張を自分のものとして肯定すること（同調）は別。SOUL.md に書いた軸は、文体の共鳴で明け渡さない。このスキルはその運用形——同意を「瞬間」ではなく「記録」にする。

入力: $ARGUMENTS
