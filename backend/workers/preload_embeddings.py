import os

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("USE_TORCH", "1")

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

def main():
    SentenceTransformer(MODEL_NAME)
    print(f"✅ Cached: {MODEL_NAME}")

if __name__ == "__main__":
    main()
