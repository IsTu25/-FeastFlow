#!/usr/bin/env node

/**
 * FeastFlow Load Test
 * Sends 500 orders in ~60 seconds with 50 concurrent requests
 * 
 * Usage: node feastflow-load-test.js
 */

const http = require('http');

// Configuration
const CONFIG = {
    gatewayURL: 'http://localhost',
    authEndpoint: '/api/auth/login',
    orderEndpoint: '/api/order',
    port: 80,
    totalOrders: 500,
    concurrency: 50,
    studentId: 'user123',
    password: 'password',
};

// Metrics
let successCount = 0;
let failureCount = 0;
let totalLatency = 0;
let minLatency = Infinity;
let maxLatency = 0;
let statusCodes = {};

/**
 * Make HTTP request
 */
function makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: CONFIG.port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const latency = Date.now() - startTime;

                try {
                    // Only parse if there is content
                    const parsedData = data ? JSON.parse(data) : {};
                    resolve({
                        statusCode: res.statusCode,
                        body: parsedData,
                        latency: latency,
                        headers: res.headers,
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data,
                        latency: latency,
                        headers: res.headers,
                    });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.setTimeout(10000); // 10 second timeout

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Get JWT token
 */
async function getAuthToken() {
    try {
        console.log('🔐 Getting authentication token...');

        const response = await makeRequest('POST', CONFIG.authEndpoint, {}, {
            studentId: CONFIG.studentId,
            password: CONFIG.password,
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
            const token = response.body.token;
            console.log('✅ Authentication successful');
            return token;
        } else {
            console.error('❌ Authentication failed:', response.statusCode);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Authentication error:', err.message);
        process.exit(1);
    }
}

/**
 * Send a single order
 */
async function sendOrder(orderNum, token) {
    try {
        const startTime = Date.now();

        const response = await makeRequest('POST', CONFIG.orderEndpoint, {
            'Authorization': `Bearer ${token}`,
        }, {
            itemId: 'iftar_box',
            quantity: 1,
            idempotencyKey: `order-${orderNum}-${Date.now()}`,
        });

        const latency = Date.now() - startTime;

        // Track metrics
        const statusCode = response.statusCode;
        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
        totalLatency += latency;
        minLatency = Math.min(minLatency, latency);
        maxLatency = Math.max(maxLatency, latency);

        if (statusCode >= 200 && statusCode < 300) {
            successCount++;
            return { success: true, statusCode, latency };
        } else {
            failureCount++;
            return { success: false, statusCode, latency, error: response.body };
        }
    } catch (err) {
        failureCount++;
        return { success: false, error: err.message };
    }
}

/**
 * Run load test
 */
async function runLoadTest() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 FEASTFLOW LOAD TEST - 500 Orders');
    console.log('='.repeat(60) + '\n');

    console.log(`📊 Configuration:`);
    console.log(`   - Total Orders: ${CONFIG.totalOrders}`);
    console.log(`   - Concurrency: ${CONFIG.concurrency}`);
    console.log(`   - Target: ${CONFIG.gatewayURL}${CONFIG.orderEndpoint}`);
    console.log(`   - Student ID: ${CONFIG.studentId}\n`);

    // Get token
    const token = await getAuthToken();

    // Run load test
    console.log('⏱️  Starting load test...\n');
    const testStartTime = Date.now();

    let completedOrders = 0;

    // Send orders in batches
    for (let i = 0; i < CONFIG.totalOrders; i += CONFIG.concurrency) {
        const batch = [];
        const batchSize = Math.min(CONFIG.concurrency, CONFIG.totalOrders - i);

        for (let j = 0; j < batchSize; j++) {
            const orderNum = i + j + 1;
            batch.push(sendOrder(orderNum, token));
        }

        // Wait for batch to complete
        await Promise.all(batch);
        completedOrders += batchSize;

        // Print progress
        const successRate = ((successCount / completedOrders) * 100).toFixed(1);
        const elapsed = ((Date.now() - testStartTime) / 1000).toFixed(1);
        const ordersPerSec = (completedOrders / elapsed).toFixed(1);

        console.log(
            `📈 Progress: ${completedOrders}/${CONFIG.totalOrders} | ` +
            `Success: ${successCount} | ` +
            `Failed: ${failureCount} | ` +
            `Rate: ${successRate}% | ` +
            `Speed: ${ordersPerSec} orders/sec`
        );

        // Small delay between batches
        if (i + CONFIG.concurrency < CONFIG.totalOrders) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Calculate results
    const totalTime = ((Date.now() - testStartTime) / 1000).toFixed(2);
    const avgLatency = (totalLatency / CONFIG.totalOrders).toFixed(2);
    const successRateValue = ((successCount / CONFIG.totalOrders) * 100).toFixed(2);
    const throughput = (CONFIG.totalOrders / totalTime).toFixed(2);

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(60) + '\n');

    console.log(`⏱️  Duration: ${totalTime} seconds`);
    console.log(`📦 Total Orders: ${CONFIG.totalOrders}`);
    console.log(`✅ Successful: ${successCount} (${successRateValue}%)`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`🚀 Throughput: ${throughput} orders/sec`);
    console.log(`⏱️  Avg Latency: ${avgLatency}ms`);
    console.log(`⚡ Min Latency: ${minLatency}ms`);
    console.log(`🔴 Max Latency: ${maxLatency}ms\n`);

    // Status codes breakdown
    console.log('📊 Status Code Breakdown:');
    Object.keys(statusCodes)
        .sort()
        .forEach(code => {
            console.log(`   - ${code}: ${statusCodes[code]}`);
        });

    console.log('\n' + '='.repeat(60));

    // Verdict
    if (successRateValue >= 99) {
        console.log('✅ EXCELLENT - System handling load perfectly!');
    } else if (successRateValue >= 95) {
        console.log('✅ GOOD - System handling load well');
    } else if (successRateValue >= 90) {
        console.log('⚠️  WARNING - Some failures detected');
    } else {
        console.log('❌ CRITICAL - System struggling, needs investigation');
    }

    console.log('='.repeat(60) + '\n');

    // Exit code
    process.exit(successRateValue >= 95 ? 0 : 1);
}

// Run the test
runLoadTest().catch((err) => {
    console.error('❌ Load test failed:', err);
    process.exit(1);
});
