// Ledger Event Scraper — a Go service that scrapes Stellar ledger events
// from the Horizon API and persists matching contract invocations to PostgreSQL.
//
// Usage:
//
//	scraper [--start-ledger N] [--contract-address ADDR]
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Hahfyeex/Stellar-PolyMarket/scraper/config"
	scr "github.com/Hahfyeex/Stellar-PolyMarket/scraper/scraper"
	"github.com/Hahfyeex/Stellar-PolyMarket/scraper/store"
)

func main() {
	startLedger := flag.Int64("start-ledger", 0, "ledger sequence to start scraping from (0 = resume from DB)")
	contractAddr := flag.String("contract-address", "", "Soroban contract address to filter (overrides CONTRACT_ADDRESS env)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// CLI flag overrides env var.
	if *contractAddr != "" {
		cfg.ContractAddress = *contractAddr
	}

	log.Printf("horizon: %s", cfg.HorizonURL)
	log.Printf("contract filter: %s", cfg.ContractAddress)
	log.Printf("workers: %d", cfg.WorkerCount)

	st, err := store.New(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer st.Close()

	client := &http.Client{Timeout: 30 * time.Second}
	pollInterval := time.Duration(cfg.PollIntervalSec) * time.Second

	s := scr.New(cfg.HorizonURL, cfg.ContractAddress, cfg.WorkerCount, pollInterval, client, st)

	// Graceful shutdown on SIGINT / SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("received %s, shutting down...", sig)
		s.Stop()
	}()

	if err := s.Run(*startLedger); err != nil {
		log.Fatalf("scraper error: %v", err)
	}
}
