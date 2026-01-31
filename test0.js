const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function testBrowser() {
    console.log('🔍 Starting diagnostic test...\n');
    
    const target = process.argv[2] || 'https://protopirate.net';
    console.log(`Target: ${target}\n`);
    
    let browser;
    try {
        console.log('1️⃣ Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            timeout: 30000
        });
        console.log('✅ Browser launched successfully\n');
        
        console.log('2️⃣ Creating new page...');
        const page = await browser.newPage();
        console.log('✅ Page created\n');
        
        console.log('3️⃣ Setting user agent...');
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        console.log('✅ User agent set\n');
        
        console.log('4️⃣ Navigating to target...');
        const response = await page.goto(target, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        const status = response.status();
        const headers = response.headers();
        
        console.log(`✅ Response received\n`);
        console.log('📊 Response Details:');
        console.log(`   Status Code: ${status}`);
        console.log(`   Status Text: ${response.statusText()}`);
        console.log(`   URL: ${response.url()}\n`);
        
        console.log('📋 Response Headers:');
        for (const [key, value] of Object.entries(headers)) {
            console.log(`   ${key}: ${value}`);
        }
        console.log('');
        
        if (status === 403) {
            console.log('🛡️  BLOCKED! Server returned 403');
            
            // Пробуем получить тело ответа
            const bodyText = await page.content();
            console.log('\n📄 Response Body (first 500 chars):');
            console.log(bodyText.substring(0, 500));
            console.log('...\n');
            
        } else if (status >= 200 && status < 400) {
            console.log('✅ SUCCESS! Page loaded successfully');
            
            // Пробуем сделать еще один запрос
            console.log('\n5️⃣ Testing second request...');
            const response2 = await page.goto(target + '?test=123', {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            console.log(`   Second request status: ${response2.status()}`);
            
            if (response2.status() >= 200 && response2.status() < 400) {
                console.log('✅ Second request also successful!\n');
            } else {
                console.log('❌ Second request failed!\n');
            }
        } else {
            console.log(`⚠️  Unexpected status code: ${status}\n`);
        }
        
        await browser.close();
        console.log('✅ Browser closed\n');
        console.log('🎉 Test completed successfully!');
        
    } catch (error) {
        console.log(`\n❌ ERROR: ${error.message}\n`);
        console.log('Stack trace:');
        console.log(error.stack);
        
        if (browser) {
            await browser.close();
        }
    }
}

// Запуск
console.log('╔═══════════════════════════════════════════════════╗');
console.log('║     🔍 BROWSER DIAGNOSTIC TEST                   ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

testBrowser().then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
