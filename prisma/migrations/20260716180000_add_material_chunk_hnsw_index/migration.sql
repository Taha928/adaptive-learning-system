-- Phase 2 turns material_chunk into a read path: every quiz, lesson, plan and
-- tutor reply now runs a similarity query against it. Without an index that is
-- a sequential scan computing cosine distance over every chunk in the table.
--
-- HNSW rather than ivfflat: ivfflat must be built against existing data to pick
-- useful centroids and degrades as the table grows past them, so it would need
-- rebuilding as courses are added. HNSW builds incrementally, stays accurate as
-- rows arrive, and needs no retraining — the right shape for a table that grows
-- with every upload.
--
-- vector_cosine_ops matches the `<=>` operator retrieval.ts queries with. An
-- index built for a different operator class is silently ignored by the planner.
CREATE INDEX IF NOT EXISTS "material_chunk_embedding_hnsw_idx"
    ON "material_chunk"
    USING hnsw ("embedding" vector_cosine_ops);
