import { Chat, Message } from "../models/index.js";

export const chatSocket = (io, socket) => {

    socket.on("join-chat", async (chatId) => {
        try {
            const chat = await Chat.findOne({
                _id: chatId,
                participants: socket.userId
            });

            if (!chat) {
                return socket.emit("socket-error", {
                    message: "Chat not found or access denied"
                });
            }

            socket.join(chatId.toString());

            console.log(`${socket.userId} joined room: ${chatId}`);

            socket.emit("chat-joined", {
                success: true,
                chatId
            });

        } catch (error) {
            socket.emit("socket-error", {
                message: "Unable to join chat"
            });
        }
    });


    socket.on("send-message", async (data) => {
        try {
            const { chatId, text } = data;

            // Validate message
            if (!chatId || !text?.trim()) {
                return socket.emit("socket-error", {
                    message: "Chat ID and message text are required"
                });
            }

            // Check chat membership
            const chat = await Chat.findOne({
                _id: chatId,
                participants: socket.userId
            });

            if (!chat) {
                return socket.emit("socket-error", {
                    message: "Chat not found or access denied"
                });
            }

            // Save message in MongoDB
            const message = await Message.create({
                chatId,
                sender: socket.userId,
                text: text.trim(),
                messageType: "text"
            });

            // Update latest message
            chat.latestMessage = message._id;
            await chat.save();

            // Populate sender details
            const populatedMessage = await Message.findById(message._id)
                .populate("sender", "name phone avatar");

            // Send message to everyone in the chat room
            io.to(chatId.toString()).emit(
                "receive-message",
                populatedMessage
            );

        } catch (error) {
            console.error("Send Message Error:", error);

            socket.emit("socket-error", {
                message: "Unable to send message"
            });
        }
    });


    socket.on("message-read", async ({ chatId }) => {
        try {
            const chat = await Chat.findOne({
                _id: chatId,
                participants: socket.userId
            });

            if (!chat) return;

            const messages = await Message.find({
                chatId,
                sender: { $ne: socket.userId },
                status: { $ne: "read" }
            });

            for (const message of messages) {

                const alreadyRead = message.readBy.some(
                    (item) => item.user.toString() === socket.userId.toString()
                );

                if (!alreadyRead) {
                    message.readBy.push({
                        user: socket.userId,
                        readAt: new Date()
                    });
                }

                message.status = "read";
                await message.save();

                io.to(chatId.toString()).emit("message-status", {
                    messageId: message._id,
                    chatId,
                    status: "read"
                });
            }

        } catch (error) {
            console.log("Message Read Error:", error);
        }
    });


    socket.on("message-delivered", async ({ messageId }) => {
        try {
            const message = await Message.findById(messageId);

            if (!message || message.sender.toString() === socket.userId.toString()) {
                return;
            }

            const chat = await Chat.findOne({
                _id: message.chatId,
                participants: socket.userId
            });

            if (!chat) return;

            if (message.status === "sent") {
                message.status = "delivered";
                await message.save();

                io.to(message.chatId.toString()).emit("message-status", {
                    messageId: message._id,
                    chatId: message.chatId,
                    status: "delivered"
                });
            }

        } catch (error) {
            console.log("Message Delivered Error:", error);
        }
    });

    socket.on("typing", async ({ chatId }) => {
        try {
            const chat = await Chat.findOne({
                _id: chatId,
                participants: socket.userId
            });

            if (!chat) return;

            socket.to(chatId.toString()).emit("user-typing", {
                chatId,
                userId: socket.userId,
                isTyping: true
            });

        } catch (error) {
            console.log("Typing Error:", error);
        }
    });


    socket.on("stop-typing", async ({ chatId }) => {
        try {
            const chat = await Chat.findOne({
                _id: chatId,
                participants: socket.userId
            });

            if (!chat) return;

            socket.to(chatId.toString()).emit("user-typing", {
                chatId,
                userId: socket.userId,
                isTyping: false
            });

        } catch (error) {
            console.log("Stop Typing Error:", error);
        }
    });

    socket.on("delete-message", async ({ messageId, deleteType }) => {
        try {
            const message = await Message.findById(messageId);

            if (!message) {
                return socket.emit("socket-error", {
                    message: "Message not found"
                });
            }

            const chat = await Chat.findOne({
                _id: message.chatId,
                participants: socket.userId
            });

            if (!chat) {
                return socket.emit("socket-error", {
                    message: "Access denied"
                });
            }

            // Delete for me
            if (deleteType === "me") {

                if (!message.deletedFor.some(
                    id => id.toString() === socket.userId.toString()
                )) {
                    message.deletedFor.push(socket.userId);
                    await message.save();
                }

                socket.emit("message-deleted", {
                    messageId,
                    deleteType: "me"
                });

            }

            // Delete for everyone
            else if (deleteType === "everyone") {

                // Only sender can delete for everyone
                if (message.sender.toString() !== socket.userId.toString()) {
                    return socket.emit("socket-error", {
                        message: "Only sender can delete this message"
                    });
                }

                message.isDeleted = true;
                message.text = "This message was deleted";
                message.mediaUrl = null;

                await message.save();

                io.to(message.chatId.toString()).emit("message-deleted", {
                    messageId,
                    deleteType: "everyone",
                    text: "This message was deleted"
                });

            }

        } catch (error) {
            console.log("Delete Message Error:", error);

            socket.emit("socket-error", {
                message: "Unable to delete message"
            });
        }
    });

};