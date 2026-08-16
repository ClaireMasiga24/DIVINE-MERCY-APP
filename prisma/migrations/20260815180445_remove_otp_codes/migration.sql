/*
  Warnings:

  - You are about to drop the `OtpCode` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OtpCode" DROP CONSTRAINT "OtpCode_userId_fkey";

-- DropTable
DROP TABLE "OtpCode";
