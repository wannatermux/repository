const net = require('net');
const fs = require('fs');
const { Worker } = require('worker_threads');
const os = require('os');

class IPv4ProxyScanner {
    constructor(options = {}) {
        this.timeout = options.timeout || 3000;
        this.ports = options.ports || [8080, 3128, 80, 8888, 1080, 9050, 3129, 8081];
        this.maxConcurrent = options.maxConcurrent || 1000;
        this.outputFile = options.outputFile || 'found_proxies.txt';
        this.validatedFile = options.validatedFile || 'validated_proxies.txt';
        
        this.scanned = 0;
        this.found = [];
        this.validated = [];
        this.startTime = Date.now();
    }
    
    // Генерация случайного IP
    generateRandomIP() {
        return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    }
    
    // Генерация IP диапазона из CIDR
    generateIPRange(cidr) {
        const [base, bits] = cidr.split('/');
        const [a, b, c, d] = base.split('.').map(Number);
        const mask = ~((1 << (32 - parseInt(bits))) - 1);
        const start = (a << 24 | b << 16 | c << 8 | d) & mask;
        const end = start + Math.pow(2, 32 - parseInt(bits)) - 1;
        
        const ips = [];
        for (let i = start; i <= end && i < start + 256; i++) {
            ips.push([
                (i >>> 24) & 255,
                (i >>> 16) & 255,
                (i >>> 8) & 255,
                i & 255
            ].join('.'));
        }
        
        return ips;
    }
    
    // Сканирование порта
    async scanPort(ip, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, this.timeout);
            
            socket.connect(port, ip, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve(true);
            });
            
            socket.on('error', () => {
                clearTimeout(timer);
                resolve(false);
            });
        });
    }
    
    // Проверка прокси (HTTP/SOCKS)
    async validateProxy(ip, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                resolve({ working: false, type: null });
            }, this.timeout);
            
            // Попытка HTTP CONNECT
            socket.connect(port, ip, () => {
                const httpRequest = `CONNECT google.com:80 HTTP/1.1\r\nHost: google.com\r\n\r\n`;
                socket.write(httpRequest);
            });
            
            socket.on('data', (data) => {
                clearTimeout(timer);
                const response = data.toString();
                
                if (response.includes('HTTP/1.1 200') || response.includes('HTTP/1.0 200')) {
                    socket.destroy();
                    resolve({ working: true, type: 'HTTP' });
                } else {
                    socket.destroy();
                    resolve({ working: false, type: null });
                }
            });
            
            socket.on('error', () => {
                clearTimeout(timer);
                resolve({ working: false, type: null });
            });
        });
    }
    
    // Сканирование одного IP
    async scanIP(ip) {
        const results = [];
        
        for (const port of this.ports) {
            const isOpen = await this.scanPort(ip, port);
            
            if (isOpen) {
                const proxy = `${ip}:${port}`;
                results.push(proxy);
                this.found.push(proxy);
                console.log(`✅ FOUND: ${proxy}`);
                
                // Сохранить сразу
                fs.appendFileSync(this.outputFile, proxy + '\n');
            }
        }
        
        this.scanned++;
        
        if (this.scanned % 100 === 0) {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
            const rate = (this.scanned / elapsed).toFixed(2);
            console.log(`📊 Scanned: ${this.scanned} | Found: ${this.found.length} | Rate: ${rate} IP/s`);
        }
        
        return results;
    }
    
    // Массовое сканирование
    async scanRange(ips) {
        const chunks = [];
        for (let i = 0; i < ips.length; i += this.maxConcurrent) {
            chunks.push(ips.slice(i, i + this.maxConcurrent));
        }
        
        console.log(`🚀 Starting scan of ${ips.length} IPs in ${chunks.length} batches...`);
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(ip => this.scanIP(ip)));
        }
        
        console.log(`\n✅ Scan complete!`);
        console.log(`📊 Total scanned: ${this.scanned}`);
        console.log(`🎯 Found proxies: ${this.found.length}`);
    }
    
    // Валидация найденных прокси
    async validateAll() {
        console.log(`\n🔍 Validating ${this.found.length} found proxies...`);
        
        const chunks = [];
        for (let i = 0; i < this.found.length; i += 50) {
            chunks.push(this.found.slice(i, i + 50));
        }
        
        for (const chunk of chunks) {
            const results = await Promise.all(
                chunk.map(async (proxy) => {
                    const [ip, port] = proxy.split(':');
                    const result = await this.validateProxy(ip, parseInt(port));
                    
                    if (result.working) {
                        console.log(`✅ VALIDATED: ${proxy} (${result.type})`);
                        this.validated.push(`${proxy}|${result.type}`);
                        fs.appendFileSync(this.validatedFile, `${proxy}|${result.type}\n`);
                    }
                    
                    return result;
                })
            );
        }
        
        console.log(`\n✅ Validation complete!`);
        console.log(`🎯 Working proxies: ${this.validated.length}/${this.found.length}`);
    }
    
    // Сканирование популярных диапазонов
    async scanPopularRanges() {
        // Известные диапазоны с высокой вероятностью прокси
        const ranges = [
            '45.0.0.0/16',      // Datacenters
            '185.0.0.0/16',     // European VPS
            '104.0.0.0/16',     // US Cloud
            '138.0.0.0/16',     // Oracle Cloud
            '167.0.0.0/16',     // DigitalOcean
        ];
        
        const allIPs = [];
        
        for (const range of ranges) {
            const ips = this.generateIPRange(range);
            allIPs.push(...ips);
            console.log(`📋 Generated ${ips.length} IPs from ${range}`);
        }
        
        await this.scanRange(allIPs);
    }
    
    // Случайное сканирование
    async scanRandom(count = 10000) {
        const ips = [];
        
        for (let i = 0; i < count; i++) {
            ips.push(this.generateRandomIP());
        }
        
        await this.scanRange(ips);
    }
}

// ИСПОЛЬЗОВАНИЕ
(async () => {
    const scanner = new IPv4ProxyScanner({
        timeout: 3000,           // Таймаут подключения
        maxConcurrent: 1000,     // Одновременных сканирований
        ports: [8080, 3128, 80, 8888, 1080, 9050, 3129, 8081, 8000, 3130],
        outputFile: 'found_proxies.txt',
        validatedFile: 'validated_proxies.txt'
    });
    
    // РЕЖИМ 1: Сканирование конкретного диапазона
    console.log('Mode: CIDR Range Scanning');
    const ips = scanner.generateIPRange('45.142.120.0/24');
    await scanner.scanRange(ips);
    
    // РЕЖИМ 2: Сканирование популярных диапазонов
    // await scanner.scanPopularRanges();
    
    // РЕЖИМ 3: Случайное сканирование
    // await scanner.scanRandom(5000);
    
    // Валидация найденных прокси
    if (scanner.found.length > 0) {
        await scanner.validateAll();
    }
    
    console.log('\n📁 Results saved to:');
    console.log(`   - ${scanner.outputFile} (all found)`);
    console.log(`   - ${scanner.validatedFile} (validated only)`);
})();
