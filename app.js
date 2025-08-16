// Literature Review Management System JavaScript

class LiteratureManager {
    constructor() {
        this.papers = [];
        this.filteredPapers = [];
        this.currentCategory = 'all';
        this.currentSort = 'year-desc';
        this.currentPage = 1;
        this.papersPerPage = 12;
        this.currentChart = null;
        this.storage = null;
        
        // 添加Supabase支持
        this.storageMode = 'supabase'; // 优先使用Supabase
        this.userId = this.generateUserId();
        this.currentShareId = null;
        
        this.filters = {
            search: '',
            category: 'all',
            yearMin: 2000,
            yearMax: 2024,
            methodologies: [],
            studyTypes: [],
            venue: '',
            citationMin: null,
            citationMax: null
        };
        
        // Batch upload state
        this.batchUploadState = {
            files: [],
            queue: [],
            processing: false,
            paused: false,
            cancelled: false,
            currentIndex: 0,
            completed: 0,
            failed: 0,
            maxConcurrent: 3
        };
        
        this.init();
    }

    // 生成唯一用户ID
    generateUserId() {
        let userId = localStorage.getItem('user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('user_id', userId);
        }
        return userId;
    }
    
    async init() {
        // 优先初始化Supabase，如果失败则降级到IndexedDB
        if (this.storageMode === 'supabase') {
            try {
                await window.supabaseStorage.init();
                const testResult = await window.supabaseStorage.testConnection();
                if (testResult.success) {
                    console.log('✅ Supabase storage initialized successfully');
                } else {
                    console.warn('⚠️ Supabase connection failed, falling back to IndexedDB');
                    this.storageMode = 'indexeddb';
                }
            } catch (error) {
                console.warn('⚠️ Supabase not available, falling back to IndexedDB:', error);
                this.storageMode = 'indexeddb';
            }
        }
        
        // 初始化IndexedDB作为备用
        if (this.storageMode === 'indexeddb') {
            try {
                this.storage = new IndexedDBStorage();
                await this.storage.init();
                console.log('✅ IndexedDB storage initialized successfully');
            } catch (error) {
                console.warn('IndexedDB initialization failed, falling back to localStorage:', error);
                this.storage = null;
                this.storageMode = 'localStorage';
            }
        }
        
        await this.loadData();
        this.setupEventListeners();
        this.setupShareLinkEvents();
        this.initializeFilters();
        this.applyFilters();
        
        // 检查是否是分享链接访问
        this.handleShareLinkAccess();
    }
    
    // Check if there's any local data
    async hasLocalData() {
        // Check IndexedDB
        if (this.storage) {
            try {
                const papers = await this.storage.getAllPapers();
                if (papers && papers.length > 0) {
                    return true;
                }
            } catch (error) {
                console.log('Error checking IndexedDB:', error);
            }
        }
        
        // Check localStorage
        const savedPapers = localStorage.getItem('literaturePapers');
        if (savedPapers) {
            try {
                const parsedPapers = JSON.parse(savedPapers);
                return Array.isArray(parsedPapers) && parsedPapers.length > 0;
            } catch (error) {
                console.log('Error parsing localStorage:', error);
            }
        }
        
        return false;
    }
    
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
    
    // Save data to persistent storage
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
    
    setupEventListeners() {
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.applyFilters();
        });
        
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.applyFilters();
        });
        
        // Year range sliders
        const yearMinSlider = document.getElementById('yearMin');
        const yearMaxSlider = document.getElementById('yearMax');
        
        yearMinSlider.addEventListener('input', (e) => {
            this.filters.yearMin = parseInt(e.target.value);
            if (this.filters.yearMin > this.filters.yearMax) {
                this.filters.yearMax = this.filters.yearMin;
                yearMaxSlider.value = this.filters.yearMin;
            }
            this.updateYearDisplay();
            this.applyFilters();
        });
        
        yearMaxSlider.addEventListener('input', (e) => {
            this.filters.yearMax = parseInt(e.target.value);
            if (this.filters.yearMax < this.filters.yearMin) {
                this.filters.yearMin = this.filters.yearMax;
                yearMinSlider.value = this.filters.yearMax;
            }
            this.updateYearDisplay();
            this.applyFilters();
        });
        
        // Citation range inputs
        document.getElementById('citationMin').addEventListener('input', (e) => {
            this.filters.citationMin = e.target.value ? parseInt(e.target.value) : null;
            this.applyFilters();
        });
        
        document.getElementById('citationMax').addEventListener('input', (e) => {
            this.filters.citationMax = e.target.value ? parseInt(e.target.value) : null;
            this.applyFilters();
        });
        
        // Venue filter
        document.getElementById('venueFilter').addEventListener('change', (e) => {
            this.filters.venue = e.target.value;
            this.applyFilters();
        });
        
        // Category tab buttons
        document.querySelectorAll('.category-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                this.filters.category = btn.dataset.category;
                this.applyFilters();
            });
        });
        
        // Sort functionality
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.sortPapers();
            this.updateView();
        });
        
        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Upload functionality
        document.getElementById('uploadBtn').addEventListener('click', () => {
            this.showUploadModal();
        });
        
        // GitHub Settings functionality
        document.getElementById('githubSettingsBtn').addEventListener('click', () => {
            this.showGithubSettingsModal();
        });
        
        document.getElementById('closeGithubSettings').addEventListener('click', () => {
            this.hideGithubSettingsModal();
        });
        
        document.getElementById('testGithubConnection').addEventListener('click', () => {
            this.testGithubConnection();
        });
        
        document.getElementById('saveGithubSettings').addEventListener('click', () => {
            this.saveGithubSettings();
        });
        
        document.getElementById('syncToGithubBtn').addEventListener('click', () => {
            this.syncToGitHub();
        });
        
        document.getElementById('deleteAllPapersBtn').addEventListener('click', () => {
            this.deleteAllPapers();
        });
        
        // Paper details modal
        document.getElementById('closePaper').addEventListener('click', () => {
            this.hidePaperModal();
        });
        
        // Modal backdrop click to close
        document.getElementById('paperModal').addEventListener('click', (e) => {
            if (e.target.id === 'paperModal') {
                this.hidePaperModal();
            }
        });
        
        // Upload modal events
        document.getElementById('closeUpload').addEventListener('click', () => {
            this.hideUploadModal();
        });
        
        document.getElementById('uploadModal').addEventListener('click', (e) => {
            if (e.target.id === 'uploadModal') {
                this.hideUploadModal();
            }
        });
        
        // Upload tab switching
        document.querySelectorAll('.upload-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.switchUploadTab(tab.dataset.tab);
            });
        });
        
        // Enhanced File upload events for batch processing
        document.getElementById('selectFileBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        // Add folder selection support (webkitdirectory)
        document.getElementById('selectFolderBtn').addEventListener('click', () => {
            const folderInput = document.createElement('input');
            folderInput.type = 'file';
            folderInput.webkitdirectory = true;
            folderInput.multiple = true;
            folderInput.accept = '.pdf,.doc,.docx,.json,.csv';
            folderInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.handleBatchFileSelect(e.target.files);
                }
            });
            folderInput.click();
        });
        
        document.getElementById('fileInput').addEventListener('change', (e) => {
            console.log('File input changed, files:', e.target.files);
            if (e.target.files && e.target.files.length > 0) {
                this.handleBatchFileSelect(e.target.files);
                // Clear the input value to allow selecting the same file again if needed
                e.target.value = '';
            }
        });
        
        // Enhanced drag and drop events for batch upload zone
        const uploadZone = document.getElementById('uploadZone');
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        
        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            this.handleBatchFileSelect(e.dataTransfer.files);
        });
        
        uploadZone.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        // Category selection events
        document.querySelectorAll('input[name="uploadCategory"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateSelectedCategoryDisplay();
            });
        });
        
        // Batch control events
        document.getElementById('clearAllBtn').addEventListener('click', () => {
            this.clearFileQueue();
        });
        
        document.getElementById('startBatchBtn').addEventListener('click', () => {
            this.startBatchUpload();
        });
        
        document.getElementById('pauseBatchBtn').addEventListener('click', () => {
            this.pauseBatchUpload();
        });
        
        document.getElementById('cancelBatchBtn').addEventListener('click', () => {
            this.cancelBatchUpload();
        });
        
        document.getElementById('retryFailedBtn').addEventListener('click', () => {
            this.retryFailedUploads();
        });
        
        // Manual entry form
        document.getElementById('manualEntryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleManualEntry();
        });
        
        document.getElementById('cancelManualEntry').addEventListener('click', () => {
            this.hideUploadModal();
        });
        
        // Image manager events
        document.getElementById('closeImageManager').addEventListener('click', () => {
            this.hideImageManager();
        });
        
        document.getElementById('imageManagerModal').addEventListener('click', (e) => {
            if (e.target.id === 'imageManagerModal') {
                this.hideImageManager();
            }
        });
        
        // Image upload events
        document.getElementById('imageUploadArea').addEventListener('click', () => {
            document.getElementById('imageFileInput').click();
        });
        
        document.getElementById('imageFileInput').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0]);
        });
        
        // Image drag and drop
        const imageUploadArea = document.getElementById('imageUploadArea');
        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.classList.add('drag-over');
        });
        
        imageUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('drag-over');
        });
        
        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.handleImageUpload(e.dataTransfer.files[0]);
            }
        });
        
        // Image management buttons
        document.getElementById('resetImageBtn').addEventListener('click', () => {
            this.resetPaperImage();
        });
        
        document.getElementById('removeImageBtn').addEventListener('click', () => {
            this.removePaperImage();
        });
        
        // PDF download functionality (simplified)
        document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
            if (this.currentPdfUrl) {
                const link = document.createElement('a');
                link.href = this.currentPdfUrl;
                link.download = (this.currentPdfTitle || 'document') + '.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        });
    }
    
    initializeFilters() {
        // Initialize methodology filters
        const methodologies = [...new Set(this.papers.map(p => p.methodology))];
        this.createCheckboxGroup('methodologyFilters', methodologies, 'methodologies');
        
        // Initialize study type filters
        const studyTypes = [...new Set(this.papers.map(p => p.studyType))];
        this.createCheckboxGroup('studyTypeFilters', studyTypes, 'studyTypes');
        
        // Initialize venue options
        const venues = [...new Set(this.papers.map(p => p.journal))].sort();
        const venueSelect = document.getElementById('venueFilter');
        venues.forEach(venue => {
            const option = document.createElement('option');
            option.value = venue;
            option.textContent = venue;
            venueSelect.appendChild(option);
        });
        
        this.updateYearDisplay();
    }
    
    createCheckboxGroup(containerId, items, filterKey) {
        const container = document.getElementById(containerId);
        container.innerHTML = ''; // Clear existing items
        items.forEach(item => {
            const itemCount = this.papers.filter(p => {
                if (filterKey === 'methodologies') return p.methodology === item;
                if (filterKey === 'studyTypes') return p.studyType === item;
                return false;
            }).length;
            
            const checkboxItem = document.createElement('div');
            checkboxItem.className = 'checkbox-item';
            checkboxItem.innerHTML = `
                <input type="checkbox" id="${filterKey}_${item.replace(/\s+/g, '_')}" value="${item}">
                <label for="${filterKey}_${item.replace(/\s+/g, '_')}">${item}</label>
                <span class="item-count">${itemCount}</span>
            `;
            
            const checkbox = checkboxItem.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.filters[filterKey].push(item);
                } else {
                    this.filters[filterKey] = this.filters[filterKey].filter(i => i !== item);
                }
                this.applyFilters();
            });
            
            container.appendChild(checkboxItem);
        });
    }
    
    updateYearDisplay() {
        document.getElementById('yearMinDisplay').textContent = this.filters.yearMin;
        document.getElementById('yearMaxDisplay').textContent = this.filters.yearMax;
    }
    
    applyFilters() {
        console.log('=== APPLY FILTERS DEBUG ===');
        console.log('Current filters:', this.filters);
        console.log('Total papers before filtering:', this.papers.length);
        
        this.filteredPapers = this.papers.filter(paper => {
            // Search filter
            if (this.filters.search) {
                const searchText = this.filters.search;
                const searchIn = `${paper.title} ${paper.authors.join(' ')} ${paper.abstract} ${paper.keywords.join(' ')}`.toLowerCase();
                if (!searchIn.includes(searchText)) return false;
            }
            
            // Category filter
            if (this.filters.category !== 'all' && paper.researchArea !== this.filters.category) {
                return false;
            }
            
            // Year filter
            if (paper.year < this.filters.yearMin || paper.year > this.filters.yearMax) {
                console.log(`Paper "${paper.title}" (${paper.year}) filtered out by year range ${this.filters.yearMin}-${this.filters.yearMax}`);
                return false;
            }
            
            // Methodology filter
            if (this.filters.methodologies.length > 0 && !this.filters.methodologies.includes(paper.methodology)) {
                return false;
            }
            
            // Study type filter
            if (this.filters.studyTypes.length > 0 && !this.filters.studyTypes.includes(paper.studyType)) {
                return false;
            }
            
            // Venue filter
            if (this.filters.venue && paper.journal !== this.filters.venue) {
                return false;
            }
            
            // Citation range filter
            if (this.filters.citationMin !== null && paper.citations < this.filters.citationMin) {
                return false;
            }
            if (this.filters.citationMax !== null && paper.citations > this.filters.citationMax) {
                return false;
            }
            
            return true;
        });
        
        console.log('Filtered papers count:', this.filteredPapers.length);
        console.log('Recently added papers:', this.papers.slice(-3).map(p => `${p.id}: ${p.title} (${p.year})`));
        
        this.sortPapers();
        this.currentPage = 1;
        this.updateStatistics();
        this.renderPapersGrid();
        this.updatePagination();
        
        console.log('=== FILTERS APPLIED ===');
    }
    
    sortPapers() {
        this.filteredPapers.sort((a, b) => {
            switch (this.currentSort) {
                case 'year-desc':
                    return b.year - a.year;
                case 'year-asc':
                    return a.year - b.year;
                case 'citations-desc':
                    return b.citations - a.citations;
                case 'citations-asc':
                    return a.citations - b.citations;
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                default:
                    return b.year - a.year;
            }
        });
    }
    
    updateStatistics() {
        document.getElementById('totalCount').textContent = this.papers.length;
        document.getElementById('filteredCount').textContent = this.filteredPapers.length;
        
        // Update category count
        const categoryCount = this.currentCategory === 'all' ? 
            this.filteredPapers.length : 
            this.papers.filter(p => p.researchArea === this.currentCategory).length;
        document.getElementById('categoryCount').textContent = categoryCount;
    }
    
    renderPapersGrid() {
        const container = document.getElementById('papersGrid');
        const startIndex = (this.currentPage - 1) * this.papersPerPage;
        const endIndex = Math.min(startIndex + this.papersPerPage, this.filteredPapers.length);
        const paginatedPapers = this.filteredPapers.slice(startIndex, endIndex);
        
        if (paginatedPapers.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <h3>No matching papers found</h3>
                    <p>Please try adjusting filter conditions or search keywords</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = paginatedPapers.map(paper => `
            <div class="paper-card" onclick="literatureManager.showPaperDetails(${paper.id})">
                <div class="paper-card-header">
                    <div class="paper-image-container">
                        ${paper.thumbnail && paper.thumbnail !== 'null' && paper.thumbnail !== '' ? 
                            `<img src="${paper.thumbnail}" alt="PDF Preview" class="paper-thumbnail" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                             <div class="paper-icon" style="display: none;">${this.getPaperIcon(paper.researchArea)}</div>` :
                            `<div class="paper-icon">${this.getPaperIcon(paper.researchArea)}</div>`
                        }
                        <div class="image-overlay" onclick="event.stopPropagation(); literatureManager.showImageManager(${paper.id})">
                            <div class="overlay-icon">📷</div>
                        </div>
                    </div>
                </div>
                <div class="paper-card-content">
                    <h3 class="paper-card-title">${paper.title}</h3>
                    <div class="paper-card-meta">
                        <div class="paper-card-authors">${paper.authors.join(', ')}</div>
                        <div class="paper-card-info">
                            <span class="paper-card-venue">${paper.journal}</span>
                            <span class="paper-card-year">${paper.year}</span>
                        </div>
                        <div class="paper-card-stats">
                            <div class="paper-stat">
                                <span class="paper-stat-icon">📊</span>
                                <span>${paper.citations}</span>
                            </div>
                            <div class="paper-stat">
                                <span class="paper-stat-icon">📥</span>
                                <span>${paper.downloads}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    getPaperIcon(researchArea) {
        const icons = {
            'Accessible Interaction': '♿',
            'HCI New Wearable Devices': '⌚',
            'Immersive Interaction': '🥽',
            'Mobile Device': '📱',
            'Special Scenarios': '🎭',
            'General': '📄'
        };
        return icons[researchArea] || '📄';
    }
    
    renderTimelineView() {
        const container = document.getElementById('timelineView');
        const papersByYear = {};
        
        this.filteredPapers.forEach(paper => {
            if (!papersByYear[paper.year]) {
                papersByYear[paper.year] = [];
            }
            papersByYear[paper.year].push(paper);
        });
        
        const years = Object.keys(papersByYear).sort((a, b) => b - a);
        
        container.innerHTML = years.map(year => `
            <div class="timeline-year">
                <h3 class="timeline-year-label">${year} (${papersByYear[year].length} papers)</h3>
                <div class="timeline-papers">
                    ${papersByYear[year].map(paper => `
                        <div class="paper-card" onclick="literatureManager.showPaperDetails(${paper.id})">
                            <div class="paper-header">
                                <h4 class="paper-title">${paper.title}</h4>
                                <div class="paper-authors">${paper.authors.join(', ')}</div>
                                <div class="paper-venue">${paper.journal}</div>
                            </div>
                            <div class="paper-meta">
                                <div class="meta-item">
                                    <span>Field: ${paper.researchArea}</span>
                                </div>
                                <div class="meta-item">
                                    <span>Citations: ${paper.citations}</span>
                                </div>
                            </div>
                            <div class="paper-keywords">
                                ${paper.keywords.slice(0, 3).map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    updatePagination() {
        const pagination = document.getElementById('pagination');
        const totalPages = Math.ceil(this.filteredPapers.length / this.papersPerPage);
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }
        
        let paginationHTML = '';
        
        // Previous button
        paginationHTML += `<button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="literatureManager.goToPage(${this.currentPage - 1})">Previous</button>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
                paginationHTML += `<button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" onclick="literatureManager.goToPage(${i})">${i}</button>`;
            } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
                paginationHTML += `<span class="pagination-info">...</span>`;
            }
        }
        
        // Next button
        paginationHTML += `<button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="literatureManager.goToPage(${this.currentPage + 1})">Next</button>`;
        
        // Page info
        paginationHTML += `<span class="pagination-info">Page ${this.currentPage} of ${totalPages}</span>`;
        
        pagination.innerHTML = paginationHTML;
    }
    
    goToPage(page) {
        this.currentPage = page;
        this.renderPapersGrid();
        this.updatePagination();
    }
    
    resetFilters() {
        this.filters = {
            search: '',
            category: 'all',
            yearMin: 2000,
            yearMax: 2024,
            methodologies: [],
            studyTypes: [],
            venue: '',
            citationMin: null,
            citationMax: null
        };
        
        // Reset UI elements
        document.getElementById('searchInput').value = '';
        document.getElementById('yearMin').value = 2000;
        document.getElementById('yearMax').value = 2024;
        document.getElementById('citationMin').value = '';
        document.getElementById('citationMax').value = '';
        document.getElementById('venueFilter').value = '';
        
        // Reset category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.category === 'all') {
                tab.classList.add('active');
            }
        });
        this.currentCategory = 'all';
        
        // Reset checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateYearDisplay();
        this.applyFilters();
    }
    
    showPaperDetails(paperId) {
        const paper = this.papers.find(p => p.id === paperId);
        if (!paper) return;
        
        this.currentEditingPaper = paper;
        this.isEditMode = false;
        
        document.getElementById('paperTitle').textContent = paper.title;
        this.renderPaperDetails(paper);
        
        document.getElementById('paperModal').classList.remove('hidden');
    }
    
    renderPaperDetails(paper) {
        const isEditMode = this.isEditMode;
        
        document.getElementById('paperDetails').innerHTML = `
            <div class="paper-details-layout">
                <div class="paper-details-image">
                    ${paper.thumbnail && paper.thumbnail !== 'null' && paper.thumbnail !== '' ? 
                        `<img src="${paper.thumbnail}" alt="PDF Preview" class="paper-details-thumbnail" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                         <div class="paper-details-icon" style="display: none;">${this.getPaperIcon(paper.researchArea)}</div>` :
                        `<div class="paper-details-icon">${this.getPaperIcon(paper.researchArea)}</div>`
                    }
                </div>
                <div class="paper-details-content">
                    <div class="paper-details-actions">
                        ${!isEditMode ? 
                            `<button class="btn btn--danger btn--sm delete-btn" onclick="literatureManager.deletePaper(${paper.id})" title="Delete Paper">🗑️ Delete</button>
                             <button class="btn btn--secondary btn--sm edit-btn" onclick="literatureManager.toggleEditMode()">✏️ Edit</button>` :
                            `<button class="btn btn--primary btn--sm save-btn" onclick="literatureManager.savePaperDetails()">💾 Save</button>
                             <button class="btn btn--outline btn--sm cancel-btn" onclick="literatureManager.cancelEditMode()">❌ Cancel</button>`
                        }
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Authors</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.authors.join(', ') :
                                `<input type="text" class="detail-input" id="edit-authors" value="${paper.authors.join(', ')}" placeholder="Separate multiple authors with commas">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Journal/Conference</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.journal :
                                `<input type="text" class="detail-input" id="edit-journal" value="${paper.journal}" placeholder="Journal or conference name">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Publication Year</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.year :
                                `<input type="number" class="detail-input" id="edit-year" value="${paper.year}" min="1900" max="2030" placeholder="Publication year">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Research Field</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.researchArea :
                                `<select class="detail-input" id="edit-researchArea">
                                    <option value="Accessible Interaction" ${paper.researchArea === 'Accessible Interaction' ? 'selected' : ''}>Accessible Interaction</option>
                                    <option value="HCI New Wearable Devices" ${paper.researchArea === 'HCI New Wearable Devices' ? 'selected' : ''}>HCI New Wearable Devices</option>
                                    <option value="Immersive Interaction" ${paper.researchArea === 'Immersive Interaction' ? 'selected' : ''}>Immersive Interaction</option>
                                    <option value="Mobile Device" ${paper.researchArea === 'Mobile Device' ? 'selected' : ''}>Mobile Device</option>
                                    <option value="Special Scenarios" ${paper.researchArea === 'Special Scenarios' ? 'selected' : ''}>Special Scenarios</option>
                                    <option value="General" ${paper.researchArea === 'General' ? 'selected' : ''}>Other</option>
                                </select>`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Research Method</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.methodology :
                                `<select class="detail-input" id="edit-methodology">
                                    <option value="Experimental" ${paper.methodology === 'Experimental' ? 'selected' : ''}>Experimental Research</option>
                                    <option value="Survey" ${paper.methodology === 'Survey' ? 'selected' : ''}>Survey</option>
                                    <option value="Computational" ${paper.methodology === 'Computational' ? 'selected' : ''}>Computational Methods</option>
                                    <option value="Design Research" ${paper.methodology === 'Design Research' ? 'selected' : ''}>Design Research</option>
                                    <option value="Theoretical" ${paper.methodology === 'Theoretical' ? 'selected' : ''}>Theoretical Research</option>
                                </select>`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Study Type</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.studyType :
                                `<select class="detail-input" id="edit-studyType">
                                    <option value="Empirical" ${paper.studyType === 'Empirical' ? 'selected' : ''}>Empirical Research</option>
                                    <option value="Review" ${paper.studyType === 'Review' ? 'selected' : ''}>Review</option>
                                    <option value="Case Study" ${paper.studyType === 'Case Study' ? 'selected' : ''}>Case Study</option>
                                </select>`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Abstract</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                `<div class="detail-abstract">${paper.abstract}</div>` :
                                `<textarea class="detail-textarea" id="edit-abstract" placeholder="Paper abstract" rows="4">${paper.abstract}</textarea>`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Keywords</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.keywords.join(', ') :
                                `<input type="text" class="detail-input" id="edit-keywords" value="${paper.keywords.join(', ')}" placeholder="Separate multiple keywords with commas">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Citations</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.citations :
                                `<input type="number" class="detail-input" id="edit-citations" value="${paper.citations}" min="0" placeholder="Citation count">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Downloads</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.downloads :
                                `<input type="number" class="detail-input" id="edit-downloads" value="${paper.downloads}" min="0" placeholder="Download count">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">DOI</div>
                        <div class="detail-value">
                            ${!isEditMode ? 
                                paper.doi :
                                `<input type="text" class="detail-input" id="edit-doi" value="${paper.doi}" placeholder="10.xxxx/xxxxxx">`
                            }
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-label">Links</div>
                        <div class="detail-links">
                            ${paper.pdfUrl && paper.pdfUrl !== '#' ? 
                                `<a href="${paper.pdfUrl}" target="_blank" rel="noopener noreferrer" class="detail-link detail-link--primary">📄 Open PDF in New Window</a>` :
                                `<span class="detail-link detail-link--disabled">PDF document unavailable</span>`
                            }
                            ${paper.websiteUrl && paper.websiteUrl !== '#' ? 
                                `<a href="${paper.websiteUrl}" target="_blank" rel="noopener noreferrer" class="detail-link detail-link--secondary">🌐 Website Link</a>` :
                                `<span class="detail-link detail-link--disabled">Website link unavailable</span>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    toggleEditMode() {
        this.isEditMode = true;
        this.renderPaperDetails(this.currentEditingPaper);
    }
    
    cancelEditMode() {
        this.isEditMode = false;
        this.renderPaperDetails(this.currentEditingPaper);
    }
    
    async savePaperDetails() {
        if (!this.currentEditingPaper) return;
        
        try {
            // Collect edited values
            const editedPaper = {
                ...this.currentEditingPaper,
                authors: document.getElementById('edit-authors').value.split(',').map(a => a.trim()).filter(a => a),
                journal: document.getElementById('edit-journal').value.trim(),
                year: parseInt(document.getElementById('edit-year').value),
                researchArea: document.getElementById('edit-researchArea').value,
                methodology: document.getElementById('edit-methodology').value,
                studyType: document.getElementById('edit-studyType').value,
                abstract: document.getElementById('edit-abstract').value.trim(),
                keywords: document.getElementById('edit-keywords').value.split(',').map(k => k.trim()).filter(k => k),
                citations: parseInt(document.getElementById('edit-citations').value) || 0,
                downloads: parseInt(document.getElementById('edit-downloads').value) || 0,
                doi: document.getElementById('edit-doi').value.trim()
            };
            
            // Validate required fields
            if (!editedPaper.authors.length || !editedPaper.journal || !editedPaper.year) {
                this.showNotification('Please fill in required fields: authors, journal and year', 'error');
                return;
            }
            
            if (editedPaper.year < 1900 || editedPaper.year > 2030) {
                this.showNotification('Please enter a valid publication year', 'error');
                return;
            }
            
            // Update the paper in the papers array
            const paperIndex = this.papers.findIndex(p => p.id === this.currentEditingPaper.id);
            if (paperIndex !== -1) {
                // Update H-index based on citations
                editedPaper.hIndex = Math.floor(editedPaper.citations / 3);
                
                this.papers[paperIndex] = editedPaper;
                this.currentEditingPaper = editedPaper;
                
                // Save to localStorage
                await this.saveData();
                
                // Refresh filters and view
                this.applyFilters();
                this.initializeFilters();
                
                // Exit edit mode and show success
                this.isEditMode = false;
                this.renderPaperDetails(editedPaper);
                this.showNotification('Paper information saved successfully!', 'success');
            }
            
        } catch (error) {
            console.error('Error saving paper details:', error);
            this.showNotification('Save failed: ' + error.message, 'error');
        }
    }
    
    hidePaperModal() {
        document.getElementById('paperModal').classList.add('hidden');
    }
    
    // Upload Modal Methods
    showUploadModal() {
        document.getElementById('uploadModal').classList.remove('hidden');
        this.resetUploadForm();
        this.updateSelectedCategoryDisplay(); // Initialize category display
    }
    
    hideUploadModal() {
        document.getElementById('uploadModal').classList.add('hidden');
        this.resetUploadForm();
    }
    
    switchUploadTab(tabName) {
        document.getElementById('fileUploadTab').classList.toggle('hidden', tabName !== 'file');
        document.getElementById('manualEntryTab').classList.toggle('hidden', tabName !== 'manual');
    }
    
    resetUploadForm() {
        // Reset file upload
        document.getElementById('fileInput').value = '';
        
        // Reset legacy elements if they exist
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea) uploadArea.classList.remove('drag-over');
        
        const uploadProgress = document.getElementById('uploadProgress');
        if (uploadProgress) uploadProgress.classList.add('hidden');
        
        const progressFill = document.getElementById('progressFill');
        if (progressFill) progressFill.style.width = '0%';
        
        // Reset batch upload elements
        const uploadZone = document.getElementById('uploadZone');
        if (uploadZone) uploadZone.classList.remove('drag-over');
        
        // Reset category selection to auto
        document.getElementById('categoryAuto').checked = true;
        
        // Reset manual entry form
        document.getElementById('manualEntryForm').reset();
        
        // Clear batch file queue
        this.clearFileQueue();
        
        // Hide batch panel
        const batchPanel = document.getElementById('batchPanel');
        if (batchPanel) batchPanel.classList.add('hidden');
        
        // Initialize batch upload state
        this.initializeBatchUploadState();
    }
    
    handleFileSelect(files) {
        console.log('handleFileSelect called with files:', files);
        if (files.length === 0) {
            console.log('No files selected');
            return;
        }
        
        try {
            const fileList = this.createFileList(files);
            const fileUploadTab = document.getElementById('fileUploadTab');
            
            // Remove existing file list
            const existingFileList = fileUploadTab.querySelector('.file-list');
            if (existingFileList) {
                existingFileList.remove();
            }
            
            fileUploadTab.appendChild(fileList);
            
            // Show immediate feedback
            this.showNotification(`Selected ${files.length} file(s) for upload`, 'info');
            
            // Process files
            this.processFiles(files);
        } catch (error) {
            console.error('Error in handleFileSelect:', error);
            this.showNotification('Error processing selected files: ' + error.message, 'error');
        }
    }
    
    createFileList(files) {
        const fileList = document.createElement('div');
        fileList.className = 'file-list';
        
        Array.from(files).forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">${this.getFileIcon(file.type)}</div>
                    <div class="file-details">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <div class="file-status processing" id="fileStatus-${index}">Processing</div>
                <button class="remove-file" data-index="${index}">×</button>
            `;
            
            fileItem.querySelector('.remove-file').addEventListener('click', () => {
                fileItem.remove();
                if (fileList.children.length === 0) {
                    fileList.remove();
                }
            });
            
            fileList.appendChild(fileItem);
        });
        
        return fileList;
    }
    
    getFileIcon(fileType) {
        if (fileType.includes('pdf')) return '📄';
        if (fileType.includes('json')) return '📋';
        if (fileType.includes('csv')) return '📊';
        if (fileType.includes('doc')) return '📝';
        return '📄';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async processFiles(files) {
        console.log('Starting to process files:', files);
        const results = [];
        
        // Show processing notification
        this.showNotification(`Processing ${files.length} file(s)...`, 'info');
        
        // Get selected category for upload
        const selectedCategoryElement = document.querySelector('input[name="uploadCategory"]:checked');
        const selectedCategory = selectedCategoryElement ? selectedCategoryElement.value : 'auto';
        
        console.log('Selected category for upload:', selectedCategory);
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const statusElement = document.getElementById(`fileStatus-${i}`);
            
            try {
                statusElement.textContent = 'Parsing...';
                statusElement.className = 'file-status processing';
                
                // Show different status for PDF files
                if (file.type === 'application/pdf') {
                    statusElement.textContent = 'Generating thumbnail...';
                }
                
                console.log('Processing file:', file.name, 'with category:', selectedCategory);
                const paperData = await this.parseFile(file, selectedCategory);
                console.log('Parsed paper data:', paperData);
                
                if (paperData) {
                    console.log('Adding paper to collection...');
                    await this.addPaper(paperData);
                    statusElement.textContent = 'Success';
                    statusElement.className = 'file-status success';
                    results.push({ success: true, file: file.name, data: paperData });
                } else {
                    console.log('Failed to parse paper data');
                    statusElement.textContent = 'Parse failed';
                    statusElement.className = 'file-status error';
                    results.push({ success: false, file: file.name, error: 'Unable to parse file content' });
                }
            } catch (error) {
                console.error('Error processing file:', error);
                statusElement.textContent = 'Error';
                statusElement.className = 'file-status error';
                results.push({ success: false, file: file.name, error: error.message });
            }
        }
        
        console.log('Upload results:', results);
        this.showUploadResults(results);
    }
    
    // ===============================
    // BATCH UPLOAD SYSTEM METHODS
    // ===============================
    
    initializeBatchUploadState() {
        this.batchUploadState = {
            files: [],
            queue: [],
            processing: false,
            paused: false,
            cancelled: false,
            currentIndex: 0,
            completed: 0,
            failed: 0,
            maxConcurrent: 3
        };
    }
    
    handleBatchFileSelect(files) {
        console.log('Batch file selection:', files.length, 'files');
        
        if (files.length === 0) {
            this.showNotification('No files selected', 'warning');
            return;
        }
        
        if (files.length > 50) {
            this.showNotification('Maximum 50 files allowed per batch. Only first 50 files will be processed.', 'warning');
            files = Array.from(files).slice(0, 50);
        }
        
        // Filter supported file types
        const supportedFiles = Array.from(files).filter(file => {
            const extension = file.name.split('.').pop().toLowerCase();
            return ['pdf', 'doc', 'docx', 'json', 'csv'].includes(extension);
        });
        
        if (supportedFiles.length !== files.length) {
            this.showNotification(`${files.length - supportedFiles.length} unsupported files ignored`, 'info');
        }
        
        if (supportedFiles.length === 0) {
            this.showNotification('No supported files found. Please select PDF, DOC, JSON, or CSV files.', 'error');
            return;
        }
        
        // Add files to queue
        this.addFilesToQueue(supportedFiles);
        
        // Show batch panel
        this.showBatchPanel();
        
        this.showNotification(`Added ${supportedFiles.length} files to upload queue`, 'success');
    }
    
    addFilesToQueue(files) {
        const newFiles = Array.from(files).map((file, index) => ({
            id: Date.now() + index,
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'queued',
            progress: 0,
            error: null,
            result: null
        }));
        
        this.batchUploadState.files.push(...newFiles);
        this.batchUploadState.queue.push(...newFiles);
        
        this.updateBatchUI();
    }
    
    showBatchPanel() {
        const batchPanel = document.getElementById('batchPanel');
        batchPanel.classList.remove('hidden');
    }
    
    updateBatchUI() {
        this.updateBatchSummary();
        this.renderFileQueue();
        this.updateBatchProgress();
        this.updateBatchStatus();
    }
    
    updateBatchSummary() {
        const totalFiles = this.batchUploadState.files.length;
        const queuedFiles = this.batchUploadState.files.filter(f => f.status === 'queued').length;
        
        document.getElementById('batchTitle').textContent = 
            this.batchUploadState.processing ? 'Processing Files' : 'Selected Files';
        document.getElementById('batchSummary').textContent = 
            `${totalFiles} files (${queuedFiles} ready for upload)`;
    }
    
    renderFileQueue() {
        const fileQueue = document.getElementById('fileQueue');
        fileQueue.innerHTML = '';
        
        this.batchUploadState.files.forEach(fileItem => {
            const fileElement = this.createFileQueueItem(fileItem);
            fileQueue.appendChild(fileElement);
        });
    }
    
    createFileQueueItem(fileItem) {
        const div = document.createElement('div');
        div.className = `file-item ${fileItem.status}`;
        div.id = `file-${fileItem.id}`;
        
        const fileIcon = this.getFileIcon(fileItem.type);
        const fileSize = this.formatFileSize(fileItem.size);
        
        div.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-details">
                    <h5>${fileItem.name}</h5>
                    <p class="file-meta">${fileSize} • ${fileItem.type || 'Unknown type'}</p>
                    ${fileItem.status === 'processing' ? '<div class="file-progress"><div class="file-progress-fill" style="width: ' + fileItem.progress + '%"></div></div>' : ''}
                </div>
            </div>
            <div class="file-status ${fileItem.status}">
                ${this.getFileStatusContent(fileItem)}
            </div>
            <div class="file-actions">
                ${this.getFileActions(fileItem)}
            </div>
        `;
        
        return div;
    }
    
    getFileIcon(type) {
        if (type?.includes('pdf')) return '📄';
        if (type?.includes('doc')) return '📝';
        if (type?.includes('json')) return '📋';
        if (type?.includes('csv')) return '📊';
        return '📄';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    getFileStatusContent(fileItem) {
        switch (fileItem.status) {
            case 'queued':
                return '<span class="file-status-text">Queued</span>';
            case 'processing':
                return '<div class="processing-spinner"></div><span class="file-status-text">Processing</span>';
            case 'completed':
                return '<span class="file-status-text">✓ Completed</span>';
            case 'failed':
                return `<span class="file-status-text">✗ Failed</span>`;
            default:
                return '<span class="file-status-text">Unknown</span>';
        }
    }
    
    getFileActions(fileItem) {
        switch (fileItem.status) {
            case 'queued':
                return `<button class="file-action-btn remove" onclick="literatureManager.removeFileFromQueue('${fileItem.id}')" title="Remove">🗑️</button>`;
            case 'failed':
                return `
                    <button class="file-action-btn retry" onclick="literatureManager.retryFile('${fileItem.id}')" title="Retry">↻</button>
                    <button class="file-action-btn remove" onclick="literatureManager.removeFileFromQueue('${fileItem.id}')" title="Remove">🗑️</button>
                `;
            default:
                return '';
        }
    }
    
    clearFileQueue() {
        if (this.batchUploadState.processing) {
            this.showNotification('Cannot clear queue while processing. Please cancel upload first.', 'warning');
            return;
        }
        
        this.initializeBatchUploadState();
        this.updateBatchUI();
        
        const batchPanel = document.getElementById('batchPanel');
        batchPanel.classList.add('hidden');
        
        this.showNotification('File queue cleared', 'info');
    }
    
    // Update selected category display in upload modal
    updateSelectedCategoryDisplay() {
        const selectedRadio = document.querySelector('input[name="uploadCategory"]:checked');
        if (!selectedRadio) return;
        
        const selectedValue = selectedRadio.value;
        const categoryBadge = document.querySelector('.category-badge');
        const categoryDescription = document.querySelector('.category-description');
        
        // Update badge content based on selection
        const categoryInfo = {
            'auto': {
                icon: '🤖',
                text: 'Auto Recognition Selected',
                description: 'Files will be automatically categorized based on their content'
            },
            'Accessible Interaction': {
                icon: '♿',
                text: 'Accessible Interaction',
                description: 'All files will be categorized under Accessibility and Inclusive Design'
            },
            'HCI New Wearable Devices': {
                icon: '⌚',
                text: 'HCI New Wearable Devices',
                description: 'All files will be categorized under Smartwatches, AR/VR, and IoT devices'
            },
            'Immersive Interaction': {
                icon: '🥽',
                text: 'Immersive Interaction',
                description: 'All files will be categorized under VR, AR, and Mixed Reality'
            },
            'Mobile Device': {
                icon: '📱',
                text: 'Mobile Device',
                description: 'All files will be categorized under Smartphones, tablets, and mobile UX'
            },
            'Special Scenarios': {
                icon: '⚡',
                text: 'Special Scenarios',
                description: 'All files will be categorized under Emergency, healthcare, and education scenarios'
            }
        };
        
        const info = categoryInfo[selectedValue] || categoryInfo['auto'];
        
        // Update the display
        categoryBadge.innerHTML = `
            <span class="badge-icon">${info.icon}</span>
            <span class="badge-text">${info.text}</span>
        `;
        categoryDescription.textContent = info.description;
        
        console.log('Category selection updated:', selectedValue);
    }
    
    removeFileFromQueue(fileId) {
        const fileIndex = this.batchUploadState.files.findIndex(f => f.id == fileId);
        if (fileIndex === -1) return;
        
        const file = this.batchUploadState.files[fileIndex];
        if (file.status === 'processing') {
            this.showNotification('Cannot remove file while processing', 'warning');
            return;
        }
        
        this.batchUploadState.files.splice(fileIndex, 1);
        this.batchUploadState.queue = this.batchUploadState.queue.filter(f => f.id != fileId);
        
        this.updateBatchUI();
        
        if (this.batchUploadState.files.length === 0) {
            this.clearFileQueue();
        }
    }
    
    async startBatchUpload() {
        if (this.batchUploadState.files.length === 0) {
            this.showNotification('No files to upload', 'warning');
            return;
        }
        
        if (this.batchUploadState.processing) {
            this.showNotification('Upload already in progress', 'warning');
            return;
        }
        
        this.batchUploadState.processing = true;
        this.batchUploadState.paused = false;
        this.batchUploadState.cancelled = false;
        
        // Show progress panel
        document.getElementById('batchProgress').classList.remove('hidden');
        
        // Update UI
        this.updateBatchControls();
        this.updateBatchUI();
        
        this.showNotification('Starting batch upload...', 'info');
        
        // Process files
        await this.processBatchFiles();
    }
    
    async processBatchFiles() {
        const queuedFiles = this.batchUploadState.files.filter(f => f.status === 'queued');
        
        // Get selected category
        const selectedCategoryElement = document.querySelector('input[name="uploadCategory"]:checked');
        const selectedCategory = selectedCategoryElement ? selectedCategoryElement.value : 'auto';
        
        let concurrentCount = 0;
        const maxConcurrent = this.batchUploadState.maxConcurrent;
        
        for (const fileItem of queuedFiles) {
            if (this.batchUploadState.cancelled) break;
            
            while (this.batchUploadState.paused) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (concurrentCount >= maxConcurrent) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            
            concurrentCount++;
            this.processFileItem(fileItem, selectedCategory).finally(() => {
                concurrentCount--;
            });
        }
        
        // Wait for all processing to complete
        while (concurrentCount > 0 && !this.batchUploadState.cancelled) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.finalizeBatchUpload();
    }
    
    async processFileItem(fileItem, selectedCategory) {
        try {
            fileItem.status = 'processing';
            fileItem.progress = 0;
            this.updateFileItemUI(fileItem);
            this.updateBatchStatus();
            
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                if (fileItem.status === 'processing') {
                    fileItem.progress = Math.min(fileItem.progress + 10, 90);
                    this.updateFileItemUI(fileItem);
                }
            }, 200);
            
            const paperData = await this.parseFile(fileItem.file, selectedCategory);
            
            clearInterval(progressInterval);
            
            if (paperData) {
                await this.addPaper(paperData);
                fileItem.status = 'completed';
                fileItem.progress = 100;
                fileItem.result = paperData;
                this.batchUploadState.completed++;
            } else {
                throw new Error('Unable to parse file content');
            }
            
        } catch (error) {
            fileItem.status = 'failed';
            fileItem.error = error.message;
            this.batchUploadState.failed++;
        }
        
        this.updateFileItemUI(fileItem);
        this.updateBatchStatus();
        this.updateBatchProgress();
    }
    
    updateFileItemUI(fileItem) {
        const fileElement = document.getElementById(`file-${fileItem.id}`);
        if (!fileElement) return;
        
        fileElement.className = `file-item ${fileItem.status}`;
        
        const statusElement = fileElement.querySelector('.file-status');
        statusElement.innerHTML = this.getFileStatusContent(fileItem);
        statusElement.className = `file-status ${fileItem.status}`;
        
        const actionsElement = fileElement.querySelector('.file-actions');
        actionsElement.innerHTML = this.getFileActions(fileItem);
        
        // Update progress bar if processing
        if (fileItem.status === 'processing') {
            const progressFill = fileElement.querySelector('.file-progress-fill');
            if (progressFill) {
                progressFill.style.width = fileItem.progress + '%';
            }
        }
    }
    
    updateBatchProgress() {
        const totalFiles = this.batchUploadState.files.length;
        const completedFiles = this.batchUploadState.completed + this.batchUploadState.failed;
        const progressPercent = totalFiles > 0 ? (completedFiles / totalFiles) * 100 : 0;
        
        document.getElementById('overallProgressFill').style.width = progressPercent + '%';
        document.getElementById('overallProgressText').textContent = `${completedFiles} / ${totalFiles}`;
    }
    
    updateBatchStatus() {
        const queuedCount = this.batchUploadState.files.filter(f => f.status === 'queued').length;
        const processingCount = this.batchUploadState.files.filter(f => f.status === 'processing').length;
        
        document.getElementById('queuedCount').textContent = queuedCount;
        document.getElementById('processingCount').textContent = processingCount;
        document.getElementById('completedCount').textContent = this.batchUploadState.completed;
        document.getElementById('failedCount').textContent = this.batchUploadState.failed;
        
        // Update retry button state
        const retryBtn = document.getElementById('retryFailedBtn');
        retryBtn.disabled = this.batchUploadState.failed === 0;
    }
    
    updateBatchControls() {
        const startBtn = document.getElementById('startBatchBtn');
        const pauseBtn = document.getElementById('pauseBatchBtn');
        const cancelBtn = document.getElementById('cancelBatchBtn');
        
        if (this.batchUploadState.processing) {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-flex';
            cancelBtn.style.display = 'inline-flex';
            
            pauseBtn.textContent = this.batchUploadState.paused ? 'Resume' : 'Pause';
        } else {
            startBtn.style.display = 'inline-flex';
            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }
    }
    
    pauseBatchUpload() {
        if (!this.batchUploadState.processing) return;
        
        this.batchUploadState.paused = !this.batchUploadState.paused;
        this.updateBatchControls();
        
        const action = this.batchUploadState.paused ? 'paused' : 'resumed';
        this.showNotification(`Batch upload ${action}`, 'info');
    }
    
    cancelBatchUpload() {
        if (!this.batchUploadState.processing) return;
        
        if (confirm('Are you sure you want to cancel the batch upload? This will stop processing but keep completed uploads.')) {
            this.batchUploadState.cancelled = true;
            this.batchUploadState.processing = false;
            this.batchUploadState.paused = false;
            
            // Reset processing files to queued
            this.batchUploadState.files.forEach(file => {
                if (file.status === 'processing') {
                    file.status = 'queued';
                    file.progress = 0;
                }
            });
            
            this.updateBatchUI();
            this.updateBatchControls();
            
            this.showNotification('Batch upload cancelled', 'warning');
        }
    }
    
    retryFailedUploads() {
        const failedFiles = this.batchUploadState.files.filter(f => f.status === 'failed');
        
        if (failedFiles.length === 0) {
            this.showNotification('No failed uploads to retry', 'info');
            return;
        }
        
        failedFiles.forEach(file => {
            file.status = 'queued';
            file.error = null;
            file.progress = 0;
        });
        
        this.batchUploadState.failed = 0;
        this.updateBatchUI();
        
        this.showNotification(`${failedFiles.length} failed uploads reset to queue`, 'info');
    }
    
    retryFile(fileId) {
        const file = this.batchUploadState.files.find(f => f.id == fileId);
        if (!file) return;
        
        file.status = 'queued';
        file.error = null;
        file.progress = 0;
        
        if (file.status === 'failed') {
            this.batchUploadState.failed--;
        }
        
        this.updateBatchUI();
        this.showNotification(`${file.name} reset to queue`, 'info');
    }
    
    finalizeBatchUpload() {
        this.batchUploadState.processing = false;
        this.batchUploadState.paused = false;
        
        const completedCount = this.batchUploadState.completed;
        const failedCount = this.batchUploadState.failed;
        const totalCount = completedCount + failedCount;
        
        this.updateBatchControls();
        this.updateBatchUI();
        
        // Refresh the papers grid
        this.applyFilters();
        this.renderPapersGrid();
        this.updatePagination();
        
        // Show completion notification
        if (failedCount === 0) {
            this.showNotification(`🎉 Batch upload completed! ${completedCount} papers added successfully.`, 'success');
        } else {
            this.showNotification(`Batch upload completed: ${completedCount} successful, ${failedCount} failed. Use "Retry Failed" to try again.`, 'warning');
        }
    }
    
    async parseFile(file, selectedCategory = 'auto') {
        const extension = file.name.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'json':
                return await this.parseJSON(file, selectedCategory);
            case 'csv':
                return await this.parseCSV(file, selectedCategory);
            case 'pdf':
                return await this.parsePDF(file, selectedCategory);
            case 'doc':
            case 'docx':
                return await this.parseDoc(file, selectedCategory);
            default:
                throw new Error('Unsupported file format');
        }
    }
    
    async parseJSON(file, selectedCategory = 'auto') {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate required fields
        if (!data.title || !data.authors || !data.year) {
            throw new Error('JSON file missing required fields (title, authors, year)');
        }
        
        return this.normalizepaperData(data, selectedCategory);
    }
    
    async parseCSV(file, selectedCategory = 'auto') {
        const text = await file.text();
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        if (lines.length < 2) {
            throw new Error('CSV file is empty or format is incorrect');
        }
        
        const papers = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const paperData = {};
            
            headers.forEach((header, index) => {
                paperData[header] = values[index] || '';
            });
            
            if (paperData.title && paperData.authors && paperData.year) {
                papers.push(this.normalizepaperData(paperData, selectedCategory));
            }
        }
        
        if (papers.length === 0) {
            throw new Error('No valid paper data found in CSV file');
        }
        
        return papers[0]; // For simplicity, return first paper
    }
    
    async parsePDF(file, selectedCategory = 'auto') {
        try {
            // Check if GitHub storage is configured
            const useGithubStorage = githubStorage.getToken() && await githubStorage.validateToken();
            
            let pdfUrl;
            let githubFileInfo = null;
            
            if (useGithubStorage) {
                // Upload to GitHub
                this.showNotification('Uploading PDF to GitHub...', 'info');
                const uploadResult = await githubStorage.uploadPDF(file, { title: file.name });
                
                if (uploadResult.success) {
                    pdfUrl = uploadResult.url;
                    githubFileInfo = {
                        sha: uploadResult.sha,
                        filename: uploadResult.filename,
                        storedInGithub: true
                    };
                    this.showNotification('✅ PDF uploaded to GitHub successfully!', 'success');
                } else {
                    this.showNotification('❌ GitHub upload failed, using local storage', 'warning');
                    // Fallback to base64 storage
                    pdfUrl = await this.convertFileToBase64(file);
                }
            } else {
                // Use local base64 storage
                pdfUrl = await this.convertFileToBase64(file);
            }
            
            // Initialize PDF.js
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                
                // Generate thumbnail from first page - always generate regardless of storage type
                const thumbnail = await this.generatePDFThumbnail(pdf);
                console.log('Generated thumbnail for PDF:', thumbnail ? 'success' : 'failed');
                
                let fullText = '';
                const maxPages = Math.min(pdf.numPages, 3); // Only parse first 3 pages
                
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                // Extract paper information using NLP patterns
                const extractedInfo = this.extractPaperInfo(fullText);
                const fileName = file.name.replace('.pdf', '');
                
                // Determine research area based on selection
                let researchArea;
                if (selectedCategory === 'auto') {
                    researchArea = this.classifyResearchArea(extractedInfo.title + ' ' + fullText.substring(0, 500));
                } else {
                    researchArea = selectedCategory;
                }
                
                return {
                    title: extractedInfo.title || fileName,
                    authors: extractedInfo.authors || ['Unknown Author'],
                    year: extractedInfo.year || new Date().getFullYear(),
                    journal: extractedInfo.journal || 'Unknown Journal',
                    researchArea: researchArea,
                    methodology: 'Experimental',
                    studyType: 'Empirical',
                    keywords: extractedInfo.keywords || [],
                    citations: 0,
                    hIndex: 0,
                    downloads: 0,
                    abstract: extractedInfo.abstract || fullText.substring(0, 300) + '...',
                    doi: extractedInfo.doi || '',
                    pdfUrl: pdfUrl, // Now can be GitHub URL or base64
                    websiteUrl: '#',
                    thumbnail: thumbnail, // Always save thumbnail
                    originalThumbnail: thumbnail, // Keep original for reset function
                    pdfFileSize: file.size,
                    isPersistentPDF: true,
                    githubFileInfo: githubFileInfo // Store GitHub metadata
                };
            } else {
                // Fallback to basic parsing
                const fileName = file.name.replace('.pdf', '');
                const researchArea = selectedCategory === 'auto' ? 'General' : selectedCategory;
                
                return {
                    title: fileName,
                    authors: ['Unknown Author'],
                    year: new Date().getFullYear(),
                    journal: 'Unknown Journal',
                    researchArea: researchArea,
                    methodology: 'Experimental',
                    studyType: 'Empirical',
                    keywords: [],
                    citations: 0,
                    hIndex: 0,
                    downloads: 0,
                    abstract: `Paper parsed from PDF file "${file.name}", please manually edit relevant information.`,
                    doi: '',
                    pdfUrl: pdfUrl, // Now can be GitHub URL or base64
                    websiteUrl: '#',
                    thumbnail: null,
                    pdfFileSize: file.size,
                    isPersistentPDF: true,
                    githubFileInfo: githubFileInfo // Store GitHub metadata
                };
            }
        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error('PDF parsing failed: ' + error.message);
        }
    }
    
    // Convert file to base64 for persistent storage
    async convertFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });
    }
    
    async generatePDFThumbnail(pdf) {
        try {
            const page = await pdf.getPage(1); // Get first page
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Render PDF page to canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Convert canvas to data URL
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (error) {
            console.error('Thumbnail generation error:', error);
            return null;
        }
    }
    
    extractPaperInfo(text) {
        const info = {
            title: null,
            authors: [],
            year: null,
            journal: null,
            abstract: null,
            keywords: [],
            doi: null
        };
        
        // Extract title (usually in the first few lines, often in caps or bold)
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
            // Look for title in first 5 lines
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                const line = lines[i].trim();
                if (line.length > 20 && line.length < 200 && !line.includes('@') && !line.includes('Abstract')) {
                    info.title = line;
                    break;
                }
            }
        }
        
        // Extract DOI
        const doiMatch = text.match(/(?:DOI|doi)[\s:]*(\d{2}\.\d{4}\/[^\s]+)/i);
        if (doiMatch) {
            info.doi = doiMatch[1];
        }
        
        // Extract year
        const yearMatch = text.match(/\b(19|20)\d{2}\b/g);
        if (yearMatch) {
            const years = yearMatch.map(y => parseInt(y)).filter(y => y >= 1990 && y <= new Date().getFullYear());
            if (years.length > 0) {
                info.year = Math.max(...years); // Use the most recent year found
            }
        }
        
        // Extract abstract
        const abstractMatch = text.match(/abstract[\s\n]*(.{100,1000}?)(?:\n\n|keywords|introduction)/i);
        if (abstractMatch) {
            info.abstract = abstractMatch[1].trim();
        }
        
        // Extract keywords
        const keywordsMatch = text.match(/keywords?[\s:\-]*(.{10,200}?)(?:\n\n|\d+\.|introduction)/i);
        if (keywordsMatch) {
            info.keywords = keywordsMatch[1].split(/[,;]/).map(k => k.trim()).filter(k => k.length > 1).slice(0, 8);
        }
        
        // Extract authors (look for patterns like "Name, Name and Name" or "Name et al.")
        const authorPatterns = [
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)*)\s+(?:and|&)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)/,
            /([A-Z][a-z]+(?:\s+[A-Z]\.)*\s+[A-Z][a-z]+)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z]\.)*\s+[A-Z][a-z]+))*\s+et\s+al\./
        ];
        
        for (const pattern of authorPatterns) {
            const match = text.match(pattern);
            if (match) {
                info.authors = match[0].split(/\s+and\s+|,\s*/).map(a => a.trim()).filter(a => a && a !== 'et' && a !== 'al.');
                break;
            }
        }
        
        // Extract journal/venue information
        const venuePatterns = [
            /(?:In\s+)?Proceedings\s+of\s+(.{5,50}?)(?:\s*,|\s*\d{4}|\n)/i,
            /(?:Published\s+in\s+)?([A-Z][a-zA-Z\s&]+(?:Journal|Conference|Workshop|Symposium))/,
            /([A-Z][a-zA-Z\s]+)\s+(?:Journal|Conference)\s+(?:on|of)/
        ];
        
        for (const pattern of venuePatterns) {
            const match = text.match(pattern);
            if (match) {
                info.journal = match[1].trim();
                break;
            }
        }
        
        return info;
    }
    
    classifyResearchArea(text) {
        const classifications = {
            'Accessible Interaction': [
                'accessibility', 'impairment', 'disability', 'visually impaired', 
                'motor impairment', 'blind', 'deaf', 'assistive', 'accessible',
                'touchscreen', 'motor disabilities', 'visual disabilities'
            ],
            'HCI New Wearable Devices': [
                'wearable', 'earput', 'behind-the-ear', 'ear-based', 'clothing buttons',
                'wearable device', 'smart watch', 'fitness tracker', 'augmented reality glasses',
                'ear-worn', 'button', 'clothing'
            ],
            'Immersive Interaction': [
                'mixed reality', 'virtual reality', 'immersive', 'vr', 'mr',
                'digital shapes', 'virtual environment', 'desktop virtual reality',
                'presentation', 'boundary', 'immersion', 'virtual world'
            ],
            'Mobile Device': [
                'mobile', 'smartphone', 'finger', 'gesture', 'touch interaction',
                'one-handed', 'touchscreen', 'mobile input', 'finger-grained',
                'smart devices', 'touch', 'mobile device'
            ],
            'Special Scenarios': [
                'conductor', 'musical', 'string instruments', 'performance',
                'sleight of hand', 'finger motion', 'expressiveness', 'visualization',
                'musical interface', 'gesture elicitation', 'interface morphologies'
            ]
        };
        
        const textLower = text.toLowerCase();
        
        for (const [area, keywords] of Object.entries(classifications)) {
            for (const keyword of keywords) {
                if (textLower.includes(keyword)) {
                    return area;
                }
            }
        }
        
        return 'General';
    }
    
    async parseDoc(file, selectedCategory = 'auto') {
        // Basic DOC parsing - similar to PDF
        const fileName = file.name.replace(/\.(doc|docx)$/, '');
        const researchArea = selectedCategory === 'auto' ? 'General' : selectedCategory;
        
        return {
            title: fileName,
            authors: ['Unknown Author'],
            year: new Date().getFullYear(),
            journal: 'Unknown Journal',
            researchArea: researchArea,
            methodology: 'Experimental',
            studyType: 'Empirical',
            keywords: [],
            citations: 0,
            hIndex: 0,
            downloads: 0,
            abstract: `Paper parsed from DOC file "${file.name}", please manually edit relevant information.`,
            doi: '',
            pdfUrl: '#',
            websiteUrl: '#'
        };
    }
    
    normalizepaperData(data, selectedCategory = 'auto') {
        // Determine research area based on selection
        let researchArea;
        if (selectedCategory === 'auto') {
            researchArea = data.researchArea || data['Research Field'] || 'General';
        } else {
            researchArea = selectedCategory;
        }
        
        return {
            id: this.papers.length + 1,
            title: data.title || data['Title'] || 'Untitled',
            authors: Array.isArray(data.authors) ? data.authors : 
                     (data.authors || data['Authors'] || 'Unknown').split(/[,;]/).map(a => a.trim()),
            year: parseInt(data.year || data['Year'] || new Date().getFullYear()),
            journal: data.journal || data['Journal'] || data.venue || 'Unknown Journal',
            researchArea: researchArea,
            methodology: data.methodology || data['Method'] || 'Experimental',
            studyType: data.studyType || data['Type'] || 'Empirical',
            keywords: Array.isArray(data.keywords) ? data.keywords :
                      (data.keywords || data['Keywords'] || '').split(/[,;]/).map(k => k.trim()).filter(k => k),
            citations: parseInt(data.citations || data['Citations'] || 0),
            hIndex: parseInt(data.hIndex || data['H-Index'] || 0),
            downloads: parseInt(data.downloads || data['Downloads'] || 0),
            abstract: data.abstract || data['Abstract'] || '',
            doi: data.doi || data['DOI'] || '',
            pdfUrl: data.pdfUrl || data['PDF Link'] || '#',
            websiteUrl: data.websiteUrl || data['Website Link'] || '#'
        };
    }
    
    async handleManualEntry() {
        const formData = new FormData(document.getElementById('manualEntryForm'));
        const paperData = {
            id: this.papers.length + 1,
            title: document.getElementById('titleInput').value,
            authors: document.getElementById('authorsInput').value.split(',').map(a => a.trim()),
            year: parseInt(document.getElementById('yearInput').value),
            journal: document.getElementById('journalInput').value,
            researchArea: document.getElementById('researchAreaInput').value,
            methodology: document.getElementById('methodologyInput').value,
            studyType: document.getElementById('studyTypeInput').value,
            keywords: document.getElementById('keywordsInput').value.split(',').map(k => k.trim()).filter(k => k),
            citations: parseInt(document.getElementById('citationsInput').value) || 0,
            hIndex: Math.floor((parseInt(document.getElementById('citationsInput').value) || 0) / 3),
            downloads: parseInt(document.getElementById('downloadsInput').value) || 0,
            abstract: document.getElementById('abstractInput').value,
            doi: document.getElementById('doiInput').value,
            pdfUrl: '#',
            websiteUrl: '#',
            thumbnail: null // Manual entries don't have thumbnails
        };
        
        await this.addPaper(paperData);
        this.hideUploadModal();
        this.showNotification('Paper added successfully!', 'success');
    }
    
    async addPaper(paperData) {
        console.log('addPaper called with:', paperData);
        
        // Ensure unique ID
        const maxId = this.papers.length > 0 ? Math.max(...this.papers.map(p => p.id)) : 0;
        paperData.id = maxId + 1;
        
        console.log('Assigned ID:', paperData.id);
        console.log('Current papers count before adding:', this.papers.length);
        
        this.papers.push(paperData);
        console.log('Papers count after adding:', this.papers.length);
        console.log('Added paper:', paperData);
        
        // 明确保存到Supabase
        await this.saveData(); 
        console.log('Data saved to storage');
        
        // 强制同步到Supabase（确保保存成功）
        if (this.storageMode === 'supabase') {
            console.log('🔄 Force syncing to Supabase...');
            const result = await window.supabaseStorage.savePapers(this.papers, this.userId);
            if (result.success) {
                console.log(`✅ Force sync successful: ${result.count} papers`);
            } else {
                console.error('❌ Force sync failed:', result.error);
            }
        }
        
        // Auto-sync to GitHub if configured
        await this.autoSyncToGitHub();
        
        this.applyFilters();
        console.log('Filters applied');
        
        this.initializeFilters();
        console.log('Filters reinitialized');
        
        // Jump to first page and show the new paper
        this.currentPage = 1;
        this.renderPapersGrid();
        this.updatePagination();
        console.log('Grid rendered and pagination updated');
        
        console.log('Added new paper:', paperData.title);
    }
    
    showUploadResults(results) {
        console.log('showUploadResults called with:', results);
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;
        
        console.log(`Upload summary: ${successCount}/${totalCount} successful`);
        
        if (successCount === totalCount && successCount > 0) {
            this.showNotification(`Successfully uploaded ${successCount} papers! Saved locally`, 'success');
            setTimeout(() => {
                console.log('Hiding upload modal and refreshing view...');
                this.hideUploadModal();
                // Reset filters and go to first page to show new papers
                this.resetFilters();
                this.currentPage = 1;
                this.renderPapersGrid();
                this.updatePagination();
                console.log('View refreshed after successful upload');
            }, 1500);
        } else {
            this.showNotification(`Upload completed: ${successCount}/${totalCount} successful`, 'warning');
            // Still refresh view even if some uploads failed
            setTimeout(() => {
                console.log('Refreshing view after partial upload success...');
                this.resetFilters();
                this.currentPage = 1;
                this.renderPapersGrid();
                this.updatePagination();
                console.log('View refreshed after partial upload');
            }, 1000);
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add styles if not already present
        if (!document.querySelector('.notification-styles')) {
            const style = document.createElement('style');
            style.className = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-base);
                    padding: var(--space-12) var(--space-16);
                    box-shadow: var(--shadow-lg);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    gap: var(--space-12);
                    min-width: 300px;
                    animation: slideInRight 0.3s ease;
                }
                
                .notification--success {
                    border-left: 4px solid var(--color-success);
                }
                
                .notification--error {
                    border-left: 4px solid var(--color-error);
                }
                
                .notification--warning {
                    border-left: 4px solid var(--color-warning);
                }
                
                .notification--info {
                    border-left: 4px solid var(--color-info);
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    font-size: var(--font-size-lg);
                    cursor: pointer;
                    color: var(--color-text-secondary);
                }
                
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    // Image Manager Methods
    showImageManager(paperId) {
        this.currentEditingPaper = this.papers.find(p => p.id === paperId);
        if (!this.currentEditingPaper) return;
        
        document.getElementById('imageManagerModal').classList.remove('hidden');
        this.updateCurrentImageDisplay();
    }
    
    hideImageManager() {
        document.getElementById('imageManagerModal').classList.add('hidden');
        this.currentEditingPaper = null;
        document.getElementById('imageFileInput').value = '';
    }
    
    updateCurrentImageDisplay() {
        const container = document.getElementById('currentImageContainer');
        
        if (this.currentEditingPaper.thumbnail) {
            container.innerHTML = `<img src="${this.currentEditingPaper.thumbnail}" alt="Current Image" class="current-image-preview" />`;
        } else {
            container.innerHTML = `
                <div class="current-image-placeholder">
                    <span>${this.getPaperIcon(this.currentEditingPaper.researchArea)}</span>
                </div>
            `;
        }
    }
    
    async handleImageUpload(file) {
        if (!file || !this.currentEditingPaper) return;
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select a valid image file!', 'error');
            return;
        }
        
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showNotification('Image file too large, please select an image smaller than 5MB!', 'error');
            return;
        }
        
        try {
            // Convert image to base64
            const imageDataUrl = await this.convertImageToDataUrl(file);
            
            // Update paper thumbnail
            this.currentEditingPaper.thumbnail = imageDataUrl;
            this.updateCurrentImageDisplay();
            this.renderPapersGrid();
            await this.saveData(); // Save changes to localStorage
            
            this.showNotification('Image replaced successfully!', 'success');
        } catch (error) {
            this.showNotification('Image processing failed: ' + error.message, 'error');
        }
    }
    
    convertImageToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Create image to resize if needed
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Calculate dimensions to maintain aspect ratio
                    const maxWidth = 400;
                    const maxHeight = 300;
                    let { width, height } = img;
                    
                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width *= ratio;
                        height *= ratio;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Draw and compress image
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });
    }
    
    async resetPaperImage() {
        if (!this.currentEditingPaper) return;
        
        // Reset to original thumbnail or remove custom image
        if (this.currentEditingPaper.originalThumbnail) {
            this.currentEditingPaper.thumbnail = this.currentEditingPaper.originalThumbnail;
        } else {
            this.currentEditingPaper.thumbnail = null;
        }
        
        this.updateCurrentImageDisplay();
        this.renderPapersGrid();
        await this.saveData(); // Save changes to localStorage
        this.showNotification('Reset to default image!', 'success');
    }
    
    async removePaperImage() {
        if (!this.currentEditingPaper) return;
        
        this.currentEditingPaper.thumbnail = null;
        this.updateCurrentImageDisplay();
        this.renderPapersGrid();
        await this.saveData(); // Save changes to localStorage
        this.showNotification('Image removed!', 'success');
    }
    
    // PDF Viewer functionality
    showPdfViewerAndCloseModal(pdfUrl, title = 'PDF Document') {
        // First close the paper details modal
        this.hidePaperModal();
        
        // Then show the PDF viewer
        setTimeout(() => {
            this.showPdfViewer(pdfUrl, title);
        }, 150); // Small delay to allow modal close animation
    }
    
    showPdfViewer(pdfUrl, title = 'PDF Document') {
        if (!pdfUrl || pdfUrl === '#') {
            this.showNotification('PDF document unavailable', 'error');
            return;
        }
        
        // Store PDF data for the viewer
        this.currentPdfUrl = pdfUrl;
        this.currentPdfTitle = title;
        this.currentPdfDoc = null;
        this.currentPdfPage = 1;
        this.currentPdfZoom = 1.0;
        
        // Show modal and set title
        document.getElementById('pdfViewerModal').classList.remove('hidden');
        document.getElementById('pdfViewerTitle').textContent = title;
        
        // Show loading state
        this.showPdfLoadingState();
        
        // Load PDF
        this.loadPdfDocument(pdfUrl);
    }
    
    async loadPdfDocument(pdfUrl) {
        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library not loaded');
            }
            
            // Set worker - using a more reliable CDN
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }
            
            console.log('Loading PDF from:', pdfUrl.substring(0, 50) + '...');
            
            // Convert base64 to array buffer if needed
            let pdfData;
            if (pdfUrl.startsWith('data:')) {
                console.log('Converting base64 PDF data...');
                const base64 = pdfUrl.split(',')[1];
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                pdfData = bytes;
                console.log('PDF data converted, size:', bytes.length);
            } else {
                // For GitHub URLs and other URL types, fetch with proper headers
                console.log('Fetching PDF from URL...');
                
                // Special handling for jsDelivr CDN URLs
                let fetchUrl = pdfUrl;
                let fetchOptions = {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/pdf',
                        'Cache-Control': 'no-cache'
                    }
                };
                
                // Try multiple URL strategies for GitHub-hosted PDFs
                const urlStrategies = [];
                
                if (pdfUrl.includes('cdn.jsdelivr.net')) {
                    // Primary: 直接使用jsDelivr，添加CORS支持
                    urlStrategies.push({
                        url: pdfUrl + '?raw=true',
                        name: 'jsDelivr with raw parameter',
                        options: { ...fetchOptions, mode: 'cors' }
                    });
                    
                    // Backup: Raw GitHub URL with no-cors mode
                    const rawUrl = pdfUrl.replace('https://cdn.jsdelivr.net/gh/', 'https://raw.githubusercontent.com/').replace('@main/', '/main/');
                    urlStrategies.push({
                        url: rawUrl,
                        name: 'Raw GitHub (no-cors)',
                        options: { ...fetchOptions, mode: 'no-cors' }
                    });
                    
                } else {
                    // For non-jsDelivr URLs, try as-is with different modes
                    urlStrategies.push({
                        url: pdfUrl,
                        name: 'Direct URL (cors)',
                        options: { ...fetchOptions, mode: 'cors' }
                    });
                    
                    urlStrategies.push({
                        url: pdfUrl,
                        name: 'Direct URL (no-cors)',
                        options: { ...fetchOptions, mode: 'no-cors' }
                    });
                }
                
                let pdfData = null;
                let successStrategy = null;
                
                for (const strategy of urlStrategies) {
                    try {
                        console.log(`Trying ${strategy.name}: ${strategy.url.substring(0, 80)}...`);
                        
                        const response = await fetch(strategy.url, strategy.options);
                        
                        if (response.ok) {
                            if (strategy.isApi) {
                                // GitHub API returns base64 content
                                const apiData = await response.json();
                                const base64Content = apiData.content.replace(/\s/g, '');
                                const binaryString = atob(base64Content);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                pdfData = bytes.buffer;
                            } else {
                                pdfData = await response.arrayBuffer();
                            }
                            
                            console.log(`✅ Success with ${strategy.name}, PDF size: ${pdfData.byteLength} bytes`);
                            successStrategy = strategy;
                            break;
                        } else {
                            console.log(`❌ ${strategy.name} failed: ${response.status} ${response.statusText}`);
                        }
                    } catch (error) {
                        console.log(`❌ ${strategy.name} error:`, error.message);
                    }
                }
                
                if (!pdfData) {
                    throw new Error('All URL strategies failed. PDF may be unavailable or access restricted.');
                }
            }
            
            // Load PDF document
            console.log('Loading PDF document...');
            this.currentPdfDoc = await pdfjsLib.getDocument({ 
                data: pdfData,
                // Add additional options for better compatibility
                verbosity: 0, // Reduce console spam
                isEvalSupported: false,
                useSystemFonts: true
            }).promise;
            
            console.log(`PDF loaded successfully, ${this.currentPdfDoc.numPages} pages`);
            
            // Render all pages
            await this.renderAllPdfPages();
            
            // Hide loading state
            this.hidePdfLoadingState();
            
        } catch (error) {
            console.error('PDF loading error:', error);
            this.showPdfError('Unable to load PDF document: ' + error.message);
        }
    }
    
    async renderAllPdfPages() {
        if (!this.currentPdfDoc) return;
        
        const container = document.getElementById('pdfPagesContainer');
        container.innerHTML = ''; // Clear existing pages
        
        const numPages = this.currentPdfDoc.numPages;
        console.log(`Rendering ${numPages} pages`);
        
        for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
            try {
                const page = await this.currentPdfDoc.getPage(pageNumber);
                
                // Create canvas for this page
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page-canvas';
                canvas.setAttribute('data-page', pageNumber);
                
                const context = canvas.getContext('2d');
                
                // Get actual container dimensions
                const scrollContainer = document.querySelector('.pdf-scroll-container');
                let containerWidth = 800; // Default width
                
                if (scrollContainer && scrollContainer.clientWidth > 0) {
                    containerWidth = scrollContainer.clientWidth - 40;
                } else {
                    // Fallback: use viewport width
                    containerWidth = Math.min(800, window.innerWidth - 100);
                }
                
                console.log(`Container width: ${containerWidth}`);
                
                const viewport = page.getViewport({ scale: 1.0 });
                const scale = Math.min(containerWidth / viewport.width, 2.0); // Max scale 2.0
                
                console.log(`Page ${pageNumber}: viewport ${viewport.width}x${viewport.height}, scale: ${scale}`);
                
                const scaledViewport = page.getViewport({ scale });
                
                // Set canvas dimensions
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                
                console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`);
                
                // Render page
                const renderContext = {
                    canvasContext: context,
                    viewport: scaledViewport
                };
                
                await page.render(renderContext).promise;
                console.log(`Page ${pageNumber} rendered successfully`);
                
                // Create page wrapper
                const pageWrapper = document.createElement('div');
                pageWrapper.className = 'pdf-page-wrapper';
                pageWrapper.appendChild(canvas);
                
                // Add page number label (optional - can be removed if not needed)
                const pageLabel = document.createElement('div');
                pageLabel.className = 'pdf-page-label';
                pageLabel.textContent = `Page ${pageNumber}`;
                pageWrapper.appendChild(pageLabel);
                
                container.appendChild(pageWrapper);
                
            } catch (error) {
                console.error(`Error rendering page ${pageNumber}:`, error);
                
                // Add error placeholder
                const errorDiv = document.createElement('div');
                errorDiv.className = 'pdf-page-error';
                errorDiv.innerHTML = `<p>Failed to load page ${pageNumber}</p>`;
                container.appendChild(errorDiv);
            }
        }
        
        console.log(`Finished rendering all ${numPages} pages`);
    }
    
    showPdfLoadingState() {
        document.getElementById('pdfLoading').classList.remove('hidden');
        document.getElementById('pdfScrollContainer').classList.add('hidden');
        document.getElementById('pdfError').classList.add('hidden');
    }
    
    hidePdfLoadingState() {
        document.getElementById('pdfLoading').classList.add('hidden');
        document.getElementById('pdfScrollContainer').classList.remove('hidden');
        document.getElementById('pdfError').classList.add('hidden');
    }
    
    showPdfError(message) {
        document.getElementById('pdfLoading').classList.add('hidden');
        document.getElementById('pdfScrollContainer').classList.add('hidden');
        document.getElementById('pdfError').classList.remove('hidden');
        document.getElementById('pdfError').querySelector('p').textContent = message;
    }
    
    closePdfViewer() {
        document.getElementById('pdfViewerModal').classList.add('hidden');
        this.currentPdfDoc = null;
        this.currentPdfUrl = null;
        this.currentPdfTitle = null;
    }
    
    pdfDownload() {
        if (!this.currentPdfUrl) return;
        
        const link = document.createElement('a');
        link.href = this.currentPdfUrl;
        link.download = (this.currentPdfTitle || 'document') + '.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // GitHub Settings Methods
    showGithubSettingsModal() {
        // Load current token if exists
        const currentToken = githubStorage.getToken();
        if (currentToken) {
            document.getElementById('githubTokenInput').value = currentToken;
        }
        
        // Update status
        this.updateGithubStatus();
        
        document.getElementById('githubSettingsModal').classList.remove('hidden');
    }

    hideGithubSettingsModal() {
        document.getElementById('githubSettingsModal').classList.add('hidden');
    }

    async testGithubConnection() {
        const tokenInput = document.getElementById('githubTokenInput');
        const token = tokenInput.value.trim();
        
        if (!token) {
            this.showNotification('Please enter a GitHub token', 'error');
            return;
        }
        
        // Temporarily set token for testing
        githubStorage.setToken(token);
        
        try {
            this.showNotification('Testing connection...', 'info');
            const isValid = await githubStorage.validateToken();
            
            if (isValid) {
                this.showNotification('✅ Connection successful!', 'success');
                document.getElementById('githubStatus').textContent = 'Connected';
                document.getElementById('githubStatus').style.color = '#16a34a';
            } else {
                this.showNotification('❌ Connection failed. Please check your token.', 'error');
                document.getElementById('githubStatus').textContent = 'Connection failed';
                document.getElementById('githubStatus').style.color = '#dc2626';
            }
        } catch (error) {
            this.showNotification('❌ Connection error: ' + error.message, 'error');
            document.getElementById('githubStatus').textContent = 'Error';
            document.getElementById('githubStatus').style.color = '#dc2626';
        }
    }

    async saveGithubSettings() {
        const tokenInput = document.getElementById('githubTokenInput');
        const token = tokenInput.value.trim();
        
        if (!token) {
            this.showNotification('Please enter a GitHub token', 'error');
            return;
        }
        
        // Test connection first
        githubStorage.setToken(token);
        const isValid = await githubStorage.validateToken();
        
        if (isValid) {
            // Save token
            githubStorage.setToken(token);
            this.showNotification('✅ GitHub storage configured successfully!', 'success');
            this.updateGithubStatus();
            this.hideGithubSettingsModal();
        } else {
            this.showNotification('❌ Invalid token. Please check and try again.', 'error');
        }
    }

    async updateGithubStatus() {
        const statusElement = document.getElementById('githubStatus');
        const token = githubStorage.getToken();
        
        if (!token) {
            statusElement.textContent = 'Not configured';
            statusElement.style.color = '#6b7280';
            return;
        }
        
        try {
            const isValid = await githubStorage.validateToken();
            if (isValid) {
                statusElement.textContent = 'Connected';
                statusElement.style.color = '#16a34a';
            } else {
                statusElement.textContent = 'Token invalid';
                statusElement.style.color = '#dc2626';
            }
        } catch (error) {
            statusElement.textContent = 'Connection error';
            statusElement.style.color = '#dc2626';
        }
    }

    // Auto-sync papers to GitHub if configured
    async autoSyncToGitHub() {
        try {
            const token = githubStorage.getToken();
            if (!token) {
                return; // No GitHub configured, skip sync
            }

            const isValid = await githubStorage.validateToken();
            if (!isValid) {
                return; // Invalid token, skip sync
            }

            console.log('Auto-syncing papers to GitHub...');
            const result = await githubStorage.uploadPapersMetadata(this.papers);
            
            if (result.success) {
                console.log('✅ Papers synced to GitHub successfully');
                setTimeout(() => {
                    this.showNotification('📤 Papers synced to GitHub for sharing', 'success');
                }, 1000);
            } else {
                console.warn('⚠️ GitHub sync failed:', result.error);
            }
        } catch (error) {
            console.warn('⚠️ Auto-sync error:', error.message);
        }
    }

    // Manual sync button for GitHub settings
    async syncToGitHub() {
        try {
            const token = githubStorage.getToken();
            if (!token) {
                this.showNotification('Please configure GitHub storage first', 'error');
                return;
            }

            this.showNotification('Syncing papers to GitHub...', 'info');
            const result = await githubStorage.uploadPapersMetadata(this.papers);
            
            if (result.success) {
                this.showNotification(`✅ ${result.message}`, 'success');
            } else {
                this.showNotification(`❌ Sync failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`❌ Sync error: ${error.message}`, 'error');
        }
    }

    // Delete a single paper
    async deletePaper(paperId) {
        const paper = this.papers.find(p => p.id === paperId);
        if (!paper) {
            this.showNotification('Paper not found', 'error');
            return;
        }

        // Confirm deletion
        const confirmMessage = `Are you sure you want to delete "${paper.title}"?\n\nThis action will permanently remove the paper from:\n• Local storage\n• Shared database on GitHub\n• PDF files on GitHub\n\nThis action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.showNotification('Deleting paper...', 'info');
            
            // 1. Remove from papers array
            this.papers = this.papers.filter(p => p.id !== paperId);
            
            // 2. Remove from IndexedDB individually
            if (this.storage) {
                try {
                    await this.storage.deletePaper(paperId);
                    console.log('Deleted from IndexedDB');
                } catch (error) {
                    console.warn('Failed to delete from IndexedDB:', error);
                }
            }
            
            // 3. Delete PDF file from GitHub if it exists
            if (paper.githubFileInfo && githubStorage.getToken()) {
                try {
                    const deleteResult = await githubStorage.deletePDF(paper.githubFileInfo.filename, paper.githubFileInfo.sha);
                    if (deleteResult) {
                        console.log('PDF file deleted from GitHub');
                    } else {
                        console.warn('Failed to delete PDF file from GitHub');
                    }
                } catch (error) {
                    console.warn('Error deleting PDF from GitHub:', error);
                }
            }
            
            // 4. Save updated data to local storage
            await this.saveData();
            
            // 5. Update shared database on GitHub (this removes the paper from shared database)
            if (githubStorage.getToken()) {
                try {
                    const syncResult = await githubStorage.uploadPapersMetadata(this.papers);
                    if (syncResult.success) {
                        console.log('Shared database updated - paper removed');
                    } else {
                        console.warn('Failed to update shared database:', syncResult.error);
                    }
                } catch (error) {
                    console.warn('Error updating shared database:', error);
                }
            }
            
            // 6. Update UI
            this.applyFilters();
            this.initializeFilters();
            this.renderPapersGrid();
            this.updatePagination();
            
            // Close modal
            this.hidePaperModal();
            
            this.showNotification('✅ Paper completely deleted from all locations', 'success');
        } catch (error) {
            console.error('Error deleting paper:', error);
            this.showNotification('❌ Failed to delete paper: ' + error.message, 'error');
        }
    }

    // Delete all papers
    async deleteAllPapers() {
        if (this.papers.length === 0) {
            this.showNotification('No papers to delete', 'info');
            return;
        }

        // Confirm deletion
        const confirmMessage = `Are you sure you want to delete ALL ${this.papers.length} papers?\n\nThis action will permanently remove ALL papers from:\n• Cloud storage (Supabase)\n• Local storage\n• Any shared links\n\nThis action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        // Double confirmation for destructive action
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
        const modal = document.getElementById('shareLinkModal');
        const urlInput = document.getElementById('shareUrlInput');
        const statsCount = document.getElementById('shareStatsCount');
        const statsDate = document.getElementById('shareStatsDate');
        const shareStats = document.getElementById('shareStats');
        
        // 确保所有元素都存在
        if (!modal || !urlInput || !statsCount || !statsDate || !shareStats) {
            console.error('Share link modal elements not found');
            this.showNotification('Share link interface not available', 'error');
            return;
        }
        
        // 设置分享链接内容
        urlInput.value = shareUrl;
        statsCount.textContent = this.papers.length;
        statsDate.textContent = new Date().toLocaleDateString();
        shareStats.style.display = 'block';
        
        // 显示模态框
        modal.classList.remove('hidden');
        
        // 确保模态框在最前面
        modal.style.zIndex = '10000';
        
        console.log('Share link modal opened with URL:', shareUrl);
    }

    // 设置分享链接事件监听器
    setupShareLinkEvents() {
        // 确保元素存在后再添加事件监听器
        const closeBtn = document.getElementById('closeShareLink');
        const copyBtn = document.getElementById('copyShareUrl');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('shareLinkModal').classList.add('hidden');
            });
        }
        
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const shareUrl = document.getElementById('shareUrlInput')?.value;
                if (!shareUrl) {
                    this.showNotification('No share URL to copy', 'warning');
                    return;
                }
                
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    this.showNotification('Share link copied to clipboard!', 'success');
                } catch (error) {
                    // 降级复制方法
                    const urlInput = document.getElementById('shareUrlInput');
                    if (urlInput) {
                        urlInput.select();
                        document.execCommand('copy');
                        this.showNotification('Share link copied!', 'success');
                    }
                }
            });
        }
        
        // 模态框背景点击关闭
        const modal = document.getElementById('shareLinkModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'shareLinkModal') {
                    modal.classList.add('hidden');
                }
            });
        }
    }

    // 处理分享链接访问
    async handleShareLinkAccess() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareParam = urlParams.get('share');
        const shareIdFromParam = urlParams.get('share_id');
        
        // 从路径中提取shareId (支持 /share/shareId 格式)
        const pathSegments = window.location.pathname.split('/');
        const shareIdFromPath = pathSegments[1] === 'share' ? pathSegments[2] : null;
        
        // 优先使用路径中的shareId，然后是URL参数
        const shareId = shareIdFromPath || shareIdFromParam;
        
        console.log('🔗 Share link detection:');
        console.log('- Current URL:', window.location.href);
        console.log('- Path segments:', pathSegments);
        console.log('- Share ID from path:', shareIdFromPath);
        console.log('- Share ID from param:', shareIdFromParam);
        console.log('- Final share ID:', shareId);
        console.log('- Share param (old format):', shareParam);
        
        if (shareId) {
            console.log('📋 Loading shared papers with ID:', shareId);
            // Supabase分享链接
            await this.loadSharedPapers(shareId);
        } else if (shareParam) {
            console.log('📋 Loading shared papers from URL param:', shareParam);
            // URL参数分享链接 (旧格式: ?share=xxx)
            await this.loadSharedPapersFromUrl(shareParam);
        } else {
            console.log('⚠️ No share parameter found in URL');
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
                
                // 确保UI正确更新
                this.updateStatistics();
                this.initializeFilters();
                this.applyFilters();
                this.renderPapersGrid();
                this.updatePagination();
                
                this.showNotification(`Loaded ${this.papers.length} shared papers`, 'success');
                
                // 显示分享信息
                setTimeout(() => {
                    this.showNotification(`📋 Viewing shared collection (${result.shareData.access_count} views)`, 'info');
                }, 2000);
                
                console.log('✅ Successfully loaded shared papers:', this.papers.length);
            } else {
                this.showNotification('Share link not found or expired', 'error');
                console.error('❌ Failed to load shared papers:', result.error);
            }
        } catch (error) {
            console.error('❌ Error loading shared papers:', error);
            this.showNotification('Failed to load shared papers: ' + error.message, 'error');
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

    // Debug storage method
    async debugStorage() {
        console.log('🔍 === DEBUG STORAGE STATUS ===');
        
        let debugInfo = '🔍 Storage Debug Info:\n\n';
        
        // Check current papers in memory
        debugInfo += `📝 Current papers in memory: ${this.papers.length}\n`;
        
        // Check localStorage
        const localStorage_data = localStorage.getItem('literaturePapers');
        if (localStorage_data) {
            try {
                const parsed = JSON.parse(localStorage_data);
                debugInfo += `💾 localStorage: ${Array.isArray(parsed) ? parsed.length : 'invalid'} papers\n`;
            } catch (error) {
                debugInfo += `💾 localStorage: corrupted data\n`;
            }
        } else {
            debugInfo += `💾 localStorage: empty\n`;
        }
        
        // Check IndexedDB
        if (this.storage) {
            try {
                const papers = await this.storage.getAllPapers();
                debugInfo += `📱 IndexedDB: ${papers ? papers.length : 'null'} papers\n`;
            } catch (error) {
                debugInfo += `📱 IndexedDB: error - ${error.message}\n`;
            }
        } else {
            debugInfo += `📱 IndexedDB: not available\n`;
        }
        
        // Check GitHub token
        const token = githubStorage.getToken();
        debugInfo += `🌐 GitHub token: ${token ? 'configured' : 'not configured'}\n`;
        
        if (token) {
            try {
                const isValid = await githubStorage.validateToken();
                debugInfo += `🌐 GitHub connection: ${isValid ? 'valid' : 'invalid'}\n`;
            } catch (error) {
                debugInfo += `🌐 GitHub connection: error\n`;
            }
        }
        
        console.log(debugInfo);
        alert(debugInfo);
        
        // Also log paper IDs for debugging
        if (this.papers.length > 0) {
            console.log('Paper IDs:', this.papers.map(p => p.id));
        }
    }
}

// Initialize the application
let literatureManager;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application directly without authentication
    initializeLiteratureManager();
});

function initializeLiteratureManager() {
    literatureManager = new LiteratureManager();
    window.literatureManager = literatureManager; // For global access
}