/**
 * tests/gap-detector.test.js
 *
 * Comprehensive test suite for the self-healing gap detector.
 * Tests gap detection, back-fill functionality, and error scenarios.
 * Targets 95% code coverage including edge cases and error paths.
 */

'use strict';

const gapDetector = require('../src/indexer/gap-detector');
const db = require('../src/db');
const logger = require('../src/utils/logger');

// Mock dependencies
jest.mock('../src/db');
jest.mock('../src/utils/logger');
jest.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn()
  }
}));

// Mock the mercury module to avoid actual event processing
jest.mock('../src/indexer/mercury', () => ({
  processEvent: jest.fn()
}));

describe('Gap Detector', () => {
  let mockRpcServer;
  let mockProcessEvent;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock processEvent from mercury module
    mockProcessEvent = require('../src/indexer/mercury').processEvent;
    mockProcessEvent.mockResolvedValue();

    // Mock RPC server
    mockRpcServer = {
      getLatestLedger: jest.fn(),
      getLedger: jest.fn()
    };
    
    const { SorobanRpc } = require('@stellar/stellar-sdk');
    SorobanRpc.Server.mockImplementation(() => mockRpcServer);

    // Set up environment variables
    process.env.CONTRACT_ADDRESS = 'test-contract-id';
    process.env.SOROBAN_RPC_URL = 'https://test-rpc.com';
    process.env.GAP_FILL_STRATEGY = 'batch';
    process.env.GAP_FILL_BATCH_SIZE = '5';
    process.env.GAP_FILL_BATCH_DELAY = '100';
    process.env.MAX_AUTO_RECOVERY_GAP = '100';
  });

  afterEach(() => {
    delete process.env.CONTRACT_ADDRESS;
    delete process.env.SOROBAN_RPC_URL;
    delete process.env.GAP_FILL_STRATEGY;
    delete process.env.GAP_FILL_BATCH_SIZE;
    delete process.env.GAP_FILL_BATCH_DELAY;
    delete process.env.MAX_AUTO_RECOVERY_GAP;
  });

  describe('getLatestStellarLedger', () => {
    it('should return the latest ledger sequence from Stellar', async () => {
      const mockLedger = { sequence: 12345 };
      mockRpcServer.getLatestLedger.mockResolvedValue(mockLedger);

      const result = await gapDetector.getLatestStellarLedger();
      
      expect(result).toBe(12345);
      expect(mockRpcServer.getLatestLedger).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle RPC errors gracefully', async () => {
      const error = new Error('RPC connection failed');
      mockRpcServer.getLatestLedger.mockRejectedValue(error);

      await expect(gapDetector.getLatestStellarLedger()).rejects.toThrow('RPC connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        { err: 'RPC connection failed' },
        'Failed to fetch latest ledger from Stellar'
      );
    });
  });

  describe('getMaxDbLedger', () => {
    it('should return the maximum ledger from database', async () => {
      db.query.mockResolvedValue({
        rows: [{ max_ledger: 12000 }]
      });

      const result = await gapDetector.getMaxDbLedger();
      
      expect(result).toBe(12000);
      expect(db.query).toHaveBeenCalledWith(
        'SELECT MAX(ledger_seq) as max_ledger FROM events WHERE contract_id = $1',
        ['test-contract-id']
      );
    });

    it('should return 0 when no events exist in database', async () => {
      db.query.mockResolvedValue({
        rows: [{ max_ledger: null }]
      });

      const result = await gapDetector.getMaxDbLedger();
      
      expect(result).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      db.query.mockRejectedValue(error);

      await expect(gapDetector.getMaxDbLedger()).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        { err: 'Database connection failed' },
        'Failed to get max ledger from database'
      );
    });
  });

  describe('detectGap', () => {
    it('should detect no gap when database is up to date', async () => {
      // Mock database and Stellar responses
      db.query.mockResolvedValue({ rows: [{ max_ledger: 12345 }] });
      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 12345 });

      const result = await gapDetector.detectGap();
      
      expect(result).toEqual({
        dbLedger: 12345,
        stellarLedger: 12345,
        gap: 0,
        hasGap: false
      });
      
      expect(logger.info).toHaveBeenCalledWith(
        {
          db_max_ledger: 12345,
          stellar_latest_ledger: 12345,
          gap_size: 0
        },
        'Gap detection completed'
      );
    });

    it('should detect a gap when database is behind Stellar', async () => {
      db.query.mockResolvedValue({ rows: [{ max_ledger: 12300 }] });
      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 12350 });

      const result = await gapDetector.detectGap();
      
      expect(result).toEqual({
        dbLedger: 12300,
        stellarLedger: 12350,
        gap: 50,
        hasGap: true
      });
    });

    it('should handle errors during gap detection', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      await expect(gapDetector.detectGap()).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith(
        { err: 'Database error' },
        'Gap detection failed'
      );
    });
  });

  describe('fetchEventsFromLedgers', () => {
    const mockEvent = {
      contractId: 'test-contract-id',
      topic: ['BetPlace'],
      body: { market_id: 1, bettor: 'test' },
      transactionHash: '0x123',
      id: 0
    };

    it('should fetch events from a single ledger', async () => {
      mockRpcServer.getLedger.mockResolvedValue({
        closingTime: '2026-01-01T00:00:00Z',
        events: [mockEvent]
      });

      const result = await gapDetector.fetchEventsFromLedgers(100, 100);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        topic: 'BetPlace',
        tx_hash: '0x123',
        ledger_seq: 100,
        ledger_time: '2026-01-01T00:00:00Z'
      });
      
      expect(mockRpcServer.getLedger).toHaveBeenCalledWith({
        sequence: 100,
        includeEvents: true
      });
    });

    it('should fetch events from multiple ledgers', async () => {
      mockRpcServer.getLedger
        .mockResolvedValueOnce({
          closingTime: '2026-01-01T00:00:00Z',
          events: [mockEvent]
        })
        .mockResolvedValueOnce({
          closingTime: '2026-01-01T00:01:00Z',
          events: []
        });

      const result = await gapDetector.fetchEventsFromLedgers(100, 101);
      
      expect(result).toHaveLength(1);
      expect(mockRpcServer.getLedger).toHaveBeenCalledTimes(2);
    });

    it('should filter events by contract ID', async () => {
      const otherContractEvent = {
        ...mockEvent,
        contractId: 'other-contract-id'
      };

      mockRpcServer.getLedger.mockResolvedValue({
        closingTime: '2026-01-01T00:00:00Z',
        events: [mockEvent, otherContractEvent]
      });

      const result = await gapDetector.fetchEventsFromLedgers(100, 100);
      
      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe('BetPlace');
    });

    it('should handle ledger fetch errors gracefully', async () => {
      mockRpcServer.getLedger.mockRejectedValue(new Error('Ledger not found'));

      const result = await gapDetector.fetchEventsFromLedgers(100, 100);
      
      expect(result).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        { ledger: 100, err: 'Ledger not found' },
        'Failed to fetch events from ledger, skipping'
      );
    });

    it('should add delay for serial strategy', async () => {
      process.env.GAP_FILL_STRATEGY = 'serial';
      
      mockRpcServer.getLedger.mockResolvedValue({
        closingTime: '2026-01-01T00:00:00Z',
        events: []
      });

      const startTime = Date.now();
      await gapDetector.fetchEventsFromLedgers(100, 101);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('processEventBatch', () => {
    const mockEvents = [
      {
        topic: 'BetPlace',
        ledger_seq: 100,
        tx_hash: '0x123'
      },
      {
        topic: 'MktCreate',
        ledger_seq: 101,
        tx_hash: '0x456'
      }
    ];

    it('should process events using batch strategy', async () => {
      process.env.GAP_FILL_STRATEGY = 'batch';
      
      const result = await gapDetector.processEventBatch(mockEvents);
      
      expect(result).toEqual({ processed: 2, failed: 0 });
      expect(mockProcessEvent).toHaveBeenCalledTimes(2);
      expect(mockProcessEvent).toHaveBeenCalledWith(mockEvents[0]);
      expect(mockProcessEvent).toHaveBeenCalledWith(mockEvents[1]);
    });

    it('should process events using serial strategy', async () => {
      process.env.GAP_FILL_STRATEGY = 'serial';
      
      const result = await gapDetector.processEventBatch(mockEvents);
      
      expect(result).toEqual({ processed: 2, failed: 0 });
      expect(mockProcessEvent).toHaveBeenCalledTimes(2);
    });

    it('should handle event processing failures', async () => {
      mockProcessEvent
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Processing failed'));

      const result = await gapDetector.processEventBatch(mockEvents);
      
      expect(result).toEqual({ processed: 1, failed: 1 });
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event batch', async () => {
      const result = await gapDetector.processEventBatch([]);
      
      expect(result).toEqual({ processed: 0, failed: 0 });
      expect(mockProcessEvent).not.toHaveBeenCalled();
    });
  });

  describe('backFillMissingLedgers', () => {
    beforeEach(() => {
      // Mock fetchEventsFromLedgers and processEventBatch
      jest.spyOn(gapDetector, 'fetchEventsFromLedgers');
      jest.spyOn(gapDetector, 'processEventBatch');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should back-fill using batch strategy', async () => {
      process.env.GAP_FILL_BATCH_SIZE = '2';
      
      const mockEvents = [{ topic: 'BetPlace' }];
      gapDetector.fetchEventsFromLedgers
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce([]);
      gapDetector.processEventBatch.mockResolvedValue({ processed: 1, failed: 0 });

      const result = await gapDetector.backFillMissingLedgers(100, 101);
      
      expect(result.totalProcessed).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledWith(100, 101);
      expect(gapDetector.processEventBatch).toHaveBeenCalledWith(mockEvents);
    });

    it('should back-fill using serial strategy', async () => {
      process.env.GAP_FILL_STRATEGY = 'serial';
      
      const mockEvents = [{ topic: 'BetPlace' }];
      gapDetector.fetchEventsFromLedgers.mockResolvedValue(mockEvents);
      gapDetector.processEventBatch.mockResolvedValue({ processed: 1, failed: 0 });

      const result = await gapDetector.backFillMissingLedgers(100, 100);
      
      expect(result.totalProcessed).toBe(1);
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledWith(100, 100);
    });

    it('should handle large ranges with batching', async () => {
      process.env.GAP_FILL_BATCH_SIZE = '2';
      
      gapDetector.fetchEventsFromLedgers.mockResolvedValue([]);
      gapDetector.processEventBatch.mockResolvedValue({ processed: 0, failed: 0 });

      await gapDetector.backFillMissingLedgers(100, 105);
      
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledTimes(3);
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledWith(100, 101);
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledWith(102, 103);
      expect(gapDetector.fetchEventsFromLedgers).toHaveBeenCalledWith(104, 105);
    });

    it('should handle back-fill failures', async () => {
      gapDetector.fetchEventsFromLedgers.mockRejectedValue(new Error('Fetch failed'));

      await expect(gapDetector.backFillMissingLedgers(100, 101))
        .rejects.toThrow('Fetch failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: 'Fetch failed',
          start_ledger: 100,
          end_ledger: 101
        }),
        '[RECOVERY] Back-fill failed'
      );
    });
  });

  describe('runSelfHealing', () => {
    beforeEach(() => {
      jest.spyOn(gapDetector, 'detectGap');
      jest.spyOn(gapDetector, 'backFillMissingLedgers');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should complete successfully when no gap exists', async () => {
      gapDetector.detectGap.mockResolvedValue({
        hasGap: false,
        gap: 0
      });

      const result = await gapDetector.runSelfHealing();
      
      expect(result).toEqual({
        success: true,
        message: 'No gap detected'
      });
      
      expect(gapDetector.backFillMissingLedgers).not.toHaveBeenCalled();
    });

    it('should fill gaps when they exist', async () => {
      gapDetector.detectGap.mockResolvedValue({
        hasGap: true,
        gap: 50,
        dbLedger: 12000,
        stellarLedger: 12050
      });
      
      gapDetector.backFillMissingLedgers.mockResolvedValue({
        totalProcessed: 10,
        totalFailed: 0,
        duration: 5000
      });

      const result = await gapDetector.runSelfHealing();
      
      expect(result).toEqual({
        success: true,
        message: 'Gap filled successfully',
        gapSize: 50,
        totalProcessed: 10,
        totalFailed: 0,
        duration: 5000
      });
      
      expect(gapDetector.backFillMissingLedgers).toHaveBeenCalledWith(12001, 12050);
    });

    it('should reject gaps larger than MAX_AUTO_RECOVERY_GAP', async () => {
      process.env.MAX_AUTO_RECOVERY_GAP = '25';
      
      gapDetector.detectGap.mockResolvedValue({
        hasGap: true,
        gap: 50,
        dbLedger: 12000,
        stellarLedger: 12050
      });

      const result = await gapDetector.runSelfHealing();
      
      expect(result).toEqual({
        success: false,
        message: 'Gap too large for auto-recovery',
        gapSize: 50,
        requiresManualIntervention: true
      });
      
      expect(gapDetector.backFillMissingLedgers).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        {
          gap_size: 50,
          max_auto_recovery: 25
        },
        'Gap too large for automatic recovery - manual intervention required'
      );
    });

    it('should handle self-healing failures', async () => {
      gapDetector.detectGap.mockRejectedValue(new Error('Detection failed'));

      await expect(gapDetector.runSelfHealing()).rejects.toThrow('Detection failed');
      expect(logger.error).toHaveBeenCalledWith(
        { err: 'Detection failed' },
        'Self-healing process failed'
      );
    });

    it('should log recovery start message correctly', async () => {
      gapDetector.detectGap.mockResolvedValue({
        hasGap: true,
        gap: 42,
        dbLedger: 12000,
        stellarLedger: 12042
      });
      
      gapDetector.backFillMissingLedgers.mockResolvedValue({
        totalProcessed: 5,
        totalFailed: 0,
        duration: 3000
      });

      await gapDetector.runSelfHealing();
      
      expect(logger.info).toHaveBeenCalledWith(
        {
          gap_size: 42,
          start_ledger: 12001,
          end_ledger: 12042
        },
        '[RECOVERY] Found 42 missing ledgers. Commencing back-fill...'
      );
    });
  });

  describe('initializeSelfHealing', () => {
    it('should run self-healing when CONTRACT_ADDRESS is set', async () => {
      jest.spyOn(gapDetector, 'runSelfHealing').mockResolvedValue({ success: true });

      await gapDetector.initializeSelfHealing();
      
      expect(gapDetector.runSelfHealing).toHaveBeenCalled();
    });

    it('should skip self-healing when CONTRACT_ADDRESS is not set', async () => {
      delete process.env.CONTRACT_ADDRESS;
      jest.spyOn(gapDetector, 'runSelfHealing');

      await gapDetector.initializeSelfHealing();
      
      expect(gapDetector.runSelfHealing).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'CONTRACT_ADDRESS not set - skipping self-healing'
      );
    });

    it('should handle self-healing failures without crashing', async () => {
      jest.spyOn(gapDetector, 'runSelfHealing').mockRejectedValue(new Error('Self-healing failed'));

      await gapDetector.initializeSelfHealing();
      
      expect(logger.error).toHaveBeenCalledWith(
        { err: 'Self-healing failed' },
        'Self-healing initialization failed'
      );
    });
  });

  describe('GAP_FILL_CONFIG', () => {
    it('should use default configuration values', () => {
      delete process.env.GAP_FILL_BATCH_SIZE;
      delete process.env.GAP_FILL_BATCH_DELAY;
      delete process.env.MAX_AUTO_RECOVERY_GAP;
      delete process.env.GAP_FILL_STRATEGY;

      // Re-require the module to pick up new environment
      delete require.cache[require.resolve('../src/indexer/gap-detector')];
      const freshGapDetector = require('../src/indexer/gap-detector');

      expect(freshGapDetector.GAP_FILL_CONFIG.BATCH_SIZE).toBe(10);
      expect(freshGapDetector.GAP_FILL_CONFIG.BATCH_DELAY).toBe(1000);
      expect(freshGapDetector.GAP_FILL_CONFIG.MAX_AUTO_RECOVERY_GAP).toBe(1000);
      expect(freshGapDetector.GAP_FILL_CONFIG.STRATEGY).toBe('batch');
    });

    it('should use environment variable values when provided', () => {
      process.env.GAP_FILL_BATCH_SIZE = '20';
      process.env.GAP_FILL_BATCH_DELAY = '500';
      process.env.MAX_AUTO_RECOVERY_GAP = '2000';
      process.env.GAP_FILL_STRATEGY = 'serial';

      delete require.cache[require.resolve('../src/indexer/gap-detector')];
      const freshGapDetector = require('../src/indexer/gap-detector');

      expect(freshGapDetector.GAP_FILL_CONFIG.BATCH_SIZE).toBe(20);
      expect(freshGapDetector.GAP_FILL_CONFIG.BATCH_DELAY).toBe(500);
      expect(freshGapDetector.GAP_FILL_CONFIG.MAX_AUTO_RECOVERY_GAP).toBe(2000);
      expect(freshGapDetector.GAP_FILL_CONFIG.STRATEGY).toBe('serial');
    });
  });

  describe('Integration Test: 50-ledger gap simulation', () => {
    it('should successfully handle a 50-ledger gap', async () => {
      // Set up the scenario
      process.env.GAP_FILL_BATCH_SIZE = '10';
      process.env.MAX_AUTO_RECOVERY_GAP = '100';
      
      // Mock database state (50 ledgers behind)
      db.query.mockResolvedValue({ rows: [{ max_ledger: 12000 }] });
      
      // Mock Stellar state (50 ledgers ahead)
      mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 12050 });
      
      // Mock ledger responses with events
      const mockLedgerResponse = {
        closingTime: '2026-01-01T00:00:00Z',
        events: [{
          contractId: 'test-contract-id',
          topic: ['BetPlace'],
          body: { market_id: 1 },
          transactionHash: '0x123',
          id: 0
        }]
      };
      
      mockRpcServer.getLedger.mockResolvedValue(mockLedgerResponse);
      mockProcessEvent.mockResolvedValue();

      // Run the self-healing process
      const result = await gapDetector.runSelfHealing();
      
      // Verify results
      expect(result.success).toBe(true);
      expect(result.gapSize).toBe(50);
      expect(result.totalProcessed).toBe(50); // One event per ledger
      
      // Verify the correct number of ledger fetches
      expect(mockRpcServer.getLedger).toHaveBeenCalledTimes(50);
      
      // Verify events were processed
      expect(mockProcessEvent).toHaveBeenCalledTimes(50);
      
      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          gap_size: 50,
          start_ledger: 12001,
          end_ledger: 12050
        }),
        '[RECOVERY] Found 50 missing ledgers. Commencing back-fill...'
      );
    });
  });
});
