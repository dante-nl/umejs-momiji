// # theme initialisation
// for dark mode and light mode
const STORAGE_KEY = 'ume-theme';

function getInitialTheme() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const hljsLink = document.getElementById('hljs-theme');

    if (hljsLink) {
        // read theme names from the data attributes
        const themeName = theme === 'dark' ? hljsLink.dataset.dark : hljsLink.dataset.light;

        if (themeName) {
            hljsLink.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${themeName}.min.css`;
        }
    }
}

applyTheme(getInitialTheme());

document.addEventListener('DOMContentLoaded', () => {
    // * theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle?.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        sessionStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
    });

    // * mobile sidebar
    const menuToggle = document.querySelector('.topbar__menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    function openNav() {
        sidebar.classList.add('is-open');
        overlay.hidden = false;
        document.body.classList.add('nav-open');
        menuToggle.setAttribute('aria-expanded', 'true');
    }
    function closeNav() {
        sidebar.classList.remove('is-open');
        overlay.hidden = true;
        document.body.classList.remove('nav-open');
        menuToggle.setAttribute('aria-expanded', 'false');
    }

    menuToggle?.addEventListener('click', () => {
        sidebar.classList.contains('is-open') ? closeNav() : openNav();
    });
    overlay?.addEventListener('click', closeNav);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar?.classList.contains('is-open')) closeNav();
    });

    // # sidebar active state
    const currentPath = window.location.pathname;
    const sidebarLinks = document.querySelectorAll('.sidebar__nav a');

    sidebarLinks.forEach((link) => {
        if (link.getAttribute('href') === currentPath) {
            link.setAttribute('aria-current', 'page');

            // Open parent <details> elements
            let parent = link.closest('details');
            while (parent) {
                parent.open = true;
                parent = parent.parentElement.closest('details');
            }
        }
    });

    // # code block highlighting and copy button
    document.querySelectorAll('code').forEach((block) => {
        const hasLanguageClass = Array.from(block.classList).some((cls) =>
            cls.startsWith('language-'),
        );

        if (hasLanguageClass) {
            hljs.highlightElement(block);
            addCopyButton(block);
        } else {
            // prevent hljs from mangling plaintext blocks
            block.classList.add('plaintext', 'hljs');
            addCopyButton(block);
        }
    });

    function addCopyButton(codeElement) {
        const pre = codeElement.closest('pre');
        if (!pre || pre.querySelector('.copy-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy code to clipboard');

        btn.addEventListener('click', async () => {
            const codeText = codeElement.textContent;
            try {
                await navigator.clipboard.writeText(codeText);
                showCopiedState(btn);
            } catch {
                fallbackCopy(codeText, btn);
            }
        });

        pre.appendChild(btn);
    }

    function showCopiedState(btn) {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    }

    function fallbackCopy(text, btn) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopiedState(btn);
        } catch {
            alert('Unable to copy. Please copy manually.');
        }
        document.body.removeChild(textarea);
    }

    // # quicksearch bar
    const searchTrigger = document.querySelector('.search-trigger');
    const searchModal = document.getElementById('search-modal');
    const searchModalInput = document.getElementById('search-modal-input');
    const searchModalResults = document.getElementById('search-modal-results');
    const searchModalClose = document.getElementById('search-modal-close');

    let searchIndexData = [];
    try {
        const indexScript = document.getElementById('search-index-data');
        if (indexScript) {
            searchIndexData = JSON.parse(indexScript.textContent);
        }
    } catch (e) {
        console.error('Failed to parse search index', e);
    }

    let currentResults = [];
    let selectedIndex = -1;

    function openSearch() {
        searchModal.showModal();
        searchModalInput.value = '';
        renderSearchResults([]);
        searchModalInput.focus();
    }

    function closeSearch() {
        searchModal.close();
    }

    searchTrigger?.addEventListener('click', openSearch);
    searchModalClose?.addEventListener('click', closeSearch);

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchModal.open ? closeSearch() : openSearch();
        }
    });

    searchModal?.addEventListener('click', (e) => {
        const dialogDimensions = searchModal.getBoundingClientRect();
        if (
            e.clientX < dialogDimensions.left ||
            e.clientX > dialogDimensions.right ||
            e.clientY < dialogDimensions.top ||
            e.clientY > dialogDimensions.bottom
        ) {
            closeSearch();
        }
    });

    searchModalInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderSearchResults([]);
            return;
        }
        const filtered = searchIndexData
            .filter(
                (item) =>
                    item.title.toLowerCase().includes(query) ||
                    item.content.toLowerCase().includes(query),
            )
            .slice(0, 10);
        renderSearchResults(filtered);
    });

    // * handle Keyboard navigation
    searchModalInput?.addEventListener('keydown', (e) => {
        if (currentResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % currentResults.length;
            updateActiveResult();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
            updateActiveResult();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
                window.location.href = currentResults[selectedIndex].url;
            }
        }
    });

    // sync mouse hover with keyboard selection
    searchModalResults?.addEventListener('mouseover', (e) => {
        const link = e.target.closest('.search-result');
        if (link) {
            selectedIndex = parseInt(link.dataset.index, 10);
            updateActiveResult();
        }
    });

    function renderSearchResults(results) {
        currentResults = results;
        selectedIndex = results.length > 0 ? 0 : -1;

        if (results.length === 0) {
            if (searchModalInput.value.trim() === '') {
                searchModalResults.innerHTML = '';
            } else {
                searchModalResults.innerHTML = '<li class="search-empty">No results found.</li>';
            }
            return;
        }

        searchModalResults.innerHTML = results
            .map(
                (item, i) => `
      <li>
        <a href="${item.url}" class="search-result ${i === 0 ? 'is-active' : ''}" data-index="${i}">
          <span class="search-result__category">${item.category}</span>
          <span class="search-result__title">${item.title}</span>
          <span class="search-result__snippet">${item.content}</span>
        </a>
      </li>
    `,
            )
            .join('');
    }

    function updateActiveResult() {
        const items = searchModalResults.querySelectorAll('.search-result');
        items.forEach((item, i) => {
            if (i === selectedIndex) {
                item.classList.add('is-active');
                // Ensure the active item is visible in the scrollable list
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('is-active');
            }
        });
    }

    // # table of contents tracker
    // track active TOC link
    const tocLinks = document.querySelectorAll('.toc__nav a[href^="#"]');
    if (tocLinks.length) {
        const headings = [...tocLinks]
            .map((a) => document.querySelector(a.getAttribute('href')))
            .filter(Boolean);
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    tocLinks.forEach((a) => a.removeAttribute('aria-current'));
                    const active = document.querySelector(
                        `.toc__nav a[href="#${entry.target.id}"]`,
                    );
                    active?.setAttribute('aria-current', 'true');
                });
            },
            { rootMargin: '-20% 0px -70% 0px' },
        );
        headings.forEach((h) => observer.observe(h));
    }
});
