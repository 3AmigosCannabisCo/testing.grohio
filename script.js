/**
 * GROHIO v16.0: "Amigo's Notebook" Edition
 * Main Application Logic (script.js)
 *
 * This file contains all JavaScript for the GROHIO platform.
 * It is loaded as a "module" to support Firebase 'import' statements.
 * The entire application is wrapped in an IIFE (Immediately Invoked
 * Function Expression) to prevent polluting the global namespace.
 *
 * File Structure:
 * 1. Firebase Imports
 * 2. IIFE Wrapper
 * 3. Global Constants & DOM References (now with Gallery/Community)
 * 4. Core Utility Functions (exponentialBackoff)
 * 5. Navigation & UI Control (showSection, closeModal)
 * 6. Gemini API Implementation (Amigo Answers)
 * 7. Firebase Setup & Authentication
 * 8. Calculator Logic (VPD, DLI, PPM, Cost)
 * 9. NEW: Interactive Gallery Logic
 * 10. NEW: Community Journal Logic (Concept)
 * 11. Initialization (Event Listeners)
 *
 * v16.0 Changes:
 * - CRITICAL FIX: Corrected Gemini API URL (was 'generativelace').
 * - ADDED: New tab listeners and DOM elements for Gallery & Community.
 * - ADDED: `handleImageUpload` function using FileReader to create
 * a Base64-encoded image and add it to the gallery grid.
 * - ADDED: Event listener for the "journal-submit-btn" to show
 * the potential of a live-wired 'addDoc' to Firestore.
 * - VERIFIED: All calculator logic, including "Savings", is sound.
 */

//
// =========================================
// FIREBASE IMPORTS
// =========================================
// These are loaded as modules from Google's CDN.
//
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Import Firestore functions we *would* use for the community tab
import { getFirestore, setLogLevel, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

//
// =========================================
// IIFE WRAPPER
// =========================================
//
(function() {
    
    /**
     * @description A "strict mode" directive to enforce cleaner code and prevent common errors.
     */
    'use strict';

    //
    // =========================================
    // GLOBAL CONSTANTS & DOM REFERENCES
    // =========================================
    // We cache all our DOM element queries here for performance.
    // Instead of searching the DOM every time, we find them once.
    //
    
    /** @type {NodeListOf<HTMLElement>} */
    const sections = document.querySelectorAll('.content-section');
    
    /** @type {NodeListOf<HTMLButtonElement>} */
    const navButtons = document.querySelectorAll('nav .nav-btn');
    
    /** @type {NodeListOf<HTMLButtonElement>} */
    const internalNavButtons = document.querySelectorAll('.nav-btn-internal');
    
    /** @type {HTMLElement} */
    const searchModal = document.getElementById('search-modal');
    
    /** @type {HTMLInputElement} */
    const searchInput = document.getElementById('search-input');
    
    /** @type {HTMLElement} */
    const searchOutput = document.getElementById('search-output');

    /** @type {HTMLElement} */
    const amigoHeader = document.getElementById('amigo-answer-header');
    
    /** @type {HTMLElement} */
    const loadingSpinner = document.getElementById('loading-spinner');
    
    /** @type {NodeListOf<HTMLButtonElement>} */
    const closeModalBtns = document.querySelectorAll('#close-modal-btn-top, #close-modal-btn-bottom');
    
    /** @type {HTMLElement} */
    const userIdDisplay = document.getElementById('user-id-display');

    
    // --- Grow Tools Calculator Elements ---
    
    /** @type {HTMLInputElement} */
    const tempCInput = document.getElementById('temp-c');
    
    /** @type {HTMLInputElement} */
    const rhInput = document.getElementById('rh');
    
    /** @type {HTMLElement} */
    const vpdOutput = document.getElementById('vpd-output');
    
    /** @type {HTMLInputElement} */
    const ecInput = document.getElementById('ec-input');
    
    /** @type {HTMLSelectElement} */
    const ppmScaleSelect = document.getElementById('ppm-scale');
    
    /** @type {HTMLElement} */
    const ppmOutput = document.getElementById('ppm-output');
    
    /** @type {HTMLInputElement} */
    const ppfdInput = document.getElementById('ppfd-input');
    
    /** @type {HTMLInputElement} */
    const hoursOnInput = document.getElementById('hours-on-input');
    
    /** @type {HTMLElement} */
    const dliOutput = document.getElementById('dli-output');

    
    // --- Cost Calculator Elements ---
    
    /** @type {Object<string, HTMLInputElement>} */
    const costInputs = {
        onetimeTent: document.getElementById('cost-onetime-tent'),
        onetimeLight: document.getElementById('cost-onetime-light'),
        onetimeOther: document.getElementById('cost-onetime-other'),
        recurringSeeds: document.getElementById('cost-recurring-seeds'),
        recurringSoil: document.getElementById('cost-recurring-soil'),
        recurringNutrients: document.getElementById('cost-recurring-nutrients'),
        lightWatts: document.getElementById('cost-light-watts'),
        kwhRate: document.getElementById('cost-kwh-rate'),
        totalDays: document.getElementById('cost-total-days'),
        yieldGrams: document.getElementById('cost-yield-grams'),
        dispensaryPrice: document.getElementById('cost-dispensary-price')
    };

    /** @type {Object<string, HTMLElement>} */
    const costOutputs = {
        onetimeCost: document.getElementById('output-onetime-cost'),
        electricCost: document.getElementById('output-electric-cost'),
        recurringCost: document.getElementById('output-recurring-cost'),
        totalCost: document.getElementById('output-total-cost'),
        harvestValue: document.getElementById('output-harvest-value'),
        totalSavings: document.getElementById('output-total-savings'),
        costPerGram: document.getElementById('output-cost-per-gram'),
        costPerGramFuture: document.getElementById('output-cost-per-gram-future')
    };

    // --- NEW: Gallery Elements (v16.0) ---

    /** @type {HTMLInputElement} */
    const imageUploadBtn = document.getElementById('image-upload-btn');
    
    /** @type {HTMLElement} */
    const galleryGrid = document.getElementById('gallery-grid');
    
    /** @type {HTMLElement} */
    const galleryMessage = document.getElementById('gallery-message');

    // --- NEW: Community Elements (v16.0) ---
    
    /** @type {HTMLFormElement} */
    const journalForm = document.getElementById('journal-form');
    
    /** @type {HTMLInputElement} */
    const journalTitle = document.getElementById('journal-title');
    
    /** @type {HTMLTextAreaElement} */
    const journalBody = document.getElementById('journal-body');

    /** @type {HTMLElement} */
    const journalSubmitMessage = document.getElementById('journal-submit-message');

    //
    // =========================================
    // CORE UTILITY FUNCTIONS
    // =========================================
    //

    /**
     * @description Implements exponential backoff for retrying a failed async function.
     * This is crucial for network requests (like our API call) that might fail
     * due to temporary server issues or rate limiting. It waits progressively
     * longer after each failure.
     *
     * @param {Function} fn - The async function to retry (e.g., `callGeminiApi`).
     * @param {number} [maxRetries=5] - Maximum number of retry attempts.
     * @param {number} [delay=500] - The base delay in milliseconds.
     * @returns {Function} A new function that, when called, will retry `fn`.
     */
    function exponentialBackoff(fn, maxRetries = 5, delay = 500) {
        return async function retryWrapper(...args) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    // Try to execute the function
                    return await fn.apply(this, args);
                } catch (error) {
                    // If this was the last retry, throw the error
                    if (i === maxRetries - 1) throw error;
                    
                    // Don't log retry attempts to the console as errors,
                    // as this is expected behavior for a network request.
                    
                    // Calculate wait time: (delay * 2^i) + random jitter
                    const waitTime = delay * Math.pow(2, i) + Math.random() * delay;
                    
                    // Wait for the calculated time before the next loop iteration
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        };
    }

    //
    // =========================================
    // NAVIGATION & UI CONTROL
    // =========================================
    //

    /**
     * @description Hides all content sections and shows the one with the matching ID.
     * Also updates the navigation buttons to set the 'active' class.
     * @param {string} id - The 'data-section' ID of the section to show (e.g., "home", "legal").
     */
    function showSection(id) {
        if (!sections || sections.length === 0) {
             console.error("CRITICAL: Content sections not found!");
             return;
        }
        
        // 1. Hide all sections
        sections.forEach(section => {
            section.classList.add('hidden');
        });

        // 2. Find and show the active section
        const activeSection = document.getElementById(id);
        
        if (activeSection) {
            activeSection.classList.remove('hidden');
        } else {
             // Fallback to home if section not found (e.g., bad link)
             const homeSection = document.getElementById('home');
             if (homeSection) homeSection.classList.remove('hidden');
             id = 'home'; // Ensure nav button logic below highlights 'home'
        }
        
        if (!navButtons || navButtons.length === 0) {
            console.error("CRITICAL: Nav buttons not found!");
            return;
        }

        // 3. Update navigation button styles
        navButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.section === id) {
                btn.classList.add('active');
            }
        });
        
        // 4. Scroll to the top of the page
        window.scrollTo(0, 0); 
    }

    /**
     * @description Hides the search modal and clears the search input field.
     */
    function closeModal() {
        if (searchModal) {
            searchModal.classList.add('hidden');
            if(amigoHeader) amigoHeader.classList.remove('animate-pulse-glow');
        }
        if (searchInput) {
            searchInput.value = ''; // Clear input on close
        }
    }

    //
    // =========================================
    // GEMINI API IMPLEMENTATION (AMIGO ANSWERS)
    // =========================================
    // This is the core of our "Amigo Answers" search.
    //

    /**
     * @description The system prompt guides the AI's persona and response rules.
     * This is sent with every API call to ensure the AI acts as "Amigo."
     */
    const AMIGO_SYSTEM_PROMPT = `You are "Amigo," a world-class cannabis cultivation expert and AI assistant for the GROHIO platform. 
    Your responses must be ultra-detailed, scientific, but explained in simple, encouraging terms a new grower can understand.
    You are friendly, encouraging, and patient.
    You MUST use the provided Google Search results (grounding) to formulate your answer.
    Your goal is to provide a professional, university-level answer, formatted clearly with paragraphs and bullet points for web display.
    Always rule out pH lockout first when diagnosing any nutrient deficiency or toxicity issue.
    Structure your response using Markdown (e.g., ## for headers, ** for bold, * for bullets).`;

    /**
     * @description The core async function that makes the `fetch` call to the Google Gemini API.
     * @param {string} userQuery - The question typed in by the user.
     * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>} An object containing the AI's text response and an array of sources.
     * @throws Will throw an error if the network request fails or the API returns an error.
     */
    async function callGeminiApi(userQuery) {
        // The API key is left as "" and is provided by the Canvas environment.
        const apiKey = ""; 
        
        // **CRITICAL FIX (v16.0):** Corrected API endpoint.
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        /**
         * @description The payload sent to the Gemini API.
         * - `contents`: The user's prompt.
         * - `tools`: Enables Google Search grounding.
         * - `systemInstruction`: Injects our "Amigo" persona.
         */
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }], // This enables Google Search!
            systemInstruction: { parts: [{ text: AMIGO_SYSTEM_PROMPT }] },
        };

        // Make the network request
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Handle bad responses (e.g., 400, 500)
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText}. Detail: ${errorBody?.error?.message || 'Unknown error'}`);
        }

        // Parse the successful JSON response
        const result = await response.json();
        
        // Navigate the complex JSON to find the AI's response
        const candidate = result.candidates?.[0];

        if (!candidate || !candidate.content?.parts?.[0]?.text) {
            // This happens if the API response is empty or malformed
            throw new Error("Invalid response structure from API.");
        }

        // 1. Get the AI's text response
        const text = candidate.content.parts[0].text;
        
        // 2. Extract the Google Search sources
        let sources = [];
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attribution => ({
                    uri: attribution.web?.uri,
                    title: attribution.web?.title,
                }))
                .filter(source => source.uri && source.title); // Ensure sources are valid
        }

        return { text, sources };
    }

    /**
     * @description A retry-wrapped version of our API call function.
     * We call this instead of `callGeminiApi` directly.
     */
    const performSearchWithRetry = exponentialBackoff(callGeminiApi);

    /**
     * @description Handles the entire search process: shows modal, calls API, and renders results.
     * @param {string} userQuery - The user's question.
     */
    async function performSearch(userQuery) {
        if (!searchModal || !searchOutput || !loadingSpinner || !amigoHeader) {
            console.error("CRITICAL: Search modal elements are missing!");
            return;
        }
        
        // 1. Show modal and loading spinner
        searchModal.classList.remove('hidden');
        searchOutput.innerHTML = ''; // Clear previous results
        loadingSpinner.classList.remove('hidden');
        amigoHeader.classList.add('animate-pulse-glow'); // Add pulse animation

        try {
            // 2. Call the API (with retries) and wait for the response
            const { text, sources } = await performSearchWithRetry(userQuery);
            
            // 3. Build the HTML to display the results
            let htmlOutput = `<p class="text-brand-green font-bold text-xl mb-3">Amigo's Answer for: "${userQuery}"</p>`;
            
            // Format response text: replace markdown (##, **, \n) with HTML
            const formattedText = text
                .replace(/##\s*(.*?)(?:\n|<br>)/g, '<h4 class="text-xl font-bold text-brand-blue mt-4 mb-2">$1</h4>') // H2
                .replace(/###\s*(.*?)(?:\n|<br>)/g, '<h5 class="text-lg font-bold text-gray-300 mt-3 mb-1">$1</h5>') // H3
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics
                .replace(/\n/g, '<br>'); // Add line breaks
                
            htmlOutput += `<div class="p-4 border border-gray-800 rounded-lg text-lg">${formattedText}</div>`;

            // 4. Add the sources, if any
            if (sources.length > 0) {
                htmlOutput += '<div class="source-container"><p class="font-bold text-brand-blue">Grounded Sources (via Google Search):</p><ul>';
                sources.forEach((source, index) => {
                    htmlOutput += `<li><a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="source-link">Source ${index + 1}: ${source.title}</a></li>`;
                });
                htmlOutput += '</ul></div>';
            } else {
                htmlOutput += '<div class="source-container"><p class="text-gray-500">Note: Response was generated from my internal knowledge. For the latest info, try a more specific search.</p></div>';
            }
            
            // 5. Render the final HTML
            searchOutput.innerHTML = htmlOutput;
            
        } catch (error) {
            // Handle any errors from the API call
            console.error("Amigo Answers Error:", error);
            searchOutput.innerHTML = `<div class="text-brand-red p-4 border border-brand-red rounded-lg">
                <p class="font-bold text-xl mb-2">GROHIO System Failure</p>
                <p>I encountered a critical error while processing your request. The API may be unavailable or the connection failed.</p>
                <p class="text-sm mt-2">Error Detail: ${error.message}</p>
                <p class="text-sm mt-1">Please try again with a slightly different query or check your console for further diagnostics.</p>
            </div>`;
        } finally {
            // 6. Hide the loading spinner
            loadingSpinner.classList.add('hidden');
            amigoHeader.classList.remove('animate-pulse-glow');
        }
    }
    
    //
    // =========================================
    // FIREBASE SETUP
    // =========================================
    //
    
    /** @type {import("firebase/firestore").Firestore} */
    let db;
    /** @type {import("firebase/auth").Auth} */
    let auth;
    /** @type {string} */
    let userId = 'anon_user';
    /** @type {string} */
    let appId = 'default-app-id'; // Store appId for Firestore path

    /**
     * @description Initializes the Firebase app, database, and auth.
     * This function uses special variables (`__app_id`, `__firebase_config`, `__initial_auth_token`)
     * that are injected by the Canvas environment.
     * It will authenticate the user (with a token if provided, or anonymously
     * if not) and display their User ID. This is the first step
     * to building persistent features like a grow journal.
     */
    async function initFirebase() {
        try {
            // 1. Get environment variables
            appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

            // 2. Check if Firebase is available
            if (!firebaseConfigStr) {
                console.warn("Firebase config not found. Running in Offline Mode.");
                if(userIdDisplay) userIdDisplay.textContent = 'Data: Offline Mode';
                return; // Exit if firebase config isn't present
            }
            
            // 3. Initialize Firebase App
            const firebaseConfig = JSON.parse(firebaseConfigStr);
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);

            // Enable debug logging for Firestore (great for development)
            setLogLevel('Debug');

            // 4. Authentication
            if (initialAuthToken) {
                // Use the token provided by the environment
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                // Fallback to anonymous sign-in
                await signInAnonymously(auth);
            }

            // 5. Set and display the User ID
            userId = auth.currentUser?.uid || 'anon_' + crypto.randomUUID();
            
            if (userIdDisplay) {
                userIdDisplay.textContent = `Active User ID: ${userId}`;
            }

        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            if(userIdDisplay) userIdDisplay.textContent = 'Authentication Failed (Check Console)';
        }
    }


    //
    // =========================================
    // CALCULATOR LOGIC
    // =========================================
    //

    /**
     * @description Calculates Vapor Pressure Deficit (VPD) in kPa.
     * VPD is the "thirst" of the air. It's the difference between how much
     * moisture the air *can* hold (SVP) and how much it *is* holding (AVP).
     * This is the primary driver of plant transpiration (sweating).
     */
    function calculateVPD() {
        if (!tempCInput || !rhInput || !vpdOutput) return; // Guard clause
        
        const T_C = parseFloat(tempCInput.value);
        const RH_percent = parseFloat(rhInput.value);
        
        if (isNaN(T_C) || isNaN(RH_percent) || RH_percent < 0 || RH_percent > 100) {
            vpdOutput.textContent = 'Invalid Input';
            return;
        }
        
        const RH = RH_percent / 100.0; // Convert % to decimal

        // --- The Science ---
        // 1. Calculate Saturation Vapor Pressure (SVP) in kPa.
        // We use a simplified version of Buck's equation, common in horticulture.
        // This formula calculates the maximum amount of water vapor the air can
        // hold at a given temperature (T_C).
        const SVP_kPa = 0.61094 * Math.exp((17.625 * T_C) / (T_C + 243.04));

        // 2. Calculate Vapor Pressure Deficit (VPD).
        // VPD = (Max moisture air can hold) - (Current moisture in air)
        // VPD = SVP_kPa - (SVP_kPa * RH)
        // VPD = SVP_kPa * (1 - RH)
        const VPD = SVP_kPa * (1 - RH);

        // 3. Determine the growth stage target
        let stage = 'Unknown Stage';
        if (VPD < 0.8) stage = 'Seedling/Clone';
        else if (VPD <= 1.2) stage = 'Vegetative Growth';
        else if (VPD <= 1.6) stage = 'Peak Flowering';
        else stage = 'High Stress/Late Flower';

        // 4. Display the result
        vpdOutput.textContent = `${VPD.toFixed(2)} kPa (Target: ${stage})`;
    }

    /**
     * @description Converts Electrical Conductivity (EC) to Parts Per Million (PPM).
     * EC is the *true* measurement of total dissolved solids (nutrient strength).
     * PPM is a *conversion* from EC. Different meters use different
     * conversion factors (scales).
     */
    function convertPPM() {
        if (!ecInput || !ppmScaleSelect || !ppmOutput) return; // Guard clause

        const EC = parseFloat(ecInput.value);
        const scale = parseInt(ppmScaleSelect.value, 10); // 500 or 700

        if (isNaN(EC) || EC < 0) {
            ppmOutput.textContent = 'Invalid EC Input';
            return;
        }
        
        // --- The Math ---
        // PPM = EC (in mS/cm) * ScaleFactor
        // e.g., 1.5 mS/cm * 500 = 750 PPM (500 Scale)
        // e.g., 1.5 mS/cm * 700 = 1050 PPM (700 Scale)
        const PPM = EC * scale;

        ppmOutput.textContent = `${PPM.toFixed(0)} PPM (${scale} Scale)`;
    }
    
    /**
     * @description Calculates Daily Light Integral (DLI) in mol/m²/day.
     * DLI is the *total number* of photons that land on a given area in a day.
     * It's the most important metric for determining plant growth and yield.
     * PPFD = Light *intensity* (photons per second).
     * DLI = Total light *volume* (photons per day).
     */
    function calculateDLI() {
        if (!ppfdInput || !hoursOnInput || !dliOutput) return; // Guard clause

        const PPFD = parseFloat(ppfdInput.value); // e.g., 800
        const Hours = parseFloat(hoursOnInput.value); // e.g., 12

        if (isNaN(PPFD) || isNaN(Hours) || PPFD < 0 || Hours < 0 || Hours > 24) {
            dliOutput.textContent = 'Invalid Input';
            return;
        }

        // --- The Math ---
        // 1. Seconds of light = Hours * 3600 (seconds/hour)
        const secondsOfLight = Hours * 3600;
        
        // 2. Total photons per day (in µmol) = PPFD * seconds
        const totalMicromols = PPFD * secondsOfLight;
        
        // 3. Convert µmol (micromols) to mol (mols) by dividing by 1,000,000
        // DLI (mol/m²/day) = (PPFD * Hours * 3600) / 1,000,000
        const DLI = totalMicromols / 1000000;
        
        // 4. Determine growth stage
        let stage = 'Unknown Stage';
        if (DLI < 18) stage = 'Seedlings/Clones';
        else if (DLI <= 40) stage = 'Vegetative Growth';
        else if (DLI <= 60) stage = 'Peak Flower Production';
        else stage = 'Supplemental CO2 Recommended';

        // 5. Display the result
        dliOutput.textContent = `${DLI.toFixed(2)} mol/m²/day (Target: ${stage})`;
    }

    /**
     * @description Calculates all fields for the Grow Cost Calculator.
     * This function reads all inputs, performs the math, and updates all
     * output fields with formatted currency.
     */
    function calculateCost() {
        // Guard clause: Check if all elements exist
        if (Object.values(costInputs).some(el => !el) || Object.values(costOutputs).some(el => !el)) {
            console.error("CRITICAL: Cost calculator elements are missing!");
            return;
        }

        // 1. Get all values, parseFloat, and default to 0 if NaN
        const onetimeTent = parseFloat(costInputs.onetimeTent.value) || 0;
        const onetimeLight = parseFloat(costInputs.onetimeLight.value) || 0;
        const onetimeOther = parseFloat(costInputs.onetimeOther.value) || 0;
        
        const recurringSeeds = parseFloat(costInputs.recurringSeeds.value) || 0;
        const recurringSoil = parseFloat(costInputs.recurringSoil.value) || 0;
        const recurringNutrients = parseFloat(costInputs.recurringNutrients.value) || 0;
        
        const lightWatts = parseFloat(costInputs.lightWatts.value) || 0;
        const kwhRateCents = parseFloat(costInputs.kwhRate.value) || 0;
        const kwhRateDollars = kwhRateCents / 100.0;
        const totalDays = parseFloat(costInputs.totalDays.value) || 0;
        
        const yieldGrams = parseFloat(costInputs.yieldGrams.value) || 1; // Default to 1 to avoid / by zero
        const dispensaryPrice = parseFloat(costInputs.dispensaryPrice.value) || 0; 

        // 2. Perform Calculations
        
        // --- Electricity Cost Calculation ---
        // Assume 4 weeks (28 days) of Veg at 18/6 and the rest Flower at 12/12
        const vegDays = Math.min(totalDays, 28);
        const flowerDays = Math.max(0, totalDays - vegDays);
        
        // (Watts * Hours * Days) / 1000 = kWh
        const vegKwh = (lightWatts * 18 * vegDays) / 1000;
        const flowerKwh = (lightWatts * 12 * flowerDays) / 1000;
        const totalKwh = vegKwh + flowerKwh;
        
        // This is a rough estimate. It doesn't include fans, pumps, etc.
        // We add a 15% flat fee to account for fans/pumps.
        const totalKwhWithFans = totalKwh * 1.15;
        
        const electricCost = totalKwhWithFans * kwhRateDollars;
        
        // --- Total Cost Calculation ---
        const totalOnetimeCost = onetimeTent + onetimeLight + onetimeOther;
        const totalRecurringCost = recurringSeeds + recurringSoil + recurringNutrients + electricCost;
        const totalFirstCost = totalOnetimeCost + totalRecurringCost;
        
        // --- Cost Per Gram & Savings ---
        const costPerGram = totalFirstCost / yieldGrams;
        const costPerGramFuture = totalRecurringCost / yieldGrams;
        const harvestValue = yieldGrams * dispensaryPrice;
        const totalSavings = harvestValue - totalRecurringCost; // This is the "profit" function

        // 3. Update UI
        // Use the Intl.NumberFormat object for easy currency formatting
        const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

        costOutputs.onetimeCost.textContent = formatter.format(totalOnetimeCost);
        costOutputs.electricCost.textContent = formatter.format(electricCost);
        costOutputs.recurringCost.textContent = formatter.format(totalRecurringCost);
        costOutputs.totalCost.textContent = formatter.format(totalFirstCost);
        
        costOutputs.harvestValue.textContent = formatter.format(harvestValue); 
        costOutputs.totalSavings.textContent = formatter.format(totalSavings); 
        
        costOutputs.costPerGram.textContent = `${formatter.format(costPerGram)} / gram`;
        costOutputs.costPerGramFuture.textContent = `${formatter.format(costPerGramFuture)} / gram`;
    }

    
    //
    // =========================================
    // NEW: INTERACTIVE GALLERY LOGIC (v16.0)
    // =========================================
    //
    
    /**
     * @description Handles the file input change event for the gallery.
     * Reads the selected file as a Base64 Data URL and adds it to the gallery.
     * @param {Event} event - The 'change' event from the file input.
     */
    function handleImageUpload(event) {
        if (!galleryGrid || !galleryMessage) return;

        const file = event.target.files[0];
        if (!file) {
            return; // No file selected
        }
        
        // Check file type
        if (!file.type.startsWith('image/')) {
            galleryMessage.textContent = 'Error: Please select an image file (jpg, png).';
            galleryMessage.classList.remove('hidden', 'text-brand-green');
            galleryMessage.classList.add('text-brand-red');
            return;
        }
        
        // Check file size (e.g., 5MB limit)
        if (file.size > 5 * 1024 * 1024) {
            galleryMessage.textContent = 'Error: File is too large (Max 5MB).';
            galleryMessage.classList.remove('hidden', 'text-brand-green');
            galleryMessage.classList.add('text-brand-red');
            return;
        }

        const reader = new FileReader();

        // This event fires when the file is done reading
        reader.onload = function(e) {
            const imageDataUrl = e.target.result; // This is the Base64 string
            
            // Create the new gallery item
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item animate-fadeIn'; // Add animation
            
            galleryItem.innerHTML = `
                <img src="${imageDataUrl}" alt="User uploaded grow photo">
                <div class="gallery-item-caption">
                    <p>${file.name}</p>
                    <span class="text-xs text-gray-400">Uploaded by: You (Local)</span>
                </div>
            `;
            
            // Add the new item to the top of the grid
            galleryGrid.prepend(galleryItem);
            
            // Show success message
            galleryMessage.textContent = 'Success! Your image has been added to the local gallery.';
            galleryMessage.classList.remove('hidden', 'text-brand-red');
            galleryMessage.classList.add('text-brand-green');
        };
        
        // This event fires if there's an error
        reader.onerror = function() {
            galleryMessage.textContent = 'Error: Could not read file.';
            galleryMessage.classList.remove('hidden', 'text-brand-green');
            galleryMessage.classList.add('text-brand-red');
        };

        // This starts the reading process
        reader.readAsDataURL(file);
    }

    
    //
    // =========================================
    // NEW: COMMUNITY JOURNAL LOGIC (v16.0)
    // =========================================
    //
    
    /**
     * @description Handles the submission of the new journal entry form.
     * This is a *concept* and does not write to Firestore yet, but
     * it shows the UI/UX and where the Firestore code *would* go.
     * @param {Event} event - The 'submit' event from the form.
     */
    async function handleJournalSubmit(event) {
        event.preventDefault(); // Stop the form from reloading the page
        
        if (!journalTitle || !journalBody || !journalSubmitMessage ) {
             console.error("Journal form elements are missing.");
             return;
        }
        
        // Check if Firebase is ready
        if (!db || !auth.currentUser) {
            console.warn("Firebase not ready. Cannot submit journal.");
            if(journalSubmitMessage) {
                journalSubmitMessage.textContent = 'Error: Not connected to server. Please wait.';
                journalSubmitMessage.classList.remove('hidden', 'text-brand-green');
                journalSubmitMessage.classList.add('text-brand-red');
            }
            return;
        }
        
        const title = journalTitle.value.trim();
        const body = journalBody.value.trim();
        
        if (!title || !body) {
            journalSubmitMessage.textContent = 'Please fill out all fields.';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-green');
            journalSubmitMessage.classList.add('text-brand-red');
            return;
        }
        
        // Show a temporary success message
        journalSubmitMessage.textContent = 'Submitting...';
        journalSubmitMessage.classList.remove('hidden', 'text-brand-red');
        journalSubmitMessage.classList.add('text-brand-green');

        
        // --- THIS IS THE REAL FIRESTORE LOGIC ---
        // This is currently commented out to prevent errors in an
        // environment without write rules, but this is how it would work.
        
        /*
        try {
            // This is the path for a *public* collection for this app
            // We use the `appId` and `userId` variables we stored earlier.
            const collectionPath = `/artifacts/${appId}/public/data/journals`;
            
            // This is the data we will send
            const postData = {
                title: title,
                body: body,
                authorId: userId,
                createdAt: serverTimestamp() // Uses the server's time
            };
            
            // This line writes the data to the database
            const docRef = await addDoc(collection(db, collectionPath), postData);
            
            console.log("Document written with ID: ", docRef.id);
            
            // Real success message
            journalSubmitMessage.textContent = 'Post Submitted Successfully!';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-red');
            journalSubmitMessage.classList.add('text-brand-green');
            
            // Clear the form
            journalTitle.value = '';
            journalBody.value = '';

        } catch (e) {
            console.error("Error adding document: ", e);
            journalSubmitMessage.textContent = 'Error: Could not submit post. Check console.';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-green');
            journalSubmitMessage.classList.add('text-brand-red');
        }
        */
        
        // --- Mock-up behavior (for demonstration) ---
        // We'll simulate a 1-second network delay
        setTimeout(() => {
            journalSubmitMessage.textContent = 'Post Submitted (Concept)!';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-red');
            journalSubmitMessage.classList.add('text-brand-green');
            journalTitle.value = '';
            journalBody.value = '';
            
            // Hide message after 3 seconds
            setTimeout(() => {
                journalSubmitMessage.classList.add('hidden');
            }, 3000);
            
        }, 1000);
    }
    
    
    //
    // =========================================
    // INITIALIZATION & EVENT LISTENERS
    // =========================================
    //
    
    /**
     * @description This function runs when the page is fully loaded ("DOMContentLoaded").
     * It initializes Firebase and sets up all event listeners for the app.
     */
    function onDOMLoaded() {
        // Initialize Firebase for user authentication
        initFirebase();
        
        // Run all calculators once on load to populate them
        // with the default values from the HTML.
        calculateVPD();
        convertPPM();
        calculateDLI();
        calculateCost(); 

        // --- Navigation Listeners ---
        if (navButtons) {
            navButtons.forEach(button => {
                button.addEventListener('click', () => {
                    showSection(button.dataset.section);
                });
            });
        }

        if (internalNavButtons) {
            internalNavButtons.forEach(button => {
                 button.addEventListener('click', () => {
                    showSection(button.dataset.section);
                 });
            });
        }

        // --- Search Listeners ---
        if (searchInput) {
            // Add 'keypress' listener for the "Enter" key
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && searchInput.value.trim()) {
                    performSearch(searchInput.value.trim());
                    e.preventDefault(); // Prevent form submission (if any)
                }
            });
        }

        // --- Modal Close Listeners ---
        if (closeModalBtns) {
            closeModalBtns.forEach(btn => {
                btn.addEventListener('click', closeModal);
            });
        }
        
        // --- Grow Tools Calculator Listeners ---
        // These 'input' listeners recalculate on every single key press.
        if (tempCInput) tempCInput.addEventListener('input', calculateVPD);
        if (rhInput) rhInput.addEventListener('input', calculateVPD);
        if (ecInput) ecInput.addEventListener('input', convertPPM);
        if (ppmScaleSelect) ppmScaleSelect.addEventListener('change', convertPPM);
        if (ppfdInput) ppfdInput.addEventListener('input', calculateDLI);
        if (hoursOnInput) hoursOnInput.addEventListener('input', calculateDLI);
        
        // --- Cost Calculator Listeners ---
        // We loop over all our cached input elements and add a listener.
        Object.values(costInputs).forEach(input => {
            if (input) {
                input.addEventListener('input', calculateCost);
            }
        });
        
        // --- NEW: Gallery Listener (v16.0) ---
        if (imageUploadBtn) {
            imageUploadBtn.addEventListener('change', handleImageUpload);
        }
        
        // --- NEW: Community Listener (v16.0) ---
        if (journalForm) {
            journalForm.addEventListener('submit', handleJournalSubmit);
        }
        
        // Ensure Home section is visible on load
        showSection('home');
    }

    // Add the main event listener for when the HTML document is ready.
    document.addEventListener('DOMContentLoaded', onDOMLoaded);

})(); // End IIFE
