import { createPrisma } from "./index";
import { seedCore } from "./seed-core";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const prisma = createPrisma(url);

try {
  await seedCore(prisma);
  console.log("Seed complete (categories, permissions, roles, default stock location).");
} finally {
  await prisma.$disconnect();
}
