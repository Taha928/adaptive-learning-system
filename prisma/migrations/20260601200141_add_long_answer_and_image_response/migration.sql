-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'longAnswer';

-- AlterTable
ALTER TABLE "answer" ADD COLUMN     "response_image" TEXT;
