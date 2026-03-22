import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabase } from "../_shared/supabase.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";

/**
 * Generate Payment Link Edge Function
 *
 * Creates a Razorpay payment link for an order.
 * Accepts POST with JSON body: { order_id: string, amount: number, customer_name?: string, customer_phone?: string }
 * Returns: { payment_link_url: string }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { order_id, amount, customer_name, customer_phone, description } =
      await req.json();

    if (!order_id || !amount) {
      return new Response(
        JSON.stringify({ error: "order_id and amount are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(
        JSON.stringify({ error: "Razorpay credentials not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Razorpay Payment Link
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const razorpayPayload: any = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: "INR",
      description: description || `Payment for order`,
      reference_id: order_id,
      callback_url: `https://t.me`,
      callback_method: "get",
    };

    if (customer_name || customer_phone) {
      razorpayPayload.customer = {};
      if (customer_name) razorpayPayload.customer.name = customer_name;
      if (customer_phone) razorpayPayload.customer.contact = customer_phone;
    }

    const rpRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(razorpayPayload),
    });

    if (!rpRes.ok) {
      const errorText = await rpRes.text();
      console.error("Razorpay error:", rpRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create payment link" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const rpData = await rpRes.json();
    const paymentLinkUrl = rpData.short_url || rpData.url;

    // Update order with payment link
    await supabase
      .from("orders")
      .update({ payment_link: paymentLinkUrl })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        payment_link_url: paymentLinkUrl,
        payment_link_id: rpData.id,
        order_id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("Payment link error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
