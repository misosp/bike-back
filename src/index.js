export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle OPTIONS (Preflight)
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Handle POST /api/apply
        if (request.method === "POST" && url.pathname === "/api/apply") {
            try {
                // Parse Multipart Form Data
                const formData = await request.formData();

                const bikeNo = formData.get("bikeNo");
                const applicantName = formData.get("applicantName");
                const phone = formData.get("phone");
                const email = formData.get("email");
                const plan = formData.get("plan");
                const payment = formData.get("payment");
                const adText = formData.get("adText");
                const adImage = formData.get("adImage");
                const termsAccepted = formData.get("termsAccepted"); // "on" 想定（任意扱い推奨）

                // REQUIRED FIELDS
                if (!bikeNo || !applicantName || !phone || !email || !plan || !payment || !adText || !adImage) {
                    return new Response(JSON.stringify({ error: "Missing required fields" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // ALLOW LIST VALIDATION
                const planLabelMap = {
                    "1month_10000": "1カ月（10,000円）",
                    "6months_55000": "6カ月（55,000円）",
                    "12months_100000": "12カ月（100,000円）",
                };
                const paymentLabelMap = {
                    "bank": "振込決済",
                    "credit": "クレジット決済（Stripe）",
                };

                if (!planLabelMap[plan]) {
                    return new Response(JSON.stringify({ error: "Invalid plan" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                if (!paymentLabelMap[payment]) {
                    return new Response(JSON.stringify({ error: "Invalid payment" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                const planLabel = planLabelMap[plan];
                const paymentLabel = paymentLabelMap[payment];

                // VALIDATION: Email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    return new Response(JSON.stringify({ error: "Invalid email format" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // VALIDATION: Image file check
                if (!(adImage instanceof File)) {
                    return new Response(JSON.stringify({ error: "adImage must be a file" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // VALIDATION: Image type
                if (!adImage.type.startsWith("image/")) {
                    return new Response(JSON.stringify({ error: "File must be an image" }), {
                        status: 415,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // VALIDATION: Image size (Max 10MB)
                const MAX_SIZE = 10 * 1024 * 1024;
                if (adImage.size > MAX_SIZE) {
                    return new Response(JSON.stringify({ error: "Image size too large (max 10MB)" }), {
                        status: 413,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // R2 STORAGE logic
                // Key format: uploads/YYYYMMDD-HHMMSS-<random>.<ext>
                // JST Time for filename (UTC+9)
                const nowJST = new Date(Date.now() + 9 * 3600 * 1000);

                const YYYYMMDD = nowJST.toISOString().slice(0, 10).replace(/-/g, "");
                const HHMMSS = nowJST.toISOString().slice(11, 19).replace(/:/g, "");
                const timestamp = `${YYYYMMDD}-${HHMMSS}`;

                const random = crypto.randomUUID().split('-')[0]; // simple random segment

                // Extension detection
                let ext = "bin";
                if (adImage.type === "image/jpeg") ext = "jpg";
                else if (adImage.type === "image/png") ext = "png";
                else if (adImage.type === "image/webp") ext = "webp";
                else if (adImage.type === "image/gif") ext = "gif";
                else {
                    // Fallback: try to extract from name or default to bin
                    const parts = adImage.name.split('.');
                    if (parts.length > 1) ext = parts.pop();
                }

                const key = `uploads/${timestamp}-${random}.${ext}`;

                // Save to R2
                await env.AD_IMAGES_BUCKET.put(key, await adImage.arrayBuffer(), {
                    httpMetadata: { contentType: adImage.type },
                });

                // Generate Public URL
                // Remove trailing slash from base url if present to avoid double slashes
                const baseUrl = env.PUBLIC_IMAGE_BASE_URL.replace(/\/$/, "");
                const imageUrl = `${baseUrl}/${key}`;

                // SLACK NOTIFICATION logic
                const slackMessage = `📩 新規広告申込み\n\n自転車No：${bikeNo}\n法人名/氏名：${applicantName}\n電話番号：${phone}\nメール：${email}\n\n掲載期間・金額：${planLabel}\n支払い方法：${paymentLabel}\n\n広告内容：\n${adText}\n\n広告画像：\n${imageUrl}`;

                const slackResponse = await fetch(env.SLACK_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: slackMessage }),
                });

                if (!slackResponse.ok) {
                    return new Response(JSON.stringify({ error: "Failed to send Slack notification" }), {
                        status: 502,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // SUCCESS RESPONSE
                return new Response(JSON.stringify({ ok: true, imageUrl: imageUrl }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500, // Internal Server Error
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        // 404 Not Found
        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
};
