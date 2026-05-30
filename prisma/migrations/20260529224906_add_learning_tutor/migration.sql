-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "EnrollmentRole" AS ENUM ('student', 'instructor');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('pdf', 'docx', 'txt', 'note', 'link');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('uploaded', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "QuizDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('multiple_choice', 'true_false', 'short_answer');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'submitted', 'graded');

-- CreateEnum
CREATE TYPE "StudyPlanStatus" AS ENUM ('active', 'completed', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "StudyPlanItemStatus" AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "PerformanceEventType" AS ENUM ('lesson_viewed', 'lesson_completed', 'quiz_started', 'quiz_completed', 'material_viewed', 'chat_asked', 'plan_item_completed', 'login');

-- CreateTable
CREATE TABLE "course" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "created_by_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'beginner',
    "status" "CourseStatus" NOT NULL DEFAULT 'draft',
    "cover_image" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "EnrollmentRole" NOT NULL DEFAULT 'student',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "title" TEXT NOT NULL,
    "file_url" TEXT,
    "file_type" "MaterialType" NOT NULL DEFAULT 'pdf',
    "file_size_bytes" INTEGER,
    "extracted_text" TEXT,
    "status" "MaterialStatus" NOT NULL DEFAULT 'uploaded',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "material_id" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "estimated_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "topic_id" UUID,
    "created_by_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "QuizDifficulty" NOT NULL DEFAULT 'medium',
    "passing_score" INTEGER NOT NULL DEFAULT 60,
    "time_limit_minutes" INTEGER,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "status" "QuizStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'multiple_choice',
    "options" JSONB,
    "correct_answer" TEXT NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID,
    "score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quiz_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "user_id" UUID,
    "response_text" TEXT,
    "selected_option" TEXT,
    "is_correct" BOOLEAN,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "ai_feedback" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID,
    "ai_chat_id" UUID,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "status" "StudyPlanStatus" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMPTZ(3),
    "target_end_date" TIMESTAMPTZ(3),
    "generated_by_ai" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "study_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "study_plan_id" UUID NOT NULL,
    "topic_id" UUID,
    "quiz_id" UUID,
    "title" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "due_date" TIMESTAMPTZ(3),
    "status" "StudyPlanItemStatus" NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "study_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID,
    "topic_id" UUID,
    "quiz_attempt_id" UUID,
    "event_type" "PerformanceEventType" NOT NULL,
    "mastery_score" DOUBLE PRECISION,
    "duration_seconds" INTEGER,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_organization_id_idx" ON "course"("organization_id");

-- CreateIndex
CREATE INDEX "course_organization_id_status_idx" ON "course"("organization_id", "status");

-- CreateIndex
CREATE INDEX "course_created_by_id_idx" ON "course"("created_by_id");

-- CreateIndex
CREATE INDEX "enrollment_organization_id_idx" ON "enrollment"("organization_id");

-- CreateIndex
CREATE INDEX "enrollment_course_id_idx" ON "enrollment"("course_id");

-- CreateIndex
CREATE INDEX "enrollment_user_id_idx" ON "enrollment"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_user_id_course_id_key" ON "enrollment"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "material_organization_id_idx" ON "material"("organization_id");

-- CreateIndex
CREATE INDEX "material_course_id_idx" ON "material"("course_id");

-- CreateIndex
CREATE INDEX "material_organization_id_status_idx" ON "material"("organization_id", "status");

-- CreateIndex
CREATE INDEX "topic_organization_id_idx" ON "topic"("organization_id");

-- CreateIndex
CREATE INDEX "topic_course_id_idx" ON "topic"("course_id");

-- CreateIndex
CREATE INDEX "topic_course_id_order_index_idx" ON "topic"("course_id", "order_index");

-- CreateIndex
CREATE INDEX "quiz_organization_id_idx" ON "quiz"("organization_id");

-- CreateIndex
CREATE INDEX "quiz_course_id_idx" ON "quiz"("course_id");

-- CreateIndex
CREATE INDEX "quiz_topic_id_idx" ON "quiz"("topic_id");

-- CreateIndex
CREATE INDEX "quiz_organization_id_status_idx" ON "quiz"("organization_id", "status");

-- CreateIndex
CREATE INDEX "question_organization_id_idx" ON "question"("organization_id");

-- CreateIndex
CREATE INDEX "question_quiz_id_idx" ON "question"("quiz_id");

-- CreateIndex
CREATE INDEX "question_quiz_id_order_index_idx" ON "question"("quiz_id", "order_index");

-- CreateIndex
CREATE INDEX "quiz_attempt_organization_id_idx" ON "quiz_attempt"("organization_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_quiz_id_idx" ON "quiz_attempt"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_user_id_idx" ON "quiz_attempt"("user_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_organization_id_user_id_idx" ON "quiz_attempt"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_user_id_quiz_id_idx" ON "quiz_attempt"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "answer_organization_id_idx" ON "answer"("organization_id");

-- CreateIndex
CREATE INDEX "answer_attempt_id_idx" ON "answer"("attempt_id");

-- CreateIndex
CREATE INDEX "answer_question_id_idx" ON "answer"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_attempt_id_question_id_key" ON "answer"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "study_plan_organization_id_idx" ON "study_plan"("organization_id");

-- CreateIndex
CREATE INDEX "study_plan_user_id_idx" ON "study_plan"("user_id");

-- CreateIndex
CREATE INDEX "study_plan_organization_id_user_id_idx" ON "study_plan"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "study_plan_course_id_idx" ON "study_plan"("course_id");

-- CreateIndex
CREATE INDEX "study_plan_item_organization_id_idx" ON "study_plan_item"("organization_id");

-- CreateIndex
CREATE INDEX "study_plan_item_study_plan_id_idx" ON "study_plan_item"("study_plan_id");

-- CreateIndex
CREATE INDEX "study_plan_item_study_plan_id_order_index_idx" ON "study_plan_item"("study_plan_id", "order_index");

-- CreateIndex
CREATE INDEX "performance_log_organization_id_idx" ON "performance_log"("organization_id");

-- CreateIndex
CREATE INDEX "performance_log_user_id_idx" ON "performance_log"("user_id");

-- CreateIndex
CREATE INDEX "performance_log_organization_id_user_id_idx" ON "performance_log"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "performance_log_topic_id_idx" ON "performance_log"("topic_id");

-- CreateIndex
CREATE INDEX "performance_log_event_type_idx" ON "performance_log"("event_type");

-- CreateIndex
CREATE INDEX "performance_log_organization_id_occurred_at_idx" ON "performance_log"("organization_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan" ADD CONSTRAINT "study_plan_ai_chat_id_fkey" FOREIGN KEY ("ai_chat_id") REFERENCES "ai_chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_item" ADD CONSTRAINT "study_plan_item_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_item" ADD CONSTRAINT "study_plan_item_study_plan_id_fkey" FOREIGN KEY ("study_plan_id") REFERENCES "study_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_item" ADD CONSTRAINT "study_plan_item_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_log" ADD CONSTRAINT "performance_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_log" ADD CONSTRAINT "performance_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_log" ADD CONSTRAINT "performance_log_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_log" ADD CONSTRAINT "performance_log_quiz_attempt_id_fkey" FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
