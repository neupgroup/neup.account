import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Define the output, the prisma generation at the schema.prisma file.

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: "prisma/migrations",
  },
});