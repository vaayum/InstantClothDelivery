import twilio from "twilio";

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_PHONE_NUMBER ?? "";

  if (!sid || !token || !from || !sid.startsWith("AC")) {
    console.log(`[twilio] no credentials — OTP for ${to}: ${body}`);
    return;
  }

  const client = twilio(sid, token);
  await client.messages.create({ body, from, to });
}
