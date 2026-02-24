const axios = require('axios');

const services = [
    'http://localhost:3001', // Identity Provider
    'http://localhost:3002', // Stock Service
    'http://localhost:3003', // Order Gateway
    'http://localhost:3004', // Kitchen Queue
    'http://localhost:3005'  // Notification Hub
];

console.log("🐒 Chaos Monkey Started...");
console.log("I will randomly terminate services to test system resilience.");

async function terminateRandomService() {
    const randomIndex = Math.floor(Math.random() * services.length);
    const serviceUrl = services[randomIndex];

    console.log(`💀 Chaos Monkey hitting: ${serviceUrl}/chaos`);
    try {
        await axios.post(`${serviceUrl}/chaos`);
    } catch (err) {
        console.log(`Service at ${serviceUrl} is already down or unreachable.`);
    }
}

// Every 30 seconds, there is a 30% chance of a service failure
setInterval(() => {
    if (Math.random() < 0.3) {
        terminateRandomService();
    } else {
        console.log("🛡️ System survived this interval.");
    }
}, 30000);
