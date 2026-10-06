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
)

//go:embed all:web
var webFS embed.FS

func main() {
	portFlag := flag.Int("port", 8080, "Port to listen on (localhost only)")
	tenantFlag := flag.String("tenant", "common", "Default tenant alias or GUID")
	noBrowser := flag.Bool("no-browser", false, "Do not attempt to open browser automatically")
	flag.Parse()

	port := *portFlag
	addr := fmt.Sprintf("127.0.0.1:%d", port)

	srvInst, err := server.New(port, webFS)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}

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
	fmt.Printf("  -> Web Dashboard:    http://127.0.0.1:%d/#config\n", port)
	fmt.Printf("  -> Mock Users:       http://127.0.0.1:%d/#users\n", port)
	fmt.Printf("  -> Test Client:      http://127.0.0.1:%d/#login\n", port)
	fmt.Println("----------------------------------------------------------------")
	fmt.Printf("  -> OIDC Discovery:   http://127.0.0.1:%d/%s/v2.0/.well-known/openid-configuration\n", port, *tenantFlag)
	fmt.Printf("  -> Authorize URL:    http://127.0.0.1:%d/%s/oauth2/v2.0/authorize\n", port, *tenantFlag)
	fmt.Printf("  -> Token URL:        http://127.0.0.1:%d/%s/oauth2/v2.0/token\n", port, *tenantFlag)
	fmt.Printf("  -> JWKS Keys URL:    http://127.0.0.1:%d/%s/discovery/v2.0/keys\n", port, *tenantFlag)
	fmt.Println("================================================================")
	fmt.Println("Press Ctrl+C to stop.")

	if !*noBrowser {
		go openBrowser(fmt.Sprintf("http://127.0.0.1:%d/#config", port))
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
