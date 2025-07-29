const { activeTokens } = require('./activeTokens');

const queues = new Map();

function enqueue(token, task) {
    return new Promise((resolve, reject) => {
        const queue = queues.get(token) || [];
        queue.push({ task, resolve, reject });
        queues.set(token, queue);
        if (queue.length === 1) {
            if (!activeTokens.has(token)) {
                activeTokens.add(token);
            }
            runNextTask(token).catch(err => {
                console.error(`[QUEUE RUN ERROR] Token ${token}:`, err);
                activeTokens.delete(token);
            });
        }
    });
}

async function runNextTask(token) {
    const queue = queues.get(token);
    if (!queue || queue.length === 0) {
        activeTokens.delete(token);
        return;
    }

    const { task, resolve, reject } = queue[0];
    try {
        const result = await task();
        resolve(result);
    } catch (err) {
        reject(err);
    } finally {
        queue.shift();
        if (queue.length === 0) {
            queues.delete(token);
            activeTokens.delete(token);
        } else {
            runNextTask(token).catch(err => {
                console.error(`[QUEUE RUN ERROR] Token ${token}:`, err);
                activeTokens.delete(token);
            });
        }
    }
}

module.exports = enqueue;
