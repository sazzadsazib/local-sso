package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"local-sso/internal/server"
	"strconv"
	"time"
	_ "time/tzdata"
)

//go:embed all:web/dist
var webFS embed.FS

func main() {
	var port int
	var host string
	var tenant string
	var baseURL string
	var issuerMode string
	var noBrowser bool

	defaultPort := 8080
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil && p > 0 && p <= 65535 {
			defaultPort = p
		}
	}

	defaultHost := "127.0.0.1"
	if os.Getenv("RENDER") != "" || os.Getenv("HOST") != "" || os.Getenv("PORT") != "" {
		defaultHost = "0.0.0.0"
		if h := os.Getenv("HOST"); h != "" {
			defaultHost = h
		}
	}

	defaultNoBrowser := false
	if os.Getenv("RENDER") != "" || os.Getenv("PORT") != "" || (runtime.GOOS == "linux" && os.Getenv("DISPLAY") == "") {
		defaultNoBrowser = true
	}

	flag.IntVar(&port, "port", defaultPort, "Port to listen on")
	flag.IntVar(&port, "p", defaultPort, "Port to listen on (shorthand)")
	flag.StringVar(&host, "host", defaultHost, "Host/IP interface to bind on (e.g. 127.0.0.1 or 0.0.0.0)")
	flag.StringVar(&host, "h", defaultHost, "Host/IP interface to bind on (shorthand)")
	flag.StringVar(&tenant, "tenant", "common", "Default tenant alias or GUID")
	flag.StringVar(&tenant, "t", "common", "Default tenant alias or GUID (shorthand)")
	flag.StringVar(&baseURL, "base-url", "", "Override base URL for OIDC metadata (e.g. https://xxxx.onrender.com)")
	flag.StringVar(&baseURL, "b", "", "Override base URL for OIDC metadata (shorthand)")
	flag.StringVar(&issuerMode, "issuer-mode", "host", "Issuer format: 'host' (default, uses host origin) or 'entra' (https://login.microsoftonline.com/{tenant}/v2.0)")
	flag.BoolVar(&noBrowser, "no-browser", defaultNoBrowser, "Do not attempt to open browser automatically")

	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Usage of %s:\n", os.Args[0])
		fmt.Fprintf(flag.CommandLine.Output(), "  -p, -port int\n    \tPort to listen on (default %d)\n", defaultPort)
		fmt.Fprintf(flag.CommandLine.Output(), "  -h, -host string\n    \tHost interface to bind on (default \"%s\")\n", defaultHost)
		fmt.Fprintf(flag.CommandLine.Output(), "  -t, -tenant string\n    \tDefault tenant alias or GUID (default \"common\")\n")
		fmt.Fprintf(flag.CommandLine.Output(), "  -b, -base-url string\n    \tOverride base URL for OIDC metadata (e.g. https://xxxx.onrender.com)\n")
		fmt.Fprintf(flag.CommandLine.Output(), "  -issuer-mode string\n    \tIssuer format: 'host' (default, uses host origin) or 'entra' (https://login.microsoftonline.com/{tenant}/v2.0) (default \"host\")\n")
		fmt.Fprintf(flag.CommandLine.Output(), "  -no-browser\n    \tDo not attempt to open browser automatically\n")
	}

	flag.Parse()

	if baseURL == "" {
		if rURL := os.Getenv("RENDER_EXTERNAL_URL"); rURL != "" {
			baseURL = rURL
		} else if bURL := os.Getenv("BASE_URL"); bURL != "" {
			baseURL = bURL
		}
	}

	if port < 1 || port > 65535 {
		log.Fatalf("Invalid port %d: port must be between 1 and 65535", port)
	}

	if isUnsafeBrowserPort(port) {
		fmt.Println("----------------------------------------------------------------")
		fmt.Printf("⚠️  WARNING: Port %d is blocked by web browsers (ERR_UNSAFE_PORT)!\n", port)
		fmt.Println("   Chrome, Edge, Firefox, and Safari block port 6000 (X11 service protection).")
		fmt.Println("   -> Please use an allowed port instead, for example: -p 8080 or -p 3000")
		fmt.Println("----------------------------------------------------------------")
	}

	addr := fmt.Sprintf("%s:%d", host, port)

	srvInst, err := server.New(port, webFS)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}
	srvInst.BaseURL = baseURL
	srvInst.IssuerMode = issuerMode

	mux := srvInst.Handler()
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to bind to %s (is another instance running?): %v", addr, err)
	}

	fmt.Println("================================================================")
	fmt.Println("  local-sso — Local Mock Microsoft Entra ID (OIDC) & SSO Playground")
	fmt.Println("================================================================")
	fmt.Printf("  -> Web Dashboard:    http://localhost:%d/#projects\n", port)
	fmt.Printf("  -> Mock Users:       http://localhost:%d/#users\n", port)
	fmt.Printf("  -> Test Client:      http://localhost:%d/#login\n", port)
	fmt.Println("----------------------------------------------------------------")
	fmt.Printf("  -> OIDC Discovery:   http://localhost:%d/%s/v2.0/.well-known/openid-configuration\n", port, tenant)
	fmt.Printf("  -> Authorize URL:    http://localhost:%d/%s/oauth2/v2.0/authorize\n", port, tenant)
	fmt.Printf("  -> Token URL:        http://localhost:%d/%s/oauth2/v2.0/token\n", port, tenant)
	fmt.Printf("  -> JWKS Keys URL:    http://localhost:%d/%s/discovery/v2.0/keys\n", port, tenant)
	fmt.Println("================================================================")
	fmt.Println("Press Ctrl+C to stop.")

	if !noBrowser {
		go openBrowser(fmt.Sprintf("http://localhost:%d/#projects", port))
	}

	done := make(chan struct{})
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt)
		<-sigChan

		fmt.Println("\nShutting down local-sso...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
		close(done)
	}()

	if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("HTTP server error: %v", err)
	}
	<-done
}

func openBrowser(url string) {
	time.Sleep(200 * time.Millisecond)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

// isUnsafeBrowserPort returns true if the port is in the Chromium/WHATWG restricted ports list,
// which causes browsers to abort navigation with ERR_UNSAFE_PORT.
func isUnsafeBrowserPort(port int) bool {
	if (port >= 6000 && port <= 6063) || // X11
		(port >= 6665 && port <= 6669) || // IRC
		port == 6697 ||                   // IRC SSL
		port == 1 || port == 7 || port == 9 || port == 11 || port == 13 || port == 15 ||
		port == 17 || port == 19 || port == 20 || port == 21 || port == 22 || port == 23 ||
		port == 25 || port == 37 || port == 42 || port == 43 || port == 53 || port == 69 ||
		port == 77 || port == 79 || port == 87 || port == 95 || port == 101 || port == 102 ||
		port == 103 || port == 104 || port == 109 || port == 110 || port == 111 || port == 113 ||
		port == 115 || port == 117 || port == 119 || port == 123 || port == 135 || port == 139 ||
		port == 143 || port == 179 || port == 389 || port == 427 || port == 465 || port == 512 ||
		port == 513 || port == 514 || port == 515 || port == 526 || port == 530 || port == 531 ||
		port == 532 || port == 540 || port == 548 || port == 556 || port == 563 || port == 587 ||
		port == 601 || port == 636 || port == 989 || port == 990 || port == 993 || port == 995 ||
		port == 1719 || port == 1720 || port == 1723 || port == 2049 || port == 3659 ||
		port == 4045 || port == 5060 || port == 5061 || port == 6566 || port == 10080 {
		return true
	}
	return false
}

