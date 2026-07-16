-- AlterTable
ALTER TABLE "question" ADD COLUMN     "difficulty" "QuizDifficulty",
ADD COLUMN     "topic_id" UUID;

-- AlterTable
ALTER TABLE "quiz" ADD COLUMN     "is_adaptive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "question_topic_id_idx" ON "question"("topic_id");

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
