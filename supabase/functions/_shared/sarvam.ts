const SARVAM_BASE = "https://api.sarvam.ai";
const SARVAM_API_KEY = Deno.env.get("SARVAM_API_KEY")!;

/**
 * Speech-to-Text using Sarvam AI saarika:v2
 * @param audioBuffer - Raw audio data (OGG format from Telegram)
 * @param languageCode - BCP-47 language code (default: "hi-IN")
 * @returns { transcript: string, language_code: string }
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  languageCode = "hi-IN"
): Promise<{ transcript: string; language_code: string }> {
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([audioBuffer], { type: "audio/ogg" }),
      "audio.ogg"
    );
    form.append("model", "saarika:v2.5");
    
    // Sarvam STT might not support en-IN directly. If it's en-IN, try hi-IN or Unknown
    const finalLang = languageCode === "en-IN" ? "Unknown" : languageCode;
    form.append("language_code", finalLang);

    const res = await fetch(`${SARVAM_BASE}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": SARVAM_API_KEY },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Sarvam STT error:", res.status, errText);
      return { transcript: `ERROR: Sarvam API returned ${res.status}: ${errText}`, language_code: languageCode };
    }

    const data = await res.json();
    return {
      transcript: data.transcript || "",
      language_code: data.language_code || languageCode,
    };
  } catch (err: any) {
    console.error("Sarvam STT exception:", err);
    return { transcript: `ERROR: Exception: ${err?.message || String(err)}`, language_code: languageCode };
  }
}

/**
 * Text-to-Speech using Sarvam AI
 * @param text - Text to synthesize
 * @param languageCode - Target language code (default: "hi-IN")
 * @returns ArrayBuffer of audio data (WAV), or null on failure
 */
export async function synthesizeSpeech(
  text: string,
  languageCode = "hi-IN"
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: languageCode,
        speaker: "meera",
        model: "bulbul:v1",
      }),
    });

    if (!res.ok) {
      console.error("Sarvam TTS error:", res.status, await res.text());
      return null;
    }

    // Sarvam TTS returns base64-encoded audio in JSON
    const data = await res.json();
    if (data.audios && data.audios[0]) {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(data.audios[0]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    return null;
  } catch (err) {
    console.error("Sarvam TTS exception:", err);
    return null;
  }
}

/**
 * Translate text using Sarvam AI
 * @param text - Text to translate
 * @param sourceLang - Source language code
 * @param targetLang - Target language code (default: "en-IN")
 * @returns Translated text
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang = "en-IN"
): Promise<string> {
  try {
    if (sourceLang === targetLang) return text;

    const res = await fetch(`${SARVAM_BASE}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        model: "mayura:v1",
      }),
    });

    if (!res.ok) {
      console.error("Sarvam translate error:", res.status, await res.text());
      return text;
    }

    const data = await res.json();
    return data.translated_text || text;
  } catch (err) {
    console.error("Sarvam translate exception:", err);
    return text;
  }
}
