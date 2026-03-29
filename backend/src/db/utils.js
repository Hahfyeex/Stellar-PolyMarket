const { db, schema } = require('../db');
const { eq } = require('drizzle-orm');

/**
 * Fetch or Create User Profile
 * @param {string} walletAddress 
 */
async function getOrCreateUserProfile(walletAddress) {
  const [profile] = await db.select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.walletAddress, walletAddress));
  
  if (profile) return profile;

  const [newProfile] = await db.insert(schema.userProfiles)
    .values({ walletAddress })
    .returning();
  
  return newProfile;
}

/**
 * Update user bio/avatar
 */
async function updateUserProfile(walletAddress, data) {
  const [updated] = await db.update(schema.userProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.userProfiles.walletAddress, walletAddress))
    .returning();
  return updated;
}

/**
 * Categories management
 */
async function getAllCategories() {
  return db.select().from(schema.categories).where(eq(schema.categories.isActive, true));
}

async function addCategory(name, description, slug, imageUrl) {
  const [cat] = await db.insert(schema.categories)
    .values({ name, description, slug, imageUrl })
    .returning();
  return cat;
}

/**
 * Market metadata management
 */
async function getMarketByContractId(contractId) {
  const [market] = await db.select()
    .from(schema.markets)
    .where(eq(schema.markets.contractId, contractId));
  return market;
}

async function upsertMarketMetadata(contractId, metadata) {
  const [existing] = await db.select()
    .from(schema.markets)
    .where(eq(schema.markets.contractId, contractId));

  if (existing) {
    const [updated] = await db.update(schema.markets)
      .set({ ...metadata, updatedAt: new Date() })
      .where(eq(schema.markets.contractId, contractId))
      .returning();
    return updated;
  }

  const [newMarket] = await db.insert(schema.markets)
    .values({ contractId, ...metadata })
    .returning();
  return newMarket;
}

module.exports = {
  getOrCreateUserProfile,
  updateUserProfile,
  getAllCategories,
  addCategory,
  getMarketByContractId,
  upsertMarketMetadata,
};
