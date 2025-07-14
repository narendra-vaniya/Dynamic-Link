const express = require("express");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
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

// Helper function to encode deep link data
const encodeDeepLinkData = (linkData) => {
  return btoa(JSON.stringify(linkData));
};

// Serve static files from .well-known
app.use('/.well-known', express.static(path.join(__dirname, '.well-known'), {
  setHeaders: function (res, filePath) {
    if (filePath.endsWith('apple-app-site-association') || filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));


app.post("/api/create-link", (req, res) => {
  let { title, description, image, customParams = {}, originalUrl } = req.body;

  // Set defaults
  const baseUrl = originalUrl || "https://zuai.co";
  const androidUrl = `zuaiapp://zuai.co/`;
  const iosUrl = `zuaiapp://zuai.co/`;
  const webUrl = baseUrl;
  const androidFallback =
    "https://play.google.com/store/apps/details?id=in.zupay.app";
  const iosFallback =
    "https://apps.apple.com/us/app/zuai-ace-ap-sat-act-tests/id1609941536";

  title ||= "Open in App?";
  description ||= "";
  image ||=
    "https://storage.googleapis.com/zuai-media-storage-in/web-lp/metadata/main_og_image.png";

  const shortCode = generateShortCode();
  const linkId = `link_${shortCode}`;

  const linkData = {
    id: linkId,
    shortCode,
    originalUrl: baseUrl,
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

  // Build deep link URLs with parameters
  const buildDeepLinkUrl = (baseUrl, params) => {
    const url = new URL(baseUrl);
    Object.keys(params).forEach((key) => {
      url.searchParams.append(key, params[key]);
    });
    return url.toString();
  };

  // Build fallback URLs with deferred deep link data
  const buildFallbackUrl = (baseUrl, params) => {
    const url = new URL(baseUrl);
    Object.keys(params).forEach((key) => {
      url.searchParams.append(key, params[key]);
    });
    return url.toString();
  };

  if (platform === "android" || platform === "ios") {
    // Prepare deep link data
    const deepLinkData = {
      ...linkData.customParams,
      originalUrl: linkData.originalUrl,
      linkId: linkData.id,
      timestamp: Date.now(),
    };

    // Build URLs
    const appUrl = platform === "ios" ? linkData.iosUrl : linkData.androidUrl;
    const deepLinkUrl = buildDeepLinkUrl(appUrl, deepLinkData);

    // For fallback, encode the deep link data
    const encodedData = encodeDeepLinkData(deepLinkData);
    const fallbackUrl =
      platform === "ios" ? linkData.iosFallback : linkData.androidFallback;
    const fallbackUrlWithData = buildFallbackUrl(fallbackUrl, {
      dl_data: encodedData,
      link_id: linkData.id,
    });

    return res.status(200).send(`
            <html>
                <head>
                    <title>${linkData.title}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script>
                        let appOpened = false;
                        let fallbackTriggered = false;

                        async function copyToClipboard(text) {
                            try {
                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                    await navigator.clipboard.writeText(text);
                                    console.log('Text copied to clipboard successfully');
                                    return true;
                                } else {
                                    // Fallback for older browsers
                                    const textArea = document.createElement('textarea');
                                    textArea.value = text;
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(textArea);
                                    console.log('Text copied to clipboard (fallback method)');
                                    return true;
                                }
                            } catch (err) {
                                console.error('Failed to copy text: ', err);
                                return false;
                            }
                        }

                        function detectIfAppOpened() {
                            const startTime = Date.now();
                            
                            setTimeout(() => {
                                const endTime = Date.now();
                                // If we're still here after 3 seconds and page is visible, app probably didn't open
                                if (endTime - startTime < 3100 && document.visibilityState === 'visible' && !appOpened) {
                                    console.log('App probably not installed, redirecting to store');
                                    redirectToStore();
                                }
                            }, 3000);
                        }

                        function redirectToStore() {
                            if (fallbackTriggered) return;
                            fallbackTriggered = true;
                            
                            const fallbackUrl = '${fallbackUrlWithData}';
                            const deepLinkData = ${JSON.stringify(
                              deepLinkData
                            )};
                            
                            // Copy deep link data to clipboard for later use
                            copyToClipboard(JSON.stringify(deepLinkData)).then(() => {
                                console.log('Deep link data copied to clipboard');
                            });
                            
                            window.location.href = fallbackUrl;
                        }

                        function openApp() {
                            const deepLinkUrl = '${deepLinkUrl}';
                            console.log('Attempting to open app with URL:', deepLinkUrl);
                            
                            // Set up visibility change listener
                            document.addEventListener('visibilitychange', function() {
                                if (document.visibilityState === 'hidden') {
                                    appOpened = true;
                                    console.log('App opened successfully');
                                }
                            });

                            // Try to open the app
                            window.location.href = deepLinkUrl;
                            
                            // Start detection
                            detectIfAppOpened();
                        }

                        // Auto-open app when page loads
                        window.addEventListener('load', function() {
                            setTimeout(openApp, 100);
                        });

                        // Handle page focus/blur events
                        window.addEventListener('blur', function() {
                            appOpened = true;
                        });

                        window.addEventListener('focus', function() {
                            if (!appOpened && !fallbackTriggered) {
                                console.log('Page focused, app probably not installed');
                                redirectToStore();
                            }
                        });
                    </script>
                </head>
                <body style="margin: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 400px; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h1 style="margin-bottom: 16px; color: #333;">${
                          linkData.title
                        }</h1>
                        <p style="margin-bottom: 24px; color: #666;">${
                          linkData.description
                        }</p>
                        <div style="margin-bottom: 20px;">
                            <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #007AFF; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <p style="margin-top: 10px; color: #666;">Opening app...</p>
                        </div>
                        <button onclick="openApp()" 
                                style="background-color: #007AFF; color: white; border: none; padding: 12px 24px; 
                                border-radius: 8px; font-size: 16px; cursor: pointer; width: 100%;">
                            Open App
                        </button>
                        <p style="margin-top: 15px; font-size: 12px; color: #999;">
                            If the app doesn't open automatically, you'll be redirected to the app store.
                        </p>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </body>
            </html>
        `);
  } else {
    // For desktop/web, redirect to web URL
    res.redirect(linkData.webUrl);
  }
});


app.get("/api/deferred/:linkId", (req, res) => {
  const { linkId } = req.params;

  // Find link by ID
  const linkData = Array.from(linksStore.values()).find(
    (link) => link.id === linkId
  );

  if (!linkData) {
    return res.status(404).json({ error: "Link not found" });
  }

  res.json({
    linkId: linkData.id,
    originalUrl: linkData.originalUrl,
    customParams: linkData.customParams,
    title: linkData.title,
    description: linkData.description,
  });
});


app.get("/api/links", (req, res) => {
  const links = Array.from(linksStore.values()).map((link) => ({
    shortCode: link.shortCode,
    title: link.title,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
  }));

  res.json(links);
});



app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>Dynamic Links Server</title></head>
      <body style="font-family: Arial, sans-serif; margin: 40px; text-align: center;">
        <h1>🔗 Dynamic Links Server</h1>
        <p>Server is up and running!</p>
        <p><strong>Domain:</strong> ${CONFIG.domain}</p>
        <p><strong>iOS App:</strong> ${CONFIG.iosAppId}</p>
        <p><strong>Android App:</strong> ${CONFIG.androidPackage}</p>
      </body>
    </html>
  `);
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
