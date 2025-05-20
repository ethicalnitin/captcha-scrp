// Import necessary libraries
const express = require('express');
const axios = require('axios');
// Removed cookie-parser as cookies will be sent in the body
// const cookieParser = require('cookie-parser');
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
// Removed cookie-parser middleware
// app.use(cookieParser()); // Parse cookies from incoming requests
app.use(express.json()); // For parsing application/json (required to receive cookies in body)
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded (if needed)

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Incoming Request: ${req.method} ${req.originalUrl}`);
    console.log('  Headers:', req.headers);
    // Cookies will now be logged from the body in specific routes if sent
    // console.log('  Cookies:', req.cookies); // cookie-parser no longer used
    console.log('  Query Params:', req.query); // Log query parameters
    console.log('  Request Body:', req.body); // Log request body (will contain cookies if sent)
    next(); // Continue to the next middleware or route handler
});


// --- Helper function to fetch captcha ---
// This function now expects the cookies as a pre-formatted string
async function fetchCaptcha(url, cookiesString, referer, userAgent) {
    console.log(`[${new Date().toISOString()}] Making external request to: ${url}`);
    console.log('  Request Headers (to external site):', {
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
    });

    try {
        // Make the HTTP request to the external captcha URL
        const response = await axios.get(url, {
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cookie': cookiesString, // <--- Use the cookies string passed to the function
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
// This route now expects cookies in the request body as JSON
app.post('/captcha/highcourt', async (req, res) => { // Changed to POST to receive body
    console.log(`[${new Date().toISOString()}] Handling High Court Captcha request (POST).`);

    // Extract cookies from the request body
    const cookiesFromFrontend = req.body.cookies; // Assuming frontend sends { cookies: { cookieName: cookieValue, ... } }

    if (!cookiesFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies in request body for High Court Captcha.`);
        return res.status(400).send('Cookies are required in the request body.');
    }

    // Format the cookies object into a string for the 'Cookie' header
    const cookiesString = Object.entries(cookiesFromFrontend)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    console.log(`  Received and formatted cookies from body: ${cookiesString}`);


    const referer = req.headers['referer'] || 'https://hcservices.ecourts.gov.in/'; // Use frontend referer or default
    const userAgent = req.headers['user-agent']; // Use frontend user-agent

    // The '61' in the original URL seems like a cache buster or identifier.
    // You might need to pass this dynamically from the frontend if it changes.
    // For now, we'll use a fixed value or a simple timestamp.
    const cacheBuster = Date.now(); // Using timestamp as a simple cache buster
    const captchaUrl = `https://hcservices.ecourts.gov.in/hcservices/securimage/securimage_show.php?${cacheBuster}`;

    try {
        // Pass the constructed cookies string to the helper function
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
// This route now expects cookies in the request body as JSON
app.post('/captcha/districtcourt', async (req, res) => { // Changed to POST to receive body
    console.log(`[${new Date().toISOString()}] Handling District Court Captcha request (POST).`);

    // Extract cookies and captchaId from the request body
    const cookiesFromFrontend = req.body.cookies; // Assuming frontend sends { cookies: { cookieName: cookieValue, ... }, id: '...' }
    const captchaId = req.body.id; // Assuming frontend sends the ID in the body

    if (!cookiesFromFrontend) {
        console.warn(`[${new Date().toISOString()}] Missing cookies in request body for District Court Captcha.`);
        return res.status(400).send('Cookies are required in the request body.');
    }

    if (!captchaId) {
        console.error(`[${new Date().toISOString()}] Missing Captcha ID in request body for District Court request.`);
        return res.status(400).send('Captcha ID is required in the request body.');
    }

    // Format the cookies object into a string for the 'Cookie' header
    const cookiesString = Object.entries(cookiesFromFrontend)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    console.log(`  Received and formatted cookies from body: ${cookiesString}`);
    console.log(`  Received Captcha ID from body: ${captchaId}`);


    const referer = req.headers['referer'] || 'https://lucknow.dcourts.gov.in/case-status-search-by-petitioner-respondent/'; // Use frontend referer or default
    const userAgent = req.headers['user-agent']; // Use frontend user-agent


    const captchaUrl = `https://lucknow.dcourts.gov.in/?_siwp_captcha&id=${captchaId}`;

    try {
        // Pass the constructed cookies string to the helper function
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
