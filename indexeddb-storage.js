// IndexedDB Storage Manager for Literature Review System
class IndexedDBStorage {
    constructor() {
        this.dbName = 'LiteratureReviewDB';
        this.version = 1;
        this.db = null;
    }

    // Initialize IndexedDB
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Papers store - for paper metadata
                if (!db.objectStoreNames.contains('papers')) {
                    const papersStore = db.createObjectStore('papers', { keyPath: 'id' });
                    papersStore.createIndex('title', 'title', { unique: false });
                    papersStore.createIndex('year', 'year', { unique: false });
                    papersStore.createIndex('researchArea', 'researchArea', { unique: false });
                }
                
                // Files store - for PDF file chunks
                if (!db.objectStoreNames.contains('files')) {
                    const filesStore = db.createObjectStore('files', { keyPath: 'id' });
                    filesStore.createIndex('paperId', 'paperId', { unique: false });
                    filesStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
                }
                
                // Thumbnails store - for PDF thumbnails
                if (!db.objectStoreNames.contains('thumbnails')) {
                    const thumbnailsStore = db.createObjectStore('thumbnails', { keyPath: 'paperId' });
                }
                
                console.log('IndexedDB schema upgraded');
            };
        });
    }

    // Save a paper with its PDF file
    async savePaper(paperData, pdfFile = null) {
        try {
            // Generate unique ID
            if (!paperData.id) {
                paperData.id = 'paper_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            const transaction = this.db.transaction(['papers', 'files', 'thumbnails'], 'readwrite');
            
            // Save paper metadata
            const papersStore = transaction.objectStore('papers');
            await this.promisifyRequest(papersStore.put(paperData));
            
            // Save PDF file if provided
            if (pdfFile) {
                await this.savePDFFile(paperData.id, pdfFile, transaction);
            }
            
            console.log('Paper saved successfully:', paperData.title);
            return paperData.id;
        } catch (error) {
            console.error('Error saving paper:', error);
            throw error;
        }
    }

    // Save PDF file in chunks to handle large files
    async savePDFFile(paperId, pdfFile, transaction = null) {
        const chunkSize = 1024 * 1024; // 1MB chunks
        const chunks = Math.ceil(pdfFile.size / chunkSize);
        
        const filesStore = transaction ? 
            transaction.objectStore('files') : 
            this.db.transaction(['files'], 'readwrite').objectStore('files');
        
        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, pdfFile.size);
            const chunk = pdfFile.slice(start, end);
            
            const arrayBuffer = await chunk.arrayBuffer();
            
            const chunkData = {
                id: `${paperId}_chunk_${i}`,
                paperId: paperId,
                chunkIndex: i,
                data: arrayBuffer,
                totalChunks: chunks,
                fileName: pdfFile.name,
                fileSize: pdfFile.size,
                mimeType: pdfFile.type
            };
            
            await this.promisifyRequest(filesStore.put(chunkData));
        }
        
        console.log(`PDF file saved in ${chunks} chunks`);
    }

    // Get all papers
    async getAllPapers() {
        try {
            const transaction = this.db.transaction(['papers'], 'readonly');
            const store = transaction.objectStore('papers');
            const request = store.getAll();
            
            const papers = await this.promisifyRequest(request);
            console.log(`Retrieved ${papers.length} papers from IndexedDB`);
            return papers;
        } catch (error) {
            console.error('Error getting papers:', error);
            return [];
        }
    }

    // Get PDF file for a paper
    async getPDFFile(paperId) {
        try {
            const transaction = this.db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const index = store.index('paperId');
            
            const chunks = await this.promisifyRequest(index.getAll(paperId));
            
            if (chunks.length === 0) {
                return null;
            }
            
            // Sort chunks by index
            chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            
            // Combine chunks
            const totalSize = chunks[0].fileSize;
            const combinedBuffer = new ArrayBuffer(totalSize);
            const combinedView = new Uint8Array(combinedBuffer);
            
            let offset = 0;
            for (const chunk of chunks) {
                const chunkView = new Uint8Array(chunk.data);
                combinedView.set(chunkView, offset);
                offset += chunkView.length;
            }
            
            // Create blob
            const blob = new Blob([combinedBuffer], { type: chunks[0].mimeType });
            
            console.log(`Retrieved PDF file for paper: ${paperId}`);
            return {
                blob: blob,
                fileName: chunks[0].fileName,
                url: URL.createObjectURL(blob)
            };
        } catch (error) {
            console.error('Error getting PDF file:', error);
            return null;
        }
    }

    // Save thumbnail
    async saveThumbnail(paperId, thumbnailDataUrl) {
        try {
            const transaction = this.db.transaction(['thumbnails'], 'readwrite');
            const store = transaction.objectStore('thumbnails');
            
            await this.promisifyRequest(store.put({
                paperId: paperId,
                thumbnail: thumbnailDataUrl,
                createdAt: new Date().toISOString()
            }));
            
            console.log(`Thumbnail saved for paper: ${paperId}`);
        } catch (error) {
            console.error('Error saving thumbnail:', error);
        }
    }

    // Get thumbnail
    async getThumbnail(paperId) {
        try {
            const transaction = this.db.transaction(['thumbnails'], 'readonly');
            const store = transaction.objectStore('thumbnails');
            
            const result = await this.promisifyRequest(store.get(paperId));
            return result ? result.thumbnail : null;
        } catch (error) {
            console.error('Error getting thumbnail:', error);
            return null;
        }
    }

    // Delete a paper and its associated files
    async deletePaper(paperId) {
        try {
            const transaction = this.db.transaction(['papers', 'files', 'thumbnails'], 'readwrite');
            
            // Delete paper metadata
            await this.promisifyRequest(transaction.objectStore('papers').delete(paperId));
            
            // Delete PDF chunks
            const filesStore = transaction.objectStore('files');
            const filesIndex = filesStore.index('paperId');
            const chunks = await this.promisifyRequest(filesIndex.getAll(paperId));
            
            for (const chunk of chunks) {
                await this.promisifyRequest(filesStore.delete(chunk.id));
            }
            
            // Delete thumbnail
            await this.promisifyRequest(transaction.objectStore('thumbnails').delete(paperId));
            
            console.log(`Paper deleted: ${paperId}`);
        } catch (error) {
            console.error('Error deleting paper:', error);
            throw error;
        }
    }

    // Get storage usage statistics
    async getStorageStats() {
        try {
            const [papers, files, thumbnails] = await Promise.all([
                this.promisifyRequest(this.db.transaction(['papers'], 'readonly').objectStore('papers').getAll()),
                this.promisifyRequest(this.db.transaction(['files'], 'readonly').objectStore('files').getAll()),
                this.promisifyRequest(this.db.transaction(['thumbnails'], 'readonly').objectStore('thumbnails').getAll())
            ]);

            const totalFileSize = files.reduce((sum, file) => sum + (file.data?.byteLength || 0), 0);
            const thumbnailSize = thumbnails.reduce((sum, thumb) => sum + (thumb.thumbnail?.length || 0), 0);

            return {
                totalPapers: papers.length,
                totalFiles: files.length,
                totalFileSize: totalFileSize,
                thumbnailSize: thumbnailSize,
                totalSize: totalFileSize + thumbnailSize
            };
        } catch (error) {
            console.error('Error getting storage stats:', error);
            return null;
        }
    }

    // Clear all data
    async clearAllData() {
        try {
            const transaction = this.db.transaction(['papers', 'files', 'thumbnails'], 'readwrite');
            
            await Promise.all([
                this.promisifyRequest(transaction.objectStore('papers').clear()),
                this.promisifyRequest(transaction.objectStore('files').clear()),
                this.promisifyRequest(transaction.objectStore('thumbnails').clear())
            ]);
            
            console.log('All data cleared from IndexedDB');
        } catch (error) {
            console.error('Error clearing data:', error);
            throw error;
        }
    }

    // Utility method to promisify IndexedDB requests
    promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Export all data for backup
    async exportData() {
        try {
            const papers = await this.getAllPapers();
            const stats = await this.getStorageStats();
            
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                statistics: stats,
                papers: papers
            };
            
            return exportData;
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }
}

// Export for use in main application
window.IndexedDBStorage = IndexedDBStorage;