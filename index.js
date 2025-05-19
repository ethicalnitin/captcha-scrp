// Import necessary libraries
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors'); // Import cors

// Create an Express application instance
const app = express();
// Use the PORT environment variable provided by the hosting platform (like DigitalOcean),
// or default to 3000 for local development.
const port = process.env.PORT || 3000;

// Use middleware
app.use(cors()); // Enable CORS for all routes
app.use(cookieParser()); // Parse cookies from incoming requests
app.use(express.json()); // For parsing application/json (if needed for other routes)
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded (if needed)

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Incoming Request: ${req.method} ${req.originalUrl}`);
    console.log('  Headers:', req.headers);
    console.log('  Cookies:', req.cookies); // Log parsed cookies
    console.log('  Query Params:', req.query); // Log query parameters
    next(); // Continue to the next middleware or route handler
});


// --- Helper function to fetch captcha ---
async function fetchCaptcha(url, cookies, referer, userAgent) {
    console.log(`[${new Date().toISOString()}] Making external request to: ${url}`);
    console.log('  Request Headers (to external site):', {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookies,
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
    });

    try {
        // Make the HTTP request to the external captcha URL
        const response = await axios.get(url, {
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5', // Adjust based on the specific curl request
                'Cookie': cookies, // <--- THIS LINE USES THE COOKIES RECEIVED FROM THE FRONTEND
                'Referer': referer, // Pass referer received from the frontend
                'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36', // Default or pass from frontend
                // Include other headers from the curl requests as needed
                'Priority': 'i', // From curl 1
                'sec-ch-ua': '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"', // From curl requests
                'sec-ch-ua-mobile': '?0', // From curl requests
                'sec-ch-ua-platform': '"Windows"', // From curl requests
                'sec-fetch-dest': 'image', // From curl requests
                'sec-fetch-mode': 'no-cors', // From curl requests
                'sec-fetch-site': 'same-origin', // From curl requests
                'sec-gpc': '1', // From curl requests
                'Connection': 'keep-alive' // From curl 2
            },
            responseType: 'arraybuffer' // Crucial for handling binary image data
        });

        console.log(`[${new Date().toISOString()}] External Response Status: ${response.status}`);
        console.log('  Response Headers (from external site):', response.headers);
        // Note: We don't log the response data itself as it's binary image data

        // Return the response data (image buffer) and content type
        return {
            data: response.data,
            contentType: response.headers['content-type']
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching captcha from ${url}:`, error.message);
        // Log specific error details if available
        if (error.response) {
            console.error('  Response Status:', error.response.status);
            console.error('  Response Headers:', error.response.headers);
            // Avoid logging error.response.data as it might be large or binary
        } else if (error.request) {
            console.error('  No response received:', error.request);
        } else {
            console.error('  Error details:', error.message);
        }
        throw new Error('Failed to fetch captcha image');
    }
}

// --- Health Check Endpoint ---
// This endpoint is added specifically for hosting platforms like DigitalOcean
// to check if the application is running and responsive.
app.get('/health', (req, res) => {
    console.log(`[${new Date().toISOString()}] Health check endpoint hit.`);
    res.status(200).send('OK');
});


// --- Route for High Court Captcha ---
app.get('/captcha/highcourt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Handling High Court Captcha request.`);

    // Extract cookies from the frontend request using cookie-parser
    // req.cookies is an object { cookieName: cookieValue, ... }
    // We need to format it back into a string for the 'Cookie' header.
    const cookiesString = Object.entries(req.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; '); // <--- COOKIES FROM FRONTEND ARE CONVERTED TO STRING HERE

    const referer = req.headers['referer'] || 'https://hcservices.ecourts.gov.in/'; // Use frontend referer or default
    const userAgent = req.headers['user-agent']; // Use frontend user-agent

    // The '61' in the original URL seems like a cache buster or identifier.
    // You might need to pass this dynamically from the frontend if it changes.
    // For now, we'll use a fixed value or a simple timestamp.
    const cacheBuster = Date.now(); // Using timestamp as a simple cache buster
    const captchaUrl = `https://hcservices.ecourts.gov.in/hcservices/securimage/securimage_show.php?${cacheBuster}`;

    try {
        const { data, contentType } = await fetchCaptcha(captchaUrl, cookiesString, referer, userAgent);

        // Set the content type header for the response
        res.setHeader('Content-Type', contentType || 'image/png'); // Default to image/png if content type is not provided
        console.log(`[${new Date().toISOString()}] Sending High Court Captcha response with Content-Type: ${contentType || 'image/png'}`);

        // Send the image data back to the frontend
        res.send(data);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in High Court Captcha route: ${error.message}`);
        res.status(500).send(error.message);
    }
});

// --- Route for District Court Captcha ---
app.get('/captcha/districtcourt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Handling District Court Captcha request.`);

    // Extract cookies from the frontend request using cookie-parser
    const cookiesString = Object.entries(req.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; '); // <--- COOKIES FROM FRONTEND ARE CONVERTED TO STRING HERE

    const referer = req.headers['referer'] || 'https://lucknow.dcourts.gov.in/case-status-search-by-petitioner-respondent/'; // Use frontend referer or default
    const userAgent = req.headers['user-agent']; // Use frontend user-agent

    // The 'id=93b4006f1343d3128525a65c5209b923b05ffc6b' in the original URL
    // likely needs to be passed dynamically from your frontend, as it seems
    // to be a session or request specific identifier.
    // For this example, we'll use a placeholder. You MUST replace this
    // with the actual ID your frontend obtains.
    const captchaId = req.query.id; // Assuming the frontend sends the ID as a query parameter like /captcha/districtcourt?id=YOUR_ID
    console.log(`  Received Captcha ID from frontend: ${captchaId}`);

    if (!captchaId) {
        console.error(`[${new Date().toISOString()}] Missing Captcha ID for District Court request.`);
        return res.status(400).send('Captcha ID is required for district court captcha.');
    }

    const captchaUrl = `https://lucknow.dcourts.gov.in/?_siwp_captcha&id=${captchaId}`;

    try {
        const { data, contentType } = await fetchCaptcha(captchaUrl, cookiesString, referer, userAgent);

        // Set the content type header for the response
        res.setHeader('Content-Type', contentType || 'image/png'); // Default to image/png
        console.log(`[${new Date().toISOString()}] Sending District Court Captcha response with Content-Type: ${contentType || 'image/png'}`);

        // Send the image data back to the frontend
        res.send(data);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in District Court Captcha route: ${error.message}`);
        res.status(500).send(error.message);
    }
});


// --- Start the server ---
app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Captcha proxy backend listening at http://localhost:${port}`);
});
