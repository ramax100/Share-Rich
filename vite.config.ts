import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('peerjs')) return 'p2p';
            if (id.includes('qrcode') || id.includes('jsqr')) return 'qr-tools';
            if (id.includes('canvas-confetti')) return 'effects';
            return 'vendor';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      // Allow Arena/E2B preview hostnames while developing in the sandbox.
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
