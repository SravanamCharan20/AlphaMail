import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

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
