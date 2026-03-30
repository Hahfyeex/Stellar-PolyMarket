const axios = require("axios");
const logger = require("./logger");

const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";

/**
 * Find payment paths from source asset to destination asset.
 * Uses Horizon's /paths/strict-send endpoint.
 * 
 * @param {string} sourceAssetCode - Source asset code (e.g., "XLM", "USDC")
 * @param {string} sourceAssetIssuer - Source asset issuer (undefined for XLM)
 * @param {string} sourceAmount - Amount of source asset to send (in stroops)
 * @param {string} destAssetCode - Destination asset code
 * @param {string} destAssetIssuer - Destination asset issuer
 * @returns {Promise<Array>} - List of available paths
 */
async function findPaymentPaths(sourceAssetCode, sourceAssetIssuer, sourceAmount, destAssetCode, destAssetIssuer) {
    try {
        const params = new URLSearchParams();
        
        // Source Asset
        if (sourceAssetCode === "XLM") {
            params.append("source_asset_type", "native");
        } else {
            params.append("source_asset_type", "credit_alphanum4");
            params.append("source_asset_code", sourceAssetCode);
            params.append("source_asset_issuer", sourceAssetIssuer);
        }

        params.append("source_amount", (parseFloat(sourceAmount) / 10000000).toString()); // Horizon expects units, not stroops

        // Destination Assets (strict-send can return multiple paths for different destination assets)
        if (destAssetCode === "XLM") {
            params.append("destination_assets", "native");
        } else {
            params.append("destination_assets", `${destAssetCode}:${destAssetIssuer}`);
        }

        const url = `${HORIZON_URL}/paths/strict-send?${params.toString()}`;
        const response = await axios.get(url);

        return response.data._embedded.records.map(path => ({
            source_asset_code: sourceAssetCode,
            source_amount: sourceAmount,
            destination_asset_code: destAssetCode,
            destination_amount: Math.round(parseFloat(path.destination_amount) * 10000000).toString(), // Convert back to stroops
            path: path.path.map(p => ({
                asset_code: p.asset_code || "XLM",
                asset_issuer: p.asset_issuer
            }))
        }));
    } catch (err) {
        logger.error({ err: err.message, sourceAssetCode, destAssetCode }, "Failed to find payment paths from Stellar Horizon");
        return [];
    }
}

module.exports = {
    findPaymentPaths
};
