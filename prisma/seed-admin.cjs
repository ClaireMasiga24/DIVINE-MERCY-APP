/*
 * ONE-OFF SEED SCRIPT — first User (TECHNICAL_LEAD admin).
 *
 * Run: node --env-file=.env prisma/seed-admin.cjs
 *
 * Safe to re-run — it upserts on phoneNumber.
 * (Uses Node's built-in --env-file instead of the dotenv package.)
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const SEED_PHONE = "+256780196215"; // Claire Masiga — TECHNICAL_LEAD
const SEED_NAME = "Claire Masiga";

(async () => {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { phoneNumber: SEED_PHONE },
      update: { fullName: SEED_NAME, role: "TECHNICAL_LEAD", status: "ACTIVE" },
      create: { phoneNumber: SEED_PHONE, fullName: SEED_NAME, role: "TECHNICAL_LEAD", status: "ACTIVE" },
    });
    console.log(
      "Seeded:",
      JSON.stringify({
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      })
    );
  } catch (e) {
    console.error("Seed failed:", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
