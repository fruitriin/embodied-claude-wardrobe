#!/usr/bin/env python
"""keyword-buffer.py - 会話キーワードを雑に溜めるフックスクリプト

Rem (embodied-claude) ベース。ワードローブ向けの差分:
- sensory_buffer.jsonl の保存先を $CLAUDE_PROJECT_DIR/.claude/ に変更
  （ペルソナ環境ごとにバッファを分離するため）
- ノイズワードに wardrobe / ワードローブ を追加
"""
import json
import os
import re
import sys

text = ""
try:
    data = json.load(sys.stdin)
    text = data.get("prompt", "")
except Exception:
    sys.exit(0)

if not text or len(text) < 2:
    sys.exit(0)

# autonomous-action のプロンプトはバッファに入れない
if os.environ.get("CLAUDE_AUTONOMOUS"):
    sys.exit(0)
if "自律行動タイム" in text:
    sys.exit(0)

# サロゲート文字を除去（Windowsのstdin経由で入ることがある）
text = text.encode("utf-8", errors="ignore").decode("utf-8")

# <system-reminder>...</system-reminder> タグを除去（ノイズ源）
text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.DOTALL)

try:
    from sudachipy import Dictionary

    tokenizer = Dictionary().create()
except ImportError:
    sys.exit(0)

try:
    tokens = tokenizer.tokenize(text)
except Exception:
    sys.exit(0)

# ノイズ除去: ファイルパスっぽい文字列、システム用語
_PATH_CHARS = re.compile(r"[/\\.]")
_NOISE_WORDS = frozenset({
    "task", "notification", "output", "file", "status", "summary",
    "Background", "command", "tests", "exit", "Read", "retrieve",
    "result", "completed", "Users", "AppData", "Local", "Temp",
    "tasks", "Run", "mcp", "memory", "embodied", "claude", "code",
    "ClaudeCode",
    # ワードローブ固有のノイズ
    "wardrobe", "ワードローブ",
})

def _is_noise(surface: str) -> bool:
    if surface in _NOISE_WORDS:
        return True
    if _PATH_CHARS.search(surface):
        return True
    # 純粋な英数字のみ（2文字以上）でよくあるID・ハッシュ
    if re.fullmatch(r"[0-9a-fA-F\-]+", surface):
        return True
    return False

# 名詞・固有名詞のみ、2文字以上
words = []
# 動詞（原形で保存、出現順を維持）
verbs = []
for t in tokens:
    pos = t.part_of_speech()
    if pos[0] == "名詞" and len(t.surface()) >= 2:
        if not _is_noise(t.surface()):
            words.append(t.surface())
    elif pos[0] == "動詞":
        # normalized_form（chiVeと一致する表記）で保存
        lemma = t.normalized_form()
        if len(lemma) >= 2:
            verbs.append(lemma)

if not words and not verbs:
    sys.exit(0)

# 重複除去（順序保持）
def dedupe(lst):
    seen = set()
    result = []
    for item in lst:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

unique_words = dedupe(words)
unique_verbs = dedupe(verbs)

entry = {}
if unique_words:
    entry["w"] = unique_words
if unique_verbs:
    entry["v"] = unique_verbs

if not entry:
    sys.exit(0)

# ワードローブ向けの保存先: $CLAUDE_PROJECT_DIR/.claude/sensory_buffer.jsonl
# (Rem は ~/.claude/ に書いていたが、ペルソナ環境ごとに分けるためプロジェクト配下に)
project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
if project_dir:
    buf_path = os.path.join(project_dir, ".claude", "sensory_buffer.jsonl")
else:
    # フォールバック: ~/.claude/sensory_buffer.jsonl
    buf_path = os.path.join(os.path.expanduser("~"), ".claude", "sensory_buffer.jsonl")

os.makedirs(os.path.dirname(buf_path), exist_ok=True)
with open(buf_path, "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
