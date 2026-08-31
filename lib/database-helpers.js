/**
 * Database Helper Functions
 * Handles transactions, batch operations, and optimized queries
 */

const crypto = require('crypto');

/**
 * Execute operations within a transaction
 * Ensures atomic operations
 */
function createTransactionHelper(db) {
  const runDb = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  return {
    async transaction(fn) {
      try {
        await runDb('BEGIN TRANSACTION');
        const result = await fn();
        await runDb('COMMIT');
        return result;
      } catch (error) {
        await runDb('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  };
}

/**
 * Race-condition safe follow/unfollow
 * Uses INSERT OR IGNORE to prevent conflicts
 */
function createFollowHelper(allDb, runDb) {
  return {
    async toggleFollow(followerId, followingId) {
      try {
        // Serialize the read/write pair so concurrent toggles cannot observe
        // the same state and both attempt the same transition.
        await runDb('BEGIN IMMEDIATE TRANSACTION');
        const existing = await allDb(
          'SELECT id FROM follows WHERE followerId = ? AND followingId = ?',
          [followerId, followingId]
        );

        if (existing.length > 0) {
          const result = await runDb(
            'DELETE FROM follows WHERE followerId = ? AND followingId = ?',
            [followerId, followingId]
          );
          await runDb('COMMIT');
          return { success: true, following: false, changed: result.changes };
        }

        const result = await runDb(
          'INSERT OR IGNORE INTO follows (followerId, followingId, timestamp) VALUES (?, ?, ?)',
          [followerId, followingId, new Date().toISOString()]
        );
        await runDb('COMMIT');
        return { success: true, following: true, changed: result.changes };
      } catch (error) {
        await runDb('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  };
}

/**
 * Optimized reel queries
 * Avoids N+1 query problem
 */
function createReelHelper(allDb, runDb) {
  return {
    // Get reels with like counts in single query
    async getReelsWithStats(filter = {}) {
      const { status = 'published', limit = 50, offset = 0 } = filter;
      
      // Optimized: Get reels with like count in single query
      const reels = await allDb(
        `SELECT 
          r.id, r.userId, r.title, r.description, r.videoUrl, r.duration,
          r.tags, r.status, r.timestamp,
          u.username, u.avatar,
          COUNT(DISTINCT rl.id) as likeCount,
          COUNT(DISTINCT rc.id) as commentCount
        FROM reels r
        JOIN users u ON r.userId = u.id
        LEFT JOIN reel_likes rl ON rl.reelId = r.id
        LEFT JOIN reel_comments rc ON rc.reelId = r.id
        WHERE r.status = ?
        GROUP BY r.id
        ORDER BY r.timestamp DESC
        LIMIT ? OFFSET ?`,
        [status, limit, offset]
      );
      
      return reels;
    },

    // Get single reel with full stats
    async getReelWithStats(reelId) {
      const reels = await allDb(
        `SELECT 
          r.id, r.userId, r.title, r.description, r.videoUrl, r.duration,
          r.tags, r.status, r.timestamp,
          u.username, u.avatar,
          COUNT(DISTINCT rl.id) as likeCount,
          COUNT(DISTINCT rc.id) as commentCount
        FROM reels r
        JOIN users u ON r.userId = u.id
        LEFT JOIN reel_likes rl ON rl.reelId = r.id
        LEFT JOIN reel_comments rc ON rc.reelId = r.id
        WHERE r.id = ?
        GROUP BY r.id`,
        [reelId]
      );
      
      return reels[0] || null;
    },

    // Get comments with user info
    async getReelComments(reelId, limit = 10) {
      return allDb(
        `SELECT rc.id, rc.reelId, rc.userId, rc.comment, rc.timestamp,
                u.username, u.avatar
         FROM reel_comments rc
         JOIN users u ON rc.userId = u.id
         WHERE rc.reelId = ?
         ORDER BY rc.timestamp DESC
         LIMIT ?`,
        [reelId, limit]
      );
    }
  };
}

/**
 * Secure token comparison
 * Prevents timing attacks
 */
function compareTokensSafe(token1, token2) {
  if (!token1 || !token2) return false;
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token1),
      Buffer.from(token2)
    );
  } catch (error) {
    return false;
  }
}

module.exports = {
  createTransactionHelper,
  createFollowHelper,
  createReelHelper,
  compareTokensSafe
};
