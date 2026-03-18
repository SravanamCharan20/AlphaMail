import json
import os
import sys
from typing import List

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("USE_TORCH", "1")

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    model = get_model()
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return vectors.tolist()

def serve():
    # Warm the model once.
    get_model()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            texts = payload.get("texts", [])
            if not isinstance(texts, list) or not texts:
                print(json.dumps({"error": "Expected JSON with 'texts': [..]"}), flush=True)
                continue
            vectors = embed_texts(texts)
            print(json.dumps({"dim": len(vectors[0]) if vectors else 0, "vectors": vectors}), flush=True)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}), flush=True)


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--text":
        text = " ".join(sys.argv[2:]).strip()
        if not text:
            print(json.dumps({"error": "Empty text"}))
            sys.exit(1)
        vec = embed_texts([text])[0]
        print(json.dumps({"dim": len(vec), "preview": vec[:8]}))
        return

    if len(sys.argv) >= 2 and sys.argv[1] == "--server":
        serve()
        return

    payload_raw = sys.stdin.read().strip()
    if not payload_raw:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)

    payload = json.loads(payload_raw)
    texts = payload.get("texts", [])
    if not isinstance(texts, list) or not texts:
        print(json.dumps({"error": "Expected JSON with 'texts': [..]"}))
        sys.exit(1)

    vectors = embed_texts(texts)
    print(json.dumps({"dim": len(vectors[0]), "vectors": vectors}))


if __name__ == "__main__":
    main()
