const express = require("express");
const crypto = require("crypto");
require("dotenv").config({
  path: process.env.NODE_ENV === "production" ? ".prod.env" : ".dev.env",
});
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (replace with database in production)
const linksStore = new Map();

// Configuration
const CONFIG = {
  domain: process.env.DOMAIN || "dynamic-link-aiux.onrender.com",
  appName: "ZuAI",
  iosAppId: "id1609941536",
  androidPackage: "in.zupay.app",
  iosScheme: "zuaiapp",
  androidScheme: "zuaiapp",
};

// Utility Functions
const generateShortCode = () => {
  return crypto.randomBytes(4).toString("hex");
};

const detectPlatform = (userAgent) => {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mobile/.test(ua)) return "mobile-web";
  return "desktop";
};

// Routes

// 1. Create Short Link
app.post("/api/create-link", (req, res) => {
  let { title, description, image, customParams = {} } = req.body;

  ///
  const originalUrl = process.env.DOMAIN || "dynamic-link-aiux.onrender.com";
  const androidUrl = "zuaiapp://zuai.co/";
  const iosUrl = "zuaiapp://zuai.co/";
  const webUrl = "https://zuai.co";
  const androidFallback =
    "https://play.google.com/store/apps/details?id=in.zupay.app";
  const iosFallback =
    "https://apps.apple.com/us/app/zuai-ace-ap-sat-act-tests/id1609941536";

  ///
  title ||= "Open in App?";
  description ||= "";
  image ||=
    "https://storage.googleapis.com/zuai-media-storage-in/web-lp/metadata/main_og_image.png";

  if (!originalUrl && !webUrl) {
    return res.status(400).json({ error: "originalUrl or webUrl is required" });
  }

  const shortCode = generateShortCode();
  const linkId = `link_${shortCode}`;

  const linkData = {
    id: linkId,
    shortCode,
    originalUrl,
    title,
    description,
    image,
    iosUrl,
    androidUrl,
    webUrl,
    iosFallback,
    androidFallback,
    customParams,
    createdAt: Date.now(),
  };

  linksStore.set(shortCode, linkData);

  const shortUrl = `${CONFIG.domain}/${shortCode}`;

  console.log(`🔗 Created short link: ${shortUrl} → ${linkData.originalUrl}`);

  res.json({
    shortUrl,
    shortCode,
    linkId,
    originalUrl: linkData.originalUrl,
    createdAt: linkData.createdAt,
  });
});

// 3. Main Short Link Handler
app.get("/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const linkData = linksStore.get(shortCode);

  if (!linkData) {
    return res.status(404).send(`
            <html>
                <head><title>Link Not Found</title></head>
                <body>
                    <h1>404 - Link Not Found</h1>
                    <p>The link you're looking for doesn't exist or has expired.</p>
                </body>
            </html>
        `);
  }

  const userAgent = req.headers["user-agent"] || "";
  const platform = detectPlatform(userAgent);

  console.log(`🔍 Link accessed: ${shortCode} from ${platform}`);

  // Store deferred deep link data for potential app install
  const deferredData = {
    linkId: linkData.id,
    originalUrl: linkData.originalUrl,
    customParams: linkData.customParams,
    timestamp: Date.now(),
    platform,
  };

  if (platform == "android" || platform == "ios") {
    return res.status(200).send(`
            <html>
                <head>
                    <title>${CONFIG.title}</title>
                    <script>
                        async function copyToClipboard(text) {
                            try {
                                await navigator.clipboard.writeText(text);
                                console.log('Text copied successfully');
                            } catch (err) {
                                console.error('Failed to copy text: ', err);
                            }
                        }

                        function openApp() {
                            // Try to open app
                            window.location.href = '${
                              platform === "ios"
                                ? linkData.iosUrl
                                : linkData.androidUrl
                            }';
                            
                            // Set timeout to redirect to store after 2 seconds
                            setTimeout(function() {
                                const fallbackUrl = '${
                                  platform === "ios"
                                    ? linkData.iosFallback
                                    : linkData.androidFallback
                                }';
                                // Add query parameters for Android
                                if ('${platform}' === 'android') {
                                    const params = new URLSearchParams(${JSON.stringify(
                                      linkData.customParams
                                    )});
                                    window.location.href = fallbackUrl + (fallbackUrl.includes('?') ? '&' : '?') + params.toString();
                                } else {
                                    // For iOS, include all linkData as query parameters
                                    const iosParams = new URLSearchParams({
                                        ...${JSON.stringify(
                                          linkData.customParams
                                        )},
                                        iosUrl: '${linkData.iosUrl}',
                                        title: '${linkData.title}',
                                        description: '${linkData.description}',
                                        originalUrl: '${linkData.originalUrl}'
                                    });
                                    const iosFallbackWithParams = fallbackUrl + (fallbackUrl.includes('?') ? '&' : '?') + iosParams.toString();
                                    copyToClipboard(iosFallbackWithParams);
                                    window.location.href = iosFallbackWithParams;
                                }
                            }, 2000);
                        }
                         const originalUrl = '${
                                  platform === "ios"
                                    ? linkData.iosUrl
                                    : linkData.androidUrl
                                }';
                         if ('${platform}' === 'android') {
                                const params = new URLSearchParams(${JSON.stringify(
                                  linkData.customParams
                                )});
                                window.location.href = originalUrl + (originalUrl.includes('?') ? '&' : '?') + params.toString();
                            } else {
                                // For iOS, include all linkData as query parameters
                                const iosParams = new URLSearchParams({
                                    ...${JSON.stringify(linkData.customParams)},
                                    iosUrl: '${linkData.iosUrl}',
                                    title: '${linkData.title}',
                                    description: '${linkData.description}',
                                    originalUrl: '${linkData.originalUrl}'
                                });
                                const iosFallbackWithParams = originalUrl + (originalUrl.includes('?') ? '&' : '?') + iosParams.toString();
                                copyToClipboard(iosFallbackWithParams);
                                window.location.href = iosFallbackWithParams;
                            }

                    </script>
                </head>
                <body style="margin: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: Arial, sans-serif; padding: 20px;">
                    <h1 style="margin-bottom: 16px;">${linkData.title}</h1>
                    <p style="margin-bottom: 24px;">${linkData.description}</p>
                    <button onclick="openApp()" 
                            style="background-color: #007AFF; color: white; border: none; padding: 12px 24px; 
                            border-radius: 8px; font-size: 16px; cursor: pointer;">
                        Open App
                    </button>
                </body>
            </html>
        `);
  } else {
    res.redirect(linkData.webUrl);
  }
});

// 5. List all links
app.get("/api/links", (req, res) => {
  const links = Array.from(linksStore.values()).map((link) => ({
    shortCode: link.shortCode,
    title: link.title,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
  }));

  res.json(links);
});

// 6. Domain verification files for App Links
app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: `TEAM_ID.${CONFIG.androidPackage}`,
          paths: ["*"],
        },
      ],
    },
  });
});

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.json([
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: "in.zupay.app",
        sha256_cert_fingerprints: [
          "6A:8E:AD:C8:15:29:8B:31:FC:BA:95:28:AF:4A:F2:90:91:C2:0E:B8:F0:A1:D5:39:BC:FA:2F:87:4D:93:84:F1",
          "A3:C0:D1:CF:F6:68:13:F0:CB:72:5A:29:F2:77:E8:5D:C6:70:81:46:33:D9:48:A5:76:95:E6:7D:B6:50:15:E4",
          "A5:0F:F8:CA:0E:45:6D:06:3C:A8:03:55:87:1C:9A:0B:52:06:6B:1E:41:DD:E1:55:4A:23:2B:88:98:A1:59:4F",
        ],
      },
    },
  ]);
});

app.get("/", (req, res) => {
  res.send("Dynamic Links Server is up and running!");
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Dynamic Links Server running on port ${PORT}`);
  console.log(`🔗 Domain: ${CONFIG.domain}`);
  console.log(`📱 iOS App: ${CONFIG.iosAppId}`);
  console.log(`🤖 Android App: ${CONFIG.androidPackage}`);
});

// Export for testing
module.exports = app;
