// Import necessary libraries
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import cors

// Create an Express application instance
const app = express();
// Use the PORT environment variable provided by the hosting platform (like DigitalOcean),
// or default to 3000 for local development.
const port = process.env.PORT || 3000;

// Use middleware
app.use(cors({
    origin: 'https://verdant-cucurucho-13134b.netlify.app' // Allow requests only from this specific origin
}));
app.use(express.json()); // For parsing application/json (required to receive cookies in body)
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded (if needed)

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Incoming Request: ${req.method} ${req.originalUrl}`);
    console.log('  Headers:', req.headers);
    console.log('  Query Params:', req.query); // Log query parameters
    console.log('  Request Body:', req.body); // Log request body (will contain cookies if sent)
    next(); // Continue to the next middleware or route handler
});

// --- Helper function to fetch captcha ---
// This function now returns Base64 image and any new/updated cookies
async function fetchCaptcha(url, cookiesString, referer, userAgent) {
    console.log(`[${new Date().toISOString()}] Making external request to: ${url}`);
    const requestHeaders = {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookiesString, // <--- THIS LINE USES THE COOKIES STRING PASSED FROM THE ROUTE
        'Referer': referer,
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Priority': 'i',
        'sec-ch-ua': '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'Connection': 'keep-alive'
    };
    console.log('  Request Headers (to external site):', requestHeaders);

    try {
        // Make the HTTP request to the external captcha URL
        const response = await axios.get(url, {
            headers: requestHeaders, // Use the constructed headers
            responseType: 'arraybuffer' // Crucial for handling binary image data
        });

        console.log(`[${new Date().toISOString()}] External Response Status: ${response.status}`);
        console.log('  Response Headers (from external site):', response.headers);

        // Convert image buffer to Base64
        const imageBase64 = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'];

        // Extract and return Set-Cookie headers
        const setCookieHeaders = response.headers['set-cookie'];
        let receivedCookies = {};
        if (setCookieHeaders) {
            setCookieHeaders.forEach(cookieStr => {
                // Parse each cookie string, e.g., "PHPSESSID=abc; path=/; HttpOnly"
                const parts = cookieStr.split(';')[0].split('=');
                if (parts.length >= 2) {
                    const cookieName = parts[0];
                    const cookieValue = parts.slice(1).join('=');
                    receivedCookies[cookieName] = cookieValue;
                }
            });
            console.log(`[${new Date().toISOString()}] Received new/updated cookies:`, receivedCookies);
        }

        return {
            imageBase64: `data:${contentType};base64,${imageBase64}`, // Data URI format
            cookies: receivedCookies // Return parsed cookies
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching captcha from ${url}:`, error.message);
        if (error.response) {
            console.error('  Response Status:', error.response.status);
            console.error('  Response Headers:', error.response.headers);
            // If the error is a timeout, log that specifically
            if (error.code === 'ECONNABORTED') {
                console.error('  Full Error Details: AxiosError: timeout of 45000ms exceeded');
            }
        } else if (error.request) {
            console.error('  No response received:', error.request);
        } else {
            console.error('  Error details:', error.message);
        }
        throw new Error('Failed to fetch captcha image');
    }
}

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
    console.log(`[${new Date().toISOString()}] Health check endpoint hit.`);
    res.status(200).send('OK');
});

// --- Route for High Court Captcha ---
app.post('/captcha/highcourt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Handling High Court Captcha request (POST).`);

    const cookiesFromFrontend = req.body.cookies;

    if (!cookiesFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies in request body for High Court Captcha.`);
        return res.status(400).json({ error: 'Cookies are required in the request body.' }); // Send JSON error
    }

    const cookiesString = Object.entries(cookiesFromFrontend)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    console.log(`  Received and formatted cookies from body: ${cookiesString}`);

    const referer = req.headers['referer'] || 'https://hcservices.ecourts.gov.in/';
    const userAgent = req.headers['user-agent'];

    const cacheBuster = Date.now();
    const captchaUrl = `https://hcservices.ecourts.gov.in/hcservices/securimage/securimage_show.php?${cacheBuster}`;

    try {
        const { imageBase64, cookies: newCookies } = await fetchCaptcha(captchaUrl, cookiesString, referer, userAgent);

        // Send back a JSON object containing both the Base64 image and any new cookies
        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies // Send back the new cookies received from the eCourts server
        });
        console.log(`[${new Date().toISOString()}] Sent High Court Captcha response with Base64 image and new cookies.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in High Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message }); // Send JSON error
    }
});

// --- Route for District Court Captcha ---
app.post('/captcha/districtcourt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Handling District Court Captcha request (POST).`);

    const cookiesFromFrontend = req.body.cookies;
    const captchaId = req.body.id;

    if (!cookiesFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies in request body for District Court Captcha.`);
        return res.status(400).json({ error: 'Cookies are required in the request body.' });
    }

    if (!captchaId) {
        console.error(`[${new Date().toISOString()}] Missing Captcha ID in request body for District Court request.`);
        return res.status(400).json({ error: 'Captcha ID is required in the request body.' });
    }

    const cookiesString = Object.entries(cookiesFromFrontend)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    console.log(`  Received and formatted cookies from body: ${cookiesString}`);
    console.log(`  Received Captcha ID from body: ${captchaId}`);

    const referer = req.headers['referer'] || 'https://lucknow.dcourts.gov.in/case-status-search-by-petitioner-respondent/';
    const userAgent = req.headers['user-agent'];

    const captchaUrl = `https://lucknow.dcourts.gov.in/?_siwp_captcha&id=${captchaId}`;

    try {
        const { imageBase64, cookies: newCookies } = await fetchCaptcha(captchaUrl, cookiesString, referer, userAgent);

        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies // Send back the new cookies received from the eCourts server
        });
        console.log(`[${new Date().toISOString()}] Sent District Court Captcha response with Base64 image and new cookies.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in District Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- Start the server ---
app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Captcha proxy backend listening at http://localhost:${port}`);
});
