document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let articles = JSON.parse(localStorage.getItem('readingTracker_articles')) || [];
    let exportList = JSON.parse(localStorage.getItem('readingTracker_exportList')) || [];
    let currentArticleId = null;

    function saveState() {
        localStorage.setItem('readingTracker_articles', JSON.stringify(articles));
        localStorage.setItem('readingTracker_exportList', JSON.stringify(exportList));
    }

    // --- Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-links a');
    const views = document.querySelectorAll('.view');
    const backToDashboardBtns = document.querySelectorAll('[data-view="dashboard"]');

    function navigateTo(viewId) {
        navLinks.forEach(link => {
            if (link.dataset.view === viewId) link.classList.add('active');
            else link.classList.remove('active');
        });

        views.forEach(view => {
            if (view.id === `view-${viewId}`) view.classList.add('active');
            else view.classList.remove('active');
        });

        if (viewId === 'dashboard') renderDashboard();
        if (viewId === 'export') renderExport();
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(e.target.dataset.view);
        });
    });

    backToDashboardBtns.forEach(btn => {
        btn.addEventListener('click', () => navigateTo('dashboard'));
    });

    // --- Theme Toggle ---
    const themeBtn = document.getElementById('theme-btn');
    themeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme');
        root.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
    });

    // --- Parsing Logic ---
    const addArticleForm = document.getElementById('add-article-form');
    if (addArticleForm) {
        addArticleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('article-input').value;
            const article = parseArticle(input);
            if (article) {
                articles.unshift(article); // Add to beginning
                saveState();
                document.getElementById('article-input').value = '';
                navigateTo('dashboard');
            } else {
                alert('Could not parse the article. Please check the format matches the Gemini output.');
            }
        });
    }

    function parseArticle(text) {
        try {
            // Extract metadata
            const titleMatch = text.match(/\*\s*\*\*Title:\*\*\s*(.+)/i);
            const levelMatch = text.match(/\*\s*\*\*Level:\*\*\s*(.+)/i);
            const wordCountMatch = text.match(/\*\s*\*\*Word Count:\*\*\s*([\d,]+)/i) ||
                text.match(/\*\s*\*\*Word Count:\*\*\s*(.+)/i) ||
                text.match(/\*\s*\*\*Words:\*\*\s*([\d,]+)/i);

            // Extract Story Block
            const storyStartReg1 = /### 2\. Story \/ Article/i;
            const storyStartReg2 = /### Story/i;
            let startIndex = -1;
            const startMatch = text.match(storyStartReg1) || text.match(storyStartReg2);
            if (startMatch) startIndex = startMatch.index + startMatch[0].length;
            else startIndex = text.indexOf('---', text.indexOf('Word Count')) + 3; // Fallback

            let endIndex = text.search(/### 3\. Key Vocabulary|### Key Vocabulary/i);
            if (endIndex === -1) endIndex = text.length;

            if (startIndex === -1 || !titleMatch) return null;

            let storyRaw = text.substring(startIndex, endIndex).trim();
            // Remove lingering --- if any
            storyRaw = storyRaw.replace(/^---/g, '').trim();

            return {
                id: Date.now().toString(),
                title: titleMatch[1].trim(),
                level: levelMatch ? levelMatch[1].trim() : 'Unknown',
                wordCount: wordCountMatch ? parseInt(wordCountMatch[1].replace(/,/g, ''), 10) : 0,
                content: storyRaw,
                dateAdded: new Date().toISOString()
            };
        } catch (e) {
            console.error('Parsing error:', e);
            return null;
        }
    }

    // --- Dashboard Rendering ---
    function renderDashboard() {
        // Update stats
        document.getElementById('stat-articles').textContent = articles.length;
        const totalWords = articles.reduce((sum, article) => sum + (article.wordCount || 0), 0);
        document.getElementById('stat-words').textContent = totalWords.toLocaleString();

        const grid = document.getElementById('article-list');
        grid.innerHTML = '';

        if (articles.length === 0) {
            grid.innerHTML = '<p class="empty-state">No articles yet. Add one to get started!</p>';
            return;
        }

        articles.forEach(article => {
            const date = new Date(article.dateAdded).toLocaleDateString();
            const card = document.createElement('div');
            card.className = 'article-card';

            // Create a wrapper for content to allow clicking the card without triggering delete
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'article-content-wrapper';
            contentWrapper.innerHTML = `
                <h3>${article.title}</h3>
                <div class="meta">
                    <span>📚 ${article.level}</span>
                    <span>📝 ${article.wordCount} words</span>
                    <span>📅 ${date}</span>
                </div>
            `;
            contentWrapper.addEventListener('click', () => openReader(article.id));

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn text-btn delete-article-btn';
            deleteBtn.innerHTML = '🗑️ Delete';
            deleteBtn.title = 'Delete this article';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent opening the reader
                if (confirm(`Are you sure you want to delete "${article.title}"?`)) {
                    deleteArticle(article.id);
                }
            });

            const actionContainer = document.createElement('div');
            actionContainer.className = 'article-actions';
            actionContainer.appendChild(deleteBtn);

            card.appendChild(contentWrapper);
            card.appendChild(actionContainer);
            grid.appendChild(card);
        });
    }

    function deleteArticle(id) {
        articles = articles.filter(a => a.id !== id);
        saveState();
        renderDashboard();
    }

    // --- Reader Logic ---
    function openReader(id) {
        const article = articles.find(a => a.id === id);
        if (!article) return;

        currentArticleId = id;
        document.getElementById('reader-level').textContent = article.level;
        document.getElementById('reader-words').textContent = `${article.wordCount} words`;
        document.getElementById('reader-title').textContent = article.title;

        // Simple markdown to HTML for reader (paragraphs)
        const htmlContent = article.content.split('\n\n')
            .filter(p => p.trim() !== '')
            .map(p => {
                // Remove bold markers for standard reading reading readability if desired, 
                // but let's keep it to allow formatting.
                let formatted = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return `<p>${formatted}</p>`;
            })
            .join('');

        document.getElementById('reader-body').innerHTML = htmlContent;
        navigateTo('reader');
    }

    // --- Selection & Tooltip Logic ---
    const readerBody = document.getElementById('reader-body');
    const tooltip = document.getElementById('selection-tooltip');
    let currentSelection = { text: '', sentence: '' };

    readerBody.addEventListener('mouseup', (e) => {
        setTimeout(() => handleSelection(e), 10);
    });

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#selection-tooltip')) {
            tooltip.classList.add('hidden');
        }
    });

    function handleSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && selectedText.length > 0) {
            // Find the sentence containing this word
            const node = selection.anchorNode;
            if (!node) return;
            const paragraph = node.parentElement.closest('p');
            if (!paragraph) return;

            const fullText = paragraph.textContent;
            const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

            let targetSentence = sentences.find(s => s.includes(selectedText));
            if (!targetSentence) targetSentence = fullText;

            currentSelection.text = selectedText;
            currentSelection.sentence = targetSentence.trim();

            // Position tooltip
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Adjust for scrolling
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const scrollY = window.scrollY || document.documentElement.scrollTop;

            tooltip.style.left = `${rect.left + scrollX + (rect.width / 2)}px`;
            tooltip.style.top = `${rect.top + scrollY - 5}px`;
            tooltip.classList.remove('hidden');
        } else {
            tooltip.classList.add('hidden');
        }
    }

    document.getElementById('save-vocab-btn').addEventListener('click', () => {
        if (currentSelection.text && currentSelection.sentence) {
            // Format sentence for Gemini Anki Gen
            // e.g. "She hit the **chunk** with a hammer."

            // We need to carefully replace the word with its bolded version, insensitive case,
            // but preserving the original capitalization in the sentence.
            const regex = new RegExp(`(${escapeRegExp(currentSelection.text)})`, 'gi');
            const highlightedSentence = currentSelection.sentence.replace(regex, '**$1**');

            exportList.push({
                word: currentSelection.text,
                sentence: highlightedSentence,
                dateAdded: new Date().toISOString()
            });

            saveState();
            tooltip.classList.add('hidden');

            // Visual feedback
            const btn = document.getElementById('save-vocab-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Saved! ✓';
            window.getSelection().removeAllRanges();
            setTimeout(() => { btn.textContent = originalText; }, 1500);
        }
    });

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- Export Logic ---
    function renderExport() {
        const textarea = document.getElementById('export-textarea');
        if (exportList.length === 0) {
            textarea.value = '';
            textarea.placeholder = 'No sentences saved yet. Select words in the Reader to save them here.';
            return;
        }

        const formatted = exportList.map(item => `[Sentence]\n${item.sentence}`).join('\n\n---\n\n');
        textarea.value = formatted;
    }

    document.getElementById('copy-export-btn').addEventListener('click', () => {
        const text = document.getElementById('export-textarea').value;
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copy-export-btn');
            const og = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = og; }, 2000);
        });
    });

    document.getElementById('clear-export-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your saved sentences? Make sure you copied them!')) {
            exportList = [];
            saveState();
            renderExport();
        }
    });

    // --- Backup & Restore Logic ---
    document.getElementById('backup-export-btn').addEventListener('click', () => {
        const data = {
            articles: articles,
            exportList: exportList,
            version: '1.0',
            exportDate: new Date().toISOString()
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `reading_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('backup-import-btn').addEventListener('click', () => {
        const fileInput = document.getElementById('backup-import-file');
        const file = fileInput.files[0];

        if (!file) {
            alert("Please select a valid .json backup file first.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const importedData = JSON.parse(e.target.result);

                // Basic validation
                if (!importedData.articles) {
                    throw new Error("Invalid backup file: Missing articles array.");
                }

                if (confirm('Warning: This will OVERWRITE your current data with the imported file. Are you sure you want to proceed?')) {
                    articles = importedData.articles || [];
                    exportList = importedData.exportList || [];
                    saveState();
                    alert("Data imported successfully!");
                    renderDashboard();
                    // Reset file input
                    fileInput.value = '';
                }
            } catch (err) {
                console.error("Import error:", err);
                alert("Failed to import data. Please ensure it is a valid Reading Tracker backup JSON file.");
            }
        };
        reader.readAsText(file);
    });

    // --- Initial Render ---
    renderDashboard();
});
