# ペルソナ追加テンプレート

> マルチペルソナ拡張を行う場合に使用します。
> 単一ペルソナで運用する場合、このファイルは不要です。
> 詳しい手順: docs/guides/multi-persona.md

## ペルソナ定義

### 基本情報
- **ペルソナ名**:
- **ペルソナID**: （memory-mcp の persona_id に使用。英数字とハイフンのみ）
- **役割**:
- **モデル**: （opus / sonnet / haiku）

### SOUL（人格定義）

SOUL.template.md をベースに、このペルソナ固有の人格を定義してください。
ペルソナごとに別の SOUL ファイルを作成することを推奨します。

例: `souls/researcher.soul.md`, `souls/reviewer.soul.md`

### 記憶の分離

各ペルソナは persona_id で記憶が分離されます。
memory-mcp の呼び出し時に persona_id を指定してください。

### ペルソナ間の連携

複数ペルソナ間で情報を共有する場合:
- 共有記憶: persona_id を省略するか "*" で横断検索
- 個別記憶: persona_id を指定して検索

## 追加手順

1. このテンプレートをコピーして、ペルソナ名でファイルを作成
2. SOUL ファイルを `souls/` ディレクトリに作成
3. persona_id を決めて、memory-mcp の設定に追加
4. 必要に応じて `.claude/agents/` にエージェント定義を作成
