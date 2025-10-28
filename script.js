// Dynamic imports for Firebase (must be outside the IIFE for module scripts)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Self-executing function (IIFE) for encapsulation
(function() {
    // --- Global Constants & References ---
    const sections = document.querySelectorAll('.content-section');
    const navButtons = document.querySelectorAll('nav .nav-btn');
    const internalNavButtons = document.querySelectorAll('.nav-btn-internal');
    const searchModal = document.getElementById('search-modal');
    const searchInput = document.getElementById('search-input');
    const searchOutput = document.getElementById('search-output');
    const loadingSpinner = document.getElementById('loading-spinner');
    const closeModalBtns = document.querySelectorAll('#close-modal-btn-top, #close-modal-btn-bottom');
    const userIdDisplay = document.getElementById('user-id-display');

    // Calculator Elements
    const tempCInput = document.getElementById('temp-c');
    const rhInput = document.getElementById('rh');
    const vpdOutput = document.getElementById('vpd-output');
    const ecInput = document.getElementById('ec-input');
    const ppmScaleSelect = document.getElementById('ppm-scale');
    const ppmOutput = document.getElementById('ppm-output');
    const ppfdInput = document.getElementById('ppfd-input');
    const hoursOnInput = document.getElementById('hours-on-input');
    const dliOutput = document.getElementById('dli-output');


    // --- Core Utility Functions ---

    /**
     * Implements exponential backoff for API retries.
     * @param {Function} fn - The async function to retry.
     * @param {number} [maxRetries=5] - Maximum number of retries.
     * @param {number} [delay=500] - Initial delay in ms.
     * @returns {Function} - The wrapped function.
     */
    function exponentialBackoff(fn, maxRetries = 5, delay = 500) {
        return async function retryWrapper(...args) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await fn.apply(this, args);
                } catch (error) {
                    if (i === maxRetries - 1) throw error;
                    // Don't log retry attempts as errors in the console
                    // console.warn(`Attempt ${i + 1} failed. Retrying in ${waitTime}ms...`);
                    const waitTime = delay * Math.pow(2, i) + Math.random() * delay;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        };
    }

    // --- Navigation & UI Control ---

    function showSection(id) {
        if (!sections || sections.length === 0) {
             console.error("Content sections not found!");
             return;
        }
        sections.forEach(section => section.classList.add('hidden'));
        const activeSection = document.getElementById(id);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        } else {
             // Fallback to home if section not found
             const homeSection = document.getElementById('home');
             if (homeSection) homeSection.classList.remove('hidden');
             id = 'home'; // Ensure nav button logic below highlights home
        }
        
        if (!navButtons || navButtons.length === 0) {
            console.error("Nav buttons not found!");
            return;
        }
        navButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.section === id) {
                btn.classList.add('active');
            }
        });
        window.scrollTo(0, 0); // Scroll to top on section change
    }

    function closeModal() {
        if (searchModal) {
            searchModal.classList.add('hidden');
        }
        if (searchInput) {
            searchInput.value = ''; // Clear input on close
        }
    }

    // --- Gemini API Implementation (Amigo Answers) ---

    const AMIGO_SYSTEM_PROMPT = "You are Amigo, a world-class cannabis cultivation expert and AI assistant for GROHIO growers. Your responses must be ultra-detailed, scientific, and grounded in the provided search results. Provide a professional, university-level answer, formatted concisely for web display. Always rule out pH lockout first when diagnosing deficiency/toxicity issues.";

    async function callGeminiApi(userQuery) {
        const apiKey = ""; // Canvas environment automatically provides the key.
        const apiUrl = `https://generativelace.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: { parts: [{ text: AMIGO_SYSTEM_PROMPT }] },
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText}. Detail: ${errorBody?.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (!candidate || !candidate.content?.parts?.[0]?.text) {
            throw new Error("Invalid response structure from API.");
        }

        const text = candidate.content.parts[0].text;
        
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

    // Create a retry-wrapped version of the API call
    const performSearchWithRetry = exponentialBackoff(callGeminiApi);

    async function performSearch(userQuery) {
        if (!searchModal || !searchOutput || !loadingSpinner) {
            console.error("Search modal elements are missing!");
            return;
        }
        searchModal.classList.remove('hidden');
        searchOutput.innerHTML = '';
        loadingSpinner.classList.remove('hidden');

        try {
            const { text, sources } = await performSearchWithRetry(userQuery);
            
            let htmlOutput = `<p class="text-brand-green font-bold text-xl mb-3">Response for: "${userQuery}"</p>`;
            
            // Format response text: replace markdown headers and bolding for HTML
            const formattedText = text
                .replace(/##\s*(.*?)\n/g, '<h4 class="text-xl font-bold text-brand-blue mt-4 mb-2">$1</h4>') // H2
                .replace(/###\s*(.*?)\n/g, '<h5 class="text-lg font-bold text-gray-300 mt-3 mb-1">$1</h5>') // H3
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
                
            htmlOutput += `<div class="p-4 border border-gray-800 rounded-lg">${formattedText}</div>`;

            if (sources.length > 0) {
                htmlOutput += '<div class="source-container"><p class="font-bold text-brand-blue">Grounded Sources (via Google Search):</p><ul>';
                sources.forEach((source, index) => {
                    htmlOutput += `<li><a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="source-link">Source ${index + 1}: ${source.title}</a></li>`;
                });
                htmlOutput += '</ul></div>';
            } else {
                htmlOutput += '<div class="source-container"><p class="text-gray-500">Note: Response was generated without external web grounding. Information may not be current.</p></div>';
            }

            searchOutput.innerHTML = htmlOutput;
        } catch (error) {
            console.error("Amigo Answers Error:", error);
            searchOutput.innerHTML = `<div class="text-brand-red p-4 border border-brand-red rounded-lg">
                <p class="font-bold text-xl mb-2">GROHIO System Failure</p>
                <p>I encountered a critical error while processing your request. The API may be unavailable or the connection failed.</p>
                <p class="text-sm mt-2">Error Detail: ${error.message}</p>
                <p class="text-sm mt-1">Please try again with a slightly different query or check your console for further diagnostics.</p>
            </div>`;
        } finally {
            loadingSpinner.classList.add('hidden');
        }
    }
    
    // --- Firebase Setup ---
    let db, auth;
    let userId = 'anon_user';

    async function initFirebase() {
        try {
            // Global variables MANDATED by the canvas environment
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

            if (!firebaseConfigStr) {
                console.warn("Firebase config not found. Running in Offline Mode.");
                if(userIdDisplay) userIdDisplay.textContent = 'Data: Offline Mode';
                return; // Exit if firebase config isn't present
            }
            
            const firebaseConfig = JSON.parse(firebaseConfigStr);
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);

            // Enable debug logging for Firestore
            setLogLevel('Debug');

            // Authentication Logic
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                // Fallback to anonymous sign-in if no token is provided
                await signInAnonymously(auth);
            }

            userId = auth.currentUser?.uid || 'anon_' + crypto.randomUUID();
            
            if (userIdDisplay) {
                userIdDisplay.textContent = `Active User ID: ${userId}`;
            }

        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            if(userIdDisplay) userIdDisplay.textContent = 'Authentication Failed (Check Console)';
        }
    }


    // --- Calculator Logic (Confirmed Correct) ---

    function calculateVPD() {
        if (!tempCInput || !rhInput || !vpdOutput) return; // Guard clause
        
        const T_C = parseFloat(tempCInput.value);
        const RH_percent = parseFloat(rhInput.value);
        
        if (isNaN(T_C) || isNaN(RH_percent) || RH_percent < 0 || RH_percent > 100) {
            vpdOutput.textContent = 'Invalid Input';
            return;
        }
        
        const RH = RH_percent / 100.0;

        // Formula for Saturation Vapor Pressure (SVP) in kPa (using Buck's equation, common in horticulture)
        const SVP_kPa = 0.61094 * Math.exp((17.625 * T_C) / (T_C + 243.04));

        // VPD in kPa
        const VPD = SVP_kPa * (1 - RH);

        let stage = 'Unknown Stage';
        if (VPD < 0.8) stage = 'Seedling/Clone';
        else if (VPD <= 1.2) stage = 'Vegetative Growth';
        else if (VPD <= 1.6) stage = 'Peak Flowering';
        else stage = 'High Stress/Late Flower';

        vpdOutput.textContent = `${VPD.toFixed(2)} kPa (Target: ${stage})`;
    }

    function convertPPM() {
        if (!ecInput || !ppmScaleSelect || !ppmOutput) return; // Guard clause

        const EC = parseFloat(ecInput.value);
        const scale = parseInt(ppmScaleSelect.value, 10);

        if (isNaN(EC) || EC < 0) {
            ppmOutput.textContent = 'Invalid EC Input';
            return;
        }

        // PPM = EC * ScaleFactor (EC is in mS/cm, but meters often read in µS/cm)
        // Assuming input is mS/cm as labeled.
        const PPM = EC * scale;

        ppmOutput.textContent = `${PPM.toFixed(0)} PPM (${scale} Scale)`;
    }
    
    function calculateDLI() {
        if (!ppfdInput || !hoursOnInput || !dliOutput) return; // Guard clause

        const PPFD = parseFloat(ppfdInput.value);
        const Hours = parseFloat(hoursOnInput.value);

        if (isNaN(PPFD) || isNaN(Hours) || PPFD < 0 || Hours < 0 || Hours > 24) {
            dliOutput.textContent = 'Invalid Input';
            return;
        }

        // DLI (mol/m²/day) = (PPFD * Hours * 3600 seconds/hour) / 1,000,000 µmol/mol
        const DLI = (PPFD * Hours * 3600) / 1000000;
        
        let stage = 'Unknown Stage';
        if (DLI < 18) stage = 'Seedlings/Clones';
        else if (DLI <= 40) stage = 'Vegetative Growth';
        else if (DLI <= 60) stage = 'Peak Flower Production';
        else stage = 'Supplemental CO2 Recommended';

        dliOutput.textContent = `${DLI.toFixed(2)} mol/m²/day (Target: ${stage})`;
    }


    // --- Initialization ---

    document.addEventListener('DOMContentLoaded', () => {
        // Initialize Firebase for future persistence
        initFirebase();
        
        // Initial Calculator Calculation (Ensures initial values display correct output)
        calculateVPD();
        convertPPM();
        calculateDLI();

        // Navigation Listeners
        if (navButtons) {
            navButtons.forEach(button => {
                button.addEventListener('click', () => showSection(button.dataset.section));
            });
        }

        if (internalNavButtons) {
            internalNavButtons.forEach(button => {
                 button.addEventListener('click', () => showSection(button.dataset.section));
            });
        }

        // Search Listeners (Enter key for search)
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && searchInput.value.trim()) {
                    performSearch(searchInput.value.trim());
                }
            });
        }

        // Modal Close Listeners
        if (closeModalBtns) {
            closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));
        }

        // Calculator Input Listeners (Recalculate on every change)
        if (tempCInput) tempCInput.addEventListener('input', calculateVPD);
        if (rhInput) rhInput.addEventListener('input', calculateVPD);
        if (ecInput) ecInput.addEventListener('input', convertPPM);
        if (ppmScaleSelect) ppmScaleSelect.addEventListener('change', convertPPM);
        if (ppfdInput) ppfdInput.addEventListener('input', calculateDLI);
        if (hoursOnInput) hoursOnInput.addEventListener('input', calculateDLI);
        
        // Ensure Home is visible on load
        showSection('home');
    });

})(); // End IIFE
