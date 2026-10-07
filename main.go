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
	"sso-local/internal/server"
	"time"
	_ "time/tzdata"
)

//go:embed all:web/dist
var webFS embed.FS

func main() {
	portFlag := flag.Int("port", 8080, "Port to listen on (localhost only)")
	tenantFlag := flag.String("tenant", "common", "Default tenant alias or GUID")
	baseURLFlag := flag.String("base-url", "", "Override base URL for OIDC metadata (e.g. https://xxxx.ngrok-free.app)")
	issuerModeFlag := flag.String("issuer-mode", "host", "Issuer format: 'host' (default, uses host origin) or 'entra' (https://login.microsoftonline.com/{tenant}/v2.0)")
	noBrowser := flag.Bool("no-browser", false, "Do not attempt to open browser automatically")
	flag.Parse()

	port := *portFlag
	addr := fmt.Sprintf("127.0.0.1:%d", port)

	srvInst, err := server.New(port, webFS)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}
	srvInst.BaseURL = *baseURLFlag
	srvInst.IssuerMode = *issuerModeFlag

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
	fmt.Println("  sso-local — Local Mock Microsoft Entra ID (OIDC) & SSO Playground")
	fmt.Println("================================================================")
	fmt.Printf("  -> Web Dashboard:    http://localhost:%d/#projects\n", port)
	fmt.Printf("  -> Mock Users:       http://localhost:%d/#users\n", port)
	fmt.Printf("  -> Test Client:      http://localhost:%d/#login\n", port)
	fmt.Println("----------------------------------------------------------------")
	fmt.Printf("  -> OIDC Discovery:   http://localhost:%d/%s/v2.0/.well-known/openid-configuration\n", port, *tenantFlag)
	fmt.Printf("  -> Authorize URL:    http://localhost:%d/%s/oauth2/v2.0/authorize\n", port, *tenantFlag)
	fmt.Printf("  -> Token URL:        http://localhost:%d/%s/oauth2/v2.0/token\n", port, *tenantFlag)
	fmt.Printf("  -> JWKS Keys URL:    http://localhost:%d/%s/discovery/v2.0/keys\n", port, *tenantFlag)
	fmt.Println("================================================================")
	fmt.Println("Press Ctrl+C to stop.")

	if !*noBrowser {
		go openBrowser(fmt.Sprintf("http://localhost:%d/#projects", port))
	}

	done := make(chan struct{})
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt)
		<-sigChan

		fmt.Println("\nShutting down sso-local...")
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
