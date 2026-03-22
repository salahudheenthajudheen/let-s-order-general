import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabase } from "../_shared/supabase.ts";

/**
 * Match Seller Edge Function
 * 
 * Finds the best available seller for a given product query.
 * Accepts POST with JSON body: { product: string, category?: string }
 * Returns: { seller, products[] } or 404 if no match
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
    const { product, category } = await req.json();

    if (!product && !category) {
      return new Response(
        JSON.stringify({ error: "product or category is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Search for matching products
    const query = supabase
      .from("products")
      .select("*, seller:sellers(*)")
      .gt("stock", 0);

    const { data: products, error } = await query;

    if (error) {
      console.error("DB error:", error);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "No products available" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter by product name (fuzzy match)
    let matches = products;
    if (product) {
      const q = product.toLowerCase();
      matches = products.filter((p: any) => {
        const name = p.name.toLowerCase();
        return name.includes(q) || q.includes(name.split("(")[0].trim());
      });

      // Fuzzy word-level fallback
      if (matches.length === 0) {
        const queryWords = q.split(/\s+/);
        matches = products.filter((p: any) => {
          const productWords = p.name.toLowerCase().split(/\s+/);
          return queryWords.some((qw: string) =>
            productWords.some(
              (pw: string) => pw.includes(qw) || qw.includes(pw)
            )
          );
        });
      }
    }

    // Filter by category if provided
    if (category && matches.length > 0) {
      const catMatches = matches.filter((p: any) =>
        p.seller?.category?.some((c: string) =>
          c.toLowerCase().includes(category.toLowerCase())
        )
      );
      if (catMatches.length > 0) matches = catMatches;
    }

    // Only include available sellers
    matches = matches.filter((p: any) => p.seller?.is_available !== false);

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({ error: "No matching products found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Group by seller and pick the best
    const sellerMap = new Map<string, { seller: any; products: any[] }>();
    for (const m of matches) {
      const sid = m.seller.id;
      if (!sellerMap.has(sid)) {
        sellerMap.set(sid, { seller: m.seller, products: [] });
      }
      sellerMap.get(sid)!.products.push({
        id: m.id,
        name: m.name,
        price: m.price,
        stock: m.stock,
      });
    }

    // Pick seller with most matching products
    const best = [...sellerMap.values()].sort(
      (a, b) => b.products.length - a.products.length
    )[0];

    return new Response(
      JSON.stringify({
        seller: {
          id: best.seller.id,
          name: best.seller.name,
          category: best.seller.category,
          is_available: best.seller.is_available,
        },
        products: best.products,
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
    console.error("Match seller error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
