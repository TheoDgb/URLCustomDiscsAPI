const tokenRequests = new Map();
const LIMIT = 6; // max 6 requests per minute
const INTERVAL_MS = 60 * 1000; // 1 minute

function isRateLimited(token) {
    const now = Date.now();
    const requests = tokenRequests.get(token) || [];

    // Keep only queries within the time range
    const recentRequests = requests.filter(timestamp => now - timestamp < INTERVAL_MS);

    if (recentRequests.length > LIMIT) {
        return true;
    }

    // Add current query
    recentRequests.push(now);
    tokenRequests.set(token, recentRequests);
    return false;
}

module.exports = isRateLimited;