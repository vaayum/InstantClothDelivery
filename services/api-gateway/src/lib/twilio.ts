import twilio from "twilio";

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_PHONE_NUMBER ?? "";

  const isPlaceholder = !sid || !token || !from ||
    !sid.startsWith("AC") || token === "REPLACE_ME" || from.includes("X");

  if (isPlaceholder) {
    console.log(`[twilio] no credentials — OTP for ${to}: ${body}`);
    return;
  }

  try {
    const client = twilio(sid, token);
    await client.messages.create({ body, from, to });
  } catch (err) {
    console.log(`[twilio] send failed — OTP for ${to}: ${body}`);
  }
}
