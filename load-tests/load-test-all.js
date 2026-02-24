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
                console.error(`Error in ${name}:`, err.message);
                return resolve();
            }
            console.log(`Finished ${name}. Reqs/s: ${result.requests.average}, Avg Latency: ${result.latency.average}ms, Errors: ${result.errors}`);
            results.push({ name, result });
            resolve();
        });
    });
}

async function main() {
    console.log("=========================================");
    console.log("   TESTING 15 SAFE ROUTES UNDER LOAD");
    console.log("=========================================");

    // 1. HEALTH CHECKS
    await runTest('1. Identity Provider /health (GET)', { url: `${BASE_URLS.identity}/health`, connections: 10, duration: 3 });
    await runTest('2. Order Gateway /health (GET)', { url: `${BASE_URLS.order}/health`, connections: 10, duration: 3 });
    await runTest('3. Stock Service /health (GET)', { url: `${BASE_URLS.stock}/health`, connections: 10, duration: 3 });
    await runTest('4. Kitchen Queue /health (GET)', { url: `${BASE_URLS.kitchen}/health`, connections: 10, duration: 3 });
    await runTest('5. Notification Hub /health (GET)', { url: `${BASE_URLS.notification}/health`, connections: 10, duration: 3 });

    // 2. METRICS
    await runTest('6. Identity Provider /metrics (GET)', { url: `${BASE_URLS.identity}/metrics`, connections: 10, duration: 3 });
    await runTest('7. Order Gateway /metrics (GET)', { url: `${BASE_URLS.order}/metrics`, connections: 10, duration: 3 });
    await runTest('8. Stock Service /metrics (GET)', { url: `${BASE_URLS.stock}/metrics`, connections: 10, duration: 3 });
    await runTest('9. Kitchen Queue /metrics (GET)', { url: `${BASE_URLS.kitchen}/metrics`, connections: 10, duration: 3 });
    await runTest('10. Notification Hub /metrics (GET)', { url: `${BASE_URLS.notification}/metrics`, connections: 10, duration: 3 });

    // 3. CORE BUSINESS ROUTES
    // Get token for order gateway
    let token = '';
    try {
        const res = await axios.post(`${BASE_URLS.identity}/login`, { studentId: 'user123', password: 'password' });
        token = res.data.token;
    } catch (e) {
        console.log("Could not obtain token: ", e.message);
    }

    await runTest('11. Identity /login (POST)', {
        url: `${BASE_URLS.identity}/login`,
        connections: 10, duration: 3, method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ studentId: 'user123', password: 'password' })
    });

    await runTest('12. Order Gateway /order (POST)', {
        url: `${BASE_URLS.order}/order`,
        connections: 10, duration: 3, method: 'POST',
        headers: { 'Content-type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ itemId: 'iftar_box', quantity: 1, idempotencyKey: `load-test-${Date.now()}` })
    });

    await runTest('13. Stock Service /deduct (POST)', {
        url: `${BASE_URLS.stock}/deduct`,
        connections: 10, duration: 3, method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ itemId: 'iftar_box', quantity: 1, orderId: `load-${Date.now()}` })
    });

    await runTest('14. Kitchen Queue /process (POST)', {
        url: `${BASE_URLS.kitchen}/process`,
        connections: 10, duration: 3, method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ orderId: 'ord-123', itemId: 'iftar_box', quantity: 1, studentId: 'user123' })
    });

    await runTest('15. Notification Hub /notify (POST)', {
        url: `${BASE_URLS.notification}/notify`,
        connections: 10, duration: 3, method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ orderId: 'ord-123', studentId: 'user123', status: 'Ready' })
    });

    console.log("\n==================== SUMMARY ====================");
    for (const r of results) {
        if (r.result) {
            console.log(`${r.name.padEnd(45)} => Avg: ${Math.round(r.result.requests.average)} req/s | Latency: ${Math.round(r.result.latency.average)}ms | Errors: ${r.result.errors}`);
        }
    }

    console.log("\n=========================================");
    console.log("   TESTING THE 5 DESTRUCTIVE CHAOS ROUTES");
    console.log("=========================================");
    console.log("Warning: These endpoints are designed to crash the servers immediately. Sending requests...");

    try { await axios.post(`${BASE_URLS.identity}/chaos`); console.log("16. Triggered Identity Provider /chaos (POST)"); } catch (e) { }
    try { await axios.post(`${BASE_URLS.order}/chaos`); console.log("17. Triggered Order Gateway /chaos (POST)"); } catch (e) { }
    try { await axios.post(`${BASE_URLS.stock}/chaos`); console.log("18. Triggered Stock Service /chaos (POST)"); } catch (e) { }
    try { await axios.post(`${BASE_URLS.kitchen}/chaos`); console.log("19. Triggered Kitchen Queue /chaos (POST)"); } catch (e) { }
    try { await axios.post(`${BASE_URLS.notification}/chaos`); console.log("20. Triggered Notification Hub /chaos (POST)"); } catch (e) { }

    console.log("\nThe 5 services have now successfully crashed as intended! Your servers will need to be restarted.");
}

main().catch(console.error);
