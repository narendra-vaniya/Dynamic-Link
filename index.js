const express = require('express');
const crypto = require('crypto');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (replace with database in production)
const linksStore = new Map();
const deferredStore = new Map();

// Configuration
const CONFIG = {
    domain: 'dynamic-link-aiux.onrender.com',
    appName: 'ZuAI',
    iosAppId: 'id1609941536',
    androidPackage: 'in.zupay.app',
    iosScheme: 'zuaiapp',
    androidScheme: 'zuaiapp'
};

// Utility Functions
const generateShortCode = () => {
    return crypto.randomBytes(4).toString('hex');
};

const detectPlatform = (userAgent) => {
    const ua = userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/mobile/.test(ua)) return 'mobile-web';
    return 'desktop';
};

const generateFingerprint = (req) => {
    const components = [
        req.ip,
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['accept-encoding'] || ''
    ];
    
    return crypto
        .createHash('sha256')
        .update(components.join('|'))
        .digest('hex')
        .substring(0, 16);
};

// Routes

// 1. Create Short Link
app.post('/api/create-link', (req, res) => {
    const {
        originalUrl,
        title,
        description,
        image,
        iosUrl,
        androidUrl,
        webUrl,
        iosFallback,
        androidFallback,
        customParams = {}
    } = req.body;
    
    if (!originalUrl && !webUrl) {
        return res.status(400).json({ error: 'originalUrl or webUrl is required' });
    }
    
    const shortCode = generateShortCode();
    const linkId = `link_${shortCode}`;
    
    const linkData = {
        id: linkId,
        shortCode,
        originalUrl: originalUrl || webUrl,
        title: title || 'Shared Content',
        description: description || '',
        image: image || '',
        iosUrl: iosUrl || `${CONFIG.iosScheme}://open?url=${encodeURIComponent(originalUrl || webUrl)}`,
        androidUrl: androidUrl || `${CONFIG.androidScheme}://open?url=${encodeURIComponent(originalUrl || webUrl)}`,
        webUrl: webUrl || originalUrl,
        iosFallback: iosFallback || `https://apps.apple.com/app/id${CONFIG.iosAppId}`,
        androidFallback: androidFallback || `https://play.google.com/store/apps/details?id=${CONFIG.androidPackage}`,
        customParams,
        createdAt: Date.now()
    };
    
    linksStore.set(shortCode, linkData);
    
    const shortUrl = `https://${CONFIG.domain}/${shortCode}`;
    
    console.log(`🔗 Created short link: ${shortUrl} → ${linkData.originalUrl}`);
    
    res.json({
        shortUrl,
        shortCode,
        linkId,
        originalUrl: linkData.originalUrl,
        createdAt: linkData.createdAt
    });
});

// 2. Get Link Details
app.get('/api/link/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const linkData = linksStore.get(shortCode);
    
    if (!linkData) {
        return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json(linkData);
});

// 3. Main Short Link Handler
app.get('/:shortCode', (req, res) => {
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
    
    const userAgent = req.headers['user-agent'] || '';
    const platform = detectPlatform(userAgent);
    const fingerprint = generateFingerprint(req);
    
    console.log(`🔍 Link accessed: ${shortCode} from ${platform}`);
    
    // Store deferred deep link data for potential app install
    const deferredData = {
        linkId: linkData.id,
        originalUrl: linkData.originalUrl,
        customParams: linkData.customParams,
        timestamp: Date.now(),
        fingerprint,
        platform
    };
    
    deferredStore.set(fingerprint, deferredData);
    
    // Set expiration for deferred data (24 hours)
    setTimeout(() => {
        deferredStore.delete(fingerprint);
    }, 24 * 60 * 60 * 1000);
    
    // Platform-specific handling
    if (platform === 'ios') {
        // Try to open app first, fallback to web
        res.send(`
            <html>
                <head>
                    <title>${linkData.title}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta property="og:title" content="${linkData.title}">
                    <meta property="og:description" content="${linkData.description}">
                    <meta property="og:image" content="${linkData.image}">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; text-align: center; }
                        .banner { background: #007AFF; color: white; padding: 15px; border-radius: 10px; margin: 20px 0; }
                        .btn { display: inline-block; padding: 12px 24px; background: #007AFF; color: white; text-decoration: none; border-radius: 6px; margin: 10px; }
                        .content { max-width: 600px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h1>${linkData.title}</h1>
                        <p>${linkData.description}</p>
                        
                        <div class="banner">
                            <strong>📱 Get the ${CONFIG.appName} app for the best experience!</strong>
                        </div>
                        
                        <a href="${linkData.iosFallback}" class="btn">📱 Download App</a>
                        <a href="${linkData.webUrl}" class="btn">🌐 Continue on Web</a>
                        
                        <script>
                            // Try to open app immediately
                            window.location.href = '${linkData.iosUrl}';
                            
                            // If app doesn't open in 2 seconds, redirect to fallback
                            setTimeout(() => {
                                console.log('App not installed, redirecting to fallback');
                                window.location.href = '${linkData.iosFallback}';
                            }, 2000);
                            
                            // Store for deferred deep linking
                            localStorage.setItem('pendingDeepLink', JSON.stringify({
                                url: '${linkData.originalUrl}',
                                params: ${JSON.stringify(linkData.customParams)},
                                timestamp: Date.now()
                            }));
                        </script>
                    </div>
                </body>
            </html>
        `);
        
    } else if (platform === 'android') {
        res.send(`
            <html>
                <head>
                    <title>${linkData.title}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta property="og:title" content="${linkData.title}">
                    <meta property="og:description" content="${linkData.description}">
                    <meta property="og:image" content="${linkData.image}">
                    <style>
                        body { font-family: 'Roboto', Arial, sans-serif; padding: 20px; text-align: center; }
                        .banner { background: #4CAF50; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
                        .btn { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 10px; }
                        .content { max-width: 600px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h1>${linkData.title}</h1>
                        <p>${linkData.description}</p>
                        
                        <div class="banner">
                            <strong>📱 Get the ${CONFIG.appName} app for the best experience!</strong>
                        </div>
                        
                        <a href="${linkData.androidFallback}" class="btn">📱 Download App</a>
                        <a href="${linkData.webUrl}" class="btn">🌐 Continue on Web</a>
                        
                        <script>
                            // Try to open app immediately
                            window.location.href = '${linkData.androidUrl}';
                            
                            // If app doesn't open in 2 seconds, redirect to fallback
                            setTimeout(() => {
                                console.log('App not installed, redirecting to fallback');
                                window.location.href = '${linkData.androidFallback}';
                            }, 2000);
                            
                            // Store for deferred deep linking
                            localStorage.setItem('pendingDeepLink', JSON.stringify({
                                url: '${linkData.originalUrl}',
                                params: ${JSON.stringify(linkData.customParams)},
                                timestamp: Date.now()
                            }));
                        </script>
                    </div>
                </body>
            </html>
        `);
        
    } else {
        // Desktop or mobile web
        res.send(`
            <html>
                <head>
                    <title>${linkData.title}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta property="og:title" content="${linkData.title}">
                    <meta property="og:description" content="${linkData.description}">
                    <meta property="og:image" content="${linkData.image}">
                    <style>
                        body { font-family: system-ui, sans-serif; padding: 20px; text-align: center; }
                        .app-banner { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
                        .btn { display: inline-block; padding: 12px 24px; background: #333; color: white; text-decoration: none; border-radius: 4px; margin: 10px; }
                        .content { max-width: 600px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h1>${linkData.title}</h1>
                        <p>${linkData.description}</p>
                        
                        <div class="app-banner">
                            <strong>📱 Available on mobile!</strong><br>
                            Get the ${CONFIG.appName} app for the best experience.
                        </div>
                        
                        <a href="${linkData.webUrl}" class="btn">🌐 Continue</a>
                        
                        <script>
                            // Redirect to web content after a short delay
                            setTimeout(() => {
                                window.location.href = '${linkData.webUrl}';
                            }, 1000);
                        </script>
                    </div>
                </body>
            </html>
        `);
    }
});

// 4. Deferred Deep Link Check (for apps to call on first launch)
app.get('/api/deferred/:fingerprint', (req, res) => {
    const { fingerprint } = req.params;
    const deferredData = deferredStore.get(fingerprint);
    
    if (!deferredData) {
        return res.json({ found: false });
    }
    
    // Check if data is still valid (within 24 hours)
    const age = Date.now() - deferredData.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
        deferredStore.delete(fingerprint);
        return res.json({ found: false });
    }
    
    // Mark as consumed
    deferredStore.delete(fingerprint);
    
    res.json({
        found: true,
        url: deferredData.originalUrl,
        params: deferredData.customParams,
        linkId: deferredData.linkId
    });
});

// 5. List all links
app.get('/api/links', (req, res) => {
    const links = Array.from(linksStore.values()).map(link => ({
        shortCode: link.shortCode,
        title: link.title,
        originalUrl: link.originalUrl,
        createdAt: link.createdAt
    }));
    
    res.json(links);
});

// 6. Domain verification files for App Links
app.get('/.well-known/apple-app-site-association', (req, res) => {
    res.json({
        applinks: {
            apps: [],
            details: [
                {
                    appID: `TEAM_ID.${CONFIG.androidPackage}`,
                    paths: ["*"]
                }
            ]
        }
    });
});

app.get('/.well-known/assetlinks.json', (req, res) => {
    res.json([
        {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app",
                package_name: CONFIG.androidPackage,
                sha256_cert_fingerprints: ["YOUR_APP_SIGNING_CERT_FINGERPRINT"]
            }
        }
    ]);
});

// 7. Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        linksCount: linksStore.size
    });
});

app.get("/",(req,res)=>{
    res.send("Dynamic Links Server is up and running!");
})

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
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