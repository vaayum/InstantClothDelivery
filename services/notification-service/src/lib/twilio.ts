import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!client) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID ?? "",
      process.env.TWILIO_AUTH_TOKEN ?? ""
    );
  }
  return client;
}

export async function sendSms(to: string, body: string): Promise<void> {
  try {
    await getClient().messages.create({ to, from: process.env.TWILIO_FROM ?? "", body });
  } catch (err) {
    console.error("[twilio] SMS failed:", err);
  }
}
