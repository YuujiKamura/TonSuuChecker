import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// ビルド時にコミットハッシュを取得
const getGitCommitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

export default defineConfig(({ mode }) => {
    const commitHash = getGitCommitHash();
    return {
      base: mode === 'production' ? '/TonSuuChecker/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        '__COMMIT_HASH__': JSON.stringify(commitHash),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
