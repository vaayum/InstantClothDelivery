import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { signJwt, requireAuth } from "@threaddash/auth";
import { getRedis } from "../lib/redis";
import { sendSms } from "../lib/twilio";

const router = Router();
const prisma = new PrismaClient();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/send-otp", async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  const otp = generateOtp();
  const redis = getRedis();
  await redis.set(`otp:${phone}`, otp, "EX", 300);
  await sendSms(phone, `Your ThreadDash OTP is ${otp}. Valid for 5 minutes.`);
  res.json({ message: "OTP sent" });
});

router.post("/verify-otp", async (req, res): Promise<void> => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ error: "phone and otp are required" });
    return;
  }
  const redis = getRedis();
  const stored = await redis.get(`otp:${phone}`);
  if (!stored || stored !== otp) {
    res.status(401).json({ error: "Invalid or expired OTP" });
    return;
  }
  await redis.del(`otp:${phone}`);

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: "New User" } });
  }

  const token = signJwt({ userId: user.id, role: user.role, phone: user.phone });
  res.json({ token, user: { id: user.id, role: user.role, phone: user.phone } });
});

router.post("/admin-login", async (req, res): Promise<void> => {
  const { secret } = req.body as { secret?: string };
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || !secret || secret !== adminSecret) {
    res.status(401).json({ error: "Invalid admin secret" });
    return;
  }
  const token = signJwt({ userId: "admin", role: "ADMIN", phone: "" });
  res.json({ token });
});

router.patch("/fcm-token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  await (prisma.user as any).update({ where: { id: req.user!.userId }, data: { fcmToken: token } });
  res.json({ success: true });
});

export default router;
