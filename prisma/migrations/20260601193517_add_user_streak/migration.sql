-- AlterTable
ALTER TABLE "user" ADD COLUMN     "current_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_active_date" DATE,
ADD COLUMN     "longest_streak" INTEGER NOT NULL DEFAULT 0;
