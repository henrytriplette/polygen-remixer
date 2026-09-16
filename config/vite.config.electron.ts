import { defineConfig } from 'vite';
import path from 'path';

import vue from '@vitejs/plugin-vue';

const root = path.resolve(__dirname, '..');

// Renderer bundle for the Electron build. Same app as the web build, but:
//  - base is relative so index.html works when loaded from file://
//  - no PWA plugin: service workers are not available on file:// and the
//    desktop shell already provides "installed app" behaviour
export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(root, './src')
        },
        extensions: ['.js', '.ts', '.json', '.vue', '.css', '.scss', '.sass'],
    },
    plugins: [vue()],
    build: {
        outDir: path.resolve(root, 'dist-electron/renderer'),
        emptyOutDir: true,
        sourcemap: false,
        target: 'esnext',
    },
});
