const net = require('net');
const fs = require('fs');

class IPv4ProxyScanner {
    constructor(options = {}) {
        this.timeout = options.timeout || 3000;
        this.ports = options.ports || [8080, 3128, 80, 8888, 1080, 9050, 3129, 8081];
        this.maxConcurrent = options.maxConcurrent || 1000;
        this.outputFile = options.outputFile || 'found_proxies.txt';
        this.validatedFile = options.validatedFile || 'validated_proxies.txt';
        this.continuousScan = options.continuousScan || true;
        this.rangeIndex = 0;
        
        this.scanned = 0;
        this.found = [];
        this.validated = [];
        this.totalScanned = 0;
        this.totalFound = 0;
        this.startTime = Date.now();
        
        // Популярные диапазоны для непрерывного сканирования
        this.ranges = [
            '45.0.0.0/16',
            '185.0.0.0/16',
            '104.0.0.0/16',
            '138.0.0.0/16',
            '167.0.0.0/16',
            '192.3.0.0/16',
            '206.0.0.0/16',
            '91.0.0.0/16',
            '94.0.0.0/16',
            '95.0.0.0/16',
            '176.0.0.0/16',
            '178.0.0.0/16',
            '188.0.0.0/16',
            '193.0.0.0/16',
            '194.0.0.0/16'
        ];
    }
    
    generateRandomIP() {
        return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    }
    
    generateIPRange(cidr) {
        const [base, bits] = cidr.split('/');
        const [a, b, c, d] = base.split('.').map(Number);
        const mask = ~((1 << (32 - parseInt(bits))) - 1);
        const start = (a << 24 | b << 16 | c << 8 | d) & mask;
        const end = start + Math.pow(2, 32 - parseInt(bits)) - 1;
        
        const ips = [];
        const limit = Math.min(end - start + 1, 256); // Ограничение на батч
        
        for (let i = 0; i < limit; i++) {
            const ip = start + Math.floor(Math.random() * (end - start + 1));
            ips.push([
                (ip >>> 24) & 255,
                (ip >>> 16) & 255,
                (ip >>> 8) & 255,
                ip & 255
            ].join('.'));
        }
        
        return ips;
    }
    
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
    
    async validateProxy(ip, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                resolve({ working: false, type: null });
            }, this.timeout);
            
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
    
    async scanIP(ip) {
        const results = [];
        
        for (const port of this.ports) {
            const isOpen = await this.scanPort(ip, port);
            
            if (isOpen) {
                const proxy = `${ip}:${port}`;
                results.push(proxy);
                this.found.push(proxy);
                this.totalFound++;
                
                const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
                console.log(`✅ FOUND: ${proxy} | Total: ${this.totalFound} | Time: ${elapsed}s`);
                
                fs.appendFileSync(this.outputFile, proxy + '\n');
                
                // Валидация сразу
                const [validIP, validPort] = proxy.split(':');
                const validation = await this.validateProxy(validIP, parseInt(validPort));
                
                if (validation.working) {
                    console.log(`✅ VALIDATED: ${proxy} (${validation.type})`);
                    this.validated.push(`${proxy}|${validation.type}`);
                    fs.appendFileSync(this.validatedFile, `${proxy}|${validation.type}\n`);
                }
            }
        }
        
        this.scanned++;
        this.totalScanned++;
        
        if (this.scanned % 100 === 0) {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
            const rate = (this.totalScanned / elapsed).toFixed(2);
            console.log(`📊 Scanned: ${this.totalScanned} | Found: ${this.totalFound} | Validated: ${this.validated.length} | Rate: ${rate} IP/s`);
        }
        
        return results;
    }
    
    async scanRange(ips, rangeName = '') {
        const chunks = [];
        for (let i = 0; i < ips.length; i += this.maxConcurrent) {
            chunks.push(ips.slice(i, i + this.maxConcurrent));
        }
        
        console.log(`\n🚀 Scanning ${rangeName} - ${ips.length} IPs in ${chunks.length} batches...`);
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(ip => this.scanIP(ip)));
        }
        
        console.log(`✅ Range ${rangeName} complete! Found: ${this.found.length - (this.totalFound - this.found.length)}`);
    }
    
    // БЕСКОНЕЧНОЕ СКАНИРОВАНИЕ
    async scanContinuously() {
        console.log('🔄 CONTINUOUS PROXY SCANNER STARTED');
        console.log('🎯 Will scan forever until stopped (Ctrl+C to stop)');
        console.log('📁 Results auto-save to:', this.outputFile);
        console.log('=' .repeat(60));
        
        let iteration = 0;
        
        while (this.continuousScan) {
            iteration++;
            this.scanned = 0;
            this.found = [];
            
            // Выбор диапазона по кругу
            const currentRange = this.ranges[this.rangeIndex % this.ranges.length];
            this.rangeIndex++;
            
            console.log(`\n🔄 ITERATION #${iteration} | Range: ${currentRange}`);
            
            const ips = this.generateIPRange(currentRange);
            await this.scanRange(ips, currentRange);
            
            // Статистика после каждой итерации
            const elapsed = ((Date.now() - this.startTime) / 60000).toFixed(2);
            console.log(`\n📊 SESSION STATS (${elapsed} min):`);
            console.log(`   Total Scanned: ${this.totalScanned}`);
            console.log(`   Total Found: ${this.totalFound}`);
            console.log(`   Total Validated: ${this.validated.length}`);
            console.log(`   Success Rate: ${((this.totalFound / this.totalScanned) * 100).toFixed(3)}%`);
            
            // Небольшая пауза между итерациями
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // БЕСКОНЕЧНОЕ СЛУЧАЙНОЕ СКАНИРОВАНИЕ
    async scanRandomContinuously(batchSize = 500) {
        console.log('🔄 CONTINUOUS RANDOM PROXY SCANNER STARTED');
        console.log('🎯 Will scan random IPs forever until stopped (Ctrl+C to stop)');
        console.log('📁 Results auto-save to:', this.outputFile);
        console.log('=' .repeat(60));
        
        let iteration = 0;
        
        while (this.continuousScan) {
            iteration++;
            this.scanned = 0;
            this.found = [];
            
            console.log(`\n🔄 ITERATION #${iteration} | Random batch: ${batchSize} IPs`);
            
            const ips = [];
            for (let i = 0; i < batchSize; i++) {
                ips.push(this.generateRandomIP());
            }
            
            await this.scanRange(ips, `Random-${iteration}`);
            
            // Статистика
            const elapsed = ((Date.now() - this.startTime) / 60000).toFixed(2);
            console.log(`\n📊 SESSION STATS (${elapsed} min):`);
            console.log(`   Total Scanned: ${this.totalScanned}`);
            console.log(`   Total Found: ${this.totalFound}`);
            console.log(`   Total Validated: ${this.validated.length}`);
            console.log(`   Success Rate: ${((this.totalFound / this.totalScanned) * 100).toFixed(3)}%`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    stop() {
        this.continuousScan = false;
        console.log('\n🛑 Scanner stopped by user');
    }
}

// ИСПОЛЬЗОВАНИЕ
(async () => {
    const scanner = new IPv4ProxyScanner({
        timeout: 2000,
        maxConcurrent: 1000,
        ports: [8080, 3128, 80, 8888, 1080, 9050, 3129, 8081, 8000, 3130],
        outputFile: 'found_proxies.txt',
        validatedFile: 'validated_proxies.txt',
        continuousScan: true
    });
    
    // Обработка Ctrl+C для корректного завершения
    process.on('SIGINT', () => {
        scanner.stop();
        console.log('\n📁 Final results saved to:');
        console.log(`   - ${scanner.outputFile} (total found: ${scanner.totalFound})`);
        console.log(`   - ${scanner.validatedFile} (validated: ${scanner.validated.length})`);
        process.exit(0);
    });
    
    // РЕЖИМ 1: Непрерывное сканирование популярных диапазонов
    await scanner.scanContinuously();
    
    // РЕЖИМ 2: Непрерывное случайное сканирование
    // await scanner.scanRandomContinuously(500);
})();
