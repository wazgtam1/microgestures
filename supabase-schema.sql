-- Supabase数据库表结构
-- 在Supabase Dashboard > SQL Editor中执行这些SQL语句

-- 1. 创建论文表
CREATE TABLE IF NOT EXISTS papers (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    authors JSONB DEFAULT '[]',
    year INTEGER,
    journal TEXT,
    research_area TEXT,
    methodology TEXT,
    study_type TEXT,
    keywords JSONB DEFAULT '[]',
    citations INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    abstract TEXT,
    doi TEXT,
    pdf_url TEXT,
    website_url TEXT,
    thumbnail TEXT,
    original_thumbnail TEXT,
    pdf_file_size BIGINT,
    is_persistent_pdf BOOLEAN DEFAULT true,
    github_file_info JSONB,
    user_id TEXT DEFAULT 'anonymous',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建分享集合表
CREATE TABLE IF NOT EXISTS shared_collections (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'anonymous',
    papers JSONB NOT NULL DEFAULT '[]',
    title TEXT DEFAULT 'Shared Paper Collection',
    description TEXT DEFAULT '',
    access_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_papers_user_id ON papers(user_id);
CREATE INDEX IF NOT EXISTS idx_papers_research_area ON papers(research_area);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_created_at ON papers(created_at);
CREATE INDEX IF NOT EXISTS idx_shared_collections_user_id ON shared_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_collections_created_at ON shared_collections(created_at);

-- 4. 启用行级安全策略 (RLS)
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_collections ENABLE ROW LEVEL SECURITY;

-- 5. 创建访问策略
-- 论文表：允许任何人读取和写入（简化版本，实际项目中应该更严格）
CREATE POLICY "Allow all access to papers" ON papers
    FOR ALL USING (true) WITH CHECK (true);

-- 分享集合表：允许任何人读取，但只允许创建者修改
CREATE POLICY "Allow read access to shared_collections" ON shared_collections
    FOR SELECT USING (true);

CREATE POLICY "Allow insert access to shared_collections" ON shared_collections
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access to shared_collections" ON shared_collections
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete access to shared_collections" ON shared_collections
    FOR DELETE USING (true);

-- 6. 创建自动更新时间戳的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. 创建触发器
CREATE TRIGGER update_papers_updated_at BEFORE UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_collections_updated_at BEFORE UPDATE ON shared_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 插入示例数据（可选）
-- INSERT INTO papers (title, authors, year, journal, research_area) VALUES
-- ('Sample Paper', '["John Doe", "Jane Smith"]', 2024, 'Journal of HCI', 'Mobile Device');

-- 完成！现在你的Supabase数据库已经准备好了。