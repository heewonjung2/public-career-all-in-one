"""SQLite 저장소 (표준 라이브러리 sqlite3, JSON 컬럼 사용)."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
DB_PATH = Path(__file__).resolve().parents[1] / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recruitments (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    data TEXT NOT NULL,
    source_kind TEXT NOT NULL,          -- seeded_verified | imported_url | user_upload
    verification_status TEXT NOT NULL,  -- verified | unverified | failed
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruitment_id TEXT,
    file_name TEXT,
    source_url TEXT,
    final_url TEXT,
    sha256 TEXT UNIQUE,
    page_count INTEGER,
    pages TEXT,                          -- JSON list[str]
    verification_status TEXT NOT NULL,
    verification_note TEXT,
    checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roadmaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruitment_id TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS study_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roadmap_id INTEGER NOT NULL,
    week INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as c:
        c.executescript(SCHEMA)
        cols = [r[1] for r in c.execute("PRAGMA table_info(roadmaps)")]
        if "scope_key" not in cols:  # 마이그레이션: 로드맵을 기관|공고|직렬별로 분리
            c.execute("ALTER TABLE roadmaps ADD COLUMN scope_key TEXT")
        # 기존(범위 없는) 로드맵은 당시 공고 기준 코레일 사무영업(IT)로 귀속 — 다른 기관에 섞이지 않게 함
        c.execute("UPDATE roadmaps SET scope_key = 'korail|' || recruitment_id || '|사무영업(IT)' WHERE scope_key IS NULL")


def dumps(o) -> str:
    return json.dumps(o, ensure_ascii=False)


def loads(s):
    return json.loads(s) if s else None
