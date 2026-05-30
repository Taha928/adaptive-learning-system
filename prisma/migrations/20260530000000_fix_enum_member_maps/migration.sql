-- Align Postgres enum values with the Prisma schema member names (removed @map).
-- RENAME VALUE is non-destructive: it preserves existing rows and just relabels
-- the enum value in place. Required because the Prisma 7 client generates the
-- runtime enum constant from the DB value, which must match the schema name.

ALTER TYPE "QuestionType" RENAME VALUE 'multiple_choice' TO 'multipleChoice';
ALTER TYPE "QuestionType" RENAME VALUE 'true_false' TO 'trueFalse';
ALTER TYPE "QuestionType" RENAME VALUE 'short_answer' TO 'shortAnswer';

ALTER TYPE "AttemptStatus" RENAME VALUE 'in_progress' TO 'inProgress';

ALTER TYPE "StudyPlanItemStatus" RENAME VALUE 'in_progress' TO 'inProgress';

ALTER TYPE "PerformanceEventType" RENAME VALUE 'lesson_viewed' TO 'lessonViewed';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'lesson_completed' TO 'lessonCompleted';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'quiz_started' TO 'quizStarted';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'quiz_completed' TO 'quizCompleted';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'material_viewed' TO 'materialViewed';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'chat_asked' TO 'chatAsked';
ALTER TYPE "PerformanceEventType" RENAME VALUE 'plan_item_completed' TO 'planItemCompleted';
