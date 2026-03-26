const nock = require('nock');
const { verifyProposal } = require('./src/workers/truth-watcher');

async function run() {
    process.env.TRUTH_API_BASE_URL = 'https://api.truthacles.com/v1';
    nock('https://api.truthacles.com/v1')
        .get('/markets/001')
        .reply(200, { outcome: 'Yes' });

    console.log("Simulating Oracle proposing 'No' for Market #001 where True outcome is 'Yes'...");
    await verifyProposal('001', 'No');
}

run();
