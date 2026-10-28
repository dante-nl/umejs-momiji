import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    name: 'ume-theme-basic',
    entryTemplate: 'layout.ume.html',
    templatesDir: path.join(__dirname, 'templates'),
    partialsDir: path.join(__dirname, 'partials'),
    assetsDir: path.join(__dirname, 'assets'),

    config: {
        siteTitle: 'My Basic ESM Theme',
        author: 'Dante',
        showFooter: true,
    },

    helpers: {
        year: () => new Date().getFullYear(),
        authorName: {
            helper: (slug, config) => {
                console.log(config);
                return config.author;
            },
            cache: true,
        },
    },

    setup(api) {
        api.registerHelper('themeName', () => api.config.siteTitle);
    },
};
