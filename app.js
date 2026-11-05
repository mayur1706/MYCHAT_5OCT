import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Server } from "socket.io";
import redisClient from "./config/redis.js";
import routes from "./controllers/controller.js";
import initializeSocket from "./config/socket.js";

dotenv.config();
redisClient.connect().catch(console.error);
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Attach io instance to req so controllers can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use("/api", routes);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

initializeSocket(io);


// Test API
app.get("/", (req, res) => {
  res.json({ message: "WhatsApp Clone Backend Running" });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});