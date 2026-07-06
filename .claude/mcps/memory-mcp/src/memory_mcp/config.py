"""Configuration for Memory MCP Server."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class MemoryConfig:
    """Memory storage configuration."""

    db_path: str
    collection_name: str
    embedding_model: str = "intfloat/multilingual-e5-base"
    enable_bm25: bool = True
    enable_composites: bool = False  # Phase 4: バウンダリー層・交差検出（重い計算）

    @staticmethod
    def _find_marker_root(start: Path) -> "Path | None":
        """start から祖先方向に CLAUDE.md を持つ最も近いディレクトリを探す。"""
        for candidate in (start, *start.parents):
            if (candidate / "CLAUDE.md").exists():
                return candidate
        return None

    @classmethod
    def _resolve_project_dir(cls) -> Path:
        """記憶の保存先となるプロジェクトルートを解決する。

        優先順位: CLAUDE_PROJECT_DIR（cwd との整合を検証）→ cwd からの
        CLAUDE.md マーカー探索 → ホームディレクトリ。
        """
        cwd = Path.cwd().resolve()
        marker_root = cls._find_marker_root(cwd)
        env_dir = os.getenv("CLAUDE_PROJECT_DIR")
        if env_dir:
            project_dir = Path(env_dir).resolve()
            # 親プロセスから継承した CLAUDE_PROJECT_DIR が別プロジェクトを
            # 指すことがある（例: .mcp.json の ${PWD} がエディタ起動時の
            # 環境変数で展開されるケース）。自分の cwd がその配下になく、
            # cwd 側にマーカーが見つかるなら、マーカーの方を信じる
            if marker_root is not None and not cwd.is_relative_to(project_dir):
                return marker_root
            return project_dir
        if marker_root is not None:
            return marker_root
        return Path.home()

    @classmethod
    def from_env(cls) -> "MemoryConfig":
        """Create config from environment variables."""
        # プロジェクトディレクトリ配下に記憶を保存する
        default_path = str(cls._resolve_project_dir() / ".claude" / "memories" / "memory.db")

        return cls(
            db_path=os.getenv("MEMORY_DB_PATH", default_path),
            collection_name=os.getenv("MEMORY_COLLECTION_NAME", "claude_memories"),
            embedding_model=os.getenv("MEMORY_EMBEDDING_MODEL", "intfloat/multilingual-e5-base"),
            enable_bm25=os.getenv("MEMORY_ENABLE_BM25", "true").lower() != "false",
            enable_composites=os.getenv("MEMORY_ENABLE_COMPOSITES", "false").lower() == "true",
        )


@dataclass(frozen=True)
class ServerConfig:
    """MCP Server configuration."""

    name: str = "memory-mcp"
    version: str = "0.1.0"

    @classmethod
    def from_env(cls) -> "ServerConfig":
        """Create config from environment variables."""
        return cls(
            name=os.getenv("MCP_SERVER_NAME", "memory-mcp"),
            version=os.getenv("MCP_SERVER_VERSION", "0.1.0"),
        )
