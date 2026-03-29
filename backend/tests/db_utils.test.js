// Mock db and schema
jest.mock('../src/db', () => {
    const mockWhereInternal = jest.fn();
    const mockReturningInternal = jest.fn();
    
    return {
        db: {
            select: jest.fn(() => ({
                from: jest.fn(() => ({
                    where: mockWhereInternal
                }))
            })),
            insert: jest.fn(() => ({
                values: jest.fn(() => ({
                    returning: mockReturningInternal,
                    onConflictDoNothing: jest.fn().mockReturnThis()
                }))
            })),
            update: jest.fn(() => ({
                set: jest.fn(() => ({
                    where: jest.fn(() => ({
                        returning: mockReturningInternal
                    }))
                }))
            }))
        },
        schema: {
            userProfiles: { walletAddress: 'walletAddress', updatedAt: 'updatedAt' },
            categories: { id: 'id', name: 'name', isActive: 'isActive', slug: 'slug' },
            markets: { contractId: 'contractId', updatedAt: 'updatedAt' },
        },
        _mockWhere: mockWhereInternal,
        _mockReturning: mockReturningInternal
    };
});

const { db, _mockWhere: whereMock, _mockReturning: returningMock } = require('../src/db');
const utils = require('../src/db/utils');

describe('Database Utility Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getOrCreateUserProfile - returns existing profile', async () => {
        const mockProfile = { walletAddress: 'test_wallet', username: 'tester' };
        whereMock.mockResolvedValue([mockProfile]);

        const result = await utils.getOrCreateUserProfile('test_wallet');
        expect(result).toEqual(mockProfile);
        expect(db.select).toHaveBeenCalled();
    });

    test('getOrCreateUserProfile - creates profile if not exists', async () => {
        whereMock.mockResolvedValue([]); // Empty result on select
        returningMock.mockResolvedValue([{ walletAddress: 'new_wallet' }]); // Result on insert

        const result = await utils.getOrCreateUserProfile('new_wallet');
        expect(result.walletAddress).toBe('new_wallet');
        expect(db.insert).toHaveBeenCalled();
    });

    test('updateUserProfile - updates bio and avatar', async () => {
        const updatedProfile = { walletAddress: 'test_wallet', bio: 'new bio' };
        returningMock.mockResolvedValue([updatedProfile]);

        const result = await utils.updateUserProfile('test_wallet', { bio: 'new bio' });
        expect(result.bio).toBe('new bio');
        expect(db.update).toHaveBeenCalled();
    });

    test('getAllCategories - fetches active categories', async () => {
        const mockCats = [{ id: 1, name: 'Politics' }];
        whereMock.mockResolvedValue(mockCats);

        const result = await utils.getAllCategories();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Politics');
    });

    test('addCategory - inserts new category', async () => {
        const newCat = { name: 'Science', id: 5 };
        returningMock.mockResolvedValue([newCat]);

        const result = await utils.addCategory('Science', 'desc', 'sci', 'img');
        expect(result.name).toBe('Science');
        expect(db.insert).toHaveBeenCalled();
    });

    test('getMarketByContractId - fetches market by ID', async () => {
        const mockMarket = { contractId: 'CAC123', title: 'Test Market' };
        whereMock.mockResolvedValue([mockMarket]);

        const result = await utils.getMarketByContractId('CAC123');
        expect(result.title).toBe('Test Market');
    });

    test('upsertMarketMetadata - updates existing market', async () => {
        const existingMarket = { contractId: 'CAC123', title: 'Old Title' };
        const updatedMarket = { contractId: 'CAC123', title: 'New Title' };
        
        whereMock.mockResolvedValueOnce([existingMarket]); // Exists
        returningMock.mockResolvedValueOnce([updatedMarket]); // Update Result

        const result = await utils.upsertMarketMetadata('CAC123', { title: 'New Title' });
        expect(result.title).toBe('New Title');
        expect(db.update).toHaveBeenCalled();
    });

    test('upsertMarketMetadata - inserts NEW market if none exists', async () => {
        whereMock.mockResolvedValueOnce([]); // Doesn't exist
        returningMock.mockResolvedValueOnce([{ contractId: 'NEW_MARKET', title: 'New' }]);

        const result = await utils.upsertMarketMetadata('NEW_MARKET', { title: 'New' });
        expect(result.title).toBe('New');
        expect(db.insert).toHaveBeenCalled();
    });
});
