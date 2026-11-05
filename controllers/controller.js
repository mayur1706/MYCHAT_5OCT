import redisClient from "../config/redis.js";
import express from "express";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { uploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.post("/send-otp", async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required" });
        }

        const otp = "1234";

        await redisClient.set(`otp:${phone}`, otp, {
            EX: 300,
        });

        let user = await User.findOne({ phone });

        if (!user) {
            user = new User({
                phone,
            });
        }

        user.is_verified = false;
        await user.save();

        console.log("Generated OTP:", otp);

        return res.json({
            success: true,
            message: "OTP generated successfully",
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

router.post("/verify-otp", async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone and OTP are required",
            });
        }

        const user = await User.findOne({ phone });

        if (!user) return res.status(400).json({ success: false, message: "User not found" });

        const savedOtp = await redisClient.get(`otp:${phone}`);

        if (!savedOtp) {
            return res.status(400).json({
                success: false,
                message: "OTP expired or not found",
            });
        }

        if (savedOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        await redisClient.del(`otp:${phone}`);

        user.is_verified = true;
        await user.save();

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        return res.json({
            success: true,
            token,
            user,
            message: "OTP verified successfully",
        });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

router.get("/get_all_users", authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ is_verified: true })
            .sort({ createdAt: -1 })
            .lean();

        const currentUserId = (req.user._id || req.user.userId || req.user.id).toString();

        const updatedUsers = users.map((user) => ({
            ...user,
            isSelf: user._id.toString() === currentUserId
        }));

        return res.json({
            success: true,
            users: updatedUsers,
        });

    } catch (error) {
        console.log("Server error", error);
        return res.status(500).json({ message: error.message });
    }
});


router.get("/get_user_chats", authMiddleware, async (req, res) => {
    try {
        const currentUserId = (req.user._id || req.user.userId || req.user.id).toString();

        const chats = await Chat.find({
            participants: currentUserId
        })
            .populate("participants", "name phone avatar isOnline lastSeen")
            .populate("groupAdmins", "name phone avatar")
            .populate("latestMessage")
            .sort({ updatedAt: -1 });

        return res.json({
            success: true,
            chats
        });
    } catch (error) {
        console.log("Get User Chats Error:", error);
        return res.status(500).json({ message: error.message });
    }
});

router.post("/create_chat", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        const currentUserId = (req.user._id || req.user.userId || req.user.id).toString();

        // Validate userId
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const isSelfChat = currentUserId.toString() === userId.toString();

        // Check whether user exists
        const user = await User.findOne({
            _id: userId,
            is_verified: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Find existing chat
        const participantsFilter = isSelfChat
            ? [currentUserId]
            : [currentUserId, userId];

        let chat = await Chat.findOne({
            isGroupChat: false,
            participants: {
                $all: participantsFilter,
                $size: participantsFilter.length
            }
        }).populate("participants", "name phone avatar");

        if (chat) {
            return res.status(200).json({
                success: true,
                message: "Chat already exists",
                chat
            });
        }

        // Create new chat (supports both self-chat and 1-on-1 chat)
        chat = await Chat.create({
            isGroupChat: false,
            participants: participantsFilter
        });

        chat = await chat.populate(
            "participants",
            "name phone avatar"
        );

        return res.status(201).json({
            success: true,
            message: "Chat created successfully",
            chat
        });

    } catch (error) {
        console.log("Access Chat Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get("/get_messages/:chatId", authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req.user._id || req.user.userId || req.user.id).toString();

        const chat = await Chat.findById(chatId);

        if (!chat) {
            return res.status(404).json({
                success: false,
                message: "Chat not found"
            });
        }

        const isParticipant = chat.participants.some(
            (p) => p.toString() === currentUserId
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this chat"
            });
        }

        const messages = await Message.find({
            chatId,
            deletedFor: { $ne: currentUserId }
        })
            .populate("sender", "name phone avatar")
            .sort({ createdAt: 1 });

        return res.json({
            success: true,
            messages
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


router.post("/create-group", authMiddleware, uploadMiddleware.single("groupAvatar"),
    async (req, res) => {
        try {
            const { chatName, participants } = req.body;
            const creatorId = (req.user._id || req.user.userId || req.user.id).toString();

            if (!chatName?.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Group name is required"
                });
            }

            let memberIds = JSON.parse(participants);

            if (!Array.isArray(memberIds) || memberIds.length < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Select at least one member"
                });
            }

            memberIds = [
                ...new Set(memberIds.map(id => id.toString()))
            ].filter(id => id !== creatorId.toString());

            if (memberIds.length < 1) {
                return res.status(400).json({
                    success: false,
                    message: "At least one other member is required"
                });
            }

            const users = await User.find({
                _id: { $in: memberIds },
                is_verified: true
            });

            if (users.length !== memberIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more users are invalid"
                });
            }

            const group = await Chat.create({
                isGroupChat: true,
                chatName: chatName.trim(),
                groupAvatar: req.file
                    ? `/uploads/${req.file.filename}`
                    : null,
                groupAdmins: [creatorId],
                participants: [creatorId, ...memberIds]
            });

            const populatedGroup = await Chat.findById(group._id)
                .populate("participants", "name phone avatar")
                .populate("groupAdmins", "name phone avatar");

            // Realtime Notify all participants about new group creation
            if (req.io) {
                for (const memberId of memberIds) {
                    req.io.to(memberId.toString()).emit("group-created", {
                        group: populatedGroup
                    });
                }
            }

            return res.status(201).json({
                success: true,
                message: "Group created successfully",
                group: populatedGroup
            });

        } catch (error) {
            console.log("Create Group Error:", error);

            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

export default router;
