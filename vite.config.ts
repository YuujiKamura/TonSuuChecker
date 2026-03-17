import path from 'path';
import fs from 'fs';
import os from 'os';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync, spawn } from 'child_process';

// ビルド時にコミットハッシュを取得
const getGitCommitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

// Gemini CLI Proxy Plugin
const geminiCliPlugin = (): Plugin => {
  return {
    name: 'gemini-cli-proxy',
    configureServer(server) {
      // マルチターン対話エンドポイント
      server.middlewares.use('/api/gemini-cli-multiturn', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { prompts, base64Images } = JSON.parse(body);
            if (!prompts?.length || !base64Images?.length) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'prompts array and base64Images required' }));
              return;
            }

            // 一時ディレクトリ作成
            const tempDir = path.join(os.tmpdir(), `gemini-cli-mt-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            // 画像ファイル作成
            const imageFiles: string[] = [];
            base64Images.forEach((b64: string, i: number) => {
              const data = b64.replace(/^data:image\/\w+;base64,/, '');
              const imgPath = path.join(tempDir, `image_${i}.jpg`);
              fs.writeFileSync(imgPath, Buffer.from(data, 'base64'));
              imageFiles.push(`image_${i}.jpg`);
            });

            // マルチターン用：プロンプトを連結して一度に送信
            // Gemini CLIはセッション維持が難しいので、全プロンプトを構造化して1回で送る
            const combinedPrompt = prompts.map((p: string, i: number) =>
              `【Step ${i + 1}】\n${p}`
            ).join('\n\n---\n\n') + `\n\n---\n\n【出力形式】
各Stepの回答をJSON形式で出力してください:
===STEP1===
{Step1の回答JSON}
===STEP2===
{Step2の回答JSON}`;

            const promptFile = path.join(tempDir, 'prompt.txt');
            fs.writeFileSync(promptFile, combinedPrompt, 'utf8');

            // 単一のgemini呼び出しで全ステップを処理
            const psScript = `
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$imageFiles = @(${imageFiles.map(f => `'${f}'`).join(', ')})
Get-Content -Raw -Encoding UTF8 'prompt.txt' | & 'gemini' -o text $imageFiles
`;
            const scriptFile = path.join(tempDir, 'run.ps1');
            fs.writeFileSync(scriptFile, psScript, 'utf8');

            console.log(`[Gemini CLI MT] Running ${prompts.length} steps...`);
            const startTime = Date.now();

            // 実行
            const proc = spawn('powershell', [
              '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile
            ], { cwd: tempDir, shell: true });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            proc.on('close', code => {
              try { fs.rmSync(tempDir, { recursive: true }); } catch {}

              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(`[Gemini CLI MT] Done (${elapsed}s), code=${code}`);

              if (code !== 0) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: stderr || 'CLI failed' }));
                return;
              }

              // ステップごとの結果を分割
              const cleaned = stdout
                .split('\n')
                .filter(l => !l.includes('Loaded cached') && !l.includes('Hook registry'))
                .join('\n')
                .trim();

              const steps: string[] = [];
              const stepMatches = cleaned.split(/===STEP\d+===/);
              stepMatches.forEach((s, i) => {
                if (i > 0 && s.trim()) steps.push(s.trim());
              });

              // 最後のステップからJSON抽出
              const lastStep = steps[steps.length - 1] || cleaned;
              let jsonStr = lastStep;
              if (lastStep.includes('```json')) {
                const start = lastStep.indexOf('```json') + 7;
                const end = lastStep.lastIndexOf('```');
                if (start < end) jsonStr = lastStep.substring(start, end).trim();
              } else if (lastStep.includes('```')) {
                const start = lastStep.indexOf('```') + 3;
                const end = lastStep.lastIndexOf('```');
                if (start < end) jsonStr = lastStep.substring(start, end).trim();
              } else {
                const startBrace = lastStep.indexOf('{');
                const endBrace = lastStep.lastIndexOf('}');
                if (startBrace !== -1 && endBrace > startBrace) {
                  jsonStr = lastStep.substring(startBrace, endBrace + 1);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ steps, result: jsonStr }));
            });

            proc.on('error', err => {
              try { fs.rmSync(tempDir, { recursive: true }); } catch {}
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            });

          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });

      // 既存のシングルターンエンドポイント
      server.middlewares.use('/api/gemini-cli', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { prompt, base64Images } = JSON.parse(body);
            if (!prompt || !base64Images?.length) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'prompt and base64Images required' }));
              return;
            }

            // 一時ディレクトリ作成
            const tempDir = path.join(os.tmpdir(), `gemini-cli-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            // プロンプトファイル作成
            const promptFile = path.join(tempDir, 'prompt.txt');
            fs.writeFileSync(promptFile, prompt, 'utf8');

            // 画像ファイル作成
            const imageFiles: string[] = [];
            base64Images.forEach((b64: string, i: number) => {
              const data = b64.replace(/^data:image\/\w+;base64,/, '');
              const imgPath = path.join(tempDir, `image_${i}.jpg`);
              fs.writeFileSync(imgPath, Buffer.from(data, 'base64'));
              imageFiles.push(`image_${i}.jpg`);
            });

            // PowerShellスクリプト作成
            const psScript = `
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$files = @(${imageFiles.map(f => `'${f}'`).join(', ')})
Get-Content -Raw -Encoding UTF8 'prompt.txt' | & 'gemini' -o text $files
`;
            const scriptFile = path.join(tempDir, 'run.ps1');
            fs.writeFileSync(scriptFile, psScript, 'utf8');

            console.log(`[Gemini CLI] Analyzing ${imageFiles.length} image(s)...`);
            const startTime = Date.now();

            // 実行
            const proc = spawn('powershell', [
              '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile
            ], { cwd: tempDir, shell: true });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            proc.on('close', code => {
              // クリーンアップ
              try { fs.rmSync(tempDir, { recursive: true }); } catch {}

              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(`[Gemini CLI] Done (${elapsed}s), code=${code}`);

              if (code !== 0) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: stderr || 'CLI failed' }));
                return;
              }

              // ノイズ除去
              const cleaned = stdout
                .split('\n')
                .filter(l => !l.includes('Loaded cached') && !l.includes('Hook registry'))
                .join('\n')
                .trim();

              // JSON抽出
              let jsonStr = cleaned;
              if (cleaned.startsWith('```json')) {
                const end = cleaned.lastIndexOf('```');
                const start = cleaned.indexOf('\n') + 1;
                if (start < end) jsonStr = cleaned.substring(start, end).trim();
              } else if (cleaned.startsWith('```')) {
                const end = cleaned.lastIndexOf('```');
                const start = cleaned.indexOf('\n') + 1;
                if (start < end) jsonStr = cleaned.substring(start, end).trim();
              } else {
                const startBrace = cleaned.indexOf('{');
                const endBrace = cleaned.lastIndexOf('}');
                if (startBrace !== -1 && endBrace > startBrace) {
                  jsonStr = cleaned.substring(startBrace, endBrace + 1);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(jsonStr);
            });

            proc.on('error', err => {
              try { fs.rmSync(tempDir, { recursive: true }); } catch {}
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            });

          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    }
  };
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const commitHash = getGitCommitHash();
    return {
      base: mode === 'production' ? '/TonSuuChecker/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), geminiCliPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__COMMIT_HASH__': JSON.stringify(commitHash),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
