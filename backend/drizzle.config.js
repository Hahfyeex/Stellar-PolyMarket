/** @type {import("drizzle-kit").Config} */
export default {
  schema: "./src/db/schema.js",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/polymarket",
  },
};
