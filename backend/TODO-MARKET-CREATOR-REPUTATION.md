# MARKET CREATOR REPUTATION IMPLEMENTATION TODO

✅ **Plan approved by user**

✅ **1. Create DB migration** `backend/src/db/migrations/015_add_market_creator_reputation.sql`  
   - Add `creator_wallet` to `markets`  
   - Create `market_creators` table  
   - Indexes  

✅ **2. Create utils/creators.js**  
   - `calculateReputation()` + `updateCreatorStats()` functions  

✅ **3. Check/edit routes index** to mount creators route  

✅ **4. Edit routes/markets.js**  
   - Add creator_wallet to POST `/`  
   - Add reputation to GET `/:id`  
   - Update stats on confirm/dispute/void  
   - Add `/void` endpoint  

✅ **5. Create routes/creators.js**  
   - GET `/:wallet/reputation`  

✅ **6. Edit tests/markets.test.js**  
   - Add creator tests (add later, current is pagination only)  

✅ **7. Create tests/creators.test.js**  
   - Formula + endpoint tests  

⏳ **8. Test: `cd backend && npm test -- --coverage`** (>95%)  


⏳ **4. Edit routes/markets.js**  
   - Add creator_wallet to POST `/`  
   - Add reputation to GET `/:id`  
   - Update stats on confirm/dispute  
   - Add `/void` endpoint  

⏳ **5. Create routes/creators.js**  
   - GET `/:wallet/reputation`  

⏳ **6. Edit tests/markets.test.js**  

⏳ **7. Create tests/creators.test.js**  

⏳ **8. Test: `cd backend && npm test -- --coverage`** (>95%)  

⏳ **9. Verify endpoints & complete**

