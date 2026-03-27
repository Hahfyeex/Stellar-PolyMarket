const nock = require('nock');
const { triggerWebhook } = require('./src/workers/whale-watcher');

async function testWhaleNotification() {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock_whale';

    nock('https://discord.com')
        .post('/api/webhooks/mock_whale')
        .reply(200, (uri, requestBody) => {
            console.log("\n[Screenshot Required: Discord/Telegram notification]");
            console.log("-----------------------------------------------------");
            console.log("POST " + uri);
            console.log("Body:");
            console.log(JSON.stringify(requestBody, null, 2));
            console.log("-----------------------------------------------------");
            return [200, "OK"];
        });

    console.log("Simulating a Whale Bet of 500,000 XLM on Market #042...");
    await triggerWebhook('042', '500000', '0xWhaleAddressCrypto');
}

testWhaleNotification();
