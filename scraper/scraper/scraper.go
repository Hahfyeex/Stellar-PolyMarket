// Package scraper implements the core ledger event scraping logic.
// It polls the Stellar Horizon API for ledger operations, filters by
// contract address, and persists matching events to PostgreSQL.
package scraper

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Hahfyeex/Stellar-PolyMarket/scraper/store"
)

// HorizonClient defines the HTTP interface used by the scraper, making it
// easy to swap in a mock for testing.
type HorizonClient interface {
	Get(url string) (*http.Response, error)
}

// EventStore defines the storage interface used by the scraper.
type EventStore interface {
	SaveEvents(events []*store.Event) error
	GetLastProcessedLedger() (int64, error)
	UpdateLastProcessedLedger(seq int64) error
}

// Scraper coordinates ledger scraping with a pool of concurrent workers.
type Scraper struct {
	horizonURL      string
	contractAddress string
	workerCount     int
	pollInterval    time.Duration
	client          HorizonClient
	store           EventStore
	stopCh          chan struct{}
}

// New creates a Scraper with the given configuration.
func New(horizonURL, contractAddress string, workerCount int, pollInterval time.Duration, client HorizonClient, st EventStore) *Scraper {
	return &Scraper{
		horizonURL:      strings.TrimRight(horizonURL, "/"),
		contractAddress: contractAddress,
		workerCount:     workerCount,
		pollInterval:    pollInterval,
		client:          client,
		store:           st,
		stopCh:          make(chan struct{}),
	}
}

// Run starts the scraping loop. If startLedger > 0 it begins from that ledger
// (catch-up mode); otherwise it resumes from the last processed ledger stored
// in the database. Run blocks until Stop is called or a fatal error occurs.
func (s *Scraper) Run(startLedger int64) error {
	seq := startLedger

	if seq <= 0 {
		last, err := s.store.GetLastProcessedLedger()
		if err != nil {
			return fmt.Errorf("load resume point: %w", err)
		}
		seq = last + 1
		log.Printf("resuming from ledger %d (last processed: %d)", seq, last)
	} else {
		log.Printf("starting catch-up from ledger %d", seq)
	}

	for {
		select {
		case <-s.stopCh:
			log.Println("scraper stopped")
			return nil
		default:
		}

		latestLedger, err := s.getLatestLedgerSeq()
		if err != nil {
			log.Printf("error fetching latest ledger: %v, retrying in %v", err, s.pollInterval)
			time.Sleep(s.pollInterval)
			continue
		}

		if seq > latestLedger {
			// We are caught up; wait for new ledgers.
			time.Sleep(s.pollInterval)
			continue
		}

		// Process a batch of ledgers concurrently.
		end := seq + int64(s.workerCount)
		if end > latestLedger+1 {
			end = latestLedger + 1
		}

		if err := s.processBatch(seq, end); err != nil {
			log.Printf("error processing batch [%d, %d): %v", seq, end, err)
			time.Sleep(s.pollInterval)
			continue
		}

		seq = end
	}
}

// Stop signals the scraper to shut down gracefully.
func (s *Scraper) Stop() {
	close(s.stopCh)
}

// processBatch processes ledgers in [start, end) using a goroutine pool.
// Results are collected and saved in sequential order so the last-processed
// ledger marker stays consistent.
func (s *Scraper) processBatch(start, end int64) error {
	count := int(end - start)
	type result struct {
		seq    int64
		events []*store.Event
		err    error
	}

	results := make([]result, count)
	jobs := make(chan int, count)
	var wg sync.WaitGroup

	// Launch worker goroutines.
	for w := 0; w < s.workerCount && w < count; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				ledgerSeq := start + int64(idx)
				events, err := s.processLedger(ledgerSeq)
				results[idx] = result{seq: ledgerSeq, events: events, err: err}
			}
		}()
	}

	// Send jobs.
	for i := 0; i < count; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	// Save results in order and update the progress marker.
	for _, r := range results {
		if r.err != nil {
			return fmt.Errorf("ledger %d: %w", r.seq, r.err)
		}
		if len(r.events) > 0 {
			if err := s.store.SaveEvents(r.events); err != nil {
				return fmt.Errorf("save events for ledger %d: %w", r.seq, err)
			}
			log.Printf("ledger %d: saved %d event(s)", r.seq, len(r.events))
		}
		if err := s.store.UpdateLastProcessedLedger(r.seq); err != nil {
			return fmt.Errorf("update progress for ledger %d: %w", r.seq, err)
		}
	}

	return nil
}

// processLedger fetches operations for a single ledger and returns matching events.
func (s *Scraper) processLedger(seq int64) ([]*store.Event, error) {
	ops, err := s.fetchOperations(seq)
	if err != nil {
		return nil, err
	}
	return FilterEvents(ops, s.contractAddress, seq), nil
}

// horizonOperationsResponse represents the Horizon API response for listing
// operations within a ledger.
type horizonOperationsResponse struct {
	Embedded struct {
		Records []HorizonOperationPublic `json:"records"`
	} `json:"_embedded"`
}

// HorizonOperationPublic represents a single Horizon operation record.
// Exported so that external test packages can construct test data.
type HorizonOperationPublic struct {
	ID              string          `json:"id"`
	Type            string          `json:"type"`
	TransactionHash string          `json:"transaction_hash"`
	SourceAccount   string          `json:"source_account"`
	CreatedAt       string          `json:"created_at"`
	// Soroban invoke fields
	Function        string          `json:"function,omitempty"`
	ContractID      string          `json:"contract_id,omitempty"`
	Parameters      json.RawMessage `json:"parameters,omitempty"`
}

// HorizonOperationForTest is an alias for HorizonOperationPublic, provided
// for readability in test code.
type HorizonOperationForTest = HorizonOperationPublic

// fetchOperations retrieves all operations for the given ledger sequence
// from the Horizon API.
func (s *Scraper) fetchOperations(seq int64) ([]HorizonOperationPublic, error) {
	url := fmt.Sprintf("%s/ledgers/%d/operations?limit=200&order=asc", s.horizonURL, seq)

	resp, err := s.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// Ledger does not exist yet.
		return nil, fmt.Errorf("ledger %d not found (404)", seq)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s returned %d: %s", url, resp.StatusCode, string(body))
	}

	var result horizonOperationsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response for ledger %d: %w", seq, err)
	}

	return result.Embedded.Records, nil
}

// getLatestLedgerSeq fetches the most recent ledger sequence from Horizon.
func (s *Scraper) getLatestLedgerSeq() (int64, error) {
	url := fmt.Sprintf("%s/ledgers?limit=1&order=desc", s.horizonURL)

	resp, err := s.client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GET %s returned %d", url, resp.StatusCode)
	}

	var result struct {
		Embedded struct {
			Records []struct {
				Sequence int64 `json:"sequence"`
			} `json:"records"`
		} `json:"_embedded"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decode latest ledger: %w", err)
	}
	if len(result.Embedded.Records) == 0 {
		return 0, fmt.Errorf("no ledgers found")
	}

	return result.Embedded.Records[0].Sequence, nil
}

// FilterEvents inspects a set of Horizon operations and extracts events
// that match the configured contract address. If contractAddress is empty,
// all invoke_host_function operations are returned.
func FilterEvents(ops []HorizonOperationPublic, contractAddress string, ledgerSeq int64) []*store.Event {
	var events []*store.Event

	for _, op := range ops {
		// Only consider Soroban contract invocations.
		if op.Type != "invoke_host_function" {
			continue
		}

		// Filter by contract address when one is configured.
		if contractAddress != "" && op.ContractID != contractAddress {
			continue
		}

		ts, _ := time.Parse(time.RFC3339, op.CreatedAt)

		data, _ := json.Marshal(map[string]interface{}{
			"operation_id":   op.ID,
			"function":       op.Function,
			"contract_id":    op.ContractID,
			"source_account": op.SourceAccount,
			"parameters":     op.Parameters,
		})

		eventType := "contract_invoke"
		if op.Function != "" {
			eventType = op.Function
		}

		events = append(events, &store.Event{
			LedgerSeq: ledgerSeq,
			TxHash:    op.TransactionHash,
			EventType: eventType,
			Data:      data,
			Timestamp: ts,
		})
	}

	return events
}
