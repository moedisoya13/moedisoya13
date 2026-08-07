import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// three.js까지 전부 인라인한 단일 dist/index.html을 만든다.
// 이 환경에서는 unpkg/jsdelivr/esm.sh가 차단되어 있어 런타임 CDN 의존은 쓸 수 없고,
// 결과물은 file://로 더블클릭해서 열 수 있어야 한다.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    reportCompressedSize: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
