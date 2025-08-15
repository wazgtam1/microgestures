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
            
            // Return the raw URL for accessing the file
            const rawUrl = `${this.baseRawUrl}/${this.owner}/${this.repo}/${this.branch}/${filename}`;
            
            return {
                success: true,
                url: rawUrl,
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