import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URL = process.env.MONGO_URL;

export const connectDB = async (cb) => {
  try {
    await mongoose.connect(MONGODB_URL);
    cb();
  } catch (error) {
    console.error("Error:", error);
  }
};