-- Requires an image with pgvector available (docker-compose uses
-- pgvector/pgvector:pg17). On plain postgres:17 this fails with
-- `could not open extension control file .../vector.control`.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "material_chunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "page_number" INTEGER,
    "heading" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_chunk_organization_id_idx" ON "material_chunk"("organization_id");

-- CreateIndex
CREATE INDEX "material_chunk_material_id_idx" ON "material_chunk"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_chunk_material_id_chunk_index_key" ON "material_chunk"("material_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "material_chunk" ADD CONSTRAINT "material_chunk_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunk" ADD CONSTRAINT "material_chunk_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No ANN index (ivfflat/hnsw) yet. Deliberate: this phase only writes vectors,
-- and an ivfflat index built on an empty table picks useless centroids. Phase 2
-- adds one once there is a corpus to build it from, and until then exact search
-- over a few thousand chunks is fast anyway.
