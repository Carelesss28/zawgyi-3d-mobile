import { defineConfig } from 'vite';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';

/** Lists the sound files in public/assets/audio (manifest.json), so the game only requests files that exist. */
function audioManifest() {
  const write = () => {
    const dir = 'public/assets/audio'; mkdirSync(dir, { recursive: true });
    const files = readdirSync(dir).filter((f) => /\.(mp3|ogg|wav)$/i.test(f)).sort();
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(files));
  };
  return { name: 'audio-manifest', buildStart: write, configureServer: write };
}

export default defineConfig({
  base: './',
  plugins: [audioManifest()],
  server: { port: 5174, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
