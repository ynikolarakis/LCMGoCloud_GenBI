"""Database migration scripts for the metadata store.

Migrations are executed in order. Each migration has a version number
and an idempotent SQL statement (uses IF NOT EXISTS where possible).
"""

MIGRATIONS: list[dict[str, str]] = [
    {
        "version": "001",
        "description": "Create connections table",
        "sql": """
            CREATE TABLE IF NOT EXISTS connections (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                db_type VARCHAR(50) NOT NULL,
                host VARCHAR(255) NOT NULL,
                port INTEGER NOT NULL,
                database_name VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                credentials_secret_arn VARCHAR(500),
                ssl_enabled BOOLEAN NOT NULL DEFAULT true,
                connection_timeout INTEGER NOT NULL DEFAULT 30,
                status VARCHAR(50) NOT NULL DEFAULT 'inactive',
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                last_tested_at TIMESTAMP WITH TIME ZONE
            );
        """,
    },
    {
        "version": "002",
        "description": "Create discovered_tables table",
        "sql": """
            CREATE TABLE IF NOT EXISTS discovered_tables (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                schema_name VARCHAR(255),
                table_name VARCHAR(255) NOT NULL,
                table_type VARCHAR(50),
                row_count_estimate BIGINT,
                discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_discovered_tables_connection
                ON discovered_tables(connection_id);
        """,
    },
    {
        "version": "003",
        "description": "Create discovered_columns table",
        "sql": """
            CREATE TABLE IF NOT EXISTS discovered_columns (
                id UUID PRIMARY KEY,
                table_id UUID NOT NULL REFERENCES discovered_tables(id) ON DELETE CASCADE,
                column_name VARCHAR(255) NOT NULL,
                data_type VARCHAR(100),
                is_nullable BOOLEAN DEFAULT true,
                is_primary_key BOOLEAN DEFAULT false,
                is_foreign_key BOOLEAN DEFAULT false,
                column_default TEXT,
                ordinal_position INTEGER,
                discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_discovered_columns_table
                ON discovered_columns(table_id);
        """,
    },
    {
        "version": "004",
        "description": "Create table_enrichment table",
        "sql": """
            CREATE TABLE IF NOT EXISTS table_enrichment (
                id UUID PRIMARY KEY,
                table_id UUID NOT NULL REFERENCES discovered_tables(id) ON DELETE CASCADE,
                display_name VARCHAR(255),
                description TEXT,
                business_purpose TEXT,
                update_frequency VARCHAR(100),
                data_owner VARCHAR(255),
                typical_queries JSONB DEFAULT '[]'::jsonb,
                tags JSONB DEFAULT '[]'::jsonb,
                is_sensitive BOOLEAN DEFAULT false,
                enrichment_score DECIMAL(5,2) DEFAULT 0.0,
                enriched_by VARCHAR(255),
                enriched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(table_id)
            );
        """,
    },
    {
        "version": "005",
        "description": "Create column_enrichment table",
        "sql": """
            CREATE TABLE IF NOT EXISTS column_enrichment (
                id UUID PRIMARY KEY,
                column_id UUID NOT NULL REFERENCES discovered_columns(id) ON DELETE CASCADE,
                display_name VARCHAR(255),
                description TEXT,
                business_meaning TEXT,
                synonyms JSONB DEFAULT '[]'::jsonb,
                is_filterable BOOLEAN DEFAULT true,
                is_aggregatable BOOLEAN DEFAULT true,
                is_groupable BOOLEAN DEFAULT true,
                aggregation_functions JSONB DEFAULT '["COUNT","SUM","AVG"]'::jsonb,
                format_pattern VARCHAR(100),
                pii_classification VARCHAR(50),
                enriched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(column_id)
            );
        """,
    },
    {
        "version": "006",
        "description": "Create column_value_descriptions table",
        "sql": """
            CREATE TABLE IF NOT EXISTS column_value_descriptions (
                id UUID PRIMARY KEY,
                column_id UUID NOT NULL REFERENCES discovered_columns(id) ON DELETE CASCADE,
                value VARCHAR(500) NOT NULL,
                display_name VARCHAR(255),
                description TEXT,
                sort_order INTEGER,
                is_active BOOLEAN DEFAULT true
            );

            CREATE INDEX IF NOT EXISTS idx_column_values_column
                ON column_value_descriptions(column_id);
        """,
    },
    {
        "version": "007",
        "description": "Create column_sample_data table",
        "sql": """
            CREATE TABLE IF NOT EXISTS column_sample_data (
                id UUID PRIMARY KEY,
                column_id UUID NOT NULL REFERENCES discovered_columns(id) ON DELETE CASCADE,
                distinct_values JSONB,
                distinct_count INTEGER,
                min_value VARCHAR(500),
                max_value VARCHAR(500),
                null_percentage DECIMAL(5,2),
                sampled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(column_id)
            );
        """,
    },
    {
        "version": "008",
        "description": "Create table_relationships table",
        "sql": """
            CREATE TABLE IF NOT EXISTS table_relationships (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                from_table_id UUID NOT NULL REFERENCES discovered_tables(id) ON DELETE CASCADE,
                from_column_id UUID NOT NULL REFERENCES discovered_columns(id) ON DELETE CASCADE,
                to_table_id UUID NOT NULL REFERENCES discovered_tables(id) ON DELETE CASCADE,
                to_column_id UUID NOT NULL REFERENCES discovered_columns(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50),
                is_auto_detected BOOLEAN DEFAULT true,
                description TEXT,
                join_hint TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_relationships_connection
                ON table_relationships(connection_id);
        """,
    },
    {
        "version": "009",
        "description": "Create business_glossary table",
        "sql": """
            CREATE TABLE IF NOT EXISTS business_glossary (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                term VARCHAR(255) NOT NULL,
                definition TEXT,
                calculation TEXT,
                related_tables JSONB DEFAULT '[]'::jsonb,
                related_columns JSONB DEFAULT '[]'::jsonb,
                synonyms JSONB DEFAULT '[]'::jsonb,
                examples JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_glossary_connection
                ON business_glossary(connection_id);
        """,
    },
    {
        "version": "010",
        "description": "Create schema_migrations tracking table",
        "sql": """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(10) PRIMARY KEY,
                description VARCHAR(255),
                applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        """,
    },
    {
        "version": "011",
        "description": "Create database_enrichment table",
        "sql": """
            CREATE TABLE IF NOT EXISTS database_enrichment (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                display_name VARCHAR(255),
                description TEXT,
                business_domain VARCHAR(255),
                primary_language VARCHAR(50) DEFAULT 'en',
                default_currency VARCHAR(10),
                default_timezone VARCHAR(100),
                tags JSONB DEFAULT '[]'::jsonb,
                enriched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(connection_id)
            );
        """,
    },
    {
        "version": "012",
        "description": "Create query_history table",
        "sql": """
            CREATE TABLE IF NOT EXISTS query_history (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                conversation_id UUID NOT NULL,
                question TEXT NOT NULL,
                sql_text TEXT NOT NULL,
                explanation TEXT,
                row_count INTEGER DEFAULT 0,
                is_favorite BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_query_history_connection
                ON query_history(connection_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_query_history_conversation
                ON query_history(conversation_id);
        """,
    },
    {
        "version": "013",
        "description": "Create dashboards and dashboard_cards tables",
        "sql": """
            CREATE TABLE IF NOT EXISTS dashboards (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_dashboards_connection
                ON dashboards(connection_id);

            CREATE TABLE IF NOT EXISTS dashboard_cards (
                id UUID PRIMARY KEY,
                dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                chart_type VARCHAR(50) NOT NULL,
                question TEXT NOT NULL,
                sql_text TEXT NOT NULL,
                explanation TEXT,
                columns JSONB NOT NULL DEFAULT '[]'::jsonb,
                rows JSONB NOT NULL DEFAULT '[]'::jsonb,
                row_count INTEGER DEFAULT 0,
                execution_time_ms INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                pinned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_dashboard_cards_dashboard
                ON dashboard_cards(dashboard_id, sort_order);
        """,
    },
    {
        "version": "014",
        "description": "Create example_queries table",
        "sql": """
            CREATE TABLE IF NOT EXISTS example_queries (
                id UUID PRIMARY KEY,
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                sql_query TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_example_queries_connection
                ON example_queries(connection_id);
        """,
    },
    {
        "version": "015",
        "description": "Add value_guidance to column_enrichment",
        "sql": """
            ALTER TABLE column_enrichment
                ADD COLUMN IF NOT EXISTS value_guidance TEXT;
        """,
    },
    {
        "version": "016",
        "description": "Create query_instructions table",
        "sql": """
            CREATE TABLE IF NOT EXISTS query_instructions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                instruction TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_query_instructions_conn
                ON query_instructions(connection_id);
        """,
    },
    {
        "version": "017",
        "description": "Create software_guidance table",
        "sql": """
            CREATE TABLE IF NOT EXISTS software_guidance (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                software_name VARCHAR(200) NOT NULL,
                guidance_text TEXT NOT NULL DEFAULT '',
                doc_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
                confirmed BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE(connection_id)
            );
        """,
    },
    {
        "version": "018",
        "description": "Create chat_conversations and chat_messages tables",
        "sql": """
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL DEFAULT '',
                chat_type VARCHAR(20) NOT NULL DEFAULT 'chat',
                model_id VARCHAR(50) NOT NULL DEFAULT 'opus',
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_chat_conv_connection
                ON chat_conversations(connection_id);
            CREATE INDEX IF NOT EXISTS idx_chat_conv_type
                ON chat_conversations(chat_type);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                response_data JSONB,
                error TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_chat_msg_conversation
                ON chat_messages(conversation_id);
        """,
    },
    {
        "version": "019",
        "description": "Create poc_instances table",
        "sql": """
            CREATE TABLE IF NOT EXISTS poc_instances (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                poc_connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                customer_name VARCHAR(200) NOT NULL,
                logo_path VARCHAR(500),
                password_hash VARCHAR(200) NOT NULL,
                model_id VARCHAR(50) NOT NULL DEFAULT 'opus',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                deactivated_at TIMESTAMP WITH TIME ZONE
            );

            CREATE INDEX IF NOT EXISTS idx_poc_source_conn
                ON poc_instances(source_connection_id);
            CREATE INDEX IF NOT EXISTS idx_poc_conn
                ON poc_instances(poc_connection_id);
        """,
    },
    {
        "version": "020",
        "description": "Create lab_verified_queries table for few-shot learning",
        "sql": """
            CREATE TABLE IF NOT EXISTS lab_verified_queries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                sql_query TEXT NOT NULL,
                explanation TEXT,
                tables_used JSONB NOT NULL DEFAULT '[]'::jsonb,
                row_count INTEGER DEFAULT 0,
                execution_time_ms INTEGER DEFAULT 0,
                success_count INTEGER NOT NULL DEFAULT 1,
                failure_count INTEGER NOT NULL DEFAULT 0,
                embedding JSONB,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_lab_verified_conn
                ON lab_verified_queries(connection_id);
            CREATE INDEX IF NOT EXISTS idx_lab_verified_success
                ON lab_verified_queries(connection_id, success_count DESC);
        """,
    },
    {
        "version": "021",
        "description": "Create lab_schema_embeddings table for semantic search",
        "sql": """
            CREATE TABLE IF NOT EXISTS lab_schema_embeddings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                table_id UUID REFERENCES discovered_tables(id) ON DELETE CASCADE,
                column_id UUID REFERENCES discovered_columns(id) ON DELETE CASCADE,
                entity_type VARCHAR(20) NOT NULL,
                entity_name VARCHAR(255) NOT NULL,
                text_content TEXT NOT NULL,
                embedding JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE(connection_id, entity_type, entity_name)
            );

            CREATE INDEX IF NOT EXISTS idx_lab_embed_conn
                ON lab_schema_embeddings(connection_id);
            CREATE INDEX IF NOT EXISTS idx_lab_embed_type
                ON lab_schema_embeddings(connection_id, entity_type);
        """,
    },
    {
        "version": "022",
        "description": "Create local auth tables: users, sessions, audit logs, usage stats, rate limits",
        "sql": """
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(200) NOT NULL,
                display_name VARCHAR(255),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                session_lifetime_hours INTEGER NOT NULL DEFAULT 24,
                last_login_at TIMESTAMP WITH TIME ZONE,
                password_reset_token VARCHAR(200),
                password_reset_expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

            -- User sessions for token tracking and revocation
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(100) NOT NULL,
                ip_address VARCHAR(45),
                user_agent VARCHAR(500),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);

            -- Audit logs
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id UUID,
                details JSONB,
                ip_address VARCHAR(45),
                user_agent VARCHAR(500),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

            -- Connection usage statistics (daily aggregates)
            CREATE TABLE IF NOT EXISTS connection_usage_stats (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                query_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                UNIQUE(connection_id, date)
            );

            CREATE INDEX IF NOT EXISTS idx_usage_stats_conn ON connection_usage_stats(connection_id);
            CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON connection_usage_stats(date DESC);

            -- Per-user rate limits (overrides global)
            CREATE TABLE IF NOT EXISTS user_rate_limits (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                requests_per_minute INTEGER NOT NULL DEFAULT 60,
                queries_per_day INTEGER,
                UNIQUE(user_id)
            );
        """,
    },
    {
        "version": "023",
        "description": "Create POC user groups tables for restricted POC access",
        "sql": """
            -- POC user groups (auto-created when POC is created)
            CREATE TABLE IF NOT EXISTS poc_user_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                poc_id UUID NOT NULL REFERENCES poc_instances(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE(poc_id)
            );

            CREATE INDEX IF NOT EXISTS idx_poc_groups_poc ON poc_user_groups(poc_id);

            -- POC group members (links users to POC groups)
            CREATE TABLE IF NOT EXISTS poc_group_members (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id UUID NOT NULL REFERENCES poc_user_groups(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE(group_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_poc_members_group ON poc_group_members(group_id);
            CREATE INDEX IF NOT EXISTS idx_poc_members_user ON poc_group_members(user_id);
        """,
    },
    {
        "version": "024",
        "description": "Make POC password_hash nullable (platform auth replaces POC passwords)",
        "sql": """
            ALTER TABLE poc_instances ALTER COLUMN password_hash DROP NOT NULL;
        """,
    },
]
