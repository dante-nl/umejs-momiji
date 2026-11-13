import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'node-html-parser';

// import everything from the theme
import theme, { transformCallouts, buildTree, pageBuilder } from '../ume.theme.js';

// # callout tests
test('transformCallouts - transforms basic callouts correctly', () => {
    const html = `
        <blockquote><p>[!NOTE]<br>This is a note</p></blockquote>
        <blockquote><p>[!WARNING]<br>This is a warning</p></blockquote>
    `;
    const root = parse(html);

    transformCallouts(root);

    const output = root.toString();

    // assert the classes and content are correct
    assert.match(output, /class="callout callout-note"/);
    assert.match(output, /class="callout callout-warning"/);
    assert.match(output, /This is a note/);

    // assert the raw tags
    assert.doesNotMatch(output, /\[!NOTE\]/);
    assert.doesNotMatch(output, /\[!WARNING\]/);
    assert.doesNotMatch(output, /<br>/);
});

test('transformCallouts - ignores regular blockquotes', () => {
    const html = `<blockquote><p>Just a regular quote</p></blockquote>`;
    const root = parse(html);

    transformCallouts(root);

    // the html should be completely unchanged
    assert.strictEqual(root.toString(), html);
});

// # sidebar biulder test
test('buildTree - parses directories, frontmatter, and sorting correctly', () => {
    // create temporary directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ume-test-'));

    // create tmp md files
    fs.writeFileSync(path.join(tmpDir, 'index.md'), '---\ntitle: Home\n---\n# Welcome');
    fs.writeFileSync(
        path.join(tmpDir, 'page-b.md'),
        '---\ntitle: Page B\nsidebar_order: 2\n---\nContent B',
    );
    fs.writeFileSync(
        path.join(tmpDir, 'page-a.md'),
        '---\ntitle: Page A\nsidebar_order: 1\n---\nContent A',
    );

    // create subfolder
    const subDir = path.join(tmpDir, 'guides');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.md'), '---\ntitle: Guides\n---\n# Guides');
    fs.writeFileSync(path.join(subDir, 'setup.md'), '---\ntitle: Setup Guide\n---\nHow to setup.');

    // run function
    const { sidebarTree, searchIndex, metaCache } = buildTree(tmpDir);

    // asssertion
    assert.strictEqual(sidebarTree.length, 4);

    // check sorting
    assert.strictEqual(sidebarTree[0].title, 'Page A');
    assert.strictEqual(sidebarTree[1].title, 'Page B');
    assert.strictEqual(sidebarTree[2].title, 'Guides');
    assert.strictEqual(sidebarTree[3].title, 'Home');

    // check the subfolder group
    assert.strictEqual(sidebarTree[2].type, 'group');

    assert.strictEqual(sidebarTree[2].children[0].title, 'Guides');
    assert.strictEqual(sidebarTree[2].children[1].title, 'Setup Guide');

    // check cache
    assert.strictEqual(metaCache['/page-a'].title, 'Page A');
    assert.strictEqual(metaCache['/guides/setup'].title, 'Setup Guide');

    // check searchIndex
    assert.strictEqual(searchIndex.length, 5);

    // find the specific pages to verify their categories
    const rootSearchItem = searchIndex.find((item) => item.url === '/');
    const guidesSearchItem = searchIndex.find((item) => item.url === '/guides/setup');

    assert.strictEqual(rootSearchItem.category, 'Root');
    assert.strictEqual(guidesSearchItem.category, 'guides');

    // cleanup temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// # pageBuilder test
test('pageBuilder - injects meta tags, hljs, and generates TOC', () => {
    // mock api and call setup to populate internal themeConfig
    const mockApi = {
        config: {
            siteTitle: 'Test Site',
            colors: { light: { primary: '#fff' }, dark: { primary: '#000' } },
            highlightTheme: { light: 'github', dark: 'github-dark' },
            favicon: '/favicon.ico',
            ogImage: '/og.png',
            _ume: { contentDir: null },
        },
        registerHelper: () => {},
    };
    theme.setup(mockApi);

    const mockHtml = `
        <html>
            <head></head>
            <body>
                <main id="main-content">
                    <h2>Section 1</h2>
                    <h3>Subsection</h3>
                </main>
                <nav class="toc__nav"></nav>
            </body>
        </html>
    `;

    const output = pageBuilder({}, {}, '/test-page', mockHtml);

    // assert meta tags
    assert.match(output, /<meta name="description" content="Documentation powered by umejs" \/>/);
    assert.match(output, /<meta property="og:title" content="Test Site" \/>/);

    // assert favicon, og image, and highlightjs config were loaded
    assert.match(output, /<link rel="icon" href="\/favicon.ico" \/>/);
    assert.match(output, /<meta property="og:image" content="\/og.png" \/>/);
    assert.match(output, /id="hljs-theme"/);
    assert.match(output, /data-light="github"/);
    assert.match(output, /data-dark="github-dark"/);

    // assert toc generation
    assert.match(output, /<ul>/);
    assert.match(output, /<li style="padding-left: 0px"><a href="#section-1">Section 1<\/a><\/li>/);
    assert.match(
        output,
        /<li style="padding-left: 12px"><a href="#subsection">Subsection<\/a><\/li>/,
    );
});
