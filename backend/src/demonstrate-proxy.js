const express = require('express');
const imagesRouter = require('./routes/images');
const request = require('supertest');

const app = express();
app.use('/api/images', imagesRouter);

async function testProxy() {
    console.log("Fetching a large high-resolution sample image via the proxy...");
    
    // Using a sample large image URL
    // We will just measure the response buffer size
    const testUrl = "https://images.unsplash.com/photo-1542291026-7eec264c27ff"; 

    const res = await request(app).get(`/api/images/proxy?url=${encodeURIComponent(testUrl)}`);
    
    console.log("Proxy request complete!");
    console.log(`Content-Type: ${res.headers['content-type']}`);
    console.log(`Response length (Optimized Size): ${res.body.length} bytes`);
    
    // Let's also fetch the original directly just to show the difference
    const axios = require('axios');
    try {
        const orig = await axios.get(testUrl, { responseType: 'arraybuffer' });
        console.log(`Original image size: ${orig.data.length} bytes`);
        console.log(`Reduction: -${Math.round((1 - (res.body.length / orig.data.length)) * 100)}%`);
    } catch(e) {}
}

testProxy().then(() => process.exit(0)).catch(console.error);
