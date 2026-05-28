import { NativeModules, Alert } from "react-native";

export interface RazorpayOptions {
  description?: string;
  currency: string;
  key: string;
  amount: number;
  name?: string;
  order_id: string;
  prefill?: { email?: string; contact?: string; name?: string };
  theme?: { color?: string };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

function devMockCheckout(options: RazorpayOptions): Promise<RazorpaySuccessResponse> {
  return new Promise((resolve, reject) => {
    Alert.alert(
      "Razorpay — Dev Mode",
      `₹${(options.amount / 100).toFixed(0)} · Native SDK not linked (Expo Go).\nBuild with EAS for real payments.\n\nSimulate:`,
      [
        {
          text: "✓ Payment Success",
          onPress: () =>
            resolve({
              razorpay_payment_id: `pay_dev_${Date.now()}`,
              razorpay_order_id: options.order_id,
              razorpay_signature: "dev_signature_mock",
            }),
        },
        {
          text: "✗ Payment Failed",
          style: "destructive",
          onPress: () => reject({ description: "Payment cancelled (simulated)" }),
        },
      ]
    );
  });
}

const RazorpayCheckout = {
  open(options: RazorpayOptions): Promise<RazorpaySuccessResponse> {
    if (NativeModules.RazorpayCheckout) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-razorpay");
      const sdk = mod?.default ?? mod;
      return sdk.open(options) as Promise<RazorpaySuccessResponse>;
    }
    return devMockCheckout(options);
  },
};

export default RazorpayCheckout;
