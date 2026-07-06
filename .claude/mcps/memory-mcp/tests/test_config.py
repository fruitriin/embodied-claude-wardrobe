"""Tests for MemoryConfig project-dir resolution."""

from pathlib import Path

import pytest

from memory_mcp.config import MemoryConfig


def _make_project(tmp_path: Path, name: str) -> Path:
    """CLAUDE.md マーカー付きのプロジェクトディレクトリを作る。"""
    project = tmp_path / name
    server_dir = project / ".claude" / "mcps" / "memory-mcp"
    server_dir.mkdir(parents=True)
    (project / "CLAUDE.md").write_text("# marker\n")
    return project


def test_env_dir_wins_when_cwd_is_inside_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """cwd が CLAUDE_PROJECT_DIR 配下なら env を信じる。"""
    project = _make_project(tmp_path, "proj")
    monkeypatch.chdir(project / ".claude" / "mcps" / "memory-mcp")
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project))

    assert MemoryConfig._resolve_project_dir() == project.resolve()


def test_poisoned_env_dir_is_overridden_by_marker(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """env が別プロジェクトを指していても、cwd 側のマーカーを信じる。"""
    project = _make_project(tmp_path, "wardrobe")
    other = _make_project(tmp_path, "other-project")
    monkeypatch.chdir(project / ".claude" / "mcps" / "memory-mcp")
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(other))

    assert MemoryConfig._resolve_project_dir() == project.resolve()


def test_env_dir_trusted_when_no_marker_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """cwd 側にマーカーがない（プロジェクト外設置）なら env を信じる。"""
    project = _make_project(tmp_path, "proj")
    outside = tmp_path / "global-install"
    outside.mkdir()
    monkeypatch.chdir(outside)
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project))

    assert MemoryConfig._resolve_project_dir() == project.resolve()


def test_marker_walk_from_server_dir_without_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """env なしでも .claude/mcps/memory-mcp から祖先探索で見つける。"""
    project = _make_project(tmp_path, "proj")
    monkeypatch.chdir(project / ".claude" / "mcps" / "memory-mcp")
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    assert MemoryConfig._resolve_project_dir() == project.resolve()


def test_falls_back_to_home_when_nothing_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """env もマーカーもなければホームに退避する。"""
    bare = tmp_path / "bare"
    bare.mkdir()
    monkeypatch.chdir(bare)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    assert MemoryConfig._resolve_project_dir() == Path.home()


def test_from_env_builds_db_path_under_project(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """from_env の db_path がプロジェクト配下の .claude/memories を指す。"""
    project = _make_project(tmp_path, "proj")
    monkeypatch.chdir(project / ".claude" / "mcps" / "memory-mcp")
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.delenv("MEMORY_DB_PATH", raising=False)

    config = MemoryConfig.from_env()
    expected = project.resolve() / ".claude" / "memories" / "memory.db"
    assert config.db_path == str(expected)
