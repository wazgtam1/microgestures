// Supabase Configuration
class SupabaseStorage {
    constructor() {
        // Supabase项目配置信息
        this.supabaseUrl = 'https://rgolnmbtusqojihxrbcd.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnb2xubWJ0dXNxb2ppaHhyYmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTkyNTIsImV4cCI6MjA3MDg3NTI1Mn0.y9OooOsiQKv2gZhx_X6v88E9VsLS3r71chu4VCJPK-8';
        this.supabase = null;
        this.initialized = false;
    }

    // 初始化Supabase客户端
    async init() {
        if (this.initialized) return;
        
        try {
            // 动态加载Supabase SDK
            if (typeof supabase === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
                document.head.appendChild(script);
                
                await new Promise((resolve) => {
                    script.onload = resolve;
                });
            }
            
            this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
            this.initialized = true;
            console.log('✅ Supabase initialized successfully');
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);
            throw error;
        }
    }

    // 保存论文数据
    async savePapers(papers, userId = 'anonymous') {
        await this.init();
        
        try {
            // 清空现有数据
            await this.supabase
                .from('papers')
                .delete()
                .eq('user_id', userId);
            
            // 插入新数据
            if (papers.length > 0) {
                const papersData = papers.map(paper => ({
                    title: paper.title,
                    authors: paper.authors,
                    year: paper.year,
                    journal: paper.journal,
                    research_area: paper.researchArea,
                    methodology: paper.methodology,
                    study_type: paper.studyType,
                    keywords: paper.keywords,
                    citations: paper.citations,
                    downloads: paper.downloads,
                    abstract: paper.abstract,
                    doi: paper.doi,
                    pdf_url: paper.pdfUrl,
                    website_url: paper.websiteUrl,
                    thumbnail: paper.thumbnail,
                    original_thumbnail: paper.originalThumbnail,
                    pdf_file_size: paper.pdfFileSize,
                    is_persistent_pdf: paper.isPersistentPDF,
                    github_file_info: paper.githubFileInfo,
                    user_id: userId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }));
                
                const { data, error } = await this.supabase
                    .from('papers')
                    .insert(papersData);
                
                if (error) throw error;
            }
            
            console.log(`✅ Saved ${papers.length} papers to Supabase`);
            return { success: true, count: papers.length };
        } catch (error) {
            console.error('❌ Error saving papers:', error);
            return { success: false, error: error.message };
        }
    }

    // 加载论文数据
    async loadPapers(userId = 'anonymous') {
        await this.init();
        
        try {
            const { data, error } = await this.supabase
                .from('papers')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // 转换数据库字段到应用字段
            const mappedPapers = (data || []).map(paper => ({
                id: paper.id,
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                journal: paper.journal,
                researchArea: paper.research_area,
                methodology: paper.methodology,
                studyType: paper.study_type,
                keywords: paper.keywords,
                citations: paper.citations,
                hIndex: Math.floor((paper.citations || 0) / 3),
                downloads: paper.downloads,
                abstract: paper.abstract,
                doi: paper.doi,
                pdfUrl: paper.pdf_url,
                websiteUrl: paper.website_url,
                thumbnail: paper.thumbnail,
                originalThumbnail: paper.original_thumbnail,
                pdfFileSize: paper.pdf_file_size,
                isPersistentPDF: paper.is_persistent_pdf,
                githubFileInfo: paper.github_file_info
            }));
            
            console.log(`✅ Loaded ${mappedPapers.length} papers from Supabase`);
            return { success: true, papers: mappedPapers };
        } catch (error) {
            console.error('❌ Error loading papers:', error);
            return { success: false, papers: [], error: error.message };
        }
    }

    // 删除所有论文
    async deleteAllPapers(userId = 'anonymous') {
        await this.init();
        
        try {
            const { error } = await this.supabase
                .from('papers')
                .delete()
                .eq('user_id', userId);
            
            if (error) throw error;
            
            // 同时删除分享记录
            await this.supabase
                .from('shared_collections')
                .delete()
                .eq('user_id', userId);
            
            console.log('✅ All papers deleted from Supabase');
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting papers:', error);
            return { success: false, error: error.message };
        }
    }

    // 创建分享链接
    async createShareLink(papers, userId = 'anonymous') {
        await this.init();
        
        try {
            const shareId = this.generateShareId();
            const shareData = {
                id: shareId,
                user_id: userId,
                papers: papers,
                created_at: new Date().toISOString(),
                access_count: 0
            };
            
            const { data, error } = await this.supabase
                .from('shared_collections')
                .insert(shareData);
            
            if (error) throw error;
            
            const shareUrl = `${window.location.origin}/share/${shareId}`;
            console.log('✅ Share link created:', shareUrl);
            return { success: true, shareId, shareUrl };
        } catch (error) {
            console.error('❌ Error creating share link:', error);
            return { success: false, error: error.message };
        }
    }

    // 访问分享链接
    async getSharedPapers(shareId) {
        await this.init();
        
        try {
            const { data, error } = await this.supabase
                .from('shared_collections')
                .select('*')
                .eq('id', shareId)
                .single();
            
            if (error) throw error;
            
            if (!data) {
                return { success: false, error: 'Share link not found or expired' };
            }
            
            // 增加访问计数
            await this.supabase
                .from('shared_collections')
                .update({ access_count: (data.access_count || 0) + 1 })
                .eq('id', shareId);
            
            console.log(`✅ Loaded shared papers:`, data.papers.length);
            return { success: true, papers: data.papers || [], shareData: data };
        } catch (error) {
            console.error('❌ Error loading shared papers:', error);
            return { success: false, papers: [], error: error.message };
        }
    }

    // 生成分享ID
    generateShareId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // 检查连接状态
    async testConnection() {
        await this.init();
        
        try {
            const { data, error } = await this.supabase
                .from('papers')
                .select('count')
                .limit(1);
            
            return { success: !error, error: error?.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// 创建全局实例
window.supabaseStorage = new SupabaseStorage();