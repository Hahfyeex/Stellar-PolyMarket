const axios = require('axios');
const { findPaymentPaths } = require('../utils/stellar-pathfinding');

jest.mock('axios');

describe('Stellar Pathfinding Utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return valid payment paths for XLM to USDC', async () => {
        const mockResponse = {
            data: {
                _embedded: {
                    records: [
                        {
                            source_amount: '10.0',
                            destination_amount: '150.0',
                            path: [
                                { asset_code: 'BTC', asset_issuer: 'G_BTC_ISSUER' }
                            ]
                        }
                    ]
                }
            }
        };

        axios.get.mockResolvedValueOnce(mockResponse);

        const paths = await findPaymentPaths('XLM', null, '100000000', 'USDC', 'G_USDC_ISSUER');

        expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('horizon-testnet.stellar.org/paths/strict-send'));
        expect(paths).toHaveLength(1);
        expect(paths[0]).toEqual({
            source_asset_code: 'XLM',
            source_amount: '100000000',
            destination_asset_code: 'USDC',
            destination_amount: '1500000000', // 150.0 * 10^7
            path: [
                { asset_code: 'BTC', asset_issuer: 'G_BTC_ISSUER' }
            ]
        });
    });

    it('should return an empty array if no paths are found', async () => {
        axios.get.mockRejectedValueOnce(new Error('Horizon Error 404'));

        const paths = await findPaymentPaths('XLM', null, '100000000', 'USDC', 'G_UNKNOWN');

        expect(paths).toEqual([]);
    });

    it('should handle native (XLM) destination asset correctly', async () => {
        const mockResponse = {
            data: {
                _embedded: {
                    records: [
                        {
                            source_amount: '100.0',
                            destination_amount: '95.0',
                            path: []
                        }
                    ]
                }
            }
        };

        axios.get.mockResolvedValueOnce(mockResponse);

        const paths = await findPaymentPaths('USDC', 'G_USDC_ISSUER', '1000000000', 'XLM', null);

        expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('destination_assets=native'));
        expect(paths[0].destination_asset_code).toBe('XLM');
    });
});
