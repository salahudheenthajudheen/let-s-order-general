import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabase } from "../_shared/supabase.ts";
import {
  sendMessage,
  sendVoice,
  sendInlineKeyboard,
  answerCallbackQuery,
  downloadFile,
  inlineButton,
} from "../_shared/telegram.ts";
import {
  transcribeAudio,
  synthesizeSpeech,
  translateText,
} from "../_shared/sarvam.ts";

// ─── Session Helpers ───────────────────────────────────────────────

interface Session {
  telegram_id: number;
  state: string;
  draft_order: any;
}

async function getSession(telegramId: number): Promise<Session> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .single();

  if (data) return data as Session;

  const { data: newSession } = await supabase
    .from("sessions")
    .upsert({ telegram_id: telegramId, state: "idle", draft_order: {} })
    .select()
    .single();

  return (newSession as Session) || {
    telegram_id: telegramId,
    state: "idle",
    draft_order: {},
  };
}

async function setSession(
  telegramId: number,
  state: string,
  draftOrder: any = {}
): Promise<void> {
  await supabase
    .from("sessions")
    .upsert({
      telegram_id: telegramId,
      state,
      draft_order: draftOrder,
      updated_at: new Date().toISOString(),
    });
}

// ─── Customer Helpers ──────────────────────────────────────────────

async function getOrCreateCustomer(
  telegramId: number,
  name?: string
): Promise<any> {
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("telegram_id", telegramId)
  if (data) {
    if (name && data.name.startsWith("User ")) {
      await supabase.from("customers").update({ name }).eq("telegram_id", telegramId);
      data.name = name;
    }
    return data;
  }

  const { data: newCustomer } = await supabase
    .from("customers")
    .insert({
      telegram_id: telegramId,
      name: name || `User ${telegramId}`,
      language_code: "en-IN",
    })
    .select()
    .single();

  return newCustomer;
}

// ─── NLP / Entity Extraction ───────────────────────────────────────

interface ParsedOrder {
  product: string | null;
  quantity: number | null;
}

function parseOrderFromText(text: string): ParsedOrder {
  let t = text.toLowerCase().trim();
  let quantity: number | null = null;
  let product: string | null = null;

  t = t.replace(/[^\w\s]/gi, " ");

  const numMatch = t.match(/(\d+(?:\.\d+)?)\s*/);
  if (numMatch) {
    quantity = parseFloat(numMatch[1]);
    t = t.replace(numMatch[0], "");
  }

  const numWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    ek: 1, do: 2, teen: 3, char: 4, panch: 5, das: 10,
    onnu: 1, randu: 2, moonnu: 3, naalu: 4, anchu: 5, pathu: 10,
  };

  if (!quantity) {
    for (const [word, val] of Object.entries(numWords)) {
      const regex = new RegExp(`\\b${word}\\b`, "i");
      if (regex.test(t)) {
        quantity = val;
        t = t.replace(regex, " ");
        break;
      }
    }
  }

  let cleaned = t
    .replace(
      /\b(i want|i need|order|give me|send me|buy|get|please|me|some|of|the|a|an|kg|kgs|kilo|kilos|pieces?|dozen|packet|packets|litre|litres|liter|liters|grams|gram|g)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0) {
    product = cleaned;
  }

  return { product, quantity };
}

export function parseMultipleOrdersFromText(text: string): ParsedOrder[] {
  const parts = text.split(/(?:\s+(?:and|plus|with|aur|mattu|mariyum|matrum|chood)\s+(?:then\s+)?)|(?:\s*,\s*(?:and\s+)?(?:then\s+)?)/i).filter(Boolean);
  const orders: ParsedOrder[] = [];
  for (const p of parts) {
    if (p.trim().length > 0) {
      const parsed = parseOrderFromText(p);
      if (parsed.product) {
        orders.push({
          product: parsed.product,
          quantity: parsed.quantity || 1
        });
      }
    }
  }
  return orders;
}

// ─── Product Matching ──────────────────────────────────────────────

async function findProducts(
  query: string
): Promise<{ product: any; seller: any }[]> {
  const { data: products } = await supabase
    .from("products")
    .select("*, seller:sellers(*)")
    .gt("stock", 0);

  if (!products || products.length === 0) return [];

  const q = query.toLowerCase();
  const matches = products.filter((p: any) =>
    p.name.toLowerCase().includes(q) ||
    q.includes(p.name.toLowerCase().split("(")[0].trim().toLowerCase())
  );

  if (matches.length > 0) {
    return matches.map((p: any) => ({
      product: p,
      seller: p.seller,
    }));
  }

  // Fuzzy: check if any word in query matches any word in product name
  const queryWords = q.split(/\s+/);
  const fuzzyMatches = products.filter((p: any) => {
    const productWords = p.name.toLowerCase().split(/\s+/);
    return queryWords.some((qw: string) =>
      productWords.some(
        (pw: string) => pw.includes(qw) || qw.includes(pw)
      )
    );
  });

  return fuzzyMatches.map((p: any) => ({
    product: p,
    seller: p.seller,
  }));
}

// ─── Command Handlers ──────────────────────────────────────────────

async function handleStart(chatId: number): Promise<void> {
  const customer = await getOrCreateCustomer(chatId);
  const session = await getSession(chatId);
  const role = session.draft_order?.active_role || "consumer";
  await setSession(chatId, "idle", session.draft_order);

  if (role === "admin") {
    await sendInlineKeyboard(
      chatId,
      `🛡️ *Platform Admin Panel*\n\nWelcome back, Admin. What would you like to view?`,
      [
        [inlineButton("📊 Platform Stats", "cmd_stats")],
        [inlineButton("🎭 Switch Role", "cmd_role")]
      ]
    );
  } else if (role === "seller") {
    await sendInlineKeyboard(
      chatId,
      `🏪 *Seller Node*\n\nManage your inventory and fulfillments here.`,
      [
        [inlineButton("📦 View Pending Orders", "cmd_seller_orders")],
        [inlineButton("🎭 Switch Role", "cmd_role")]
      ]
    );
  } else {
    await sendInlineKeyboard(
      chatId,
      `🛍 *Welcome to Let's Order!*\n\nHey${
        customer.name ? ` ${customer.name}` : ""
      }! I'm your voice-enabled shopping assistant.\n\n🎤 Send a *voice message* to order\n✍️ Type what you want\n📋 Use commands to navigate\n\n🌍 _Supports Hindi, Tamil, Malayalam & more!_`,
      [
        [inlineButton("🏬 Browse Sellers", "cmd_sellers")],
        [inlineButton("🛒 Start Ordering", "cmd_order")],
        [
          inlineButton("📦 My Orders", "cmd_status"),
          inlineButton("🎭 Switch Role", "cmd_role"),
        ],
        [inlineButton("🌐 Change Language", "cmd_lang")],
      ]
    );
  }
}

async function handleRoleCommand(chatId: number): Promise<void> {
  await sendInlineKeyboard(
    chatId,
    "🎭 *Select your Telegram Identity:*",
    [
      [inlineButton("🛒 Consumer", "role_consumer")],
      [inlineButton("🏪 Seller", "role_seller")],
      [inlineButton("👑 Admin", "role_admin")],
    ]
  );
}

async function handleStats(chatId: number): Promise<void> {
  const { count: customersCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  await sendMessage(chatId, `📊 *Platform Analytics*\n\n👥 Total Users: ${customersCount}\n📦 Total Orders: ${ordersCount}`);
}

async function handleSellerOrders(chatId: number): Promise<void> {
  const { data: orders } = await supabase.from('orders').select('*, customer:customers(name)').eq('status', 'pending').limit(5);
  if (!orders || orders.length === 0) {
    await sendMessage(chatId, "✅ No pending orders currently.");
  } else {
    const list = orders.map((o: any) => `📦 ${o.product} (x${o.quantity}) - Buyer: ${o.customer?.name}`).join('\n');
    await sendMessage(chatId, `*Recent Pending Orders:*\n\n${list}`);
  }
}

async function handleOrder(chatId: number): Promise<void> {
  await setSession(chatId, "awaiting_product");

  await sendMessage(
    chatId,
    `🛒 *Let's place an order!*\n\nWhat would you like to order?\n\n🎤 Send a *voice message* or type the product name.\n\nExamples:\n• _"2 kg Rice"_\n• _"1 dozen Banana"_\n• _"Paneer"_`
  );
}

async function handleStatus(chatId: number): Promise<void> {
  const customer = await getOrCreateCustomer(chatId);

  const { data: orders } = await supabase
    .from("orders")
    .select("*, seller:sellers(name)")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    await sendMessage(
      chatId,
      "📦 You don't have any orders yet.\n\nUse /order to place your first order!"
    );
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: "⏳",
    accepted: "✅",
    rejected: "❌",
    dispatched: "🚚",
    delivered: "📦",
  };

  let msg = "📦 *Your Recent Orders:*\n\n";
  for (const order of orders) {
    const emoji = statusEmoji[order.status] || "📋";
    msg += `${emoji} *${order.product}* × ${order.quantity}\n`;
    msg += `   Seller: ${order.seller?.name || "TBD"}\n`;
    msg += `   Status: *${order.status.toUpperCase()}*\n`;
    if (order.payment_link) {
      msg += `   💳 [Pay Now](${order.payment_link})\n`;
    }
    msg += `\n`;
  }

  await sendMessage(chatId, msg);
}

async function handleCancel(chatId: number): Promise<void> {
  const customer = await getOrCreateCustomer(chatId);

  const { data: activeOrder } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!activeOrder) {
    await sendMessage(
      chatId,
      "❌ No active orders to cancel.\n\nYou can only cancel *pending* orders."
    );
    return;
  }

  await supabase
    .from("orders")
    .update({ status: "rejected" })
    .eq("id", activeOrder.id);

  await sendMessage(
    chatId,
    `❌ *Order Cancelled*\n\n${activeOrder.product} × ${activeOrder.quantity} has been cancelled.`
  );

  await setSession(chatId, "idle");
}

async function handleHelp(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    `❓ *Let's Order — Help*\n\n` +
      `*Commands:*\n` +
      `/start — Welcome & language selection\n` +
      `/order — Start placing an order\n` +
      `/status — Check your order status\n` +
      `/cancel — Cancel your latest pending order\n` +
      `/help — Show this help message\n\n` +
      `*How to order:*\n` +
      `🎤 *Voice:* Send a voice message like _"2 kg chawal"_\n` +
      `✍️ *Text:* Type _"order 5 kg rice"_\n` +
      `📋 *Wizard:* Use /order for step-by-step guidance\n\n` +
      `🌍 *Supported Languages:*\n` +
      `Hindi, Tamil, Malayalam, Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi, English`
  );
}

// ─── Voice Message Handler ─────────────────────────────────────────

async function handleVoice(
  chatId: number,
  fileId: string
): Promise<void> {
  const customer = await getOrCreateCustomer(chatId);

  // Step 1: Download audio from Telegram
  const audioBuffer = await downloadFile(fileId);
  if (!audioBuffer) {
    await sendMessage(chatId, "🎤 Couldn't download your voice message. Please try again.");
    return;
  }

  // Step 2: Transcribe with Sarvam AI
  const customerLang = customer.language_code || "en-IN";
  const sttResult = await transcribeAudio(audioBuffer, customerLang);

  if (!sttResult.transcript) {
    await sendMessage(
      chatId,
      "🎤 Couldn't understand the audio. Please speak clearly for at least 2 seconds."
    );
    return;
  }

  let transcript = sttResult.transcript;
  const detectedLang = sttResult.language_code || customerLang;

  // Step 3: Translate to English if needed
  let englishText = transcript;
  if (detectedLang !== "en-IN" && detectedLang !== "en") {
    englishText = await translateText(transcript, detectedLang, "en-IN");
    await sendMessage(
      chatId,
      `🎤 _"${transcript}"_\n🌐 _"${englishText}"_`
    );
  } else {
    await sendMessage(chatId, `🎤 _"${transcript}"_`);
  }

  // Step 4: Parse order entities from text
  const parsedItems = parseMultipleOrdersFromText(englishText);

  if (parsedItems.length === 0) {
    await sendMessage(chatId, "I couldn't identify any products. Please try again, e.g., _\"2 kg rice and 1 kg sugar\"_");
    return;
  }

  // Step 5: Find matching products & sellers
  const cart: any[] = [];
  let totalPrice = 0;
  let summaryText = "";
  let ttsSummaryText = "";

  for (const item of parsedItems) {
    const matches = await findProducts(item.product as string);
    if (matches.length > 0) {
      const best = matches[0];
      const qty = item.quantity as number;
      const itemTotal = qty * (best.product.price || 0);
      
      cart.push({
        product_id: best.product.id,
        product_name: best.product.name,
        seller_id: best.seller.id,
        seller_name: best.seller.name,
        quantity: qty,
        price: best.product.price,
        total: itemTotal,
      });

      totalPrice += itemTotal;
      summaryText += `📦 *${best.product.name}* (x${qty}) from _${best.seller.name}_ - ₹${itemTotal}\n`;
      ttsSummaryText += `${qty} ${best.product.name}, `;
    }
  }

  if (cart.length === 0) {
    await sendMessage(
      chatId,
      `😕 Sorry, I couldn't find ANY matching items in our catalog.\n\nTry /order to browse available products.`
    );
    return;
  }

  // Step 6: Store draft cart and confirm
  await setSession(chatId, "confirming", {
    is_cart: true,
    cart: cart,
    total: totalPrice,
  });

  await sendInlineKeyboard(
    chatId,
    `🛒 *Cart Summary:*\n\n${summaryText}\n💵 *Total: ₹${totalPrice}*\n\nConfirm this order?`,
    [
      [
        inlineButton("✅ Confirm All", "order_confirm"),
        inlineButton("❌ Cancel", "order_cancel"),
      ],
    ]
  );

  // Step 7: Generate TTS confirmation voice
  try {
    const cleanTts = ttsSummaryText.slice(0, -2);
    const ttsText =
      detectedLang !== "en-IN" && detectedLang !== "en"
        ? `${cleanTts}. Total ${totalPrice} rupees. Confirm?`
        : `${cleanTts}. Total ${totalPrice} rupees. Shall I confirm?`;

    const ttsLang =
      detectedLang !== "en-IN" && detectedLang !== "en"
        ? detectedLang
        : "en-IN";

    const voiceBuffer = await synthesizeSpeech(ttsText, ttsLang);
    if (voiceBuffer) {
      await sendVoice(chatId, voiceBuffer);
    }
  } catch (e) {
    console.error("TTS error (non-critical):", e);
  }
}

// ─── Text Message Handler ──────────────────────────────────────────

async function handleText(chatId: number, text: string): Promise<void> {
  const session = await getSession(chatId);

  switch (session.state) {
    case "awaiting_product":
      await handleAwaitingProduct(chatId, text);
      return;

    case "awaiting_quantity":
      await handleAwaitingQuantity(chatId, text, session);
      return;

    case "confirming":
      // If they type instead of tapping a button
      if (
        text.toLowerCase().includes("yes") ||
        text.toLowerCase().includes("confirm")
      ) {
        await confirmOrder(chatId, session);
      } else if (
        text.toLowerCase().includes("no") ||
        text.toLowerCase().includes("cancel")
      ) {
        await setSession(chatId, "idle");
        await sendMessage(chatId, "❌ Order cancelled. Use /order to start again.");
      } else {
        await sendMessage(
          chatId,
          "Please tap ✅ *Confirm* or ❌ *Cancel* above, or type _yes_ / _no_."
        );
      }
      return;
  }

  // Default: try to parse as a natural language order
  const parsed = parseOrderFromText(text);

  if (parsed.product) {
    const matches = await findProducts(parsed.product);

    if (matches.length === 0) {
      await sendMessage(
        chatId,
        `😕 Couldn't find *${parsed.product}*. Try /order for step-by-step ordering.`
      );
      return;
    }

    if (matches.length > 1) {
      // Disambiguate if there are multiple distinct sellers
      const uniqueSellers = Array.from(new Map(matches.map(m => [m.seller.id, m])).values());
      if (uniqueSellers.length > 1) {
        await setSession(chatId, "awaiting_seller", {
          parsed_product: parsed.product,
          parsed_qty: parsed.quantity || 1,
          matches: matches.map(m => ({ 
            product_id: m.product.id, 
            seller_id: m.seller.id, 
            price: m.product.price, 
            product_name: m.product.name, 
            seller_name: m.seller.name 
          }))
        });
        
        const btns = uniqueSellers.map(m => [inlineButton(`🏬 ${m.seller.name} (₹${m.product.price})`, `seller_ch_${m.seller.id}`)]);
        await sendInlineKeyboard(
          chatId, 
          `🤔 Multiple distinct sellers carry *${parsed.product}*.\n\nPlease choose which shop you want to order it from:`, 
          btns
        );
        return;
      }
    }

    const best = matches[0];
    const qty = parsed.quantity || 1;
    const totalPrice = qty * (best.product.price || 0);

    await setSession(chatId, "confirming", {
      product_id: best.product.id,
      product_name: best.product.name,
      seller_id: best.seller.id,
      seller_name: best.seller.name,
      quantity: qty,
      price: best.product.price,
      total: totalPrice,
    });

    await sendInlineKeyboard(
      chatId,
      `🛒 *Order Summary:*\n\n` +
        `📦 *${best.product.name}*\n` +
        `🔢 Quantity: *${qty}*\n` +
        `💰 Price: ₹${best.product.price} each\n` +
        `💵 Total: *₹${totalPrice}*\n` +
        `🏪 Seller: ${best.seller.name}\n\n` +
        `Confirm this order?`,
      [
        [
          inlineButton("✅ Confirm", "order_confirm"),
          inlineButton("✏️ Edit", "order_edit"),
          inlineButton("❌ Cancel", "order_cancel"),
        ],
      ]
    );
  } else {
    await sendMessage(
      chatId,
      `I'm not sure what you'd like. Try:\n\n` +
        `🎤 Send a *voice message*\n` +
        `✍️ Type e.g. _"2 kg rice"_\n` +
        `📋 Use /order for guided ordering\n` +
        `❓ /help for all commands`
    );
  }
}

async function handleAwaitingProduct(
  chatId: number,
  text: string
): Promise<void> {
  const parsed = parseOrderFromText(text);

  if (!parsed.product) {
    await sendMessage(
      chatId,
      "Please tell me what you'd like to order. For example: _Rice_, _Banana_, _Paneer_"
    );
    return;
  }

  const matches = await findProducts(parsed.product);

  if (matches.length === 0) {
    const { data: allProducts } = await supabase
      .from("products")
      .select("name, price")
      .gt("stock", 0)
      .limit(10);

    let msg = `😕 Couldn't find *${parsed.product}*.\n\n📋 *Available products:*\n\n`;
    if (allProducts) {
      for (const p of allProducts) {
        msg += `• ${p.name} — ₹${p.price}\n`;
      }
    }
    msg += `\nType a product name from the list above.`;
    await sendMessage(chatId, msg);
    return;
  }

  if (matches.length > 1) {
    const uniqueSellers = Array.from(new Map(matches.map(m => [m.seller.id, m])).values());
    if (uniqueSellers.length > 1) {
      await setSession(chatId, "awaiting_seller", {
        parsed_product: parsed.product,
        parsed_qty: parsed.quantity || 1,
        matches: matches.map(m => ({ 
          product_id: m.product.id, 
          seller_id: m.seller.id, 
          price: m.product.price, 
          product_name: m.product.name, 
          seller_name: m.seller.name 
        }))
      });
      
      const btns = uniqueSellers.map(m => [inlineButton(`🏬 ${m.seller.name} (₹${m.product.price})`, `seller_ch_${m.seller.id}`)]);
      await sendInlineKeyboard(
        chatId, 
        `🤔 Multiple distinct sellers carry *${parsed.product}*.\n\nPlease choose which shop you want to order it from:`, 
        btns
      );
      return;
    }
  }

  if (parsed.quantity) {
    const best = matches[0];
    const totalPrice = parsed.quantity * (best.product.price || 0);

    await setSession(chatId, "confirming", {
      product_id: best.product.id,
      product_name: best.product.name,
      seller_id: best.seller.id,
      seller_name: best.seller.name,
      quantity: parsed.quantity,
      price: best.product.price,
      total: totalPrice,
    });

    await sendInlineKeyboard(
      chatId,
      `🛒 *Order Summary:*\n\n` +
        `📦 *${best.product.name}*\n` +
        `🔢 Quantity: *${parsed.quantity}*\n` +
        `💰 Price: ₹${best.product.price} each\n` +
        `💵 Total: *₹${totalPrice}*\n` +
        `🏪 Seller: ${best.seller.name}\n\n` +
        `Confirm this order?`,
      [
        [
          inlineButton("✅ Confirm", "order_confirm"),
          inlineButton("✏️ Edit", "order_edit"),
          inlineButton("❌ Cancel", "order_cancel"),
        ],
      ]
    );
  } else {
    const best = matches[0];
    await setSession(chatId, "awaiting_quantity", {
      product_id: best.product.id,
      product_name: best.product.name,
      seller_id: best.seller.id,
      seller_name: best.seller.name,
      price: best.product.price,
    });

    await sendMessage(
      chatId,
      `📦 *${best.product.name}* — ₹${best.product.price}\n🏪 ${best.seller.name}\n\nHow many would you like?`
    );
  }
}

async function handleAwaitingQuantity(
  chatId: number,
  text: string,
  session: Session
): Promise<void> {
  const numMatch = text.match(/\d+/);
  const quantity = numMatch ? parseInt(numMatch[0], 10) : null;

  if (!quantity || quantity <= 0) {
    await sendMessage(chatId, "Please enter a valid quantity (a number greater than 0).");
    return;
  }

  const draft = session.draft_order;
  const totalPrice = quantity * (draft.price || 0);

  await setSession(chatId, "confirming", {
    ...draft,
    quantity,
    total: totalPrice,
  });

  await sendInlineKeyboard(
    chatId,
    `🛒 *Order Summary:*\n\n` +
      `📦 *${draft.product_name}*\n` +
      `🔢 Quantity: *${quantity}*\n` +
      `💰 Price: ₹${draft.price} each\n` +
      `💵 Total: *₹${totalPrice}*\n` +
      `🏪 Seller: ${draft.seller_name}\n\n` +
      `Confirm this order?`,
    [
      [
        inlineButton("✅ Confirm", "order_confirm"),
        inlineButton("✏️ Edit", "order_edit"),
        inlineButton("❌ Cancel", "order_cancel"),
      ],
    ]
  );
}

// ─── Order Confirmation ────────────────────────────────────────────

async function confirmOrder(
  chatId: number,
  session: Session
): Promise<void> {
  const customer = await getOrCreateCustomer(chatId);
  const draft = session.draft_order;

  const itemsToInsert = draft.is_cart ? draft.cart : [draft];

  if (!itemsToInsert || itemsToInsert.length === 0 || !itemsToInsert[0].product_name) {
    await sendMessage(chatId, "❌ Something went wrong. Use /order to try again.");
    await setSession(chatId, "idle");
    return;
  }

  let totalCombined = 0;
  let summaryText = "";
  const inserts = [];

  for (const item of itemsToInsert) {
    inserts.push({
      customer_id: customer.id,
      seller_id: item.seller_id,
      product: item.product_name,
      quantity: item.quantity,
      status: "pending",
    });
    totalCombined += item.total || 0;
    summaryText += `📦 *${item.product_name}* × ${item.quantity} from _${item.seller_name}_ (₹${item.total})\n`;
  }

  const { error } = await supabase.from("orders").insert(inserts);

  if (error) {
    console.error("Order creation error:", error);
    await sendMessage(chatId, "❌ Failed to place order. Please try again.");
    await setSession(chatId, "idle");
    return;
  }

  await setSession(chatId, "idle");

  await sendInlineKeyboard(
    chatId,
    `✅ *Order Placed!*\n\n${summaryText}\n💵 Total: *₹${totalCombined}*\n\nYour orders are now *pending*.\n\nTrack your order with /status`,
    [
      [
        inlineButton("📦 Track Order", "cmd_status"),
        inlineButton("🛒 Order More", "cmd_order"),
      ],
    ]
  );
}

// ─── Seller & Product Browsing ───────────────────────────────────

async function handleBrowseSellers(chatId: number): Promise<void> {
  const { data: sellers } = await supabase.from('sellers').select('*').eq('is_available', true);
  if (!sellers || sellers.length === 0) {
    await sendMessage(chatId, "🏬 No sellers are currently available in your area.");
    return;
  }
  
  const buttons = sellers.map((s: any) => [inlineButton(`🏬 ${s.name} (${s.location_name})`, `seller_view_${s.id}`)]);
  await sendInlineKeyboard(
    chatId, 
    "🏬 *Available Sellers:*\n\nSelect a shop to browse their full catalog:", 
    buttons
  );
}

async function handleSellerView(chatId: number, sellerId: string): Promise<void> {
  const { data: seller } = await supabase.from('sellers').select('*').eq('id', sellerId).single();
  if (!seller) return;

  const { data: products } = await supabase.from('products').select('*').eq('seller_id', sellerId).gt('stock', 0);
  
  if (!products || products.length === 0) {
    await sendMessage(chatId, `🏬 *${seller.name}* currently has no products in stock.`);
    return;
  }
  
  let msg = `🏬 *${seller.name}* (${seller.location_name})\n\n`;
  products.forEach((p: any) => {
    msg += `• *${p.name}* — ₹${p.price} (${p.stock} left)\n`;
  });
  
  msg += `\n✍️ Type the name of the product you want to order.`;
  await sendMessage(chatId, msg);
}

// ─── Callback Query Handler ────────────────────────────────────────

async function handleCallback(
  chatId: number,
  callbackId: string,
  data: string
): Promise<void> {
  await answerCallbackQuery(callbackId);
  const session = await getSession(chatId);

  switch (data) {
    case "cmd_sellers":
      await handleBrowseSellers(chatId);
      break;

    case "cmd_order":
      await handleOrder(chatId);
      break;

    case "cmd_status":
      await handleStatus(chatId);
      break;

    case "cmd_help":
      await handleHelp(chatId);
      break;

    case "cmd_role":
      await handleRoleCommand(chatId);
      break;

    case "cmd_stats":
      await handleStats(chatId);
      break;

    case "cmd_seller_orders":
      await handleSellerOrders(chatId);
      break;

    case "cmd_lang":
      await sendInlineKeyboard(chatId, "🌐 *Select your language:*", [
        [
          inlineButton("🇮🇳 हिन्दी", "lang_hi-IN"),
          inlineButton("🇮🇳 தமிழ்", "lang_ta-IN"),
        ],
        [
          inlineButton("🇮🇳 മലയാളം", "lang_ml-IN"),
          inlineButton("🇮🇳 తెలుగు", "lang_te-IN"),
        ],
        [
          inlineButton("🇮🇳 ಕನ್ನಡ", "lang_kn-IN"),
          inlineButton("🇮🇳 English", "lang_en-IN"),
        ],
      ]);
      break;

    case "order_confirm":
      await confirmOrder(chatId, session);
      break;

    case "order_edit":
      await setSession(chatId, "awaiting_product");
      await sendMessage(
        chatId,
        "✏️ Let's edit. What product would you like?"
      );
      break;

    case "order_cancel":
      await setSession(chatId, "idle");
      await sendMessage(chatId, "❌ Order cancelled. Use /order to start again.");
      break;

    default:
      // Language selection
      if (data.startsWith("lang_")) {
        const langCode = data.replace("lang_", "");
        await supabase
          .from("customers")
          .update({ language_code: langCode })
          .eq("telegram_id", chatId);

        const langNames: Record<string, string> = {
          "hi-IN": "हिन्दी (Hindi)",
          "ta-IN": "தமிழ் (Tamil)",
          "ml-IN": "മലയാളം (Malayalam)",
          "te-IN": "తెలుగు (Telugu)",
          "kn-IN": "ಕನ್ನಡ (Kannada)",
          "en-IN": "English",
        };

        await sendMessage(
          chatId,
          `✅ Language set to *${langNames[langCode] || langCode}*\n\n🎤 You can now send voice messages in your language!`
        );
      } else if (data.startsWith("role_")) {
        const role = data.replace("role_", "");
        const session = await getSession(chatId);
        await setSession(chatId, session.state, { ...session.draft_order, active_role: role });
        await sendMessage(chatId, `✅ Identity switched to *${role.toUpperCase()}*.\n\nSend /start to reload menus.`);
      } else if (data.startsWith("seller_view_")) {
        const sid = data.replace("seller_view_", "");
        await handleSellerView(chatId, sid);
      } else if (data.startsWith("seller_ch_")) {
        const sid = data.replace("seller_ch_", "");
        const session = await getSession(chatId);
        if (session.state === "awaiting_seller" && session.draft_order) {
           const match = session.draft_order.matches.find((m: any) => String(m.seller_id) === sid);
           if (match) {
             const qty = session.draft_order.parsed_qty;
             const totalPrice = qty * match.price;
             await setSession(chatId, "confirming", {
               product_id: match.product_id,
               product_name: match.product_name,
               seller_id: match.seller_id,
               seller_name: match.seller_name,
               quantity: qty,
               price: match.price,
               total: totalPrice
             });
             
             await sendInlineKeyboard(
               chatId,
               `🛒 *Order Summary:*\n\n` +
                 `📦 *${match.product_name}*\n` +
                 `🔢 Quantity: *${qty}*\n` +
                 `💰 Price: ₹${match.price} each\n` +
                 `💵 Total: *₹${totalPrice}*\n` +
                 `🏪 Seller: ${match.seller_name}\n\n` +
                 `Confirm this order?`,
               [
                 [
                   inlineButton("✅ Confirm", "order_confirm"),
                   inlineButton("✏️ Edit", "order_edit"),
                   inlineButton("❌ Cancel", "order_cancel"),
                 ],
               ]
             );
           }
        }
      }
      break;
  }
}

// ─── Main Webhook Router ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Let's Order Bot — running ✅", { status: 200 });
  }

  try {
    const update = await req.json();

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      if (chatId) {
        await handleCallback(chatId, cb.id, cb.data);
      }
      return new Response("ok", { status: 200 });
    }

    const msg = update.message;
    if (!msg) return new Response("ok", { status: 200 });

    const chatId = msg.chat.id;
    const name = msg.from?.first_name || msg.from?.username;
    
    await getOrCreateCustomer(chatId, name);

    // Route by message type
    if (msg.text) {
      const text = msg.text.trim();

      // Bot commands
      if (text === "/start") await handleStart(chatId);
      else if (text === "/role") await handleRoleCommand(chatId);
      else if (text === "/stats") await handleStats(chatId);
      else if (text === "/orders") await handleSellerOrders(chatId);
      else if (text === "/order") await handleOrder(chatId);
      else if (text === "/status") await handleStatus(chatId);
      else if (text === "/cancel") await handleCancel(chatId);
      else if (text === "/help") await handleHelp(chatId);
      else await handleText(chatId, text);
    } else if (msg.voice) {
      await handleVoice(chatId, msg.voice.file_id);
    } else {
      await sendMessage(
        chatId,
        "🎤 Send a *voice message* or type your order!\n\nUse /help for all commands."
      );
    }

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new Response("error", { status: 500 });
  }
});
