import { defineConfig } from 'vite';
import path from 'path';

import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.resolve(import.meta.dirname, '..');

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(root, './src')
        },

        extensions: ['.js', '.ts', '.json', '.vue', '.css', '.scss', '.sass'],
    },
    plugins: [
        vue(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'Polygen Remixer',
                short_name: 'Remixer',
                description:
                    'Remix Studio web application.',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                icons: [
                    {
                        src: 'favicon.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
                cleanupOutdatedCaches: true,
            },
            devOptions: {
                enabled: true,
                type: 'module',
            },
        }),
    ],
});
