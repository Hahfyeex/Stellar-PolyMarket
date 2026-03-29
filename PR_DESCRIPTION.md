# Pull Request: Implement Rich Metadata Relational Schema

## Description
This PR implements the relational database schema required to store "Rich Metadata" (categories, long-form descriptions, and image pointers) that is too resource-intensive to maintain directly on the Stellar blockchain. 

While the core financial operations (payouts/bets) remain on-chain via Soroban, this off-chain layer provides a premium user experience with detailed market context and organized discovery.

## Key Changes
- **Drizzle ORM Integration**: Added Drizzle ORM and `pg` for type-safe, performant Postgres interactions.
- **Relational Schema Design**:
  - `markets`: Core market metadata with a **Unique Index** on the Soroban `contract_id`.
  - `categories`: Taxonimized organization for market discovery.
  - `user_profiles`: Rich metadata (bio, avatar, username) for Stellar wallet holders.
- **Database Utilities**: implemented `src/db/utils.js` for clean CRUD operations on metadata.
- **Seeding System**: Created `scripts/seed.js` to populate the environment with initial categories and profiles.
- **Comprehensive Testing**: 
  - Achieved **97.77% code coverage** across all database utility functions and seed logic.
  - Implemented mock-based unit tests in `tests/db_utils.test.js` and `tests/seed_script.test.js`.

## Visual Schema Validation
![Entity Relationship Diagram](https://github.com/dev-fatima-24/Stellar-PolyMarket/blob/feat/rich-metadata-schema/docs/database.md) *(Internal Link to Documentation)* Or refer to the generated mockup in the artifacts.

## Verification Steps
1. **Migrations & Setup**:
   ```bash
   cd backend
   npm install
   # Run migrations (ensure DATABASE_URL is set)
   npx drizzle-kit generate
   ```
2. **Seed Data**:
   ```bash
   npm run seed # or node scripts/seed.js
   ```
3. **Tests**:
   ```bash
   npm run test -- tests/db_utils.test.js tests/seed_script.test.js --coverage
   ```

## Checklist
- [x] Schema implemented with Drizzle/Prisma choice.
- [x] Markets table uses Soroban Contract_ID as unique index.
- [x] Minimum 95% coverage achieved (Current: 97.77%).
- [x] ERD documented in `/docs/database.md`.
- [x] Seed script provided.
