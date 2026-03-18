import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(
  __dirname,
  "../workers/embedding_worker.py"
);

export const embedTexts = (texts = []) =>
  new Promise((resolve, reject) => {
    if (!Array.isArray(texts) || texts.length === 0) {
      resolve([]);
      return;
    }

    const proc = spawn("python3", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Embedding worker exited ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed.vectors || []);
      } catch (err) {
        reject(err);
      }
    });

    proc.stdin.write(JSON.stringify({ texts }));
    proc.stdin.end();
  });
