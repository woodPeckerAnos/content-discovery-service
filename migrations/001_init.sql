CREATE TABLE IF NOT EXISTS search_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  mode TEXT NOT NULL,
  keyword TEXT,
  filters JSONB,
  limit_count INT NOT NULL,
  success BOOLEAN NOT NULL,
  partial BOOLEAN,
  actual_count INT NOT NULL,
  duration_ms INT NOT NULL,
  warnings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  rank INT NOT NULL,
  title TEXT NOT NULL,
  share_url TEXT NOT NULL,
  canonical_url TEXT,
  platform_id TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT,
  likes INT,
  views INT,
  comments INT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_runs_created ON search_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_platform_id ON content_items(platform, platform_id);
