import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "../workers/embedding_worker.py");

let workerProcess = null;
let workerInterface = null;
let pendingQueue = [];
let workerUnavailableError = null;

const startWorker = () => {
  if (workerProcess || workerUnavailableError) return;

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

  workerProcess.on("error", (err) => {
    workerUnavailableError = new Error(`Failed to start embedding worker: ${err.message}`);
    pendingQueue.forEach((pending) => pending.reject(workerUnavailableError));
    pendingQueue = [];
  });

  workerProcess.stdin.on("error", (err) => {
    if (err?.code === "EPIPE") {
      workerUnavailableError = new Error(
        "Embedding worker pipe closed. Install Python dependencies with: python3 -m pip install -r workers/requirements-embeddings.txt"
      );
    } else {
      workerUnavailableError = new Error(`Embedding worker stdin error: ${err.message}`);
    }
    pendingQueue.forEach((pending) => pending.reject(workerUnavailableError));
    pendingQueue = [];
  });

  workerProcess.on("close", (code) => {
    let err = new Error(`Embedding worker exited ${code}`);
    if (code !== 0) {
      err = new Error(
        "Embedding worker failed to start. Install Python dependencies with: python3 -m pip install -r workers/requirements-embeddings.txt"
      );
      workerUnavailableError = err;
    }
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

    if (workerUnavailableError) {
      reject(workerUnavailableError);
      return;
    }

    if (!workerProcess?.stdin?.writable) {
      reject(new Error("Embedding worker is not available"));
      return;
    }

    pendingQueue.push({ resolve, reject });
    workerProcess.stdin.write(`${JSON.stringify({ texts })}\n`, (err) => {
      if (!err) return;
      pendingQueue.pop();
      reject(
        new Error(
          `Failed to send request to embedding worker: ${err.message}. Run: python3 -m pip install -r workers/requirements-embeddings.txt`
        )
      );
    });
  });
