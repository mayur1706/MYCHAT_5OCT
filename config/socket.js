import { socketAuth } from "../middlewares/index.js";
import { User } from "../models/user.model.js";
import { chatSocket } from "../sockets/chatSocket.js";

const initializeSocket = (io) => {

    io.use(socketAuth);

    io.on("connection", async (socket) => {

        console.log("User Connected:", socket.userId);
        console.log("Socket ID:", socket.id);

        // Join personal user room so backend can send private events (e.g. added to a new group)
        socket.join(socket.userId.toString());

        try {
            // User Online
            await User.findByIdAndUpdate(socket.userId, {
                isOnline: true,
                socketId: socket.id
            });

            // Broadcast Online Status
            io.emit("user-status", {
                userId: socket.userId,
                isOnline: true,
                lastSeen: null
            });

        } catch (error) {
            console.log("Online Status Error:", error);
        }

        // Chat Events
        chatSocket(io, socket);

        // User Disconnect
        socket.on("disconnect", async () => {

            console.log("User Disconnected:", socket.userId);

            try {
                const lastSeen = new Date();

                // User Offline
                const user = await User.findOneAndUpdate(
                    {
                        _id: socket.userId,
                        socketId: socket.id
                    },
                    {
                        isOnline: false,
                        lastSeen,
                        socketId: null
                    },
                    { new: true }
                );

                // Broadcast Offline Status
                if (user) {
                    io.emit("user-status", {
                        userId: socket.userId,
                        isOnline: false,
                        lastSeen
                    });
                }

            } catch (error) {
                console.log("Offline Status Error:", error);
            }

        });

    });

};

export default initializeSocket;
