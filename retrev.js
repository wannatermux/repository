const net = require('net');
const fs = require('fs');

// --- НАСТРОЙКИ ---
const CONFIG = {
    startIp: '185.10.10.0', // Начальный IP
    endIp: '185.10.11.255',   // Конечный IP
    ports: [8080, 3128, 1080, 80], // Порты для проверки
    concurrency: 500,        // Сколько IP проверять одновременно
    timeout: 3000,           // Таймаут на попытку (мс)
    outputFile: 'found_proxies.txt'
};

// Функция преобразования IP в число для удобного цикла
function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
    return [
        (long >>> 24) & 0xFF,
        (long >>> 16) & 0xFF,
        (long >>> 8) & 0xFF,
        long & 0xFF
    ].join('.');
}

// Функция проверки конкретного IP и порта
function checkProxy(ip, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;

        socket.setTimeout(CONFIG.timeout);

        socket.on('connect', () => {
            // Если порт открыт, проверяем, прокси ли это (отправляем CONNECT)
            const payload = `CONNECT google.com:443 HTTP/1.1\r\nHost: google.com\r\n\r\n`;
            socket.write(payload);
        });

        socket.on('data', (data) => {
            const response = data.toString();
            if (response.includes('HTTP/1.1 200') || response.includes('established')) {
                status = true;
            }
            socket.destroy();
        });

        socket.on('timeout', () => socket.destroy());
        socket.on('error', () => socket.destroy());

        socket.on('close', () => {
            resolve(status ? { ip, port } : null);
        });

        socket.connect(port, ip);
    });
}

// Главный менеджер сканирования
async function startScanner() {
    const start = ipToLong(CONFIG.startIp);
    const end = ipToLong(CONFIG.endIp);
    
    console.log(`[!] Сканирование начато: ${CONFIG.startIp} - ${CONFIG.endIp}`);
    console.log(`[!] Потоков: ${CONFIG.concurrency}, Портов: ${CONFIG.ports.join(', ')}`);

    let currentIpLong = start;
    let activeChecks = 0;
    const foundCount = 0;

    const runNext = async () => {
        if (currentIpLong > end) return;

        const ip = longToIp(currentIpLong++);
        
        for (const port of CONFIG.ports) {
            activeChecks++;
            checkProxy(ip, port).then(result => {
                activeChecks--;
                if (result) {
                    const line = `${result.ip}:${result.port}`;
                    console.log(`[+] НАЙДЕН ПРОКСИ: ${line}`);
                    fs.appendFileSync(CONFIG.outputFile, line + '\n');
                }
                runNext(); // Запускаем следующую проверку, как только освободилось место
            });

            // Ограничитель конкурентности
            if (activeChecks >= CONFIG.concurrency) break;
        }
    };

    // Начальный запуск "воркеров"
    for (let i = 0; i < CONFIG.concurrency; i++) {
        runNext();
    }
}

startScanner();
