import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import matter from 'lite-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let themeConfig = {};
let pageMetadata = {};

export default {
    name: 'umejs-momiji',
    version: '1.0.0',
    umeVersion: '^1.4.0',

    entryTemplate: 'layout.ume.html',
    templatesDir: path.join(__dirname, 'templates'),
    partialsDir: path.join(__dirname, 'partials'),
    assetsDir: path.join(__dirname, 'assets'),

    config: {
        siteTitle: 'an umejs-momiji documentation site',
        siteDescription: 'built with umejs',
        colors: {
            light: {
                primary: '#f1414d;',
                accent: '#e95d67;',
            },
            dark: {
                primary: '#be0e1a',
                accent: '#a2161f',
            },
        },

        highlightTheme: {
            light: 'github',
            dark: 'github-dark',
        },
        logo: '◆',
        // favicon: '/favicon.ico',
        // ogImage: '/og-image.png',
    },

    // register the builder
    builders: [pageBuilder],

    helpers: {
        year: () => new Date().getFullYear(),
        authorName: {
            helper: (slug, config) => config.author,
            cache: true,
        },
        themeName: {
            helper: (slug, config) => config.siteTitle,
            cache: true,
        },
        themeStyles: {
            helper: (slug, config) => {
                // load the custom user defined theme overrides
                const colors = config.colors || {};
                let css = '<style>';
                let hasColors = false;

                if (colors.light) {
                    hasColors = true;
                    css += ':root[data-theme="light"] {';
                    for (const [key, value] of Object.entries(colors.light)) {
                        css += `--${key}: ${value};`;
                    }
                    css += '}';
                }

                if (colors.dark) {
                    hasColors = true;
                    css += ':root[data-theme="dark"] {';
                    for (const [key, value] of Object.entries(colors.dark)) {
                        css += `--${key}: ${value};`;
                    }
                    css += '}';
                }

                css += '</style>';
                return hasColors ? css : '';
            },
            cache: true,
        },
        topbarContent: {
            helper: (slug, config) => {
                if (!config.topbarLinks) return '';

                let topbarLinksHTML = '';

                config.topbarLinks.forEach((linkObject) => {
                    topbarLinksHTML += `<a href="${linkObject.link}">${linkObject.title}</a>`;
                });
                return topbarLinksHTML;
            },
            cache: true,
        },
        logoHtml: {
            helper: (slug, config) => {
                const logo = config.logo;
                if (!logo) return ''; // if set to null/false, hide it entirely

                // check if it's an image path (starts with / or http, or ends with image extension)
                if (
                    typeof logo === 'string' &&
                    (logo.startsWith('/') ||
                        logo.startsWith('http') ||
                        /\.(svg|png|jpg|jpeg|webp|gif)$/i.test(logo))
                ) {
                    return `<img src="${logo}" alt="Logo" class="topbar__logo-img" />`;
                }

                // check if custom HTML object is passed (e.g., an inline SVG)
                if (typeof logo === 'object' && logo.html) {
                    return logo.html;
                }

                // else, treat it as text/emoji
                return `<span class="topbar__logo">${logo}</span>`;
            },
            cache: true,
        },
    },

    setup(api) {
        themeConfig = api.config;
        // cache config for builder

        const contentDir = api.config._ume?.contentDir;

        if (contentDir && fs.existsSync(contentDir)) {
            const { sidebarTree, searchIndex, metaCache } = buildTree(contentDir);

            api.registerHelper('sidebarMenu', () => renderSidebar(sidebarTree));
            api.registerHelper('searchIndexJson', () => JSON.stringify(searchIndex));

            function flattenTree(nodes) {
                let result = [];
                for (const node of nodes) {
                    if (node.type === 'page') result.push(node);
                    else if (node.type === 'group')
                        result = result.concat(flattenTree(node.children));
                }
                return result;
            }
            const flatPages = flattenTree(sidebarTree);

            // register pagination helper
            api.registerHelper('prevNext', (req, res, slug) => {
                if (!flatPages.length) return '';

                // normalize slug for matching
                let normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
                normalizedSlug = normalizedSlug.replace(/\/index$/, '/'); // handle index

                const index = flatPages.findIndex(
                    (p) => p.url === normalizedSlug || p.url === normalizedSlug + '/',
                );

                if (index === -1) return '';

                const prev = index > 0 ? flatPages[index - 1] : null;
                const next = index < flatPages.length - 1 ? flatPages[index + 1] : null;

                let html = '<nav class="pagination" aria-label="Pagination">';
                if (prev) {
                    html += `<a href="${prev.url}" class="pagination__link pagination__prev">
                        <span class="pagination__label">Previous</span>
                        <span class="pagination__title">${prev.title}</span>
                    </a>`;
                } else {
                    html += `<div></div>`; // spacer for flexbox
                }

                if (next) {
                    html += `<a href="${next.url}" class="pagination__link pagination__next">
                        <span class="pagination__label">Next</span>
                        <span class="pagination__title">${next.title}</span>
                    </a>`;
                }
                html += '</nav>';

                return html;
            });

            // store metadata for the builder
            pageMetadata = metaCache;
        }
    },
};

// # build table of contents and opengraph
function pageBuilder(req, res, slug, html) {
    if (!html) return html;

    const root = parse(html, { comment: true });

    transformCallouts(root);

    // * generate meta tags
    const head = root.querySelector('head');
    if (head) {
        const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`.replace(/^\/index$/, '/');
        const meta = pageMetadata[normalizedSlug] || {};

        const description =
            meta.description || themeConfig.siteDescription || 'Documentation powered by umejs';
        const title = meta.title || themeConfig.siteTitle || 'Documentation';

        // light mode color
        const lightColor = themeConfig.colors?.light?.primary;
        // dark mode color
        const darkColor = themeConfig.colors?.dark?.primary;

        let extraHeadTags = '';
        if (themeConfig.favicon) {
            extraHeadTags += `<link rel="icon" href="${themeConfig.favicon}" />`;
        }
        if (themeConfig.ogImage) {
            extraHeadTags += `<meta property="og:image" content="${themeConfig.ogImage}" />`;
        }

        if (themeConfig.highlightTheme) {
            const hTheme = themeConfig.highlightTheme;
            // support strings so it can either be a string or object to define the theme
            const lightTheme = typeof hTheme === 'string' ? hTheme : hTheme.light || 'github';
            const darkTheme = typeof hTheme === 'string' ? hTheme : hTheme.dark || 'github-dark';

            extraHeadTags += `<link id="hljs-theme" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${lightTheme}.min.css" data-light="${lightTheme}" data-dark="${darkTheme}" />`;
        }

        head.appendChild(`
            <meta name="description" content="${description}" />
            <meta property="og:title" content="${title}" />
            <meta property="og:description" content="${description}" />
            <meta name="theme-color" content="${lightColor}" media="(prefers-color-scheme: light)" />
            <meta name="theme-color" content="${darkColor}" media="(prefers-color-scheme: dark)" />
            ${extraHeadTags}
        `);
    }

    // find the main content area
    const content = root.querySelector('#main-content');
    const tocNav = root.querySelector('.toc__nav');

    if (!content || !tocNav) return root.toString();

    const headings = content.querySelectorAll('h2, h3, h4');

    if (headings.length === 0) {
        tocNav.set_content('');
        return root.toString();
    }

    let tocHtml = '<ul>';

    headings.forEach((h) => {
        const level = parseInt(h.tagName.substring(1), 10);
        const text = h.textContent.trim();

        let id = h.getAttribute('id');
        if (!id) {
            id = text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            h.setAttribute('id', id);
        }

        // indent based on heading level (h2=0px, h3=12px, h4=24px)
        const padding = (level - 2) * 12;
        tocHtml += `<li style="padding-left: ${padding}px"><a href="#${id}">${text}</a></li>`;
    });

    tocHtml += '</ul>';

    // inject the generated toc into the layout
    tocNav.set_content(tocHtml);

    return root.toString();
}

function transformCallouts(root) {
    const icons = {
        NOTE: `<svg class="callout-icon" viewBox="0 0 16 16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
        TIP: `<svg class="callout-icon" viewBox="0 0 16 16"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.32a8.456 8.456 0 0 0-.542.68c-.207.3-.33.565-.37.847a.75.75 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>`,
        IMPORTANT: `<svg class="callout-icon" viewBox="0 0 16 16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>`,
        WARNING: `<svg class="callout-icon" viewBox="0 0 16 16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>`,
        CAUTION: `<svg class="callout-icon" viewBox="0 0 16 16"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
    };

    const blockquotes = root.querySelectorAll('blockquote');

    blockquotes.forEach((bq) => {
        const firstP = bq.querySelector('p');
        if (!firstP) return;

        const match = firstP.innerHTML.match(
            /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<br\s*\/?>)?/i,
        );

        if (match) {
            const type = match[1].toUpperCase();
            const typeLower = type.toLowerCase();

            // remove the [!TYPE] text from the paragraph using innerHTML
            let cleanHtml = firstP.innerHTML
                .replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<br\s*\/?>)?/i, '')
                .trim();

            if (cleanHtml === '') {
                firstP.remove();
            } else {
                firstP.set_content(cleanHtml);
            }

            // build callout HTML
            const calloutHtml = `
                <div class="callout callout-${typeLower}">
                    <div class="callout-title">
                        ${icons[type]}
                        ${type}
                    </div>
                    <div class="callout-content">
                        ${bq.innerHTML}
                    </div>
                </div>
            `;

            // replace the blockquote with the new callout structure
            bq.replaceWith(calloutHtml);
        }
    });
}

// # sidebar and search index

function buildTree(dir, baseRoute = '') {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    let nodes = [];
    let index = [];
    let metaCache = {};

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            // check if the directory has an index.md to pull metadata from
            const indexPath = path.join(fullPath, 'index.md');
            let groupTitle = file.name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
            let groupOrder = 999;

            if (fs.existsSync(indexPath)) {
                const indexContent = fs.readFileSync(indexPath, 'utf8');
                const parsedIndex = matter(indexContent);
                if (parsedIndex.data.title) groupTitle = parsedIndex.data.title;
                if (parsedIndex.data.sidebar_order !== undefined)
                    groupOrder = parsedIndex.data.sidebar_order;
            }

            const {
                sidebarTree: children,
                searchIndex: childIndex,
                metaCache: childMetaCache,
            } = buildTree(fullPath, `${baseRoute}/${file.name}`);

            // only add the group if it has children
            if (children.length > 0) {
                nodes.push({
                    type: 'group',
                    title: groupTitle,
                    order: groupOrder,
                    children,
                });
            }
            index = index.concat(childIndex);

            // add the created object to the metaCache
            metaCache = { ...metaCache, ...childMetaCache };
        } else if (file.name.endsWith('.md')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const parsed = matter(content);
            const data = parsed.data;

            // if excluded from the sidebar, respect that
            if (data.sidebar_exclude) continue;

            // construct url and make the title look nice
            const url =
                `${baseRoute}/${file.name.replace('.md', '')}`.replace(/\/index$/, '') || '/';
            const title =
                data.title ||
                file.name
                    .replace('.md', '')
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase());

            metaCache[url] = {
                title: title,
                description:
                    data.description ||
                    parsed.content
                        .substring(0, 150)
                        .replace(/[#*`_\[\]]/g, '')
                        .replace(/\n/g, ' ')
                        .trim(),
            };

            nodes.push({
                type: 'page',
                title,
                url,
                order: data.sidebar_order ?? 999,
            });

            index.push({
                title,
                url,
                category: data.sidebar_group || baseRoute.replace(/^\//, '') || 'Root',
                content: parsed.content
                    .replace(/[#*`_\[\]]/g, '')
                    .replace(/\n/g, ' ')
                    .substring(0, 1500)
                    .trim(),
            });
        }
    }

    // sorting for pages and groups
    nodes.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
    });

    return { sidebarTree: nodes, searchIndex: index, metaCache };
}

function renderSidebar(nodes) {
    let html = '<ul>';

    for (const node of nodes) {
        if (node.type === 'page') {
            html += `<li><a href="${node.url}">${node.title}</a></li>`;
        } else if (node.type === 'group') {
            html += `<li class="sidebar__group">
                <details open>
                    <summary>${node.title}</summary>
                    ${renderSidebar(node.children)}
                </details>
            </li>`;
        }
    }

    html += '</ul>';
    return html;
}
