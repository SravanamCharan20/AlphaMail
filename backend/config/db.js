import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URL = process.env.MONGO_URL;

export const connectDB = async (cb) => {
  try {
    if (!MONGODB_URL) {
      throw new Error("MONGO_URL is not set");
    }
    await mongoose.connect(MONGODB_URL);
    console.log("DB Connected...");
    if (cb) cb();
  } catch (error) {
    console.error("Error:", error);
  }
};
