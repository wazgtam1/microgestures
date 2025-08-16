// Supabase集成方法 - 添加到app.js中

// 数据加载方法（替换现有的loadData）
async loadData() {
    console.log('🔄 Starting loadData...');
    
    if (this.storageMode === 'supabase') {
        try {
            const result = await window.supabaseStorage.loadPapers(this.userId);
            if (result.success) {
                this.papers = result.papers;
                this.filteredPapers = [...this.papers];
                console.log('✅ Loaded', this.papers.length, 'papers from Supabase');
                
                if (this.papers.length > 0) {
                    setTimeout(() => {
                        this.showNotification(`Loaded ${this.papers.length} papers from cloud storage`, 'success');
                    }, 500);
                }
                return;
            } else {
                console.warn('⚠️ Supabase load failed, falling back to local storage');
                this.storageMode = 'indexeddb';
            }
        } catch (error) {
            console.error('❌ Supabase load error:', error);
            this.storageMode = 'indexeddb';
        }
    }
    
    // 降级到原有的加载逻辑
    await this.loadDataFromLocal();
}

// 本地数据加载
async loadDataFromLocal() {
    // 检查删除标记
    const deletionMarker = localStorage.getItem('papers_explicitly_deleted');
    if (deletionMarker === 'true') {
        console.log('🚫 User explicitly deleted all papers - staying empty');
        this.papers = [];
        this.filteredPapers = [];
        return;
    }
    
    // IndexedDB加载逻辑
    if (this.storage) {
        try {
            const papers = await this.storage.getAllPapers();
            if (papers && papers.length > 0) {
                this.papers = papers;
                this.filteredPapers = [...this.papers];
                console.log('✅ Loaded', this.papers.length, 'papers from IndexedDB');
                return;
            }
        } catch (error) {
            console.error('❌ Failed to load from IndexedDB:', error);
        }
    }
    
    // localStorage加载逻辑
    const savedPapers = localStorage.getItem('literaturePapers');
    if (savedPapers) {
        try {
            const parsedPapers = JSON.parse(savedPapers);
            if (Array.isArray(parsedPapers) && parsedPapers.length > 0) {
                this.papers = parsedPapers;
                this.filteredPapers = [...this.papers];
                console.log('✅ Loaded', this.papers.length, 'papers from localStorage');
                return;
            }
        } catch (error) {
            console.error('❌ Failed to parse localStorage data:', error);
        }
    }
    
    // GitHub加载（如果没有删除标记）
    try {
        const sharedResult = await githubStorage.downloadPapersMetadata();
        if (sharedResult.success && sharedResult.papers.length > 0) {
            this.papers = sharedResult.papers;
            this.filteredPapers = [...this.papers];
            console.log('✅ Loaded', this.papers.length, 'papers from GitHub');
        }
    } catch (error) {
        console.log('❌ No GitHub data available');
    }
    
    this.papers = this.papers || [];
    this.filteredPapers = [...this.papers];
}

// 数据保存方法（替换现有的saveData）
async saveData() {
    if (this.storageMode === 'supabase') {
        try {
            const result = await window.supabaseStorage.savePapers(this.papers, this.userId);
            if (result.success) {
                console.log(`✅ Saved ${result.count} papers to Supabase`);
                return;
            } else {
                console.warn('⚠️ Supabase save failed, falling back to local storage');
            }
        } catch (error) {
            console.error('❌ Supabase save error:', error);
        }
    }
    
    // 降级到本地保存
    await this.saveDataToLocal();
}

// 本地数据保存
async saveDataToLocal() {
    if (this.storage) {
        try {
            await this.storage.clearAllData();
            for (const paper of this.papers) {
                await this.storage.savePaper(paper);
            }
            console.log(`✅ Saved ${this.papers.length} papers to IndexedDB`);
            return;
        } catch (error) {
            console.error('❌ IndexedDB save failed:', error);
        }
    }
    
    // localStorage保存
    try {
        const papersToSave = this.papers.map(paper => {
            const paperCopy = { ...paper };
            if (paperCopy.pdfFile) delete paperCopy.pdfFile;
            return paperCopy;
        });
        localStorage.setItem('literaturePapers', JSON.stringify(papersToSave));
        console.log(`✅ Saved ${papersToSave.length} papers to localStorage`);
    } catch (error) {
        console.error('❌ localStorage save failed:', error);
    }
}

// 生成分享链接
async generateShareLink() {
    if (this.papers.length === 0) {
        this.showNotification('No papers to share', 'warning');
        return;
    }
    
    try {
        this.showNotification('Creating share link...', 'info');
        
        // 确保数据已保存到Supabase
        if (this.storageMode === 'supabase') {
            await this.saveData();
            
            const result = await window.supabaseStorage.createShareLink(this.papers, this.userId);
            if (result.success) {
                this.currentShareId = result.shareId;
                this.showShareLinkModal(result.shareUrl);
                return;
            }
        }
        
        // 降级方案：使用URL参数
        this.generateUrlBasedShareLink();
        
    } catch (error) {
        console.error('❌ Error generating share link:', error);
        this.showNotification('Failed to generate share link', 'error');
    }
}

// URL参数分享链接（降级方案）
generateUrlBasedShareLink() {
    try {
        const shareData = {
            papers: this.papers.map(paper => ({
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                journal: paper.journal,
                abstract: paper.abstract,
                researchArea: paper.researchArea,
                thumbnail: paper.thumbnail
            }))
        };
        
        const encodedData = btoa(JSON.stringify(shareData));
        const shareUrl = `${window.location.origin}?share=${encodedData}`;
        this.showShareLinkModal(shareUrl);
        
    } catch (error) {
        console.error('❌ Error generating URL-based share link:', error);
        this.showNotification('Failed to generate share link', 'error');
    }
}

// 显示分享链接模态框
showShareLinkModal(shareUrl) {
    document.getElementById('shareUrlInput').value = shareUrl;
    document.getElementById('shareStatsCount').textContent = this.papers.length;
    document.getElementById('shareStatsDate').textContent = new Date().toLocaleDateString();
    document.getElementById('shareStats').style.display = 'block';
    document.getElementById('shareLinkModal').classList.remove('hidden');
}

// 设置分享链接事件监听器
setupShareLinkEvents() {
    // 关闭分享链接模态框
    document.getElementById('closeShareLink').addEventListener('click', () => {
        document.getElementById('shareLinkModal').classList.add('hidden');
    });
    
    // 复制分享链接
    document.getElementById('copyShareUrl').addEventListener('click', async () => {
        const shareUrl = document.getElementById('shareUrlInput').value;
        try {
            await navigator.clipboard.writeText(shareUrl);
            this.showNotification('Share link copied to clipboard!', 'success');
        } catch (error) {
            // 降级复制方法
            document.getElementById('shareUrlInput').select();
            document.execCommand('copy');
            this.showNotification('Share link copied!', 'success');
        }
    });
}

// 处理分享链接访问
async handleShareLinkAccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    const pathSegments = window.location.pathname.split('/');
    const shareId = pathSegments[2]; // /share/shareId格式
    
    if (shareId && shareId !== '') {
        // Supabase分享链接
        await this.loadSharedPapers(shareId);
    } else if (shareParam) {
        // URL参数分享链接
        await this.loadSharedPapersFromUrl(shareParam);
    }
}

// 加载Supabase分享的论文
async loadSharedPapers(shareId) {
    try {
        this.showNotification('Loading shared papers...', 'info');
        
        const result = await window.supabaseStorage.getSharedPapers(shareId);
        if (result.success) {
            this.papers = result.papers;
            this.filteredPapers = [...this.papers];
            
            this.applyFilters();
            this.renderPapersGrid();
            this.updatePagination();
            
            this.showNotification(`Loaded ${this.papers.length} shared papers`, 'success');
            
            // 显示分享信息
            setTimeout(() => {
                this.showNotification(`📋 Viewing shared collection (${result.shareData.access_count} views)`, 'info');
            }, 2000);
        } else {
            this.showNotification('Share link not found or expired', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading shared papers:', error);
        this.showNotification('Failed to load shared papers', 'error');
    }
}

// 从URL参数加载分享的论文
async loadSharedPapersFromUrl(shareParam) {
    try {
        const shareData = JSON.parse(atob(shareParam));
        this.papers = shareData.papers || [];
        this.filteredPapers = [...this.papers];
        
        this.applyFilters();
        this.renderPapersGrid();
        this.updatePagination();
        
        this.showNotification(`Loaded ${this.papers.length} shared papers`, 'success');
    } catch (error) {
        console.error('❌ Error loading shared papers from URL:', error);
        this.showNotification('Invalid share link', 'error');
    }
}

// 删除所有论文（更新为支持Supabase）
async deleteAllPapers() {
    if (this.papers.length === 0) {
        this.showNotification('No papers to delete', 'info');
        return;
    }

    const confirmMessage = `Are you sure you want to delete ALL ${this.papers.length} papers?\n\nThis action will permanently remove ALL papers from:\n• Cloud storage (Supabase)\n• Local storage\n• Any shared links\n\nThis action cannot be undone.`;
    if (!confirm(confirmMessage)) {
        return;
    }

    const doubleConfirm = prompt(`To confirm total deletion, please type "DELETE ALL" (case sensitive):`);
    if (doubleConfirm !== "DELETE ALL") {
        this.showNotification('Deletion cancelled', 'info');
        return;
    }

    try {
        const deletedCount = this.papers.length;
        this.showNotification('Deleting all papers...', 'info');
        
        // 清空数据
        this.papers = [];
        this.filteredPapers = [];
        
        // 删除Supabase数据
        if (this.storageMode === 'supabase') {
            const result = await window.supabaseStorage.deleteAllPapers(this.userId);
            if (result.success) {
                console.log('✅ Supabase data deleted');
            }
        }
        
        // 设置删除标记并清理本地数据
        localStorage.setItem('papers_explicitly_deleted', 'true');
        await this.saveDataToLocal();
        localStorage.removeItem('literaturePapers');
        
        // 更新UI
        this.applyFilters();
        this.renderPapersGrid();
        this.updatePagination();
        
        this.showNotification(`✅ All ${deletedCount} papers deleted completely`, 'success');
    } catch (error) {
        console.error('Error deleting all papers:', error);
        this.showNotification('❌ Failed to delete all papers: ' + error.message, 'error');
    }
}