const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { database } = require('../config/config');

class DatabaseManager {
  constructor() {
    this.dbPath = path.resolve(database.path);
    this.ensureDataDirectory();
    this.db = new sqlite3.Database(this.dbPath);
    this.initTables();
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  initTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS knock_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id TEXT NOT NULL,
        requester_username TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        approved_by TEXT,
        approved_at DATETIME
      )`,

      `CREATE TABLE IF NOT EXISTS channel_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        permission_type TEXT NOT NULL,
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        UNIQUE(channel_id, user_id, permission_type)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_knock_requests_status ON knock_requests(status)`,
      `CREATE INDEX IF NOT EXISTS idx_knock_requests_channel ON knock_requests(channel_id)`,
      `CREATE INDEX IF NOT EXISTS idx_channel_permissions_expires ON channel_permissions(expires_at)`
    ];

    queries.forEach(query => {
      this.db.run(query, (err) => {
        if (err) {
          console.error('Database initialization error:', err);
        }
      });
    });
  }

  // ノックリクエストを作成
  createKnockRequest(requesterId, requesterUsername, channelId, guildId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

      const query = `
        INSERT INTO knock_requests (requester_id, requester_username, channel_id, guild_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(query, [requesterId, requesterUsername, channelId, guildId, expiresAt], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // ノックリクエストを取得（チャンネルとリクエスタで）
  getKnockRequest(channelId, requesterId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM knock_requests
        WHERE channel_id = ? AND requester_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
      `;

      this.db.get(query, [channelId, requesterId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // リクエストIDでノックリクエストを取得
  getKnockRequestById(requestId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM knock_requests
        WHERE id = ? AND status = 'pending'
      `;

      this.db.get(query, [requestId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // ノックリクエストを承認
  approveKnockRequest(requestId, approverId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE knock_requests
        SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `;

      this.db.run(query, [approverId, new Date().toISOString(), requestId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  // 期限切れのリクエストをクリーンアップ
  cleanupExpiredRequests() {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE knock_requests
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP
      `;

      this.db.run(query, [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new DatabaseManager();
