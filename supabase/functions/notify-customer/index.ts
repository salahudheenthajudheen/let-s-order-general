import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabase } from "../_shared/supabase.ts";
import { sendMessage, sendDocument } from "../_shared/telegram.ts";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  try {
    const { order_id, status } = await req.json();

    if (!order_id || !status) {
      return new Response("Missing order_id or status", { status: 400, headers: corsHeaders });
    }

    // Fetch full order context
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, customer:customers(*), seller:sellers(*)")
      .eq("id", order_id)
      .single();

    if (error || !order) {
      console.error("Order fetch error:", error);
      return new Response("Order not found", { status: 404, headers: corsHeaders });
    }

    const tgId = order.customer?.telegram_id;
    if (!tgId) {
      return new Response("No telegram ID attached to customer", { status: 200, headers: corsHeaders });
    }

    // Construct status message
    let statusMsg = "";
    if (status === "accepted") {
      statusMsg = `✅ *Order Accepted!*\n\nYour order for ${order.quantity}x ${order.product} has been accepted by ${order.seller?.name || 'the seller'}.`;
    } else if (status === "rejected") {
      statusMsg = `❌ *Order Rejected*\n\nUnfortunately, your order for ${order.quantity}x ${order.product} could not be fulfilled at this time.`;
    } else if (status === "dispatched") {
      statusMsg = `🚚 *Order Dispatched!*\n\nYour ${order.product} is on the way from ${order.seller?.name || 'the seller'}.`;
    } else if (status === "delivered") {
      statusMsg = `📦 *Order Delivered!*\n\nYour ${order.product} has arrived safely! Thank you for using Let's Order.`;
    } else {
      statusMsg = `📋 *Order Update*\n\nYour order for ${order.product} is now: *${status}*.`;
    }

    await sendMessage(tgId, statusMsg);

    // If delivered, generate and send PDF Invoice
    if (status === "delivered") {
      // 1. Create a new PDFDocument
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 400]);

      const { width, height } = page.getSize();
      
      page.drawText(`INVOICE RECEIPT`, { x: 50, y: height - 50, size: 24, color: rgb(0, 0, 0) });
      page.drawText(`Order ID: #${order.id.split('-')[0]}`, { x: 50, y: height - 90, size: 12 });
      page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 50, y: height - 110, size: 12 });
      
      page.drawText(`Seller: ${order.seller?.name || 'Local Seller'}`, { x: 50, y: height - 150, size: 14 });
      page.drawText(`Customer: ${order.customer?.name || 'Valued Customer'}`, { x: 50, y: height - 170, size: 14 });
      
      page.drawText(`Items:`, { x: 50, y: height - 210, size: 14 });
      page.drawText(`- ${order.quantity}x ${order.product}`, { x: 70, y: height - 230, size: 12 });
      
      page.drawText(`Thank you for doing business with us!`, { x: 50, y: height - 300, size: 14, color: rgb(0, 0.5, 0) });

      // Serialize the PDFDocument to bytes (a Uint8Array)
      const pdfBytes = await pdfDoc.save();

      // Send the document via Telegram
      await sendDocument(
        tgId,
        pdfBytes,
        `Invoice_${order.id.split('-')[0]}.pdf`,
        `📄 Here is your official invoice for this delivery.`
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("notify-customer error:", err);
    return new Response(err.message, { status: 500, headers: corsHeaders });
  }
});
