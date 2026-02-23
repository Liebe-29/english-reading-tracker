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

    // --- Filter Toggle ---
    const hideExportedToggle = document.getElementById('hide-exported-toggle');
    if (hideExportedToggle) {
        hideExportedToggle.checked = localStorage.getItem('readingTracker_hideExported') === 'true';
        hideExportedToggle.addEventListener('change', (e) => {
            localStorage.setItem('readingTracker_hideExported', e.target.checked);
            renderDashboard();
        });
    }

    // --- Theme Toggle ---
    function toggleTheme() {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme');
        root.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
    }

    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const themeBtnSettings = document.getElementById('theme-btn-settings');
    if (themeBtnSettings) themeBtnSettings.addEventListener('click', toggleTheme);

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
            // Extract metadata - make ** optional and handle possible missing spaces
            const titleMatch = text.match(/(?:\*|・)?\s*(?:\*\*)?Title:(?:\*\*)?\s*(.+)/i) || text.match(/Title:\s*(.+)/i);
            const levelMatch = text.match(/(?:\*|・)?\s*(?:\*\*)?Level:(?:\*\*)?\s*(.+)/i) || text.match(/Level:\s*(.+)/i);
            const wordCountMatch = text.match(/(?:\*|・)?\s*(?:\*\*)?Word Count:(?:\*\*)?\s*([\d,]+)/i) ||
                text.match(/(?:\*|・)?\s*(?:\*\*)?Word Count:(?:\*\*)?\s*(.+)/i) ||
                text.match(/(?:\*|・)?\s*(?:\*\*)?Words:(?:\*\*)?\s*([\d,]+)/i) ||
                text.match(/Word Count:\s*([\d,]+)/i);

            // Extract Story Block - be more flexible with the headers
            const storyStartReg1 = /(?:###)?\s*2\.\s*Story\s*\/?\s*Article/i;
            const storyStartReg2 = /(?:###)?\s*Story/i;
            let startIndex = -1;

            const startMatch = text.match(storyStartReg1) || text.match(storyStartReg2);
            if (startMatch) {
                startIndex = startMatch.index + startMatch[0].length;
            } else {
                // Fallback: look for the end of the Word Count line
                const wcIndex = text.indexOf('Word Count:');
                if (wcIndex !== -1) {
                    const nextNewLine = text.indexOf('\n', wcIndex);
                    // Skip over any markdown horizontal rules if present
                    const possibleDivider = text.indexOf('---', nextNewLine);
                    if (possibleDivider !== -1 && possibleDivider - nextNewLine < 10) {
                        startIndex = possibleDivider + 3;
                    } else {
                        startIndex = nextNewLine;
                    }
                }
            }

            let endIndex = text.search(/(?:###)?\s*3\.\s*Key Vocabulary|(?:###)?\s*Key Vocabulary/i);
            if (endIndex === -1) endIndex = text.length;

            if (startIndex === -1 || !titleMatch) {
                console.log("Failed to parse. startIndex:", startIndex, "titleMatch:", titleMatch);
                return null;
            }

            let storyRaw = text.substring(startIndex, endIndex).trim();
            // Remove lingering --- or numbers at the beginning
            storyRaw = storyRaw.replace(/^---+/g, '').trim();

            return {
                id: Date.now().toString(),
                title: titleMatch[1].trim(),
                level: levelMatch ? levelMatch[1].trim() : 'Unknown',
                wordCount: wordCountMatch ? parseInt(wordCountMatch[1].replace(/,/g, ''), 10) : 0,
                content: storyRaw,
                dateAdded: new Date().toISOString(),
                hasExportedWords: false // New property to track if words were checked/exported
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
        const hideExported = document.getElementById('hide-exported-toggle')?.checked || false;

        if (articles.length === 0) {
            grid.innerHTML = '<p class="empty-state">No articles yet. Add one to get started!</p>';
            return;
        }

        let visibleCount = 0;
        articles.forEach(article => {
            if (hideExported && article.hasExportedWords) return;
            visibleCount++;

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

            // Actions container (Row for Checkbox + Delete)
            const actionContainer = document.createElement('div');
            actionContainer.className = 'article-actions';

            // "Words Exported" Checkbox
            const checkboxLabel = document.createElement('label');
            checkboxLabel.className = 'export-checkbox-label';
            checkboxLabel.innerHTML = `<input type="checkbox" class="export-checkbox" ${article.hasExportedWords ? 'checked' : ''}> Checked Words`;

            const checkbox = checkboxLabel.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                article.hasExportedWords = e.target.checked;
                saveState();
                // Optional: visual styling based on checked state could be added via CSS
            });

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

            actionContainer.appendChild(checkboxLabel);
            actionContainer.appendChild(deleteBtn);

            card.appendChild(contentWrapper);
            card.appendChild(actionContainer);
            grid.appendChild(card);
        });

        if (visibleCount === 0 && articles.length > 0) {
            grid.innerHTML = '<p class="empty-state" style="grid-column: 1 / -1;">All your articles are checked. Uncheck "Hide Checked" to view them.</p>';
        }
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

        // Setup Reader Checkbox
        const readerCheckbox = document.getElementById('reader-export-checkbox');
        if (readerCheckbox) {
            readerCheckbox.checked = article.hasExportedWords;
            // Remove old listener to avoid duplicates if reader is opened multiple times
            const newCheckbox = readerCheckbox.cloneNode(true);
            readerCheckbox.parentNode.replaceChild(newCheckbox, readerCheckbox);

            newCheckbox.addEventListener('change', (e) => {
                article.hasExportedWords = e.target.checked;
                saveState();
            });
        }

        navigateTo('reader');
    }

    // --- Selection & Tooltip Logic ---
    const readerBody = document.getElementById('reader-body');
    const tooltip = document.getElementById('selection-tooltip');
    let currentSelection = { text: '', sentence: '' };

    function handleSelectionEvent(e) {
        // Pass the event so we can potentially use touch/mouse coordinates
        setTimeout(() => handleSelection(e), 300);
    }

    // Support both mouse and touch
    readerBody.addEventListener('mouseup', handleSelectionEvent);
    readerBody.addEventListener('touchend', handleSelectionEvent);

    // Safari/Firefox mobile often relies heavily on selectionchange on the document
    document.addEventListener('selectionchange', () => {
        if (document.getElementById('view-reader').classList.contains('active')) {
            handleSelectionEvent();
        }
    });

    document.addEventListener('mousedown', closeTooltip);
    document.addEventListener('touchstart', closeTooltip);

    function closeTooltip(e) {
        if (!e.target.closest('#selection-tooltip') && e.target.id !== 'save-vocab-btn') {
            tooltip.classList.add('hidden');
        }
    }

    function handleSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && selectedText.length > 0 && selectedText.length < 100) { // Limit length to avoid whole-paragraph selections
            // Find the sentence containing this word
            const node = selection.anchorNode;
            if (!node) return;
            // On some mobile browsers, the node might be the text node itself, so we need parentElement
            const element = node.nodeType === 3 ? node.parentElement : node;
            const paragraph = element.closest('p');

            if (!paragraph) return;

            const fullText = paragraph.textContent;
            // Simple sentence splitter
            const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

            let targetSentence = sentences.find(s => s.includes(selectedText));
            if (!targetSentence) targetSentence = fullText;

            currentSelection.text = selectedText;
            currentSelection.sentence = targetSentence.trim();

            // Position tooltip
            try {
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();

                    if (rect.width > 0 || rect.height > 0) {
                        // Crux of the fix: iOS/Safari getBoundingClientRect is relative to the *viewport*.
                        // window.scrollY represents how far down we've scrolled.
                        // So absolute top = rect.top + window.scrollY
                        const scrollX = window.scrollX || window.pageXOffset;
                        const scrollY = window.scrollY || window.pageYOffset;

                        // Position vertically just above the selection box
                        let topPos = rect.top + scrollY - 45;

                        // Center horizontally
                        let leftPos = rect.left + scrollX + (rect.width / 2);

                        // Fallbacks if rect values are wonky but we have an event
                        if (e && (e.touches || Math.abs(topPos) > 10000)) {
                            if (e.touches && e.touches.length > 0) {
                                topPos = e.touches[0].pageY - 60;
                                leftPos = e.touches[0].pageX;
                            } else if (e.pageY) {
                                topPos = e.pageY - 60;
                                leftPos = e.pageX;
                            }
                        }

                        // Prevent going off top of screen
                        if (topPos < scrollY + 10) {
                            topPos = rect.bottom + scrollY + 10;
                        }

                        tooltip.style.left = `${leftPos}px`;
                        tooltip.style.top = `${topPos}px`;
                        tooltip.classList.remove('hidden');
                        return; // Successfully showed tooltip
                    }
                }
            } catch (err) {
                console.log("Error calculating selection rect, falling back.", err);
            }
        }

        // If we reach here, either text is empty, too long, or bounding rect failed
        tooltip.classList.add('hidden');
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
