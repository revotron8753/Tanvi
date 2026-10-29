import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export * from "./generated/client";

const globalForPrisma = globalThis as unknown as { __tanviPrisma?: PrismaClient };

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazily-created shared client. Only server code may import this. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__tanviPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPrisma.__tanviPrisma = createPrisma(url);
  }
  return globalForPrisma.__tanviPrisma;
}
