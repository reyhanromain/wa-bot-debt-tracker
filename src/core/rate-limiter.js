/**
 * In-memory rate limiter.
 * Key format: `${wa_user_id}:${group_id}:${action}`
 */
class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} */
    this.storage = new Map();
  }

  /**
   * Check if an action is allowed.
   * @param {string} key - Unique key (e.g. "wa_user_id:group_id:command")
   * @param {number} maxCalls - Max number of calls allowed in the window
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {boolean} - true if allowed, false if rate limited
   */
  allow(key, maxCalls, windowMs) {
    const now = Date.now();
    const timestamps = this.storage.get(key) || [];

    // Keep only timestamps within the window
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxCalls) {
      // Store filtered list but don't add new timestamp
      this.storage.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.storage.set(key, validTimestamps);
    return true;
  }

  /**
   * Clear all rate limit data (useful for testing).
   */
  reset() {
    this.storage.clear();
  }
}

module.exports = { RateLimiter };
