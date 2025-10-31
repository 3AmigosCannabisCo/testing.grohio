/**
 * GROHIO v17.0: "Amigo's Notebook" Edition
 * Main Application Logic (script.js)
 *
 * This file contains all JavaScript for the GROHIO platform.
 * It is loaded as a "module" to support Firebase 'import' statements.
 * The entire application is wrapped in an IIFE (Immediately Implemented
 * Function Expression) to prevent polluting the global namespace.
 *
 * v19.0 Changes:
 * - ADDED: Full, functional Firebase persistence for all Calculators and the Community Journal.
 * - ADDED: Real-time listener (onSnapshot) to load and display all community posts.
 * - UPDATED: handleJournalSubmit now correctly writes to the Public Firestore path.
 */

//
// =========================================
// FIREBASE IMPORTS
// =========================================
//
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Import Firestore functions 
import { getFirestore, setLogLevel, addDoc, collection, serverTimestamp, doc, setDoc, getDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
    //
    // We declare all our variables here in the main scope
    // so all functions can access them.
    // We will *assign* them inside onDOMLoaded.
    
    let sections, navButtons, internalNavButtons, userIdDisplay;
    
    // --- Grow Tools Calculator Elements ---
    let tempCInput, rhInput, vpdOutput, ecInput, ppmScaleSelect, ppmOutput,
        ppfdInput, hoursOnInput, dliOutput;

    // --- Cost Calculator Elements ---
    let costInputs = {};
    let costOutputs = {};

    // --- NEW: Gallery Elements (v16.0) ---
    let imageUploadBtn, galleryGrid, galleryMessage;

    // --- NEW: Community Elements (v16.0) ---
    let journalForm, journalTitle, journalBody, journalSubmitMessage, communityFeedContainer;

    // --- NEW: Map of all input IDs for persistence ---
    const ALL_CALC_INPUT_IDS = [
        // VPD
        'temp-c', 'rh',
        // PPM
        'ec-input', 'ppm-scale',
        // DLI
        'ppfd-input', 'hours-on-input',
        // COST
        'cost-onetime-tent', 'cost-onetime-light', 'cost-onetime-other', 
        'cost-recurring-seeds', 'cost-recurring-soil', 'cost-recurring-nutrients',
        'cost-light-watts', 'cost-kwh-rate', 'cost-total-days',
        'cost-yield-grams', 'cost-dispensary-price'
    ];

    //
    // =========================================
    // CORE UTILITY FUNCTIONS
    // =========================================
    //

    /**
     * @description Simple debounce utility to limit the rate of function calls.
     */
    function debounce(func, timeout = 500) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }
    
    /**
     * @description Formats a Firestore Timestamp object into a readable "X time ago" string.
     * @param {object} timestamp - Firestore Timestamp object.
     * @returns {string} - Formatted time string.
     */
    function timeSince(timestamp) {
        if (!timestamp || !timestamp.toDate) return 'Just now';
        
        const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);

        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        
        return "Just now";
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
    
    //
    // =========================================
    // FIREBASE SETUP & PERSISTENCE
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
    let isFirebaseReady = false;

    /**
     * @description Saves the current state of all calculator inputs to Firestore.
     */
    const saveAllInputs = debounce(async () => {
        if (!isFirebaseReady) return; // Only save if authentication succeeded

        try {
            const inputs = {};
            
            // 1. Collect all input values
            ALL_CALC_INPUT_IDS.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    // Save the value directly (Firebase can handle strings/numbers)
                    inputs[id] = element.value; 
                }
            });
            
            // 2. Define the Firestore path (Private Data)
            const docRef = doc(db, `/artifacts/${appId}/users/${userId}/app_data/calculator_inputs`);
            
            // 3. Write the data
            await setDoc(docRef, inputs, { merge: true });
            // console.log("Calculator data saved successfully.");

        } catch (e) {
            console.error("Error saving calculator data:", e);
        }
    }, 1000); // Debounce for 1 second

    /**
     * @description Loads saved calculator inputs from Firestore and updates the UI.
     */
    async function loadAllInputs() {
        if (!isFirebaseReady) return; // Only load if authentication succeeded
        
        try {
            // 1. Define the Firestore path
            const docRef = doc(db, `/artifacts/${appId}/users/${userId}/app_data/calculator_inputs`);
            
            // 2. Fetch the data
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                // console.log("Calculator data loaded:", data);

                // 3. Apply loaded data to the inputs
                ALL_CALC_INPUT_IDS.forEach(id => {
                    const element = document.getElementById(id);
                    if (element && data[id] !== undefined) {
                        element.value = data[id];
                    }
                });
            } else {
                // console.log("No saved calculator data found.");
            }

            // 4. Recalculate all output fields based on the restored (or default) values
            calculateVPD();
            convertPPM();
            calculateDLI();
            calculateCost();

        } catch (e) {
            console.error("Error loading calculator data:", e);
        }
    }

    /**
     * @description Renders a single journal entry HTML element.
     * @param {object} post - The Firestore document data for a post.
     * @returns {string} - The HTML string for the entry.
     */
    function renderJournalEntry(post) {
        // Use the last 4 characters of the userId for a unique, anonymous identifier
        const displayId = post.authorId ? `User ...${post.authorId.substring(post.authorId.length - 4)}` : 'Anonymous';
        const postTime = timeSince(post.createdAt);

        return `
            <div class="journal-entry">
                <div class="journal-meta">
                    <h4 class="text-brand-blue text-xl font-bold m-0">${post.title}</h4>
                    <span class="text-sm text-gray-500">Posted by: ${displayId} (${postTime})</span>
                </div>
                <div class="journal-body">
                    <p>${post.body.replace(/\n/g, '<br>')}</p>
                </div>
            </div>
        `;
    }

    /**
     * @description Sets up the real-time listener for the public community journal posts.
     */
    function setupCommunityListener() {
        if (!isFirebaseReady || !communityFeedContainer) return;
        
        // 1. Define the public collection path
        const collectionPath = `/artifacts/${appId}/public/data/journals`;
        const q = query(collection(db, collectionPath));
        // NOTE: Sorting is done client-side to maintain a responsive app on static hosting.

        // 2. Attach the real-time listener
        onSnapshot(q, (snapshot) => {
            let posts = [];
            snapshot.forEach(doc => {
                posts.push({ id: doc.id, ...doc.data() });
            });
            
            // 3. Sort posts by creation date (newest first)
            posts.sort((a, b) => {
                const dateA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
                const dateB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
                return dateB - dateA; // Descending order
            });

            // 4. Render posts
            let html = '';
            
            // Add a friendly welcome/loading message if empty
            if (posts.length === 0) {
                 html = `<p class="text-center text-gray-600 italic mt-8">Be the first to share your grow journal!</p>`;
            } else {
                 posts.forEach(post => {
                    html += renderJournalEntry(post);
                 });
            }

            // Update the display area
            communityFeedContainer.innerHTML = html;
        }, (error) => {
            console.error("Error listening to community feed:", error);
            communityFeedContainer.innerHTML = `<p class="text-center text-brand-red italic mt-8">Error loading community posts. Check console.</p>`;
        });
    }

    /**
     * @description Initializes the Firebase app, database, and auth.
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
                isFirebaseReady = false;
                
                // Still run calculations with defaults if offline
                calculateVPD();
                convertPPM();
                calculateDLI();
                calculateCost(); 
                return; 
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
            isFirebaseReady = true; // Set flag after successful auth
            
            if (userIdDisplay) {
                userIdDisplay.textContent = `Active User ID: ${userId}`;
            }

            // 6. Load persisted data and then run calculations
            await loadAllInputs();
            
            // 7. Start listening to public community posts
            setupCommunityListener();


        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            if(userIdDisplay) userIdDisplay.textContent = 'Authentication Failed (Check Console)';
            isFirebaseReady = false;
        }
    }


    //
    // =========================================
    // CALCULATOR LOGIC (Runs client-side)
    // =========================================
    //

    /**
     * @description Calculates Vapor Pressure Deficit (VPD) in kPa.
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

        const SVP_kPa = 0.61094 * Math.exp((17.625 * T_C) / (T_C + 243.04));
        const VPD = SVP_kPa * (1 - RH);

        let stage = 'Unknown Stage';
        if (VPD < 0.8) stage = 'Seedling/Clone';
        else if (VPD <= 1.2) stage = 'Vegetative Growth';
        else if (VPD <= 1.6) stage = 'Peak Flowering';
        else stage = 'High Stress/Late Flower';

        vpdOutput.textContent = `${VPD.toFixed(2)} kPa (Target: ${stage})`;
    }

    /**
     * @description Converts Electrical Conductivity (EC) to Parts Per Million (PPM).
     */
    function convertPPM() {
        if (!ecInput || !ppmScaleSelect || !ppmOutput) return; // Guard clause

        const EC = parseFloat(ecInput.value);
        const scale = parseInt(ppmScaleSelect.value, 10); // 500 or 700

        if (isNaN(EC) || EC < 0) {
            ppmOutput.textContent = 'Invalid EC Input';
            return;
        }
        
        const PPM = EC * scale;
        ppmOutput.textContent = `${PPM.toFixed(0)} PPM (${scale} Scale)`;
    }
    
    /**
     * @description Calculates Daily Light Integral (DLI) in mol/m²/day.
     */
    function calculateDLI() {
        if (!ppfdInput || !hoursOnInput || !dliOutput) return; // Guard clause

        const PPFD = parseFloat(ppfdInput.value); // e.g., 800
        const Hours = parseFloat(hoursOnInput.value); // e.g., 12

        if (isNaN(PPFD) || isNaN(Hours) || PPFD < 0 || Hours < 0 || Hours > 24) {
            dliOutput.textContent = 'Invalid Input';
            return;
        }

        const secondsOfLight = Hours * 3600;
        const totalMicromols = PPFD * secondsOfLight;
        const DLI = totalMicromols / 1000000;
        
        let stage = 'Unknown Stage';
        if (DLI < 18) stage = 'Seedlings/Clones';
        else if (DLI <= 40) stage = 'Vegetative Growth';
        else if (DLI <= 60) stage = 'Peak Flower Production';
        else stage = 'Supplemental CO2 Recommended';

        dliOutput.textContent = `${DLI.toFixed(2)} mol/m²/day (Target: ${stage})`;
    }

    /**
     * @description Calculates all fields for the Grow Cost Calculator.
     */
    function calculateCost() {
        // Guard clause: Check if all elements exist
        if (Object.values(costInputs).some(el => !el) || Object.values(costOutputs).some(el => !el)) {
            // Error is okay if run *before* onDOMLoaded assigns elements
            // console.error("CRITICAL: Cost calculator elements are missing!");
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
        const vegDays = Math.min(totalDays, 28);
        const flowerDays = Math.max(0, totalDays - vegDays);
        
        // Assuming 18h light in veg, 12h light in flower
        const vegKwh = (lightWatts * 18 * vegDays) / 1000;
        const flowerKwh = (lightWatts * 12 * flowerDays) / 1000;
        const totalKwh = vegKwh + flowerKwh;
        // Add 15% overhead for fans/pumps/controllers
        const totalKwhWithFans = totalKwh * 1.15; 
        const electricCost = totalKwhWithFans * kwhRateDollars;
        
        const totalOnetimeCost = onetimeTent + onetimeLight + onetimeOther;
        const totalRecurringCost = recurringSeeds + recurringSoil + recurringNutrients + electricCost;
        const totalFirstCost = totalOnetimeCost + totalRecurringCost;
        
        const costPerGram = totalFirstCost / yieldGrams;
        const costPerGramFuture = totalRecurringCost / yieldGrams;
        const harvestValue = yieldGrams * dispensaryPrice;
        const totalSavings = harvestValue - totalRecurringCost;

        // 3. Update UI
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
    // (Unchanged from previous versions)
    // =========================================
    //
    
    /**
     * @description Saves the current gallery images (as Base64 URLs) to localStorage.
     */
    function saveGalleryToStorage() {
        if (!galleryGrid) return;
        
        const images = [];
        // Find all images in the grid *except* the placeholder
        const items = galleryGrid.querySelectorAll('.gallery-item:not(.placeholder)');
        
        // We save in reverse order so they load in the correct (newest first) order
        const itemsArray = Array.from(items).reverse();

        itemsArray.forEach(item => {
            const img = item.querySelector('img');
            const caption = item.querySelector('.gallery-item-caption p');
            if (img && caption) {
                images.push({
                    src: img.src,
                    name: caption.textContent
                });
            }
        });
        
        // Save the array as a JSON string
        localStorage.setItem('grohioGallery', JSON.stringify(images));
    }

    /**
     * @description Loads images from localStorage and populates the gallery.
     */
    function loadGalleryFromStorage() {
        if (!galleryGrid) return;
        
        // Wrap in try...catch to prevent bad JSON from breaking the whole script
        try {
            const storedImages = JSON.parse(localStorage.getItem('grohioGallery') || '[]');
            
            if (storedImages.length > 0) {
                // Remove the placeholder if we are loading saved images
                const placeholder = galleryGrid.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
                
                storedImages.forEach(imgData => {
                    // Create and add the gallery item
                    addGalleryItem(imgData.src, imgData.name, "Loaded from memory");
                });
            }
        } catch (error) {
            console.error("Error loading gallery from localStorage:", error);
            // If storage is corrupt, clear it so it works next time.
            localStorage.removeItem('grohioGallery');
        }
    }
    
    /**
     * @description Helper function to create and prepend a new gallery item.
     * @param {string} imageDataUrl - The Base64 image src.
     * @param {string} fileName - The name of the file.
     * @param {string} uploadTime - Text to display for upload time.
     */
    function addGalleryItem(imageDataUrl, fileName, uploadTime) {
        if (!galleryGrid) return;

        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item animate-fadeIn'; // Add animation
        
        galleryItem.innerHTML = `
            <img src="${imageDataUrl}" alt="User uploaded grow photo: ${fileName}">
            <div class="gallery-item-caption">
                <p>${fileName}</p>
                <span class="text-xs text-gray-400">${uploadTime}</span>
            </div>
        `;
        
        // Add the new item to the top of the grid
        galleryGrid.prepend(galleryItem);
    }

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
            
            // 1. Use the new helper function
            addGalleryItem(imageDataUrl, file.name, "Uploaded by: You (Local)");
            
            // 2. Save the new state to localStorage
            saveGalleryToStorage();
            
            // 3. Show success message
            galleryMessage.textContent = 'Success! Your image has been added to the local gallery.';
            galleryMessage.classList.remove('hidden', 'text-brand-red');
            galleryMessage.classList.add('text-brand-green');

            // 4. Remove the placeholder if it exists
            const placeholder = galleryGrid.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
            }
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
    // NEW: COMMUNITY JOURNAL LOGIC (v19.0 - LIVE)
    // =========================================
    //
    
    /**
     * @description Handles the submission of the new journal entry form.
     */
    async function handleJournalSubmit(event) {
        event.preventDefault(); // Stop the form from reloading the page
        
        if (!journalTitle || !journalBody || !journalSubmitMessage ) {
             console.error("Journal form elements are missing.");
             return;
        }
        
        // Check if Firebase is ready and the user is authenticated
        if (!isFirebaseReady || !auth.currentUser) {
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
        
        // Show submitting message
        journalSubmitMessage.textContent = 'Submitting...';
        journalSubmitMessage.classList.remove('hidden', 'text-brand-red');
        journalSubmitMessage.classList.add('text-brand-green');

        
        try {
            // This is the public path for this app's shared data
            const collectionPath = `/artifacts/${appId}/public/data/journals`;
            
            // This is the data we will send
            const postData = {
                title: title,
                body: body,
                // Shorten the ID for display purposes, but save the full ID for reference
                authorId: userId,
                createdAt: serverTimestamp() // Uses the server's time
            };
            
            // Write the data to the database
            await addDoc(collection(db, collectionPath), postData);
            
            // console.log("Document written with ID: ", docRef.id);
            
            // Real success message
            journalSubmitMessage.textContent = 'Post Submitted Successfully!';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-red');
            journalSubmitMessage.classList.add('text-brand-green');
            
            // Clear the form
            journalTitle.value = '';
            journalBody.value = '';
            
            // Hide message after 3 seconds
            setTimeout(() => {
                journalSubmitMessage.classList.add('hidden');
            }, 3000);


        } catch (e) {
            console.error("Error adding document: ", e);
            journalSubmitMessage.textContent = 'Error: Could not submit post. Check console.';
            journalSubmitMessage.classList.remove('hidden', 'text-brand-green');
            journalSubmitMessage.classList.add('text-brand-red');
        }
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
        
        // --- 1. DOM VARIABLE ASSIGNMENT ---
        
        sections = document.querySelectorAll('.content-section');
        navButtons = document.querySelectorAll('nav .nav-btn');
        internalNavButtons = document.querySelectorAll('.nav-btn-internal');
        userIdDisplay = document.getElementById('user-id-display');

        // Grow Tools
        tempCInput = document.getElementById('temp-c');
        rhInput = document.getElementById('rh');
        vpdOutput = document.getElementById('vpd-output');
        ecInput = document.getElementById('ec-input');
        ppmScaleSelect = document.getElementById('ppm-scale');
        ppmOutput = document.getElementById('ppm-output');
        ppfdInput = document.getElementById('ppfd-input');
        hoursOnInput = document.getElementById('hours-on-input');
        dliOutput = document.getElementById('dli-output');

        // Cost Calculator
        costInputs = {
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
        costOutputs = {
            onetimeCost: document.getElementById('output-onetime-cost'),
            electricCost: document.getElementById('output-electric-cost'),
            recurringCost: document.getElementById('output-recurring-cost'),
            totalCost: document.getElementById('output-total-cost'),
            harvestValue: document.getElementById('output-harvest-value'),
            totalSavings: document.getElementById('output-total-savings'),
            costPerGram: document.getElementById('output-cost-per-gram'),
            costPerGramFuture: document.getElementById('output-cost-per-gram-future')
        };

        // Gallery
        imageUploadBtn = document.getElementById('image-upload-btn');
        galleryGrid = document.getElementById('gallery-grid');
        galleryMessage = document.getElementById('gallery-message');

        // Community
        journalForm = document.getElementById('journal-form');
        journalTitle = document.getElementById('journal-title');
        journalBody = document.getElementById('journal-body');
        journalSubmitMessage = document.getElementById('journal-submit-message');
        // CRITICAL: We need a dedicated container to inject the live posts
        communityFeedContainer = document.getElementById('community-feed-container'); 

        
        // --- 2. INITIALIZATION ---
        
        // Initialize Firebase (and triggers loading of data + initial calculations/listeners)
        initFirebase();
        
        // Load gallery from storage (uses localStorage, not Firebase)
        loadGalleryFromStorage();

        
        // --- 3. ADD EVENT LISTENERS ---

        // Navigation Listeners
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
        
        // --- Calculator Listeners (Now call persistence logic on change) ---

        // Combined listeners for all Grow Tools (VPD, PPM, DLI)
        const allToolInputs = [tempCInput, rhInput, ecInput, ppmScaleSelect, ppfdInput, hoursOnInput];
        allToolInputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    // Recalculate the relevant tool
                    if (input.id === 'temp-c' || input.id === 'rh') calculateVPD();
                    if (input.id === 'ec-input' || input.id === 'ppm-scale') convertPPM();
                    if (input.id === 'ppfd-input' || input.id === 'hours-on-input') calculateDLI();
                    
                    // Save all inputs to Firestore (debounced)
                    saveAllInputs();
                });
            }
        });
        
        // Cost Calculator Listeners
        Object.values(costInputs).forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    // Recalculate and save all inputs (debounced)
                    calculateCost();
                    saveAllInputs();
                });
            }
        });
        
        // Gallery Listener
        if (imageUploadBtn) {
            imageUploadBtn.addEventListener('change', handleImageUpload);
        }
        
        // Community Listener (LIVE)
        if (journalForm) {
            journalForm.addEventListener('submit', handleJournalSubmit);
        }
        
        // --- 4. SHOW INITIAL SECTION ---
        // Ensure Home section is visible on load
        showSection('home');
    }

    // Add the main event listener for when the HTML document is ready.
    document.addEventListener('DOMContentLoaded', onDOMLoaded);

})(); // End IIFE
