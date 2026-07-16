-- CreateEnum
CREATE TYPE "QuizPurpose" AS ENUM ('assessment', 'revision');

-- AlterTable
ALTER TABLE "quiz" ADD COLUMN     "purpose" "QuizPurpose" NOT NULL DEFAULT 'assessment';

-- Backfill: existing written Q&A sets predate this column and would otherwise
-- be indistinguishable from assessments. They are the non-adaptive, course-wide
-- quizzes whose questions are ALL free-text — which is exactly how the old Q&A
-- generator built them, and nothing else in the schema produced that shape.
UPDATE "quiz" q
SET "purpose" = 'revision'
WHERE q."is_adaptive" = false
  AND q."topic_id" IS NULL
  AND EXISTS (SELECT 1 FROM "question" x WHERE x."quiz_id" = q."id")
  AND NOT EXISTS (
    SELECT 1 FROM "question" x
    WHERE x."quiz_id" = q."id"
      AND x."type" NOT IN ('shortAnswer', 'longAnswer')
  );
