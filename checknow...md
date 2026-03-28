project-claude-overview.md　を持ってくる
Claudeは基本的にhookの存在に気づかなくて、自分のできることできないことを見失うので
----
great-recall の 技術軸をデフォルトオフにする
ユーザーがエンジニアリングのトークを頻繁にするなら技術軸引き出しを有効にするとよさそう
----
great-recall をブートシーケンスに含めたほうがよさそう
----
追想システムは先に起動しておかないと日常の話題についていけない。
逆に、技術軸など、話題が一方向になったらあまり必要ないかも。
----
追想システムにユーザーのパロディネタ等を対応するWebSearch専門エージェントがいてもいいかも。これはジャストアイデアかな
----
スキルのツール呼び出しが CLAUDE_SKILL_DIR を使えるはず。
(ClaudeCode 2.1.69) Added ${CLAUDE_SKILL_DIR} variable for skills to reference their own directory in SKILL.md content
----
スキル呼び出し全体に経験セクションを別ファイルで書き出すようにすること。
スキルの骨組みをアップストリーム管理、個別の経験をダウンストリームにするパターン。
/Users/riin/workspace/AutomatonDevDriveFramework/.claude/commands/addf-experience.md 
----
migrate考えたい。これを参考にする
/Users/riin/workspace/AutomatonDevDriveFramework/.claude/commands/addf-migrate.md
----
lookを持ってくる
/Users/riin/workspace/assistant/.claude/commands/look.md
clip-imageとannotate-grid は observeやseeの補助として積極的に使いたい。
/Users/riin/workspace/assistant/.claude/commands/annotate-grid.md
/Users/riin/workspace/assistant/.claude/commands/clip-image.md
依存ツールとそのソースコードもこのリポジトリに持つこと
-----
非同期say
/Users/riin/workspace/assistant/.claude/commands/say.md
----
slide watchもってくる
/Users/riin/workspace/assistant/.claude/commands/slide-watch.md
----
全体的に /tmp や ~/.claude を使うソースコードを検出、 カレントの tmp 以下に書き直す
なぜなら ディレクトリ外アクセスになって 読み書きが停止してしまうから
CLAUDE_CODE_TMPDIR が 使える？
(ClaudeCode2.1.5)Added CLAUDE_CODE_TMPDIR environment variable to override the temp directory used for internal temp files, useful for environments with custom temp directory requirements
----
awakeとsleepはautonomouseじゃないと関係ないスキルなのでオプション扱いがいいかも。
.claude/wordrobeOptions/skills みたいなディレクトリを作ってそこに押し込むのがいいかな
----
.claude/hooks/continue-check.sh, .claude/hooks/hearing-hook.sh, .claude/hooks/hearing-stop-hook.sh, .claude/hooks/hearing-daemon.py は　ひとつの常設聞き耳モジュールセットだと思う
ファイルのヘッダで関係性を相互参照
----
installer ってなにこれしらん…… kmizuさんが入れたんだろうな
趣旨としては理解できるものの、多分メンテが必要
----
hooksと .claude/hooks に分散している。
カレント/hooks  は 素体からもってきたやつだと思う。
一応確認して、 .claude/hooks へ統合
----
scripts ディレクトリを .claude/  ディレクトリに押し込みたい
----
欲を言えばディレクトリ構造を mcps/各モジュール... に配置換えしたほうが見通しがいいと思うけど差分が大きくなるので要検討
ユーザー（ダウンストリーム）のファイルをこのディレクトリにどこどこ入れていくことを考えると .claude/mcps/... も候補
ただ、カレントとmcpの起動パスがあっちこっちを往復すると相対パスがグズグズになっていくのでそのあたりを担保する統合テストコードとLLMが実行するテストシナリオが必要
----
templates ディレクトリは .claude ディレクトリの中
----
autonomous などのスクリプトの埋め込みプロンプトを toml で管理したい。置き場所はカレントか .claudeの中がいいと思う。
----
ドキュメントや設定系が全体的に sampleとかexample とかが散在してるので、アップストリーム/ダウンストリームパターンで置き直したい。
配置はADDFのリポジトリを参考に。
----
FLASH記憶システム、state.mdシステム、自律行動用のTODOとルーチンシステムをワードローブへ


