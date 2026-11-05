import dotenv from "dotenv";
dotenv.config();
import { createClient } from "redis";

const redisClient = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
    },
});

redisClient.on("error", (err) => {
    console.log("Redis Client Error:", err);
});

redisClient.on("connect", () => {
    console.log("Redis Connecting...");
});

redisClient.on("ready", () => {
    console.log("Redis Connected Successfully!");
});

export default redisClient;