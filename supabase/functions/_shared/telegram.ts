const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a text message with optional inline keyboard
 */
export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: any
): Promise<void> {
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) {
    body.reply_markup = JSON.stringify(replyMarkup);
  }
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("sendMessage error:", await res.text());
  }
}

/**
 * Send a voice note (OGG/Opus)
 */
export async function sendVoice(
  chatId: number,
  audioBuffer: ArrayBuffer
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "voice",
    new Blob([audioBuffer], { type: "audio/ogg" }),
    "reply.ogg"
  );
  const res = await fetch(`${TG_API}/sendVoice`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    console.error("sendVoice error:", await res.text());
  }
}

/**
 * Send a message with an inline keyboard
 */
export async function sendInlineKeyboard(
  chatId: number,
  text: string,
  buttons: { text: string; callback_data: string }[][]
): Promise<void> {
  await sendMessage(chatId, text, {
    inline_keyboard: buttons,
  });
}

/**
 * Answer a callback query (acknowledge inline button press)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`${TG_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || "",
    }),
  });
}

/**
 * Get the download URL for a Telegram file
 */
export async function getFileUrl(fileId: string): Promise<string | null> {
  const res = await fetch(`${TG_API}/getFile?file_id=${fileId}`);
  const data = await res.json();
  const filePath = data.result?.file_path;
  if (!filePath) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

/**
 * Download a file from Telegram by file_id
 */
export async function downloadFile(
  fileId: string
): Promise<ArrayBuffer | null> {
  const url = await getFileUrl(fileId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/**
 * Helper to build inline keyboard button rows
 */
export function inlineButton(
  text: string,
  callbackData: string
): { text: string; callback_data: string } {
  return { text, callback_data: callbackData };
}
