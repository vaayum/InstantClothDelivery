jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/razorpay", () => ({ getRazorpay: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import request from "supertest";
import crypto from "crypto";
import { getPrisma } from "../src/lib/db";
import { getRazorpay } from "../src/lib/razorpay";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRazorpay = getRazorpay as jest.MockedFunction<typeof getRazorpay>;

const BASE_ORDER = {
  id: "order-1",
  razorpayOrderId: "rzp_order_1",
  paymentStatus: "PENDING",
};

function makeMockPrisma(orderOverrides: any = {}) {
  const order = { ...BASE_ORDER, ...orderOverrides };
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      findFirst: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeMockRazorpay(overrides: any = {}) {
  return {
    orders: {
      create: jest.fn().mockResolvedValue({ id: "rzp_order_new" }),
      fetchPayments: jest.fn().mockResolvedValue({
        items: [{ id: "pay_1", status: "authorized" }],
      }),
      ...(overrides.orders ?? {}),
    },
    payments: {
      capture: jest.fn().mockResolvedValue({ id: "pay_1", status: "captured" }),
      refund: jest.fn().mockResolvedValue({ id: "refund_1" }),
      ...(overrides.payments ?? {}),
    },
  };
}

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /payments/create-order ─────────────────────────────────────────────

describe("POST /payments/create-order", () => {
  it("200: creates Razorpay order and stores razorpayOrderId", async () => {
    const mockPrisma = makeMockPrisma({ razorpayOrderId: null });
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay();
    mockGetRazorpay.mockReturnValue(mockRzp as any);

    const res = await request(app)
      .post("/payments/create-order")
      .send({ orderId: "order-1", amount: 50000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ razorpayOrderId: "rzp_order_new", amount: 50000 });
    expect(mockRzp.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50000, currency: "INR", receipt: "order-1" })
    );
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" }, data: { razorpayOrderId: "rzp_order_new" } })
    );
  });

  it("400 if orderId missing", async () => {
    mockGetPrisma.mockReturnValue(makeMockPrisma() as any);
    mockGetRazorpay.mockReturnValue(makeMockRazorpay() as any);
    const res = await request(app).post("/payments/create-order").send({ amount: 50000 });
    expect(res.status).toBe(400);
  });

  it("400 if amount is a string not a number", async () => {
    mockGetPrisma.mockReturnValue(makeMockPrisma() as any);
    mockGetRazorpay.mockReturnValue(makeMockRazorpay() as any);
    const res = await request(app)
      .post("/payments/create-order")
      .send({ orderId: "order-1", amount: "50000" });
    expect(res.status).toBe(400);
  });

  it("404 if order not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.order.findUnique.mockResolvedValue(null as any);
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRazorpay.mockReturnValue(makeMockRazorpay() as any);
    const res = await request(app)
      .post("/payments/create-order")
      .send({ orderId: "no-such", amount: 50000 });
    expect(res.status).toBe(404);
  });

  it("502 if Razorpay throws", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay();
    mockRzp.orders.create.mockRejectedValue(new Error("Razorpay down"));
    mockGetRazorpay.mockReturnValue(mockRzp as any);
    const res = await request(app)
      .post("/payments/create-order")
      .send({ orderId: "order-1", amount: 50000 });
    expect(res.status).toBe(502);
  });
});

// ─── POST /payments/capture ───────────────────────────────────────────────────

describe("POST /payments/capture", () => {
  it("200: finds authorized payment, captures, sets paymentStatus=CAPTURED", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay();
    mockGetRazorpay.mockReturnValue(mockRzp as any);

    const res = await request(app)
      .post("/payments/capture")
      .send({ orderId: "order-1", amount: 50000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, paymentId: "pay_1" });
    expect(mockRzp.payments.capture).toHaveBeenCalledWith("pay_1", 50000, "INR");
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "CAPTURED" } })
    );
  });

  it("409 if order has no razorpayOrderId", async () => {
    const mockPrisma = makeMockPrisma({ razorpayOrderId: null });
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRazorpay.mockReturnValue(makeMockRazorpay() as any);
    const res = await request(app)
      .post("/payments/capture")
      .send({ orderId: "order-1", amount: 50000 });
    expect(res.status).toBe(409);
  });

  it("409 if no authorized payment found", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay({
      orders: { fetchPayments: jest.fn().mockResolvedValue({ items: [] }) },
    });
    mockGetRazorpay.mockReturnValue(mockRzp as any);
    const res = await request(app)
      .post("/payments/capture")
      .send({ orderId: "order-1", amount: 50000 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "No authorized payment found" });
  });
});

// ─── POST /payments/refund ────────────────────────────────────────────────────

describe("POST /payments/refund", () => {
  it("200: finds captured payment, refunds, sets paymentStatus=REFUNDED", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay({
      orders: {
        fetchPayments: jest.fn().mockResolvedValue({
          items: [{ id: "pay_1", status: "captured" }],
        }),
      },
    });
    mockGetRazorpay.mockReturnValue(mockRzp as any);

    const res = await request(app)
      .post("/payments/refund")
      .send({ orderId: "order-1", amount: 25000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, refundedAmount: 25000 });
    expect(mockRzp.payments.refund).toHaveBeenCalledWith("pay_1", { amount: 25000 });
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "REFUNDED" } })
    );
  });

  it("409 if no captured payment to refund", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay({
      orders: { fetchPayments: jest.fn().mockResolvedValue({ items: [] }) },
    });
    mockGetRazorpay.mockReturnValue(mockRzp as any);
    const res = await request(app)
      .post("/payments/refund")
      .send({ orderId: "order-1", amount: 25000 });
    expect(res.status).toBe(409);
  });
});

// ─── POST /payments/charge-noshow ─────────────────────────────────────────────

describe("POST /payments/charge-noshow", () => {
  it("200: creates Razorpay order for 9900 paise (₹99 default)", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const mockRzp = makeMockRazorpay();
    mockGetRazorpay.mockReturnValue(mockRzp as any);

    const res = await request(app)
      .post("/payments/charge-noshow")
      .send({ orderId: "order-1" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ razorpayOrderId: "rzp_order_new", amount: 9900 });
    expect(mockRzp.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9900, receipt: "noshow-order-1" })
    );
  });

  it("400 if orderId missing", async () => {
    mockGetPrisma.mockReturnValue(makeMockPrisma() as any);
    mockGetRazorpay.mockReturnValue(makeMockRazorpay() as any);
    const res = await request(app).post("/payments/charge-noshow").send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST /payments/webhook ───────────────────────────────────────────────────

describe("POST /payments/webhook", () => {
  const secret = "test-webhook-secret";

  function sign(body: object) {
    return crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
  }

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  });

  it("200: payment.captured → paymentStatus=CAPTURED", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const body = {
      event: "payment.captured",
      payload: { payment: { entity: { order_id: "rzp_order_1" } } },
    };
    const res = await request(app)
      .post("/payments/webhook")
      .set("x-razorpay-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { razorpayOrderId: "rzp_order_1" }, data: { paymentStatus: "CAPTURED" } })
    );
  });

  it("200: payment.authorized → paymentStatus=AUTHORIZED", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const body = {
      event: "payment.authorized",
      payload: { payment: { entity: { order_id: "rzp_order_1" } } },
    };
    const res = await request(app)
      .post("/payments/webhook")
      .set("x-razorpay-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "AUTHORIZED" } })
    );
  });

  it("200: unknown event — no DB update, returns ok", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const body = {
      event: "some.unknown.event",
      payload: { payment: { entity: { order_id: "rzp_order_1" } } },
    };
    const res = await request(app)
      .post("/payments/webhook")
      .set("x-razorpay-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("400 if signature is invalid", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const body = {
      event: "payment.captured",
      payload: { payment: { entity: { order_id: "rzp_order_1" } } },
    };
    const res = await request(app)
      .post("/payments/webhook")
      .set("x-razorpay-signature", "bad-sig-xxxxxxxx")
      .send(body);
    expect(res.status).toBe(400);
    expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
  });
});
