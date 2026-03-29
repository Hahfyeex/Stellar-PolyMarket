const { db, schema } = require('../src/db');
const seed = require('../scripts/seed'); // Needs to be requireable for test

// We will mock the seed file's execution or logic
// But first, let's wrap the logic in a function if it's not already

// Mock db calls for seed
jest.mock('../src/db', () => {
    const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        onConflictDoNothing: jest.fn().mockReturnThis(),
    };
    return {
        db: mockDb,
        schema: {
            categories: { id: 'id', slug: 'slug' },
            userProfiles: { walletAddress: 'walletAddress' },
            markets: { contractId: 'contractId' },
        }
    };
});

describe('Seed Script Functional Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Mock process.exit
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('seed() inserts categories, users and markets', async () => {
    const { seed } = require('../scripts/seed');
    
    // Politics exists, others don't
    db.select().from().where.mockResolvedValueOnce([{ id: 1, slug: 'politics' }])
                        .mockResolvedValue([]);

    await seed();

    expect(db.insert).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('seed() handles errors gracefully', async () => {
    const { seed } = require('../scripts/seed');
    db.select.mockImplementation(() => { throw new Error('DB Error'); });

    await seed();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
