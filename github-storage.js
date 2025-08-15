// GitHub Storage Module for PDF files
class GitHubStorage {
    constructor() {
        this.owner = 'wazgtam1';  // Your GitHub username
        this.repo = 'microgestures';  // Your repository name
        this.branch = 'main';
        this.token = null;  // Will be set by user
        this.baseApiUrl = 'https://api.github.com';
        this.baseRawUrl = 'https://raw.githubusercontent.com';
    }

    // Set GitHub token
    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
    }

    // Get stored token
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('github_token');
        }
        return this.token;
    }

    // Upload PDF file to GitHub
    async uploadPDF(file, paperData) {
        try {
            if (!this.getToken()) {
                throw new Error('GitHub token not configured');
            }

            // Generate unique filename
            const timestamp = Date.now();
            const filename = `pdfs/${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            
            // Convert file to base64
            const base64Content = await this.fileToBase64(file);
            const content = base64Content.split(',')[1]; // Remove data:application/pdf;base64, prefix

            // Upload to GitHub
            const uploadUrl = `${this.baseApiUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`;
            
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.getToken()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `Add PDF: ${paperData.title || file.name}`,
                    content: content,
                    branch: this.branch
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`GitHub upload failed: ${error.message}`);
            }

            const result = await response.json();
            
            // Return jsDelivr CDN URL instead of raw GitHub URL for better browser compatibility
            const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${this.branch}/${filename}`;
            
            return {
                success: true,
                url: jsdelivrUrl, // Use jsDelivr CDN URL
                rawUrl: `${this.baseRawUrl}/${this.owner}/${this.repo}/${this.branch}/${filename}`, // Keep raw URL as backup
                sha: result.content.sha,
                filename: filename,
                size: file.size
            };

        } catch (error) {
            console.error('GitHub upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Upload papers metadata to GitHub for sharing
    async uploadPapersMetadata(papers) {
        try {
            if (!this.getToken()) {
                throw new Error('GitHub token not configured');
            }

            const filename = 'papers-database.json';
            
            // Prepare metadata (exclude large binary data)
            const metadata = papers.map(paper => ({
                ...paper,
                // Keep PDF URL but remove large base64 data if present
                pdfUrl: paper.pdfUrl && paper.pdfUrl.startsWith('data:') ? 
                    '[LOCAL_PDF_DATA]' : paper.pdfUrl,
                // Keep thumbnails for sharing (they're important for UX)
                thumbnail: paper.thumbnail,
                originalThumbnail: paper.originalThumbnail
            }));

            const content = btoa(unescape(encodeURIComponent(JSON.stringify(metadata, null, 2))));

            // Check if file exists first
            let sha = null;
            try {
                const checkUrl = `${this.baseApiUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`;
                const checkResponse = await fetch(checkUrl, {
                    headers: {
                        'Authorization': `token ${this.getToken()}`
                    }
                });
                if (checkResponse.ok) {
                    const existing = await checkResponse.json();
                    sha = existing.sha;
                }
            } catch (e) {
                // File doesn't exist, that's ok
            }

            // Upload metadata
            const uploadUrl = `${this.baseApiUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`;
            const body = {
                message: `Update papers database: ${papers.length} papers`,
                content: content,
                branch: this.branch
            };
            
            if (sha) {
                body.sha = sha; // Required for updating existing file
            }
            
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.getToken()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Metadata upload failed: ${error.message}`);
            }

            return {
                success: true,
                message: `Successfully synced ${papers.length} papers to GitHub`
            };

        } catch (error) {
            console.error('Metadata upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Download papers metadata from GitHub for sharing
    async downloadPapersMetadata() {
        try {
            const filename = 'papers-database.json';
            const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${this.branch}/${filename}`;
            
            const response = await fetch(jsdelivrUrl);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: true,
                        papers: [], // No shared database yet
                        message: 'No shared database found'
                    };
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const papers = await response.json();
            
            return {
                success: true,
                papers: papers,
                message: `Loaded ${papers.length} papers from shared database`
            };

        } catch (error) {
            console.error('Metadata download error:', error);
            return {
                success: false,
                error: error.message,
                papers: []
            };
        }
    }

    // Convert file to base64
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // Delete PDF from GitHub
    async deletePDF(filename, sha) {
        try {
            if (!this.getToken()) {
                throw new Error('GitHub token not configured');
            }

            const deleteUrl = `${this.baseApiUrl}/repos/${this.owner}/${this.repo}/contents/${filename}`;
            
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.getToken()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `Delete PDF: ${filename}`,
                    sha: sha,
                    branch: this.branch
                })
            });

            return response.ok;
        } catch (error) {
            console.error('GitHub delete error:', error);
            return false;
        }
    }

    // Check if token is valid
    async validateToken() {
        try {
            if (!this.getToken()) {
                return false;
            }

            const response = await fetch(`${this.baseApiUrl}/repos/${this.owner}/${this.repo}`, {
                headers: {
                    'Authorization': `token ${this.getToken()}`
                }
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Get repository info
    async getRepoInfo() {
        try {
            const response = await fetch(`${this.baseApiUrl}/repos/${this.owner}/${this.repo}`, {
                headers: this.getToken() ? {
                    'Authorization': `token ${this.getToken()}`
                } : {}
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    size: data.size, // in KB
                    private: data.private
                };
            }
        } catch (error) {
            console.error('Failed to get repo info:', error);
        }
        return null;
    }
}

// Initialize GitHub storage
window.githubStorage = new GitHubStorage();