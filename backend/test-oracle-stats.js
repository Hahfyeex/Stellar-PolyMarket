const express = require('express');
const supertest = require('supertest');
const oraclesRouter = require('./src/routes/oracles');

const app = express();
app.use(express.json());
app.use('/api/v1/oracles', oraclesRouter);

async function testOracleStats() {
    console.log("Fetching Oracle Truth-Scores from /api/v1/oracles/stats...");
    
    const response = await supertest(app).get('/api/v1/oracles/stats');
    
    console.log("\n[Screenshot Required: JSON response from /api/v1/oracles/stats endpoint]");
    console.log(JSON.stringify(response.body, null, 2));
}

testOracleStats();
