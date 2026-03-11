import express from 'express';
import { connectDB } from "./config/db.js";
import dotenv from 'dotenv';
import userAuthRouter from './routes/userAuthRouter.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 9000;


// Routes
// Production Health Checking Routes
app.get('/health',(req,res) => {
    res.send("Backend is Working")
})
app.get('/',(req,res) => {
    res.send("Backend is Working")
})

// Actual Routes
app.use('/auth',userAuthRouter);




connectDB(() => {
  console.log("DB Connection Successful..");
  app.listen(PORT, () => {
    console.log(`server is running at ${PORT}`);
  });
});
