const { pgTable, serial, text, varchar, timestamp, integer, boolean, numeric, uniqueIndex } = require('drizzle-orm/pg-core');

const userProfiles = pgTable('user_profiles', {
  walletAddress: varchar('wallet_address', { length: 56 }).primaryKey(),
  username: varchar('username', { length: 50 }),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  description: text('description'),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
});

const markets = pgTable('markets', {
  id: serial('id').primaryKey(),
  contractId: varchar('contract_id', { length: 56 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  imageUrl: text('image_url'),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  resolutionValue: numeric('resolution_value'),
  resolved: boolean('resolved').default(false),
  transactionHash: varchar('transaction_hash', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    contractIdIdx: uniqueIndex('contract_id_idx').on(table.contractId),
  };
});

module.exports = {
  userProfiles,
  categories,
  markets,
};
