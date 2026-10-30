import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import matter from 'lite-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let themeConfig = {};
let pageMetadata = {};

export default {
    name: 'umejs-red-maple',
    version: '1.0.0',
    umeVersion: '^1.4.0',

    entryTemplate: 'layout.ume.html',
    templatesDir: path.join(__dirname, 'templates'),
    partialsDir: path.join(__dirname, 'partials'),
    assetsDir: path.join(__dirname, 'assets'),

    config: {
        siteTitle: 'umejs-red-maple',
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
    },

    setup(api) {
        themeConfig = api.config;
        // cache config for builder

        const contentDir = api.config._ume?.contentDir;

        if (contentDir && fs.existsSync(contentDir)) {
            const { sidebarTree, searchIndex, metaCache } = buildTree(contentDir);

            api.registerHelper('sidebarMenu', () => renderSidebar(sidebarTree));
            api.registerHelper('searchIndexJson', () => JSON.stringify(searchIndex));

            // store metadata for the builder
            pageMetadata = metaCache;
        }
    },
};

// # build table of contents and opengraph
function pageBuilder(req, res, slug, html) {
    if (!html) return html;

    const root = parse(html);

    // * generate meta tags
    const head = root.querySelector('head');
    if (head) {
        const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
        const meta = pageMetadata[normalizedSlug] || {};

        const description =
            meta.description || themeConfig.siteDescription || 'Documentation powered by umejs';
        const title = meta.title || themeConfig.siteTitle || 'Documentation';

        // light mode color
        const lightColor = themeConfig.colors?.light?.primary;
        // dark mode color
        const darkColor = themeConfig.colors?.dark?.primary;

        head.appendChild(`
            <meta name="description" content="${description}" />
            <meta property="og:title" content="${title}" />
            <meta property="og:description" content="${description}" />
            <meta name="theme-color" content="${lightColor}" media="(prefers-color-scheme: light)" />
            <meta name="theme-color" content="${darkColor}" media="(prefers-color-scheme: dark)" />
        `);
    }

    // find the main content area
    const content = root.querySelector('#main-content');
    const tocNav = root.querySelector('.toc__nav');

    if (!content || !tocNav) return html;

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

            const { sidebarTree: children, searchIndex: childIndex } = buildTree(
                fullPath,
                `${baseRoute}/${file.name}`,
            );

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
