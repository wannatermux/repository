const net = require('net');
const fs = require('fs');

const CONFIG = {
    startIp: '185.10.10.0', 
    endIp: '185.10.11.255',   
    ports: [8080, 3128, 1080, 80, 443], 
    concurrency: 100,        // Уменьшено для стабильности
    timeout: 5000,           // Увеличено время ожидания
    outputFile: 'found_proxies.txt'
};

function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
    return [(long >>> 24) & 0xFF, (long >>> 16) & 0xFF, (long >>> 8) & 0xFF, long & 0xFF].join('.');
}

function checkProxy(ip, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;

        socket.setTimeout(CONFIG.timeout);

        socket.on('connect', () => {
            // Отправляем проверочный CONNECT запрос
            socket.write(`CONNECT google.com:443 HTTP/1.1\r\nHost: google.com\r\n\r\n`);
        });

        socket.on('data', (data) => {
            const res = data.toString();
            if (res.includes('HTTP/1.1 200') || res.toLowerCase().includes('established')) {
                status = true;
            }
            socket.destroy();
        });

        socket.on('timeout', () => socket.destroy());
        socket.on('error', () => socket.destroy());
        socket.on('close', () => resolve(status ? { ip, port } : null));

        socket.connect(port, ip);
    });
}

async function startScanner() {
    const start = ipToLong(CONFIG.startIp);
    const end = ipToLong(CONFIG.endIp);
    let currentIpLong = start;
    let activeChecks = 0;
    let scannedCount = 0;

    console.log(`[!] Старт: ${CONFIG.startIp} -> ${CONFIG.endIp}`);

    // Таймер прогресса
    setInterval(() => {
        console.log(`[Прогресс] Проверено IP: ${scannedCount} | Активных соединений: ${activeChecks}`);
    }, 5000);

    async function next() {
        if (currentIpLong > end) return;

        const ip = longToIp(currentIpLong++);
        scannedCount++;

        for (const port of CONFIG.ports) {
            activeChecks++;
            checkProxy(ip, port).then(result => {
                activeChecks--;
                if (result) {
                    console.log(`\n[+++] НАЙДЕН: ${result.ip}:${result.port}\n`);
                    fs.appendFileSync(CONFIG.outputFile, `${result.ip}:${result.port}\n`);
                }
                next(); 
            });
            if (activeChecks >= CONFIG.concurrency) break;
        }
    }

    for (let i = 0; i < CONFIG.concurrency; i++) {
        next();
    }
}

startScanner().catch(console.error);
