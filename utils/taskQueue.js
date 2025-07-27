const queues = new Map();

function enqueue(token, task) {
    return new Promise((resolve, reject) => {
        const queue = queues.get(token) || [];
        queue.push({ task, resolve, reject });
        queues.set(token, queue);
        if (queue.length === 1) {
            runNext(token).catch(err => {
                console.error(`[QUEUE RUN ERROR] Token ${token}:`, err);
            });
        }
    });
}

async function runNext(token) {
    const queue = queues.get(token);
    if (!queue || queue.length === 0) return;

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
        } else {
            runNext(token).catch(err => {
                console.error(`[QUEUE RUN ERROR] Token ${token}:`, err);
            });
        }
    }
}

module.exports = enqueue;
