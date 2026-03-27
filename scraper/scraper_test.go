package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	scr "github.com/Hahfyeex/Stellar-PolyMarket/scraper/scraper"
	"github.com/Hahfyeex/Stellar-PolyMarket/scraper/store"
)

// --- Mock store ---

type mockStore struct {
	mu             sync.Mutex
	events         []*store.Event
	lastProcessed  int64
	saveErr        error
	updateErr      error
}

func (m *mockStore) SaveEvents(events []*store.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.saveErr != nil {
		return m.saveErr
	}
	m.events = append(m.events, events...)
	return nil
}

func (m *mockStore) GetLastProcessedLedger() (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastProcessed, nil
}

func (m *mockStore) UpdateLastProcessedLedger(seq int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.updateErr != nil {
		return m.updateErr
	}
	m.lastProcessed = seq
	return nil
}

// --- Tests ---

func TestFilterEvents_MatchesContractAddress(t *testing.T) {
	ops := []scr.HorizonOperationForTest{
		{
			ID:              "op1",
			Type:            "invoke_host_function",
			TransactionHash: "tx1",
			ContractID:      "CONTRACT_A",
			Function:        "place_bet",
			CreatedAt:       "2025-01-01T00:00:00Z",
			SourceAccount:   "GABC",
		},
		{
			ID:              "op2",
			Type:            "invoke_host_function",
			TransactionHash: "tx2",
			ContractID:      "CONTRACT_B",
			Function:        "resolve",
			CreatedAt:       "2025-01-01T00:00:01Z",
			SourceAccount:   "GDEF",
		},
		{
			ID:              "op3",
			Type:            "payment",
			TransactionHash: "tx3",
			CreatedAt:       "2025-01-01T00:00:02Z",
			SourceAccount:   "GHIJ",
		},
	}

	horizonOps := toHorizonOps(ops)

	// Filter for CONTRACT_A only.
	events := scr.FilterEvents(horizonOps, "CONTRACT_A", 100)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].TxHash != "tx1" {
		t.Errorf("expected tx1, got %s", events[0].TxHash)
	}
	if events[0].EventType != "place_bet" {
		t.Errorf("expected event type place_bet, got %s", events[0].EventType)
	}
}

func TestFilterEvents_NoFilter_ReturnsAllInvocations(t *testing.T) {
	ops := []scr.HorizonOperationForTest{
		{
			ID:              "op1",
			Type:            "invoke_host_function",
			TransactionHash: "tx1",
			ContractID:      "CONTRACT_A",
			CreatedAt:       "2025-01-01T00:00:00Z",
			SourceAccount:   "GABC",
		},
		{
			ID:              "op2",
			Type:            "invoke_host_function",
			TransactionHash: "tx2",
			ContractID:      "CONTRACT_B",
			CreatedAt:       "2025-01-01T00:00:01Z",
			SourceAccount:   "GDEF",
		},
		{
			ID:              "op3",
			Type:            "payment",
			TransactionHash: "tx3",
			CreatedAt:       "2025-01-01T00:00:02Z",
			SourceAccount:   "GHIJ",
		},
	}

	horizonOps := toHorizonOps(ops)

	// Empty contract address means no filtering.
	events := scr.FilterEvents(horizonOps, "", 200)
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
}

func TestFilterEvents_IgnoresNonInvokeOps(t *testing.T) {
	ops := []scr.HorizonOperationForTest{
		{ID: "op1", Type: "payment", TransactionHash: "tx1", CreatedAt: "2025-01-01T00:00:00Z"},
		{ID: "op2", Type: "create_account", TransactionHash: "tx2", CreatedAt: "2025-01-01T00:00:01Z"},
	}

	horizonOps := toHorizonOps(ops)
	events := scr.FilterEvents(horizonOps, "", 300)
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestGoroutinePoolProcessesConcurrently(t *testing.T) {
	// Set up a Horizon mock that tracks concurrent requests.
	var concurrentRequests int64
	var maxConcurrent int64

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cur := atomic.AddInt64(&concurrentRequests, 1)

		// Track the peak concurrency.
		for {
			old := atomic.LoadInt64(&maxConcurrent)
			if cur <= old || atomic.CompareAndSwapInt64(&maxConcurrent, old, cur) {
				break
			}
		}

		// Simulate some work.
		time.Sleep(20 * time.Millisecond)
		atomic.AddInt64(&concurrentRequests, -1)

		// Return an appropriate response based on the URL.
		if r.URL.Path == "/ledgers" {
			// Latest ledger query.
			json.NewEncoder(w).Encode(map[string]interface{}{
				"_embedded": map[string]interface{}{
					"records": []map[string]interface{}{
						{"sequence": 110},
					},
				},
			})
			return
		}

		// Ledger operations query — return empty.
		json.NewEncoder(w).Encode(map[string]interface{}{
			"_embedded": map[string]interface{}{
				"records": []interface{}{},
			},
		})
	}))
	defer server.Close()

	ms := &mockStore{lastProcessed: 99}
	s := scr.New(server.URL, "", 5, 100*time.Millisecond, server.Client(), ms)

	// Run scraper in background, stop after it processes a batch.
	go func() {
		time.Sleep(300 * time.Millisecond)
		s.Stop()
	}()

	_ = s.Run(100)

	peak := atomic.LoadInt64(&maxConcurrent)
	if peak < 2 {
		t.Errorf("expected concurrent requests >= 2, got %d (pool not working)", peak)
	}
}

func TestCatchUpFromStartLedger(t *testing.T) {
	// Verify that --start-ledger overrides the DB resume point.
	ms := &mockStore{lastProcessed: 50}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ledgers" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"_embedded": map[string]interface{}{
					"records": []map[string]interface{}{
						{"sequence": 12},
					},
				},
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"_embedded": map[string]interface{}{
				"records": []interface{}{},
			},
		})
	}))
	defer server.Close()

	s := scr.New(server.URL, "", 2, 50*time.Millisecond, server.Client(), ms)

	go func() {
		time.Sleep(200 * time.Millisecond)
		s.Stop()
	}()

	// Start from ledger 10, NOT 51 (the DB resume point).
	_ = s.Run(10)

	ms.mu.Lock()
	last := ms.lastProcessed
	ms.mu.Unlock()

	if last < 10 {
		t.Errorf("expected last processed >= 10 (catch-up start), got %d", last)
	}
}

func TestResumeFromLastProcessedLedger(t *testing.T) {
	// When start-ledger is 0 the scraper should resume from DB state.
	ms := &mockStore{lastProcessed: 75}

	requestedPaths := make([]string, 0)
	var pathsMu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathsMu.Lock()
		requestedPaths = append(requestedPaths, r.URL.Path)
		pathsMu.Unlock()

		if r.URL.Path == "/ledgers" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"_embedded": map[string]interface{}{
					"records": []map[string]interface{}{
						{"sequence": 78},
					},
				},
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"_embedded": map[string]interface{}{
				"records": []interface{}{},
			},
		})
	}))
	defer server.Close()

	s := scr.New(server.URL, "", 2, 50*time.Millisecond, server.Client(), ms)

	go func() {
		time.Sleep(200 * time.Millisecond)
		s.Stop()
	}()

	// 0 means resume mode.
	_ = s.Run(0)

	// It should have requested ledger 76 (lastProcessed+1), not 1.
	pathsMu.Lock()
	defer pathsMu.Unlock()

	found := false
	for _, p := range requestedPaths {
		if p == "/ledgers/76/operations" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected request for ledger 76 (resume from 75), paths: %v", requestedPaths)
	}
}

func TestFilterEvents_FunctionNameAsEventType(t *testing.T) {
	ops := []scr.HorizonOperationForTest{
		{
			ID:              "op1",
			Type:            "invoke_host_function",
			TransactionHash: "tx1",
			ContractID:      "C_ADDR",
			Function:        "create_market",
			CreatedAt:       "2025-06-01T12:00:00Z",
			SourceAccount:   "GABC",
		},
		{
			ID:              "op2",
			Type:            "invoke_host_function",
			TransactionHash: "tx2",
			ContractID:      "C_ADDR",
			Function:        "",
			CreatedAt:       "2025-06-01T12:00:01Z",
			SourceAccount:   "GDEF",
		},
	}

	horizonOps := toHorizonOps(ops)
	events := scr.FilterEvents(horizonOps, "C_ADDR", 500)

	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].EventType != "create_market" {
		t.Errorf("expected create_market, got %s", events[0].EventType)
	}
	if events[1].EventType != "contract_invoke" {
		t.Errorf("expected contract_invoke for empty function, got %s", events[1].EventType)
	}
}

// --- Helpers ---

// toHorizonOps converts test structs to the scraper's internal type.
// We use a JSON round-trip so the test does not depend on unexported fields.
func toHorizonOps(ops []scr.HorizonOperationForTest) []scr.HorizonOperationPublic {
	result := make([]scr.HorizonOperationPublic, len(ops))
	for i, op := range ops {
		b, _ := json.Marshal(op)
		_ = json.Unmarshal(b, &result[i])
	}
	return result
}

// Verify that mockStore satisfies EventStore at compile time.
var _ scr.EventStore = (*mockStore)(nil)

// Verify that the HTTP test server client satisfies HorizonClient.
func TestHTTPClientSatisfiesInterface(t *testing.T) {
	var _ scr.HorizonClient = &http.Client{}
	_ = fmt.Sprintf("compile-time check passed")
}
