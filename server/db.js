// SQLite persistence (Node's built-in node:sqlite — no native build step).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DB {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT,
        salt TEXT,
        guest INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_login INTEGER,
        credits INTEGER NOT NULL DEFAULT 0,
        xp INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        matches INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_xp ON accounts(xp DESC);
      CREATE INDEX IF NOT EXISTS idx_accounts_kills ON accounts(kills DESC);
      CREATE INDEX IF NOT EXISTS idx_accounts_wins ON accounts(wins DESC);
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
      CREATE TABLE IF NOT EXISTS friends (
        a INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        b INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (a, b)
      );
      CREATE INDEX IF NOT EXISTS idx_friends_b ON friends(b);
      CREATE TABLE IF NOT EXISTS match_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        map TEXT NOT NULL,
        private INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        summary TEXT NOT NULL
      );
    `);
    const q = (sql) => this.db.prepare(sql);
    this.q = {
      insertAccount: q('INSERT INTO accounts (username, pass_hash, salt, guest, created_at, last_login, credits, xp, data) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'),
      byId: q('SELECT * FROM accounts WHERE id = ?'),
      byName: q('SELECT * FROM accounts WHERE username = ? COLLATE NOCASE'),
      save: q('UPDATE accounts SET credits = ?, xp = ?, kills = ?, deaths = ?, wins = ?, matches = ?, data = ? WHERE id = ?'),
      setLogin: q('UPDATE accounts SET last_login = ? WHERE id = ?'),
      setPassword: q('UPDATE accounts SET pass_hash = ?, salt = ?, guest = 0, username = ? WHERE id = ?'),
      insertSession: q('INSERT INTO sessions (token_hash, account_id, created_at, last_used) VALUES (?, ?, ?, ?)'),
      sessionByHash: q('SELECT * FROM sessions WHERE token_hash = ?'),
      touchSession: q('UPDATE sessions SET last_used = ? WHERE token_hash = ?'),
      deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),
      pruneSessions: q('DELETE FROM sessions WHERE last_used < ?'),
      friendRow: q('SELECT * FROM friends WHERE a = ? AND b = ?'),
      friendInsert: q('INSERT OR REPLACE INTO friends (a, b, status, created_at) VALUES (?, ?, ?, ?)'),
      friendDelete: q('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)'),
      friendsOf: q(`SELECT f.a, f.b, f.status, acc.id AS other_id, acc.username, acc.xp, acc.data
                    FROM friends f JOIN accounts acc ON acc.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
                    WHERE f.a = ? OR f.b = ?`),
      friendCount: q("SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'"),
      topXp: q('SELECT id, username, xp, kills, deaths, wins, matches FROM accounts WHERE matches > 0 ORDER BY xp DESC, id ASC LIMIT ?'),
      topKills: q('SELECT id, username, xp, kills, deaths, wins, matches FROM accounts WHERE matches > 0 ORDER BY kills DESC, id ASC LIMIT ?'),
      topWins: q('SELECT id, username, xp, kills, deaths, wins, matches FROM accounts WHERE matches > 0 ORDER BY wins DESC, id ASC LIMIT ?'),
      rankXp: q('SELECT COUNT(*) AS n FROM accounts WHERE matches > 0 AND (xp > ? OR (xp = ? AND id < ?))'),
      rankKills: q('SELECT COUNT(*) AS n FROM accounts WHERE matches > 0 AND (kills > ? OR (kills = ? AND id < ?))'),
      rankWins: q('SELECT COUNT(*) AS n FROM accounts WHERE matches > 0 AND (wins > ? OR (wins = ? AND id < ?))'),
      insertMatch: q('INSERT INTO match_history (mode, map, private, ended_at, summary) VALUES (?, ?, ?, ?, ?)'),
      countAccounts: q('SELECT COUNT(*) AS n FROM accounts'),
    };
  }

  tx(fn) {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close() {
    this.db.close();
  }
}
