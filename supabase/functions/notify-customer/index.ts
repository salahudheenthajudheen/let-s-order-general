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
      // Fetch product price dynamically since order table only stores name and quantity
      let fetchedRate = 50; // Fallback
      if (order.seller_id && order.product) {
        const { data: prodData } = await supabase
          .from("products")
          .select("price")
          .eq("name", order.product)
          .eq("seller_id", order.seller_id)
          .single();
        if (prodData && prodData.price) {
          fetchedRate = Number(prodData.price);
        }
      }

      const pdfDoc = await PDFDocument.create();
      // standard A4 size is [595.28, 841.89]
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();
      
      const black = rgb(0,0,0);
      const gray = rgb(0.3,0.3,0.3);
      
      // Header
      page.drawText(`TAX INVOICE`, { x: 230, y: height - 50, size: 20, color: black });
      
      page.drawLine({
        start: { x: 40, y: height - 70 },
        end: { x: width - 40, y: height - 70 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Seller Details
      page.drawText(`Sold By:`, { x: 40, y: height - 90, size: 10, color: gray });
      page.drawText(order.seller?.name || 'Local Seller', { x: 40, y: height - 105, size: 12, color: black });
      page.drawText(`GSTIN: 29ABCDE1234F1Z5`, { x: 40, y: height - 120, size: 10, color: gray }); // Placeholder standard GST format
      page.drawText(`Bangalore, India`, { x: 40, y: height - 135, size: 10, color: gray });

      // Buyer Details
      page.drawText(`Billed To:`, { x: width / 2, y: height - 90, size: 10, color: gray });
      page.drawText(order.customer?.name || 'Valued Customer', { x: width / 2, y: height - 105, size: 12, color: black });
      page.drawText(`Contact: ${order.customer?.phone || 'N/A'}`, { x: width / 2, y: height - 120, size: 10, color: gray });

      // Invoice Meta
      const invNo = `INV-${order.id.split('-')[0].toUpperCase()}`;
      page.drawText(`Invoice No: ${invNo}`, { x: width - 200, y: height - 90, size: 10, color: black });
      page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: width - 200, y: height - 105, size: 10, color: black });
      page.drawText(`Place of Supply: 29-Karnataka`, { x: width - 200, y: height - 120, size: 10, color: black });

      // Table Header (using a drawn border instead of a filled rectangle to avoid missing method issues)
      const tabY = height - 175;
      page.drawText(`Sl No.`, { x: 45, y: tabY, size: 10, color: black });
      page.drawText(`Description of Goods`, { x: 90, y: tabY, size: 10, color: black });
      page.drawText(`HSN/SAC`, { x: 280, y: tabY, size: 10, color: black });
      page.drawText(`Qty`, { x: 350, y: tabY, size: 10, color: black });
      page.drawText(`Rate`, { x: 400, y: tabY, size: 10, color: black });
      page.drawText(`Amount (INR)`, { x: 470, y: tabY, size: 10, color: black });

      // Table Row
      const rowY = height - 200;
      const rate = fetchedRate;
      const amount = order.quantity * rate;
      page.drawText(`1`, { x: 45, y: rowY, size: 10, color: black });
      page.drawText(order.product, { x: 90, y: rowY, size: 10, color: black });
      page.drawText(`9900`, { x: 280, y: rowY, size: 10, color: black });
      page.drawText(`${order.quantity}`, { x: 350, y: rowY, size: 10, color: black });
      page.drawText(`Rs. ${rate}`, { x: 400, y: rowY, size: 10, color: black });
      page.drawText(`Rs. ${amount}`, { x: 470, y: rowY, size: 10, color: black });

      // Table Border lines
      page.drawLine({ start: { x: 40, y: height - 160 }, end: { x: width - 40, y: height - 160 }, thickness: 1, color: gray }); // top of header
      page.drawLine({ start: { x: 40, y: height - 180 }, end: { x: width - 40, y: height - 180 }, thickness: 1, color: gray }); // bottom of header
      page.drawLine({ start: { x: 40, y: height - 210 }, end: { x: width - 40, y: height - 210 }, thickness: 1, color: gray }); // bottom of row
      
      // Totals
      // GST calculation (assumed 5% total)
      const cgst = amount * 0.025;
      const sgst = amount * 0.025;
      const total = amount + cgst + sgst;
      
      let totY = height - 230;
      page.drawText(`Taxable Value:`, { x: 350, y: totY, size: 10, color: black });
      page.drawText(`Rs. ${amount.toFixed(2)}`, { x: 470, y: totY, size: 10, color: black });
      
      totY -= 15;
      page.drawText(`CGST @ 2.5%:`, { x: 350, y: totY, size: 10, color: black });
      page.drawText(`Rs. ${cgst.toFixed(2)}`, { x: 470, y: totY, size: 10, color: black });
      
      totY -= 15;
      page.drawText(`SGST @ 2.5%:`, { x: 350, y: totY, size: 10, color: black });
      page.drawText(`Rs. ${sgst.toFixed(2)}`, { x: 470, y: totY, size: 10, color: black });

      totY -= 20;
      page.drawLine({ start: { x: 350, y: totY + 10 }, end: { x: width - 40, y: totY + 10 }, thickness: 1, color: black });
      page.drawText(`Grand Total:`, { x: 350, y: totY - 5, size: 12, color: black });
      page.drawText(`Rs. ${total.toFixed(2)}`, { x: 470, y: totY - 5, size: 12, color: black });

      // Footer
      page.drawText(`DECLARATION`, { x: 40, y: 150, size: 10, color: black });
      page.drawText(`We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.`, { x: 40, y: 135, size: 8, color: gray });
      
      page.drawText(`Authorized Signatory`, { x: width - 150, y: 100, size: 10, color: black });
      page.drawLine({ start: { x: width - 160, y: 112 }, end: { x: width - 40, y: 112 }, thickness: 1, color: black });

      page.drawText(`This is a computer generated invoice. No signature required.`, { x: 150, y: 50, size: 8, color: gray });

      const pdfBytes = await pdfDoc.save();
      await sendDocument(
        tgId,
        pdfBytes,
        `Tax_Invoice_${invNo}.pdf`,
        `📄 Your order has been delivered! Attached is your official Tax Invoice.`
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
