import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "../workers/embedding_worker.py");

let workerProcess = null;
let workerInterface = null;
let pendingQueue = [];

const startWorker = () => {
  if (workerProcess) return;

  workerProcess = spawn("python3", [WORKER_PATH, "--server"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  workerInterface = readline.createInterface({
    input: workerProcess.stdout,
  });

  workerInterface.on("line", (line) => {
    const pending = pendingQueue.shift();
    if (!pending) return;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.error) {
        pending.reject(new Error(parsed.error));
        return;
      }
      pending.resolve(parsed?.vectors || []);
    } catch (err) {
      pending.reject(err);
    }
  });

  workerProcess.stderr.on("data", (data) => {
    console.warn("[embedding] worker stderr", data.toString());
  });

  workerProcess.on("close", (code) => {
    const err = new Error(`Embedding worker exited ${code}`);
    pendingQueue.forEach((pending) => pending.reject(err));
    pendingQueue = [];
    workerProcess = null;
    if (workerInterface) {
      workerInterface.close();
      workerInterface = null;
    }
  });
};

export const embedTexts = (texts = []) =>
  new Promise((resolve, reject) => {
    if (!Array.isArray(texts) || texts.length === 0) {
      resolve([]);
      return;
    }

    startWorker();

    if (!workerProcess?.stdin?.writable) {
      reject(new Error("Embedding worker is not available"));
      return;
    }

    pendingQueue.push({ resolve, reject });
    workerProcess.stdin.write(`${JSON.stringify({ texts })}\n`);
  });
