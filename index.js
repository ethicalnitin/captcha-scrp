// Import necessary libraries
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import cors
const querystring = require('querystring'); // Needed for case verification payload

// Create an Express application instance
const app = express();
// Use the PORT environment variable provided by the hosting platform (like DigitalOcean),
// or default to 3000 for local development.
const port = process.env.PORT || 3000;

// ScraperAPI Configuration
const scraperApiKey = process.env.SCRAPERAPI_KEY; // Ensure this is set in your environment
const scraperApiEndpoint = 'http://api.scraperapi.com/'; // ScraperAPI's base URL

// Check if ScraperAPI key is provided
if (!scraperApiKey) {
    console.warn(`[${new Date().toISOString()}] WARNING: SCRAPERAPI_KEY environment variable is not set. ScraperAPI will not be used for main verification route and captcha fetching.`);
}


// Use middleware
app.use(cors({
    origin: 'https://verdant-cucurucho-13134b.netlify.app' // Allow requests only from this specific origin
}));
app.use(express.json()); // For parsing application/json (required to receive cookies in body)
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded (if needed)

// Middleware to log incoming requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Incoming Request: ${req.method} ${req.originalUrl}`);
    // console.log(`[${timestamp}]   Headers:`, req.headers); // Too verbose for production logs usually
    // console.log(`[${timestamp}]   Query Params:`, req.query);
    // console.log(`[${timestamp}]   Request Body:`, req.body);
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
        console.log(`[${new Date().toISOString()}] parseCookieString: Received empty cookie string.`);
        return { parsedCookies: {}, sessionId: null };
    }

    // console.log(`[${new Date().toISOString()}] parseCookieString: Attempting to parse cookie string: "${cookieString}"`);

    // Split by '; ' to get individual cookie parts
    cookieString.split(';').forEach(part => { // Split by ';' instead of '; ' to handle cases where space is missing
        const [name, value] = part.split('=');
        if (name && value) {
            const trimmedName = name.trim();
            const trimmedValue = value.trim();
            // Assign the value. If there are duplicates, the last one wins (as in browser behavior).
            parsedCookies[trimmedName] = trimmedValue;
            // console.log(`[${new Date().toISOString()}]   Parsed cookie: ${trimmedName}=${trimmedValue}`);


            // Check for common session cookie names
            const lowerCaseName = trimmedName.toLowerCase();
            if (lowerCaseName === 'phpsessid' ||
                lowerCaseName.startsWith('asp.net_sessionid') ||
                lowerCaseName.startsWith('jsessionid') ||
                lowerCaseName.includes('session') || // Generic check
                lowerCaseName === 'hcservices_sessid' // Specific to your case
            ) {
                sessionId = trimmedValue;
                // console.log(`[${new Date().toISOString()}]   Identified potential session cookie: ${trimmedName}`);
            }
        } else {
            console.warn(`[${new Date().toISOString()}]   parseCookieString: Skipping malformed cookie part: "${part}"`);
        }
    });

    // Prioritize specific session IDs if present in the final parsed set
    if (parsedCookies['JSESSIONID']) {
        sessionId = parsedCookies['JSESSIONID'];
        // console.log(`[${new Date().toISOString()}] parseCookieString: Prioritizing JSESSIONID: ${sessionId}`);
    } else if (parsedCookies['PHPSESSID']) {
        sessionId = parsedCookies['PHPSESSID'];
        // console.log(`[${new Date().toISOString()}] parseCookieString: Prioritizing PHPSESSID: ${sessionId}`);
    } else if (parsedCookies['HCSERVICES_SESSID']) { // Specific to your case
        sessionId = parsedCookies['HCSERVICES_SESSID'];
        // console.log(`[${new Date().toISOString()}] parseCookieString: Prioritizing HCSERVICES_SESSID: ${sessionId}`);
    }

    // console.log(`[${new Date().toISOString()}] parseCookieString: Final parsed cookies:`, parsedCookies);
    // console.log(`[${new Date().toISOString()}] parseCookieString: Final identified sessionId: ${sessionId}`);

    return { parsedCookies, sessionId };
}


// --- Helper function to fetch captcha ---
// This function now returns Base64 image, new/updated cookies (as object), and the session ID
async function fetchCaptcha(url, cookiesStringFromFrontend, referer, userAgent) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Making external request to: ${url}`);

    // Headers to send to eCourts for captcha fetch.
    // Use the raw cookiesStringFromFrontend directly for the Cookie header.
    const requestHeaders = {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookiesStringFromFrontend || '', // IMPORTANT: Use the raw string from frontend
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
    console.log(`[${timestamp}]   Request Headers (to external site for captcha):`, requestHeaders);

    try {
        let response;
        if (scraperApiKey) {
            console.log(`[${timestamp}]   Fetching captcha via ScraperAPI.`);
            const scraperApiParams = {
                api_key: scraperApiKey,
                url: url,
            };
            response = await axios.get(scraperApiEndpoint, {
                params: scraperApiParams,
                headers: requestHeaders, // These headers are forwarded by ScraperAPI
                responseType: 'arraybuffer', // Crucial for image data
                timeout: 60000, // Increased timeout for ScraperAPI
            });
        } else {
            console.log(`[${timestamp}]   Fetching captcha directly.`);
            response = await axios.get(url, {
                headers: requestHeaders,
                responseType: 'arraybuffer', // Crucial for handling binary image data
                timeout: 30000 // Direct timeout
            });
        }

        console.log(`[${timestamp}] External Captcha Response Status: ${response.status}`);
        console.log(`[${timestamp}]   Response Headers (from external site via proxy):`, response.headers);

        // Convert image buffer to Base64
        const imageBase64 = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'];

        // Extract and return Set-Cookie headers
        const setCookieHeaders = response.headers['set-cookie'];
        let receivedCookies = {};
        let sessionId = null; // Initialize sessionId

        if (setCookieHeaders) {
            // Process all Set-Cookie headers to build a comprehensive cookie object
            setCookieHeaders.forEach(cookieStr => {
                const parts = cookieStr.split(';')[0].split('=');
                if (parts.length >= 2) {
                    const cookieName = parts[0];
                    const cookieValue = parts.slice(1).join('=');
                    // Store the cookie. If duplicate, the last one set by the server is typically the one used.
                    receivedCookies[cookieName.trim()] = cookieValue.trim();
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

            console.log(`[${timestamp}]   Received new/updated cookies:`, receivedCookies);
            if (sessionId) {
                console.log(`[${timestamp}]   Identified Session ID: ${sessionId}`);
            }
        } else {
            console.warn(`[${timestamp}] No 'Set-Cookie' headers received from captcha endpoint.`);
        }

        return {
            imageBase64: `data:${contentType};base64,${imageBase64}`, // Data URI format
            cookies: receivedCookies, // Return parsed cookies object for frontend to store
            sessionId: sessionId // Return the extracted session ID
        };

    } catch (error) {
        console.error(`[${timestamp}] Error fetching captcha from ${url}:`, error.message);
        if (error.response) {
            console.error(`[${timestamp}]   Response Status:`, error.response.status);
            console.error(`[${timestamp}]   Response Headers:`, error.response.headers);
            console.error(`[${timestamp}]   Response Data (preview): ${String(error.response.data).substring(0, 200)}...`);
            if (error.code === 'ECONNABORTED') {
                console.error('  Full Error Details: AxiosError: timeout exceeded');
            }
        } else if (error.request) {
            console.error(`[${timestamp}]   No response received from target server.`);
        } else {
            console.error(`[${timestamp}]   Error setting up the request: ${error.message}`);
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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Handling High Court Captcha request (POST).`);

    // The frontend should send the previous cookies string here.
    // If it's the very first request, it might send an empty string or null.
    const cookiesStringFromFrontend = req.body.cookies || '';

    console.log(`[${timestamp}]   Received cookies string from frontend for captcha: "${cookiesStringFromFrontend}"`);

    const referer = req.headers['referer'] || 'https://hcservices.ecourts.gov.in/';
    const userAgent = req.headers['user-agent'];

    const cacheBuster = Date.now();
    const captchaUrl = `https://hcservices.ecourts.gov.in/hcservices/securimage/securimage_show.php?${cacheBuster}`;

    try {
        // Pass the raw string directly to fetchCaptcha's cookiesStringFromFrontend argument
        const { imageBase64, cookies: newCookies, sessionId } = await fetchCaptcha(captchaUrl, cookiesStringFromFrontend, referer, userAgent);

        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies, // Send back the new cookies object (parsed from Set-Cookie headers)
            sessionId: sessionId // Send back the extracted session ID
        });
        console.log(`[${timestamp}] Sent High Court Captcha response with Base64 image, new cookies, and session ID.`);

    } catch (error) {
        console.error(`[${timestamp}] Error in High Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});


// --- Route for District Court Captcha ---
app.post('/captcha/districtcourt', async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Handling District Court Captcha request (POST).`);

    // The frontend should send the previous cookies string here.
    const cookiesStringFromFrontend = req.body.cookies || '';
    const captchaId = req.body.id; // Expecting this from frontend

    if (!captchaId) {
        console.error(`[${timestamp}] Missing Captcha ID in request body for District Court request.`);
        return res.status(400).json({ error: 'Captcha ID is required in the request body.' });
    }

    console.log(`[${timestamp}]   Received cookies string from frontend for captcha: "${cookiesStringFromFrontend}"`);
    console.log(`[${timestamp}]   Received Captcha ID from body: ${captchaId}`);


    const referer = req.headers['referer'] || 'https://lucknow.dcourts.gov.in/case-status-search-by-petitioner-respondent/';
    const userAgent = req.headers['user-agent'];

    const captchaUrl = `https://lucknow.dcourts.gov.in/?_siwp_captcha&id=${captchaId}`;

    try {
        // Pass the raw string directly to fetchCaptcha's cookiesStringFromFrontend argument
        const { imageBase64, cookies: newCookies, sessionId } = await fetchCaptcha(captchaUrl, cookiesStringFromFrontend, referer, userAgent);

        res.status(200).json({
            captchaImageBase64: imageBase64,
            cookies: newCookies, // Send back the new cookies object
            sessionId: sessionId // Send back the extracted session ID
        });
        console.log(`[${timestamp}] Sent District Court Captcha response with Base64 image, new cookies, and session ID.`);

    } catch (error) {
        console.error(`[${timestamp}] Error in District Court Captcha route: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});


// --- Case Verification Route ---
// This route was largely correct from your previous fix, just ensuring it uses the direct string
app.post('/api/case', async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] --- Incoming request to case verification route ---`);
    console.log(`[${timestamp}] Request Method: ${req.method}`);
    console.log(`[${timestamp}] Request URL: ${req.originalUrl}`);
    console.log(`[${timestamp}] Request Body:`, req.body); // Log the entire body to see what's coming from frontend

    try {
        // Destructure parameters from the JSON body
        const {
            captcha,
            petres_name,
            rgyear,
            caseStatusSearchType,
            f,
            court_code,
            state_code,
            court_complex_code,
            cookies: frontendCookiesObject, // Expecting an OBJECT of cookies from frontend
            sessionId: frontendSessionId // Receive the sessionId (optional, can be derived)
        } = req.body;

        console.log(`[${timestamp}] Received parameters:`);
        console.log(`  - Captcha: ${captcha}`);
        console.log(`  - Petitioner/Respondent Name: ${petres_name}`);
        console.log(`  - Registration Year: ${rgyear}`);
        console.log(`  - Search Type: ${caseStatusSearchType}`);
        console.log(`  - F value: ${f}`);
        console.log(`  - Court Code: ${court_code}`);
        console.log(`  - State Code: ${state_code}`);
        console.log(`  - Court Complex Code: ${court_complex_code}`);
        console.log(`  - Raw Cookies Object from Frontend:`, frontendCookiesObject);
        console.log(`  - Session ID from Frontend (if provided): ${frontendSessionId}`);

        // Reconstruct the cookie string from the object received from the frontend
        // This object should contain the latest cookies including those received after captcha fetch
        const cookieHeaderStringForExternalRequest = Object.entries(frontendCookiesObject || {})
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        console.log(`[${timestamp}] Formatted Cookie header string for external request: "${cookieHeaderStringForExternalRequest}"`);


        // Parse the incoming cookie string into an object and extract session ID
        // (This is primarily for your internal logging and for deriving finalSessionId for response)
        const { parsedCookies: actualFrontendCookies, sessionId: derivedSessionId } = parseCookieString(cookieHeaderStringForExternalRequest);
        console.log(`[${timestamp}] Cookies string parsed from frontend (for internal use):`, actualFrontendCookies);
        console.log(`[${timestamp}] Session ID derived from frontend cookies: ${derivedSessionId}`);

        // If frontendSessionId was not explicitly provided, use the derived one
        const finalSessionId = frontendSessionId || derivedSessionId;
        console.log(`[${timestamp}] Final Session ID to be used for response: ${finalSessionId}`);

        // Validate required fields
        console.log(`[${timestamp}] Validating required fields...`);
        if (!captcha || !petres_name || !rgyear || !caseStatusSearchType || !f ||
            !court_code || !state_code || !court_complex_code || !cookieHeaderStringForExternalRequest) {
            const missingFields = [];
            if (!captcha) missingFields.push('captcha');
            if (!petres_name) missingFields.push('petres_name');
            if (!rgyear) missingFields.push('rgyear');
            if (!caseStatusSearchType) missingFields.push('caseStatusSearchType');
            if (!f) missingFields.push('f');
            if (!court_code) missingFields.push('court_code');
            if (!state_code) missingFields.push('state_code');
            if (!court_complex_code) missingFields.push('court_complex_code');
            if (!cookieHeaderStringForExternalRequest) missingFields.push('cookiesString');

            console.error(`[${timestamp}] ERROR: Missing required fields for case verification: ${missingFields.join(', ')}`);
            return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
        }
        console.log(`[${timestamp}] All required fields are present.`);

        // Construct payload for the eCourts site
        const payload = querystring.stringify({
            action_code: 'showRecords',
            court_code,
            state_code,
            court_complex_code,
            captcha,
            petres_name,
            rgyear,
            caseStatusSearchType,
            f,
            appFlag: 'web'
        });
        console.log(`[${timestamp}] Constructed payload for eCourts site: "${payload}"`);

        // Headers to be forwarded by ScraperAPI to the target eCourts site
        const headersToForward = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Connection": "keep-alive",
            "Cookie": cookieHeaderStringForExternalRequest, // CRUCIAL: Use the cookie string derived from frontend input
            "Origin": "https://hcservices.ecourts.gov.in",
            "Referer": "https://hcservices.ecourts.gov.in/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-GPC": "1",
            "Sec-Ch-Ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Brave\";v=\"134\"",
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "\"Windows\"",
            "X-Requested-With": "XMLHttpRequest"
        };
        console.log(`[${timestamp}] Headers to be sent to external site:`, headersToForward);

        // --- ScraperAPI Integration Logic ---
        const targetUrl = 'https://hcservices.ecourts.gov.in/hcservices/cases_qry/index_qry.php';
        console.log(`[${timestamp}] Target eCourts URL: ${targetUrl}`);

        let response;
        if (scraperApiKey) {
            console.log(`[${timestamp}] ScraperAPI key is set. Fetching case verification via ScraperAPI...`);
            const scraperApiParams = {
                api_key: scraperApiKey,
                url: targetUrl,
                // For POST requests through ScraperAPI, you typically send the headers directly
                // and the payload as the body. ScraperAPI handles forwarding.
                // Note: ScraperAPI 'headers' parameter is for the target, not for ScraperAPI itself.
            };
            const axiosConfigToScraperAPI = {
                params: scraperApiParams, // ScraperAPI URL parameters
                headers: headersToForward, // Headers to be forwarded to the target
                timeout: 60000,
            };
            console.log(`[${timestamp}] ScraperAPI request parameters (for ScraperAPI URL):`, scraperApiParams);
            console.log(`[${timestamp}] ScraperAPI axios config (headers to forward, timeout):`, axiosConfigToScraperAPI);

            response = await axios.post(
                scraperApiEndpoint, // Post to ScraperAPI endpoint
                payload, // This is the body to be forwarded to the target URL by ScraperAPI
                axiosConfigToScraperAPI
            );
            console.log(`[${timestamp}] Received response from ScraperAPI. Status: ${response.status}`);
            console.log(`[${timestamp}] Response Headers from ScraperAPI:`, response.headers);

        } else {
            console.log(`[${timestamp}] ScraperAPI key not set. Fetching case verification directly from eCourts site...`);
            response = await axios.post(
                targetUrl,
                payload,
                { headers: headersToForward, timeout: 60000 }
            );
            console.log(`[${timestamp}] Received response directly from eCourts site. Status: ${response.status}`);
            console.log(`[${timestamp}] Response Headers from eCourts site:`, response.headers);
        }
        // --- End ScraperAPI Integration Logic ---

        let govData = response.data;
        console.log(`[${timestamp}] Raw response data from govt site (first 500 chars): ${String(govData).substring(0, 500)}...`);

        if (typeof govData === 'string') {
            try {
                govData = JSON.parse(govData);
                console.log(`[${timestamp}] Successfully parsed main response data as JSON.`);
            } catch (jsonErr) {
                console.error(`[${timestamp}] ERROR: Error parsing main response as JSON, leaving as string: ${jsonErr.message}`);
                // If it's HTML/text and not JSON, log the full response for debugging
                console.error(`[${timestamp}] Full raw response data: ${String(govData)}`);
            }
        }

        // Check if the response contains the "Invalid Captcha" string directly
        if (typeof govData === 'object' && govData !== null && govData.con === 'Invalid Captcha') {
            console.warn(`[${timestamp}] WARNING: Received 'Invalid Captcha' response from eCourts.`);
            // You might want to handle this specifically or just let it pass through
            // as it's a valid response from the target server.
        }


        // IMPORTANT: Capture and send back any new cookies from the case verification response
        const newSetCookieHeaders = response.headers['set-cookie'];
        let updatedCookiesForFrontend = {};
        if (newSetCookieHeaders) {
             newSetCookieHeaders.forEach(cookieStr => {
                const parts = cookieStr.split(';')[0].split('=');
                if (parts.length >= 2) {
                    const cookieName = parts[0];
                    const cookieValue = parts.slice(1).join('=');
                    updatedCookiesForFrontend[cookieName.trim()] = cookieValue.trim();
                }
            });
            console.log(`[${timestamp}] New/Updated cookies received from verification response:`, updatedCookiesForFrontend);
        } else {
            console.log(`[${timestamp}] No new 'Set-Cookie' headers received from verification response.`);
            // If no new cookies, send back the ones that were sent to this request,
            // or merge with existing ones if your frontend has a more robust cookie management.
            // For simplicity, here we'll send back the ones that were sent to this route's request.
            updatedCookiesForFrontend = frontendCookiesObject;
        }


        console.log(`[${timestamp}] Final processed data to send to frontend:`, govData);

        res.json({
            sessionID: finalSessionId, // Send back the derived session ID
            data: govData,
            cookies: updatedCookiesForFrontend // Send back the updated cookies to the frontend
        });
        console.log(`[${timestamp}] Response sent successfully to frontend.`);

    } catch (error) {
        const timestampError = new Date().toISOString();
        console.error(`[${timestampError}] FATAL ERROR in case verification route: ${error.message}`);
        if (error.response) {
            console.error(`[${timestampError}] Error Response Status: ${error.response.status}`);
            console.error(`[${timestampError}] Error Response Data Preview: ${String(error.response.data).substring(0, 500)}...`);
            console.error(`[${timestampError}] Error Response Headers:`, error.response.headers);
        } else if (error.request) {
            console.error(`[${timestampError}] No response received from target server.`);
            console.error(`[${timestampError}] Request details:`, error.request);
        } else {
            console.error(`[${timestampError}] Error setting up the request: ${error.message}`);
        }
        res.status(500).json({ error: 'Case verification failed', details: error.message });
        console.log(`[${timestampError}] Sent 500 Internal Server Error response to frontend.`);
    } finally {
        console.log(`[${new Date().toISOString()}] --- Request processing finished for case verification route ---`);
    }
});

// --- Start the server ---
app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Captcha proxy backend listening at http://localhost:${port}`);
});
