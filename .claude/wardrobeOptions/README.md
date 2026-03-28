# wardrobeOptions — オプショナル機能

自律行動や特定ハードウェアなど、全ユーザーには不要な機能をここに置く。
使いたい場合は `.claude/commands/` にコピーまたはシンボリックリンクを作成。

## 利用可能なオプション

### skills/
- `sleep.md` — 自律行動の頻度を下げて眠る（要: autonomous-action.sh + cron）
- `awake.md` — 自律行動の頻度を戻して起きる（要: autonomous-action.sh + cron）

### 使い方

```bash
# コピー
cp .claude/wardrobeOptions/skills/sleep.md .claude/commands/sleep.md

# またはシンボリックリンク（アップストリームの更新が自動反映）
ln -s ../wardrobeOptions/skills/sleep.md .claude/commands/sleep.md
```
