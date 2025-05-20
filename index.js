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

/**
 * Parses a cookie string into an object, handling potential duplicates by taking the last value.
 * Also extracts common session IDs.
 * @param {string} cookieString - The raw Cookie header string.
 * @returns {{parsedCookies: object, sessionId: string|null}}
 */
function parseCookieString(cookieString) {
    const parsedCookies = {};
    let sessionId = null;

    if (!cookieString) {
        return { parsedCookies: {}, sessionId: null };
    }

    // Split by '; ' to get individual cookie parts
    cookieString.split('; ').forEach(part => {
        const [name, value] = part.split('=');
        if (name && value) {
            // Assign the value. If there are duplicates, the last one wins (as in browser behavior).
            parsedCookies[name.trim()] = value.trim();

            // Check for common session cookie names
            const lowerCaseName = name.trim().toLowerCase();
            if (lowerCaseName === 'phpsessid' ||
                lowerCaseName.startsWith('asp.net_sessionid') ||
                lowerCaseName.startsWith('jsessionid') ||
                lowerCaseName.includes('session') || // Generic check
                lowerCaseName === 'hcservices_sessid' // Specific to your case
            ) {
                sessionId = value.trim();
            }
        }
    });

    // A common pattern is that the JSESSIONID or PHPSESSID is the main session ID.
    // Prioritize specific ones if they exist.
    if (parsedCookies['JSESSIONID']) {
        sessionId = parsedCookies['JSESSIONID'];
    } else if (parsedCookies['PHPSESSID']) {
        sessionId = parsedCookies['PHPSESSID'];
    } else if (parsedCookies['HCSERVICES_SESSID']) { // Specific to your case
        sessionId = parsedCookies['HCSERVICES_SESSID'];
    }


    return { parsedCookies, sessionId };
}


// --- Helper function to fetch captcha ---
// This function now returns Base64 image, new/updated cookies, and the session ID
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
        let sessionId = null; // Initialize sessionId

        if (setCookieHeaders) {
            // Process all Set-Cookie headers to build a comprehensive cookie object
            // and identify the primary session ID.
            setCookieHeaders.forEach(cookieStr => {
                const parts = cookieStr.split(';')[0].split('=');
                if (parts.length >= 2) {
                    const cookieName = parts[0];
                    const cookieValue = parts.slice(1).join('=');
                    // Store the cookie. If duplicate, the last one set by the server is typically the one used.
                    receivedCookies[cookieName] = cookieValue;
                }
            });

            // Now, from the *parsed* receivedCookies, try to identify the sessionId
            // Prioritize specific session cookies
            if (receivedCookies['JSESSIONID']) {
                sessionId = receivedCookies['JSESSIONID'];
            } else if (receivedCookies['PHPSESSID']) {
                sessionId = receivedCookies['PHPSESSID'];
            } else if (receivedCookies['HCSERVICES_SESSID']) {
                sessionId = receivedCookies['HCSERVICES_SESSID'];
            } else {
                // Fallback to a generic search if specific ones aren't found
                for (const name in receivedCookies) {
                    if (name.toLowerCase().includes('session')) {
                        sessionId = receivedCookies[name];
                        break; // Take the first one found
                    }
                }
            }


            console.log(`[${new Date().toISOString()}] Received new/updated cookies:`, receivedCookies);
            if (sessionId) {
                console.log(`[${new Date().toISOString()}] Identified Session ID: ${sessionId}`);
            }
        }

        return {
            imageBase64: `data:${contentType};base64,${imageBase64}`, // Data URI format
            cookies: receivedCookies, // Return parsed cookies object
            sessionId: sessionId // Return the extracted session ID
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching captcha from ${url}:`, error.message);
        if (error.response) {
            console.error('  Response Status:', error.response.status);
            console.error('  Response Headers:', error.response.headers);
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

    const cookiesStringFromFrontend = req.body.cookies; // This is the string from frontend

    if (!cookiesStringFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies string in request body for High Court Captcha.`);
        return res.status(400).json({ error: 'Cookies string is required in the request body.' });
    }

    // No need to parse here if fetchCaptcha is expecting the string directly
    // const { parsedCookies: initialCookiesFromFrontend, sessionId: initialSessionIdFromFrontend } = parseCookieString(cookiesStringFromFrontend);
    // console.log(`  Received and parsed cookies from body:`, initialCookiesFromFrontend);

    console.log(`  Received cookies string from body: ${cookiesStringFromFrontend}`); // Log the raw string

    const referer = req.headers['referer'] || 'https://hcservices.ecourts.gov.in/';
    const userAgent = req.headers['user-agent'];

    const cacheBuster = Date.now();
    const captchaUrl = `https://hcservices.ecourts.gov.in/hcservices/securimage/securimage_show.php?${cacheBuster}`;

    try {
        // Pass the raw string directly to fetchCaptcha's cookiesString argument
        const { imageBase64, cookies: newCookies, sessionId } = await fetchCaptcha(captchaUrl, cookiesStringFromFrontend, referer, userAgent);

        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies, // Send back the new cookies object received from the eCourts server
            sessionId: sessionId // Send back the extracted session ID
        });
        console.log(`[${new Date().toISOString()}] Sent High Court Captcha response with Base64 image, new cookies, and session ID.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in High Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});


// --- Route for District Court Captcha ---
app.post('/captcha/districtcourt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Handling District Court Captcha request (POST).`);

    // EXPECTING: req.body.cookies will now be a STRING
    const cookiesStringFromFrontend = req.body.cookies;
    const captchaId = req.body.id;

    if (!cookiesStringFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies string in request body for District Court Captcha.`);
        return res.status(400).json({ error: 'Cookies string is required in the request body.' });
    }

    if (!captchaId) {
        console.error(`[${new Date().toISOString()}] Missing Captcha ID in request body for District Court request.`);
        return res.status(400).json({ error: 'Captcha ID is required in the request body.' });
    }

    // Parse the incoming cookie string
    const { parsedCookies: initialCookiesFromFrontend, sessionId: initialSessionIdFromFrontend } = parseCookieString(cookiesStringFromFrontend);

    console.log(`  Received and parsed cookies from body:`, initialCookiesFromFrontend);
    console.log(`  Identified initial session ID from body:`, initialSessionIdFromFrontend);
    console.log(`  Received Captcha ID from body: ${captchaId}`);


    const referer = req.headers['referer'] || 'https://lucknow.dcourts.gov.in/case-status-search-by-petitioner-respondent/';
    const userAgent = req.headers['user-agent'];

    const captchaUrl = `https://lucknow.dcourts.gov.in/?_siwp_captcha&id=${captchaId}`;

    try {
        const { imageBase64, cookies: newCookies, sessionId } = await fetchCaptcha(captchaUrl, cookiesStringFromFrontend, referer, userAgent);

        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies, // Send back the new cookies object received from the eCourts server
            sessionId: sessionId // Send back the extracted session ID
        });
        console.log(`[${new Date().toISOString()}] Sent District Court Captcha response with Base64 image, new cookies, and session ID.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in District Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- Start the server ---
app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Captcha proxy backend listening at http://localhost:${port}`);
});
