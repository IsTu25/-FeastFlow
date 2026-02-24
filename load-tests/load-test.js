const autocannon = require('autocannon');
const axios = require('axios');

const BASE_URLS = {
    identity: 'http://localhost:3001',
    stock: 'http://localhost:3002',
    order: 'http://localhost:3003',
    kitchen: 'http://localhost:3004',
    notification: 'http://localhost:3005'
};

const results = [];

async function runTest(name, config) {
    return new Promise((resolve) => {
        console.log(`\nStarting load test: ${name}`);
        const instance = autocannon(config, (err, result) => {
            if (err) {
                console.error(`Error in ${name}:`, err);
                return resolve();
            }
            console.log(`Finished ${name}. Reqs/s: ${result.requests.average}, Avg Latency: ${result.latency.average}ms, Errors: ${result.errors}`);
            results.push({ name, result });
            resolve();
        });
        // autocannon.track(instance, { renderProgressBar: false });
    });
}

async function main() {
    console.log("Warming up services...");
    try { await axios.get(`${BASE_URLS.identity}/health`); } catch (e) { }

    // 1. Test Health Routes
    await runTest('Identity Provider Health', {
        url: `${BASE_URLS.identity}/health`,
        connections: 10,
        duration: 5,
    });

    await runTest('Order Gateway Health', {
        url: `${BASE_URLS.order}/health`,
        connections: 10,
        duration: 5,
    });

    // Get token for order gateway BEFORE we rate limit the login route!
    let token = '';
    try {
        const res = await axios.post(`${BASE_URLS.identity}/login`, { studentId: 'user123', password: 'password' });
        token = res.data.token;
    } catch (e) {
        console.log("Could not obtain token for order gateway test.", e.message);
    }

    // 2. Test Login Route
    await runTest('Identity Provider Login', {
        url: `${BASE_URLS.identity}/login`,
        connections: 10,
        duration: 5,
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ studentId: 'user123', password: 'password' })
    });

    if (token) {
        // 3. Test Order Gateway Route
        await runTest('Order Gateway - Create Order', {
            url: `${BASE_URLS.order}/order`,
            connections: 10,
            duration: 5,
            method: 'POST',
            headers: {
                'Content-type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            requests: [
                {
                    method: 'POST',
                    body: JSON.stringify({ itemId: 'iftar_box', quantity: 1, idempotencyKey: `load-test-${Date.now()}` })
                }
            ]
        });
    }

    console.log("\n==================== SUMMARY ====================");
    for (const r of results) {
        console.log(`${r.name.padEnd(30)} => Avg: ${Math.round(r.result.requests.average)} req/s | Latency: ${Math.round(r.result.latency.average)}ms | Errors: ${r.result.errors}`);
    }
}

main().catch(console.error);
