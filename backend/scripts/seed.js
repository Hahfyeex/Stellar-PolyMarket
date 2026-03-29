const { db, schema } = require('../src/db');

async function seed() {
  try {
    console.log('--- Starting Seed Script ---');

    // 1. Seed Categories
    const categories = [
      { name: 'Politics', slug: 'politics', description: 'World events, elections, and policy changes.' },
      { name: 'Crypto', slug: 'crypto', description: 'Cryptocurrency prices and blockchain news.' },
      { name: 'Sports', slug: 'sports', description: 'Major league results and athlete performance.' },
      { name: 'Weather', slug: 'weather', description: 'Global temperature changes and natural phenomena.' },
      { name: 'Science', slug: 'science', description: 'New discoveries and cosmic events.' },
    ];

    for (const cat of categories) {
      const [existing] = await db.select().from(schema.categories).where(cat.slug);
      if (!existing) {
        await db.insert(schema.categories).values(cat);
        console.log(`Added category: ${cat.name}`);
      }
    }

    // 2. Seed User Profiles
    const users = [
      { walletAddress: 'GDX6X...123', username: 'StellarKing', bio: 'Early adopter and prediction market enthusiast.' },
      { walletAddress: 'GC7H6...456', username: 'PolyWiz', bio: 'Expert in statistical modelling.' },
    ];

    for (const user of users) {
      await db.insert(schema.userProfiles).values(user).onConflictDoNothing();
      console.log(`Ensured user profile for: ${user.username}`);
    }

    // 3. Seed initial Markets
    const markets = [
      {
        contractId: 'CAC...789',
        title: 'Will Bitcoin cross $100k in 2026?',
        description: 'Historical odds on BTC price hitting a massive milestone.',
        status: 'ACTIVE',
        categoryId: 1,
      },
    ];

    for (const market of markets) {
      await db.insert(schema.markets).values(market).onConflictDoNothing();
      console.log(`Ensured initial market: ${market.title}`);
    }

    console.log('--- Seed Script Finished ---');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding DB:', err);
    process.exit(1);
  }
}

module.exports = { seed };

if (require.main === module) {
  seed();
}
