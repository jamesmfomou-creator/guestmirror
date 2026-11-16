import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";

// Signature verification and idempotence of the webhook route, with events
// signed locally (no Stripe network call, no real payment).

const SECRET = "whsec_test_local_only";
let POST: (req: NextRequest) => Promise<Response>;
let store: typeof import("@/lib/store");

beforeAll(async () => {
  process.env.TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "gm-webhook-route-"));
  process.env.STRIPE_SECRET_KEY = "sk_test_local_only";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  POST = (await import("./route")).POST;
  store = await import("@/lib/store");
});

function signed(payload: string, secret = SECRET) {
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": header, "content-type": "application/json" },
  });
}

describe("POST /api/stripe/webhook", () => {
  it("rejects a missing or wrong signature", async () => {
    const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } });
    expect((await POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload }))).status).toBe(400);
    expect((await POST(signed(payload, "whsec_wrong"))).status).toBe(400);
  });

  it("applies a delivered event once, and acknowledges a redelivery without re-applying it", async () => {
    const analysis = await store.createAnalysis({
      input: { listing_url: null, city: null, property_type: null, guest_capacity: null, nightly_price: null },
      images: [],
      result: { overall_score: 40 } as never,
      email: "route@example.com",
    });
    const payload = JSON.stringify({
      id: "evt_route_1",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: "cs_route_1",
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_route_1",
          customer_details: { email: "route@example.com" },
          amount_total: 790,
          currency: "eur",
          metadata: { app: "guestmirror", offer: "one_time", analysisId: analysis.id },
        },
      },
    });
    const first = await POST(signed(payload));
    expect(first.status).toBe(200);
    expect((await store.getAnalysis(analysis.id))?.is_unlocked).toBe(true);

    const second = await POST(signed(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
  });
});
