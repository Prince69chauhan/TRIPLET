-- ============================================================
--  Triplet — Production Database Schema
--  PostgreSQL 15+  |  pgvector  |  Row Level Security
--
--  Tables  : 14 core + 2 compliance
--  Views   : 3 (ranked_candidates, pending_notifications,
--               tamper_summary)
--  Indexes : 22
--  Triggers: 6 (auto updated_at)
--  RLS     : 8 policies across 6 tables
--
--  Run with:
--    psql -U triplet_user -d triplet -f triplet_schema_final.sql
-- ============================================================

BEGIN;

-- ============================================================
--  EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector SBERT embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram skill search

-- ============================================================
--  ENUM TYPES
-- ============================================================

DO $$ BEGIN
    CREATE TYPE user_role     AS ENUM ('candidate', 'employer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE app_status    AS ENUM (
        'pending', 'processing', 'scored',
        'shortlisted', 'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE job_status    AS ENUM (
        'active', 'paused', 'removed', 'completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE alert_status  AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE tamper_result AS ENUM ('ok', 'tampered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
--  1. USERS  (single auth table — both roles share this)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT        NOT NULL UNIQUE,
    hashed_password TEXT        NOT NULL,
    role            user_role   NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users                  IS 'Shared auth table for both candidates and employers';
COMMENT ON COLUMN users.role             IS 'candidate | employer — drives RLS and API access';
COMMENT ON COLUMN users.is_verified      IS 'Set TRUE after email verification link clicked';

-- ============================================================
--  2. CANDIDATE PROFILES  (1:1 with users where role=candidate)
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_profiles (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL UNIQUE
                            REFERENCES users(id) ON DELETE CASCADE,
    full_name           TEXT        NOT NULL,
    phone               TEXT,
    degree              TEXT,                       -- B.Tech, BCA, MCA …
    branch              TEXT,                       -- Computer Science, IT …
    college             TEXT,
    profile_picture_url TEXT,
    tenth_percentage    NUMERIC(5,2)
                            CHECK (tenth_percentage >= 0 AND tenth_percentage <= 100),
    twelfth_percentage  NUMERIC(5,2)
                            CHECK (twelfth_percentage >= 0 AND twelfth_percentage <= 100),
    cgpa                NUMERIC(4,2)
                            CHECK (cgpa >= 0 AND cgpa <= 10),
    passout_year        SMALLINT
                            CHECK (passout_year BETWEEN 1990 AND 2100),
    has_gap             BOOLEAN     NOT NULL DEFAULT FALSE,
    gap_duration_months SMALLINT    NOT NULL DEFAULT 0
                            CHECK (gap_duration_months >= 0),
    active_backlogs     SMALLINT    NOT NULL DEFAULT 0
                            CHECK (active_backlogs >= 0),
    total_backlogs      SMALLINT    NOT NULL DEFAULT 0
                            CHECK (total_backlogs >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  candidate_profiles                 IS 'Extended profile for candidates';
COMMENT ON COLUMN candidate_profiles.cgpa            IS 'On 10-point scale';
COMMENT ON COLUMN candidate_profiles.gap_duration_months IS 'Total employment gap in months — used by hard filter';

-- ============================================================
--  3. EMPLOYER PROFILES  (1:1 with users where role=employer)
-- ============================================================

CREATE TABLE IF NOT EXISTS employer_profiles (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL UNIQUE
                     REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT        NOT NULL,
    website      TEXT,
    industry     TEXT,
    profile_picture_url TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  4. ELITE COMPANIES  (authoritative list for bonus engine)
-- ============================================================

-- FIX: Replaced GENERATED ALWAYS AS (lower(name)) STORED with
--      a plain column + trigger. PostgreSQL rejects lower() on
--      TEXT as non-immutable inside a generated column expression.
CREATE TABLE IF NOT EXISTS elite_companies (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    name_lower TEXT,                          -- kept in sync by trigger below
    tier       SMALLINT    NOT NULL DEFAULT 1
                   CHECK (tier BETWEEN 1 AND 3),
    -- tier 1 = FAANG / top global
    -- tier 2 = Indian unicorn (Flipkart, Razorpay …)
    -- tier 3 = well-known MNC (Infosys, TCS …)
    added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION sync_elite_name_lower()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.name_lower := lower(NEW.name);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_elite_name_lower
    BEFORE INSERT OR UPDATE ON elite_companies
    FOR EACH ROW EXECUTE FUNCTION sync_elite_name_lower();

COMMENT ON TABLE  elite_companies      IS 'NLP extractor checks internship company names against this table to set is_elite flag';
COMMENT ON COLUMN elite_companies.tier IS '1=FAANG/global top, 2=Indian unicorn, 3=known MNC';

-- Seed
INSERT INTO elite_companies (name, tier) VALUES
    ('Google', 1), ('Microsoft', 1), ('Amazon', 1),
    ('Meta', 1), ('Apple', 1), ('OpenAI', 1),
    ('DeepMind', 1), ('Goldman Sachs', 1), ('McKinsey', 1),
    ('Stripe', 1), ('Atlassian', 1), ('Netflix', 1),
    ('Flipkart', 2), ('Paytm', 2), ('Zomato', 2),
    ('Swiggy', 2), ('Razorpay', 2), ('CRED', 2),
    ('Meesho', 2), ('PhonePe', 2), ('Ola', 2),
    ('Nykaa', 2), ('Groww', 2), ('Zepto', 2),
    ('Infosys', 3), ('TCS', 3), ('Wipro', 3),
    ('HCL', 3), ('Cognizant', 3), ('Accenture', 3)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
--  5. JOB DESCRIPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS job_descriptions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_id         UUID        NOT NULL
                            REFERENCES employer_profiles(id) ON DELETE CASCADE,
    title               TEXT        NOT NULL,
    description         TEXT,

    -- ── Hard filter criteria ────────────────────────────────
    required_skills         TEXT[]      NOT NULL DEFAULT '{}',
    min_tenth_percentage    NUMERIC(5,2)
                                CHECK (min_tenth_percentage >= 0 AND min_tenth_percentage <= 100),
    min_twelfth_percentage  NUMERIC(5,2)
                                CHECK (min_twelfth_percentage >= 0 AND min_twelfth_percentage <= 100),
    min_cgpa                NUMERIC(4,2),
    max_passout_year        SMALLINT,
    min_passout_year        SMALLINT,
    allow_gap               BOOLEAN     NOT NULL DEFAULT FALSE,
    max_gap_months          SMALLINT    DEFAULT 0,
    allow_backlogs          BOOLEAN     NOT NULL DEFAULT FALSE,
    max_active_backlogs     SMALLINT    DEFAULT 0,

    -- ── Bonus weights (configurable per JD) ─────────────────
    -- Each employer can dial these up/down for their role
    bonus_skill_in_project    SMALLINT NOT NULL DEFAULT 5,
    bonus_elite_internship    SMALLINT NOT NULL DEFAULT 10,
    bonus_project_level       SMALLINT NOT NULL DEFAULT 5,
    bonus_internship_duration SMALLINT NOT NULL DEFAULT 3,  -- per month

    -- ── SBERT embedding (384-dim, all-MiniLM-L6-v2) ─────────
    -- Stored once at JD creation; cosine sim computed at scoring time
    jd_embedding            VECTOR(384),

    -- ── Full-text search ─────────────────────────────────────
    -- FIX: Plain column; to_tsvector('english',...) is not immutable
    -- in all PG builds. Kept in sync by trigger below.
    search_vector           TSVECTOR,

    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    status      job_status  NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_passout_range CHECK (
        min_passout_year IS NULL OR
        max_passout_year IS NULL OR
        min_passout_year <= max_passout_year
    )
);

COMMENT ON COLUMN job_descriptions.jd_embedding            IS 'SBERT 384-dim embedding — stored on creation, used for cosine sim scoring';
COMMENT ON COLUMN job_descriptions.bonus_skill_in_project  IS 'Points added when a required skill appears in a candidate project/internship';
COMMENT ON COLUMN job_descriptions.search_vector           IS 'GIN tsvector for full-text JD search — kept in sync by trigger';

-- Trigger to keep search_vector in sync
CREATE OR REPLACE FUNCTION sync_jd_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_vector :=
        to_tsvector('english',
            coalesce(NEW.title, '') || ' ' ||
            coalesce(NEW.description, '') || ' ' ||
            coalesce(array_to_string(NEW.required_skills, ' '), '')
        );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_jd_search_vector
    BEFORE INSERT OR UPDATE ON job_descriptions
    FOR EACH ROW EXECUTE FUNCTION sync_jd_search_vector();

-- ============================================================
--  6. RESUMES
-- ============================================================

CREATE TABLE IF NOT EXISTS resumes (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id     UUID        NOT NULL
                         REFERENCES candidate_profiles(id) ON DELETE CASCADE,

    -- ── MinIO object store ───────────────────────────────────
    bucket_name      TEXT        NOT NULL DEFAULT 'resumes',
    object_key       TEXT        NOT NULL UNIQUE,   -- resumes/{candidate_id}/{uuid}.pdf
    file_name        TEXT        NOT NULL,
    file_size_bytes  BIGINT      CHECK (file_size_bytes > 0),
    mime_type        TEXT        CHECK (mime_type IN (
                                     'application/pdf',
                                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                     'image/jpeg', 'image/png'
                                 )),

    -- ── Integrity (SHA-256 + RSA) ────────────────────────────
    sha256_hash      TEXT        NOT NULL,   -- H  : SHA-256 of raw file bytes
    rsa_signature    TEXT        NOT NULL,   -- S  : RSA private key signs H
    last_verified_at TIMESTAMPTZ,
    tamper_detected  BOOLEAN     NOT NULL DEFAULT FALSE,

    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN resumes.object_key      IS 'MinIO path — signed URL generated at runtime, never stored';
COMMENT ON COLUMN resumes.sha256_hash     IS 'H: SHA-256 fingerprint stored at upload time';
COMMENT ON COLUMN resumes.rsa_signature   IS 'S: RSA signature of H using server private key';
COMMENT ON COLUMN resumes.tamper_detected IS 'Set TRUE if integrity check finds H != H-prime';

-- Only one active resume per candidate (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_resume
    ON resumes (candidate_id)
    WHERE is_active = TRUE;

-- ============================================================
--  7. APPLICATIONS  (candidate applies to a JD)
-- ============================================================

CREATE TABLE IF NOT EXISTS applications (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID        NOT NULL
                     REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    jd_id        UUID        NOT NULL
                     REFERENCES job_descriptions(id) ON DELETE CASCADE,
    resume_id    UUID        NOT NULL REFERENCES resumes(id),
    status       app_status  NOT NULL DEFAULT 'pending',
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (candidate_id, jd_id)   -- one application per candidate per JD
);

COMMENT ON COLUMN applications.status IS 'pending→processing→scored→shortlisted|rejected';

-- ============================================================
--  8. PARSED RESUMES  (OCR + spaCy + NLP extractor output)
-- ============================================================

CREATE TABLE IF NOT EXISTS parsed_resumes (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id        UUID        NOT NULL UNIQUE
                         REFERENCES resumes(id) ON DELETE CASCADE,

    extracted_skills TEXT[]      DEFAULT '{}',

    -- JSONB arrays — see format docs below
    projects         JSONB       NOT NULL DEFAULT '[]',
    /*  Each element:
        {
          "title":        "E-commerce site",
          "skills_used":  ["Python", "React"],
          "level":        "advanced",     -- basic | medium | advanced
          "description":  "..."
        }
    */

    internships      JSONB       NOT NULL DEFAULT '[]',
    /*  Each element:
        {
          "company":          "Google",
          "duration_months":  3,
          "skills_used":      ["Python", "GCP"],
          "is_elite":         true
        }
    */

    raw_text         TEXT,   -- full extracted text fed to SBERT
    parser_version   TEXT    NOT NULL DEFAULT 'v1',

    -- SBERT 384-dim embedding — stored after NLP extraction
    resume_embedding VECTOR(384),

    parsed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN parsed_resumes.resume_embedding IS 'SBERT 384-dim embedding of raw_text — stored for fast cosine sim';
COMMENT ON COLUMN parsed_resumes.parser_version   IS 'Bump when OCR/NLP pipeline changes to allow re-parsing';

-- ============================================================
--  8A. SAVED JOBS  (candidate bookmarks job for later)
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_jobs (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID        NOT NULL
                     REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    jd_id        UUID        NOT NULL
                     REFERENCES job_descriptions(id) ON DELETE CASCADE,
    saved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (candidate_id, jd_id)
);

COMMENT ON TABLE saved_jobs IS 'Candidate bookmarks of jobs for later review';

-- ============================================================
--  9. SCORES  (one row per application, written by AI worker)
-- ============================================================

CREATE TABLE IF NOT EXISTS scores (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID         NOT NULL UNIQUE
                        REFERENCES applications(id) ON DELETE CASCADE,

    -- ── Hard filter ─────────────────────────────────────────
    passed_hard_filter  BOOLEAN  NOT NULL DEFAULT FALSE,
    filter_fail_reason  TEXT,    -- "CGPA below minimum" | "gap not allowed" …

    -- ── Score components ─────────────────────────────────────
    base_score_m    NUMERIC(6,2) NOT NULL DEFAULT 0
                        CHECK (base_score_m >= 0 AND base_score_m <= 100),
    bonus_score_b   NUMERIC(6,2) NOT NULL DEFAULT 0
                        CHECK (bonus_score_b >= 0),
    final_score_d   NUMERIC(6,2) NOT NULL DEFAULT 0
                        CHECK (final_score_d >= 0 AND final_score_d <= 100),

    -- ── Bonus breakdown (transparency for employer dashboard) -
    bonus_breakdown JSONB        NOT NULL DEFAULT '{}',
    /*
      {
        "skill_in_project":    15,
        "elite_internship":    10,
        "project_level":        5,
        "internship_duration":  6
      }
    */

    -- ── Score integrity ──────────────────────────────────────
    score_hash      TEXT,        -- SHA-256 of (application_id || final_score_d || scored_at)
    rsa_signature   TEXT,        -- RSA signature of score_hash
    model_version   TEXT        NOT NULL DEFAULT 'sbert-v1',
    -- Bump model_version when SBERT model is retrained
    -- so old and new scores are never silently mixed in rankings

    scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN scores.base_score_m   IS 'M: SBERT cosine similarity (0-100)';
COMMENT ON COLUMN scores.bonus_score_b  IS 'B: sum of all bonus components';
COMMENT ON COLUMN scores.final_score_d  IS 'D = M + B normalised to 0-100';
COMMENT ON COLUMN scores.model_version  IS 'SBERT model tag — must match SBERT_MODEL_VERSION env var';

-- ============================================================
--  10. INTEGRITY LOGS  (every hash verification recorded here)
-- ============================================================

CREATE TABLE IF NOT EXISTS integrity_logs (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id     UUID          NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    stored_hash   TEXT          NOT NULL,   -- H  stored at upload
    computed_hash TEXT          NOT NULL,   -- H' recomputed now
    rsa_valid     BOOLEAN       NOT NULL,   -- RSA signature still valid?
    result        tamper_result NOT NULL,   -- 'ok' | 'tampered'
    triggered_by  TEXT          NOT NULL DEFAULT 'background'
                      CHECK (triggered_by IN ('read', 'background', 'manual')),
    checked_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN integrity_logs.triggered_by IS 'read=every API fetch, background=celery beat every 6h, manual=admin';
COMMENT ON COLUMN integrity_logs.result       IS 'tampered when stored_hash != computed_hash OR rsa_valid=false';

-- ============================================================
--  11. NOTIFICATIONS  (all outgoing emails — candidates + employers)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Target: one of these will be set, not both
    employer_id         UUID         REFERENCES employer_profiles(id) ON DELETE CASCADE,
    candidate_id        UUID         REFERENCES candidate_profiles(id) ON DELETE CASCADE,

    notification_type   TEXT         NOT NULL
                            CHECK (notification_type IN (
                                'tamper_alert',
                                'advance',
                                'rejection',
                                'shortlisted',
                                'application_received'
                            )),

    -- Optional links for context
    application_id      UUID         REFERENCES applications(id),
    integrity_log_id    UUID         REFERENCES integrity_logs(id),

    subject             TEXT         NOT NULL,
    body                TEXT         NOT NULL,

    -- Delivery tracking
    status              alert_status NOT NULL DEFAULT 'pending',
    retry_count         SMALLINT     NOT NULL DEFAULT 0
                            CHECK (retry_count >= 0),
    last_attempted_at   TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- At least one recipient must be set
    CONSTRAINT notification_has_recipient CHECK (
        employer_id IS NOT NULL OR candidate_id IS NOT NULL
    )
);

COMMENT ON TABLE  notifications                    IS 'Unified outbox for all email types — polled by Celery notify_worker';
COMMENT ON COLUMN notifications.notification_type  IS 'tamper_alert→employer  |  advance/rejection/shortlisted→candidate';
COMMENT ON COLUMN notifications.retry_count        IS 'Worker retries up to 5 times with exponential backoff';

-- ============================================================
--  12. CONSENT RECORDS  (DPDP Act / GDPR compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_records (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT        NOT NULL
                     CHECK (consent_type IN (
                         'data_processing',
                         'resume_storage',
                         'score_sharing',
                         'marketing'
                     )),
    granted      BOOLEAN     NOT NULL,
    ip_address   INET,
    user_agent   TEXT,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,

    UNIQUE (user_id, consent_type)
);

COMMENT ON TABLE consent_records IS 'Required by India DPDP Act 2023 — proof of user consent per processing purpose';

-- ============================================================
--  13. DELETION REQUESTS  (right to erasure — DPDP / GDPR)
-- ============================================================

CREATE TABLE IF NOT EXISTS deletion_requests (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id),
    reason       TEXT,
    status       TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','completed','rejected')),
    handled_by   TEXT,       -- admin username who actioned it
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

COMMENT ON TABLE deletion_requests IS 'User-initiated erasure requests — must be actioned within 30 days under DPDP Act';

-- ============================================================
--  INDEXES
-- ============================================================

-- Core lookups
CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

CREATE INDEX IF NOT EXISTS idx_cp_user_id
    ON candidate_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_cp_cgpa
    ON candidate_profiles (cgpa);

CREATE INDEX IF NOT EXISTS idx_cp_passout_year
    ON candidate_profiles (passout_year);

CREATE INDEX IF NOT EXISTS idx_ep_user_id
    ON employer_profiles (user_id);

-- Job descriptions
CREATE INDEX IF NOT EXISTS idx_jd_employer
    ON job_descriptions (employer_id);

CREATE INDEX IF NOT EXISTS idx_jd_active
    ON job_descriptions (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_jd_status
    ON job_descriptions (status);

CREATE INDEX IF NOT EXISTS idx_jd_skills
    ON job_descriptions USING GIN (required_skills);

CREATE INDEX IF NOT EXISTS idx_jd_search_vector
    ON job_descriptions USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_jd_embedding
    ON job_descriptions USING ivfflat (jd_embedding vector_cosine_ops)
    WITH (lists = 100);

-- Resumes
CREATE INDEX IF NOT EXISTS idx_resumes_candidate
    ON resumes (candidate_id);

-- Applications
CREATE INDEX IF NOT EXISTS idx_applications_jd
    ON applications (jd_id);

CREATE INDEX IF NOT EXISTS idx_applications_candidate
    ON applications (candidate_id);

CREATE INDEX IF NOT EXISTS idx_applications_status
    ON applications (status);

-- Saved jobs
CREATE INDEX IF NOT EXISTS idx_saved_jobs_candidate
    ON saved_jobs (candidate_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_jd
    ON saved_jobs (jd_id);

-- Scores
CREATE INDEX IF NOT EXISTS idx_scores_final
    ON scores (final_score_d DESC);

CREATE INDEX IF NOT EXISTS idx_scores_application
    ON scores (application_id);

CREATE INDEX IF NOT EXISTS idx_scores_model_version
    ON scores (model_version);

-- Parsed resumes
CREATE INDEX IF NOT EXISTS idx_parsed_skills
    ON parsed_resumes USING GIN (extracted_skills);

CREATE INDEX IF NOT EXISTS idx_resume_embedding
    ON parsed_resumes USING ivfflat (resume_embedding vector_cosine_ops)
    WITH (lists = 100);

-- Integrity
CREATE INDEX IF NOT EXISTS idx_integrity_resume
    ON integrity_logs (resume_id);

CREATE INDEX IF NOT EXISTS idx_integrity_result
    ON integrity_logs (result) WHERE result = 'tampered';

CREATE INDEX IF NOT EXISTS idx_integrity_triggered
    ON integrity_logs (triggered_by, result);

-- Elite companies
CREATE INDEX IF NOT EXISTS idx_elite_name_lower
    ON elite_companies (name_lower);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notif_employer
    ON notifications (employer_id);

CREATE INDEX IF NOT EXISTS idx_notif_candidate
    ON notifications (candidate_id);

CREATE INDEX IF NOT EXISTS idx_notif_unsent
    ON notifications (notification_type, retry_count)
    WHERE sent_at IS NULL AND retry_count < 5;

-- Consent / deletion
CREATE INDEX IF NOT EXISTS idx_consent_user
    ON consent_records (user_id);

CREATE INDEX IF NOT EXISTS idx_deletion_user
    ON deletion_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_deletion_status
    ON deletion_requests (status)
    WHERE status IN ('pending', 'in_progress');

-- ============================================================
--  AUTO-UPDATE updated_at  (trigger function shared by all tables)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_candidate_profiles_updated_at
    BEFORE UPDATE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_employer_profiles_updated_at
    BEFORE UPDATE ON employer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_job_descriptions_updated_at
    BEFORE UPDATE ON job_descriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  ROW LEVEL SECURITY
--  FastAPI sets these session vars before every query:
--    SET LOCAL app.current_user_id   = '<uuid>';
--    SET LOCAL app.current_user_role = 'candidate' | 'employer';
-- ============================================================

ALTER TABLE resumes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsed_resumes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- ── RESUMES ──────────────────────────────────────────────────

CREATE POLICY resume_candidate_select ON resumes FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'candidate'
        AND candidate_id = (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY resume_employer_select ON resumes FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'employer'
        AND id IN (
            SELECT a.resume_id FROM applications a
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.id = jd.employer_id
            WHERE ep.user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY resume_candidate_insert ON resumes FOR INSERT
    WITH CHECK (
        candidate_id = (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY resume_candidate_update ON resumes FOR UPDATE
    USING (
        candidate_id = (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ── CANDIDATE PROFILES ───────────────────────────────────────

CREATE POLICY cp_self ON candidate_profiles FOR ALL
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY cp_employer_view ON candidate_profiles FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'employer'
        AND id IN (
            SELECT a.candidate_id FROM applications a
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.id = jd.employer_id
            WHERE ep.user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ── APPLICATIONS ─────────────────────────────────────────────

CREATE POLICY app_candidate ON applications FOR ALL
    USING (
        candidate_id = (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY app_employer ON applications FOR SELECT
    USING (
        jd_id IN (
            SELECT jd.id FROM job_descriptions jd
            JOIN employer_profiles ep ON ep.id = jd.employer_id
            WHERE ep.user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ── SCORES ───────────────────────────────────────────────────

CREATE POLICY score_candidate ON scores FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM applications
            WHERE candidate_id = (
                SELECT id FROM candidate_profiles
                WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

CREATE POLICY score_employer ON scores FOR SELECT
    USING (
        application_id IN (
            SELECT a.id FROM applications a
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.id = jd.employer_id
            WHERE ep.user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ── PARSED RESUMES ───────────────────────────────────────────

CREATE POLICY pr_candidate ON parsed_resumes FOR SELECT
    USING (
        resume_id IN (
            SELECT id FROM resumes
            WHERE candidate_id = (
                SELECT id FROM candidate_profiles
                WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
            )
        )
    );

CREATE POLICY pr_employer ON parsed_resumes FOR SELECT
    USING (
        resume_id IN (
            SELECT a.resume_id FROM applications a
            JOIN job_descriptions jd ON jd.id = a.jd_id
            JOIN employer_profiles ep ON ep.id = jd.employer_id
            WHERE ep.user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ── NOTIFICATIONS ────────────────────────────────────────────

CREATE POLICY notif_employer ON notifications FOR SELECT
    USING (
        employer_id IN (
            SELECT id FROM employer_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY notif_candidate ON notifications FOR SELECT
    USING (
        candidate_id IN (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ============================================================
--  VIEWS
-- ============================================================

-- Ranked candidates per JD — powers employer dashboard
CREATE OR REPLACE VIEW ranked_candidates AS
SELECT
    a.jd_id,
    a.id                    AS application_id,
    a.candidate_id,
    u.email                 AS candidate_email,
    cp.full_name,
    cp.cgpa,
    cp.passout_year,
    cp.college,
    s.base_score_m,
    s.bonus_score_b,
    s.final_score_d,
    s.bonus_breakdown,
    s.passed_hard_filter,
    s.filter_fail_reason,
    s.model_version,
    a.status,
    a.applied_at,
    ROW_NUMBER() OVER (
        PARTITION BY a.jd_id
        ORDER BY s.final_score_d DESC NULLS LAST
    ) AS rank
FROM applications a
JOIN candidate_profiles cp ON a.candidate_id = cp.id
JOIN users u               ON cp.user_id     = u.id
LEFT JOIN scores s         ON a.id           = s.application_id;

-- Pending notification queue — polled by Celery notify_worker
CREATE OR REPLACE VIEW pending_notifications AS
SELECT *
FROM   notifications
WHERE  sent_at IS NULL
  AND  retry_count < 5
ORDER  BY created_at ASC;

-- Tamper summary — security / admin dashboard
CREATE OR REPLACE VIEW tamper_summary AS
SELECT
    r.id                AS resume_id,
    cp.full_name        AS candidate_name,
    u.email             AS candidate_email,
    il.checked_at,
    il.triggered_by,
    il.stored_hash,
    il.computed_hash,
    il.rsa_valid,
    r.tamper_detected
FROM integrity_logs il
JOIN resumes r             ON il.resume_id    = r.id
JOIN candidate_profiles cp ON r.candidate_id  = cp.id
JOIN users u               ON cp.user_id      = u.id
WHERE il.result = 'tampered'
ORDER BY il.checked_at DESC;

-- ============================================================
--  14. CANDIDATE DOCUMENTS (general document storage)
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_documents (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id     UUID        NOT NULL
                         REFERENCES candidate_profiles(id) ON DELETE CASCADE,

    -- MinIO storage
    bucket_name      TEXT        NOT NULL DEFAULT 'documents',
    object_key       TEXT        NOT NULL UNIQUE,
    original_name    TEXT        NOT NULL,   -- original filename at upload
    display_name     TEXT        NOT NULL,   -- user can rename this
    file_size_bytes  BIGINT,
    mime_type        TEXT,
    file_hash        TEXT        NOT NULL,   -- SHA-256 for duplicate detection

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate
    ON candidate_documents (candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_documents_hash
    ON candidate_documents (candidate_id, file_hash);

ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_candidate_all ON candidate_documents FOR ALL
    USING (
        candidate_id = (
            SELECT id FROM candidate_profiles
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE OR REPLACE TRIGGER trg_candidate_documents_updated_at
    BEFORE UPDATE ON candidate_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ============================================================
--  QUICK VERIFICATION  (run manually to confirm clean install)
--
--  SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' ORDER BY table_name;
--
--  Expected 14 tables + 3 views:
--    applications, candidate_profiles, consent_records,
--    deletion_requests, elite_companies, employer_profiles,
--    integrity_logs, job_descriptions, notifications,
--    parsed_resumes, resumes, scores, users
--    + views: ranked_candidates, pending_notifications,
--             tamper_summary
-- ============================================================
