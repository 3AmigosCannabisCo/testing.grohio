// --- FILE: script.js ---
// This is the "brain" of your app. It handles Firebase connection,
// authentication, database posts, image uploads, and all user interactions.

// 1. IMPORT FIREBASE SERVICES
// We use the modern "ESM" (ECMAScript Modules) to only load what we need.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  orderBy,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// 2. INITIALIZE FIREBASE
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// --- !! CRITICAL !! ---
//
// THIS IS THE SPOT!
//
// Paste your firebaseConfig object from your Firebase project
// settings right here, replacing the placeholder keys.
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
 apiKey: "AIzaSyCohZppMXwTkCUxq-bpcKtOwhQmhiZvW34",
  authDomain: "grohio-3amigos.firebaseapp.com",
  projectId: "grohio-3amigos",
  storageBucket: "grohio-3amigos.firebasestorage.app",
  messagingSenderId: "985498353759",
  appId: "1:985498353759:web:954433dce5869ab60fdbea",
  measurementId: "G-N6R2H9PWN6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Global variable to hold the current user's ID
let currentUserId = null;

// 3. CORE APP LOGIC
document.addEventListener('DOMContentLoaded', () => {
  // Grab all the key elements from app.html
  const navButtons = document.querySelectorAll('.nav-btn');
  const internalNavButtons = document.querySelectorAll('.nav-btn-internal');
  const contentSections = document.querySelectorAll('.content-section');
  const userIdDisplay = document.getElementById('user-id-display');

  // --- Handle Navigation ---
  function showSection(sectionId) {
    // Hide all sections
    contentSections.forEach(section => {
      section.classList.add('hidden');
    });

    // Deactivate all nav buttons
    navButtons.forEach(btn => {
      btn.classList.remove('active');
    });

    // Show the target section
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
      activeSection.classList.remove('hidden');
    }

    // Activate the corresponding nav button
    const activeButton = document.querySelector(`.nav-btn[data-section="${sectionId}"]`);
    if (activeButton) {
      activeButton.classList.add('active');
    }
  }

  // Add click listeners to top nav buttons
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const sectionId = button.getAttribute('data-section');
      showSection(sectionId);
    });
  });

  // Add click listeners to internal nav buttons (e.g., "View Ohio Grow Laws")
  internalNavButtons.forEach(button => {
    button.addEventListener('click', () => {
      const sectionId = button.getAttribute('data-section');
      showSection(sectionId);
    });
  });

  // --- Firebase Authentication ---
  // Sign the user in anonymously on load
  signInAnonymously(auth).catch((error) => {
    console.error("Anonymous Auth Error:", error);
    userIdDisplay.textContent = 'Auth Failed. Refresh.';
  });

  // Listen for auth state changes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      currentUserId = user.uid;
      userIdDisplay.textContent = `User ID: ${currentUserId}`;

      // User is authenticated, now we can load their data and community data
      loadCommunityFeed();
      loadGallery();
      loadSavedCalculatorData(); // Load saved calculator data

    } else {
      // User is signed out
      currentUserId = null;
      userIdDisplay.textContent = 'Not Authenticated';
    }
  });

  // --- Community Tab (Firestore) ---
  const journalForm = document.getElementById('journal-form');
  const journalTitleInput = document.getElementById('journal-title');
  const journalBodyInput = document.getElementById('journal-body');
  const journalSubmitMessage = document.getElementById('journal-submit-message');
  const feedContainer = document.getElementById('community-feed-container');

  // Handle journal post submission
  journalForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission
    if (!currentUserId) {
      setSubmitMessage('Error: You must be signed in to post.', 'error');
      return;
    }

    const title = journalTitleInput.value.trim();
    const body = journalBodyInput.value.trim();

    if (!title || !body) {
      setSubmitMessage('Error: Title and body cannot be empty.', 'error');
      return;
    }

    try {
      // Add a new document to the "community-posts" collection
      await addDoc(collection(db, 'community-posts'), {
        userId: currentUserId,
        title: title,
        body: body,
        createdAt: serverTimestamp() // Use Firebase's timestamp
      });

      // Clear the form and show success
      journalTitleInput.value = '';
      journalBodyInput.value = '';
      setSubmitMessage('Post submitted successfully!', 'success');

    } catch (error) {
      console.error('Error adding document: ', error);
      setSubmitMessage('Error: Could not submit post.', 'error');
    }
  });

  // Helper for submit message
  function setSubmitMessage(message, type) {
    journalSubmitMessage.textContent = message;
    journalSubmitMessage.className = `text-sm text-center mt-4 ${type === 'error' ? 'text-red-500' : 'text-green-500'}`;
    journalSubmitMessage.classList.remove('hidden');
    setTimeout(() => journalSubmitMessage.classList.add('hidden'), 4000);
  }

  // Load and listen for new community posts
  function loadCommunityFeed() {
    if (!currentUserId) return; // Don't load if no user

    const postsCollection = collection(db, 'community-posts');
    // Query to get posts, ordered by creation date (newest first)
    // NOTE: This query requires a Firestore Index. 
    // The console will provide a link to create it automatically if it fails.
    const q = query(postsCollection, orderBy('createdAt', 'desc'));

    // onSnapshot listens for real-time updates
    onSnapshot(q, (querySnapshot) => {
      if (querySnapshot.empty) {
        feedContainer.innerHTML = '<p class="text-center text-gray-600 italic mt-8">No posts yet. Be the first!</p>';
        return;
      }

      feedContainer.innerHTML = ''; // Clear the feed
      querySnapshot.forEach((doc) => {
        const post = doc.data();
        const postElement = document.createElement('div');
        postElement.className = 'community-post card p-6 mb-6';
        
        // Format the timestamp
        const date = post.createdAt ? post.createdAt.toDate().toLocaleString() : 'Just now';

        postElement.innerHTML = `
          <h4 class="text-brand-green text-xl font-bold mb-2">${escapeHTML(post.title)}</h4>
          <p class="mb-4">${escapeHTML(post.body)}</p>
          <div class="text-xs text-gray-500">
            <p>Posted by: ${escapeHTML(post.userId)}</p>
            <p>${date}</p>
          </div>
        `;
        feedContainer.appendChild(postElement);
      });
    }, (error) => {
      console.error("Error loading feed: ", error);
      // This is the error you get if the index is missing
      if (error.code === 'failed-precondition') {
        feedContainer.innerHTML = `<p class="text-center text-red-500 italic mt-8">Error: Database index required. Please check the JavaScript console (F12) for a link to create the Firestore index.</p>`;
      } else {
        feedContainer.innerHTML = '<p class="text-center text-red-500 italic mt-8">Error loading community feed.</p>';
      }
    });
  }

  // --- Gallery Tab (Firebase Storage) ---
  const imageUploadBtn = document.getElementById('image-upload-btn');
  const galleryMessage = document.getElementById('gallery-message');
  const galleryGrid = document.getElementById('gallery-grid');

  // Handle image upload
  imageUploadBtn.addEventListener('change', async (e) => {
    if (!currentUserId) {
      setGalleryMessage('Error: You must be signed in to upload.', 'error');
      return;
    }

    const file = e.target.files[0];
    if (!file) return; // No file selected

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setGalleryMessage('Error: File is too large (Max 5MB).', 'error');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      setGalleryMessage('Error: Only image files are allowed.', 'error');
      return;
    }

    setGalleryMessage('Uploading...', 'success');

    try {
      // Create a unique file path in Storage
      const filePath = `gallery/${currentUserId}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, filePath);

      // Upload the file
      const uploadResult = await uploadBytes(storageRef, file);

      // Get the public download URL
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Now, save a reference to this image in *Firestore*
      // This makes it easy to query for all gallery images
      await addDoc(collection(db, 'gallery-images'), {
        userId: currentUserId,
        imageUrl: downloadURL,
        storagePath: filePath, // Good to store this for later (e.g., deleting)
        createdAt: serverTimestamp()
      });

      setGalleryMessage('Upload successful!', 'success');
      // The onSnapshot listener for the gallery will automatically pick up the new image.
      
    } catch (error) {
      console.error("Image upload error: ", error);
      setGalleryMessage('Error: Upload failed.', 'error');
    }
  });

  // Helper for gallery message
  function setGalleryMessage(message, type) {
    galleryMessage.textContent = message;
    galleryMessage.className = `text-sm text-center mt-4 ${type === 'error' ? 'text-red-500' : 'text-green-500'}`;
    galleryMessage.classList.remove('hidden');
    setTimeout(() => galleryMessage.classList.add('hidden'), 4000);
  }

  // Load and listen for new gallery images
  function loadGallery() {
    if (!currentUserId) return;

    const imagesCollection = collection(db, 'gallery-images');
    // NOTE: This query also requires an index.
    const q = query(imagesCollection, orderBy('createdAt', 'desc'));

    onSnapshot(q, (querySnapshot) => {
      if (querySnapshot.empty) {
        // Don't clear the placeholder if it's the only thing there
        const placeholder = galleryGrid.querySelector('.placeholder');
        if (placeholder) {
          placeholder.style.display = 'block';
        }
        return;
      }

      // Clear the grid, but keep the placeholder template
      const placeholder = galleryGrid.querySelector('.placeholder');
      galleryGrid.innerHTML = '';
      if(placeholder) {
        placeholder.style.display = 'none'; // Hide placeholder
        galleryGrid.appendChild(placeholder);
      }

      querySnapshot.forEach((doc) => {
        const image = doc.data();
        const imgElement = document.createElement('div');
        imgElement.className = 'gallery-item';
        imgElement.innerHTML = `
          <img src="${escapeHTML(image.imageUrl)}" alt="User Upload" 
               onerror="this.src='https://placehold.co/400x400/0d0d0d/999?text=Image+Failed+to+Load'">
          <div class="gallery-item-caption">
              <p>Uploaded by:</p>
              <span class="text-xs text-gray-400">${escapeHTML(image.userId)}</span>
          </div>
        `;
        // Append new images *after* the (now hidden) placeholder
        galleryGrid.appendChild(imgElement);
      });
      
    }, (error) => {
      console.error("Error loading gallery: ", error);
      if (error.code === 'failed-precondition') {
        galleryGrid.innerHTML = `<p class="text-center text-red-500 italic mt-8 col-span-full">Error: Database index required. Please check the JavaScript console (F12) for a link to create the Firestore index.</p>`;
      } else {
        galleryGrid.innerHTML = '<p class="text-center text-red-500 italic mt-8 col-span-full">Error loading gallery.</p>';
      }
    });
  }

  // --- Calculators & Data Persistence ---
  // We will save calculator data to a *single document* per user
  // in a 'user-profiles' collection. This is more efficient.

  const calculatorInputs = document.querySelectorAll('.calc-input');
  
  // Function to get a reference to the user's profile document
  function getUserProfileRef() {
    if (!currentUserId) return null;
    // Use 'user-profiles' as the collection for private user data
    return doc(db, 'user-profiles', currentUserId);
  }

  // Save data whenever a calculator input changes (debounced)
  const debouncedSave = debounce(async (fieldId, value) => {
    if (!currentUserId) return;
    const userProfileRef = getUserProfileRef();
    try {
      await setDoc(userProfileRef, {
        calculators: {
          [fieldId]: value
        }
      }, { merge: true });
    } catch (error) {
      console.error("Error saving calculator data: ", error);
    }
  }, 1000); // Wait 1 second after user stops typing to save

  calculatorInputs.forEach(input => {
    input.addEventListener('input', () => { // 'input' is better than 'change' for live updates
      debouncedSave(input.id, input.value);
    });
  });

  // Load saved calculator data when the user signs in
  async function loadSavedCalculatorData() {
    const userProfileRef = getUserProfileRef();
    if (!userProfileRef) return;

    try {
      const docSnap = await getDoc(userProfileRef);
      if (docSnap.exists() && docSnap.data().calculators) {
        const calcData = docSnap.data().calculators;
        // Apply saved data to each input
        calculatorInputs.forEach(input => {
          if (calcData[input.id]) {
            input.value = calcData[input.id];
          }
        });
        // After loading, trigger calculations to update outputs
        runAllCalculations();
      }
    } catch (error) {
      console.error("Error loading calculator data: ", error);
    }
  }

  // --- Run Calculations (VPD, DLI, Cost) ---
  // Grab all calculator inputs and outputs
  const vpdTemp = document.getElementById('temp-c');
  const vpdRh = document.getElementById('rh');
  const vpdOutput = document.getElementById('vpd-output');

  const dliPpfd = document.getElementById('ppfd-input');
  const dliHours = document.getElementById('hours-on-input');
  const dliOutput = document.getElementById('dli-output');

  const ecInput = document.getElementById('ec-input');
  const ppmScale = document.getElementById('ppm-scale');
  const ppmOutput = document.getElementById('ppm-output');

  const costOnetimeTent = document.getElementById('cost-onetime-tent');
  const costOnetimeLight = document.getElementById('cost-onetime-light');
  const costOnetimeOther = document.getElementById('cost-onetime-other');
  const costRecurringSeeds = document.getElementById('cost-recurring-seeds');
  const costRecurringSoil = document.getElementById('cost-recurring-soil');
  const costRecurringNutrients = document.getElementById('cost-recurring-nutrients');
  const costLightWatts = document.getElementById('cost-light-watts');
  const costKwhRate = document.getElementById('cost-kwh-rate');
  const costTotalDays = document.getElementById('cost-total-days');
  const costYieldGrams = document.getElementById('cost-yield-grams');
  const costDispensaryPrice = document.getElementById(
    'cost-dispensary-price'
  );

  const outputOnetimeCost = document.getElementById('output-onetime-cost');
  const outputElectricCost = document.getElementById('output-electric-cost');
  const outputRecurringCost = document.getElementById('output-recurring-cost');
  const outputTotalCost = document.getElementById('output-total-cost');
  const outputCostPerGram = document.getElementById('output-cost-per-gram');
  const outputCostPerGramFuture = document.getElementById('output-cost-per-gram-future');
  const outputHarvestValue = document.getElementById('output-harvest-value');
  const outputTotalSavings = document.getElementById('output-total-savings');

  function calculateVPD() {
    if (!vpdTemp || !vpdRh || !vpdOutput) return;
    const T = parseFloat(vpdTemp.value); // Temp in Celsius
    const RH = parseFloat(vpdRh.value); // RH in %

    if (isNaN(T) || isNaN(RH)) return;

    // Saturation Vapor Pressure (SVP) using Buck's equation
    const SVP = 0.61121 * Math.exp(((18.678 - T / 234.5) * (T / (257.14 + T))));
    
    // Vapor Pressure Deficit (VPD) in kPa
    const VPD = SVP * (1 - (RH / 100));
    
    let vpdText = `${VPD.toFixed(2)} kPa`;
    let colorClass = 'calc-output-green'; // Default green

    if (VPD < 0.4) {
      vpdText += " (Too Low - Mold Risk)";
      colorClass = 'calc-output-blue';
    } else if (VPD >= 0.4 && VPD < 0.8) {
      vpdText += " (Ideal for Seedlings)";
      colorClass = 'calc-output-blue';
    } else if (VPD >= 0.8 && VPD <= 1.2) {
      vpdText += " (Ideal for Veg)";
    } else if (VPD > 1.2 && VPD <= 1.6) {
      vpdText += " (Ideal for Flower)";
    } else if (VPD > 1.6) {
      vpdText += " (Too High - Stress)";
      colorClass = 'calc-output-red';
    }
    
    vpdOutput.textContent = vpdText;
    vpdOutput.className = `calc-output flex items-center justify-center ${colorClass}`;
  }

  function calculateDLI() {
    if (!dliPpfd || !dliHours || !dliOutput) return;
    const ppfd = parseFloat(dliPpfd.value);
    const hours = parseFloat(dliHours.value);
    
    if (isNaN(ppfd) || isNaN(hours)) return;

    // DLI = (PPFD * hours * 3600) / 1,000,000
    const dli = (ppfd * hours * 3600) / 1000000;

    let dliText = `${dli.toFixed(2)} mol/m²/day`;
    let colorClass = 'calc-output-green';

    if (dli < 15) {
      dliText += " (Seedlings)";
      colorClass = 'calc-output-blue';
    } else if (dli >= 15 && dli < 30) {
      dliText += " (Good for Veg)";
    } else if (dli >= 30 && dli < 45) {
      dliText += " (Good for Flower)";
    } else if (dli >= 45) {
      dliText += " (Max Flower)";
      colorClass = 'calc-output-red'; // High end
    }
    
    dliOutput.textContent = dliText;
    dliOutput.className = `calc-output flex items-center justify-center ${colorClass}`;
  }
  
  function calculatePPM() {
    if (!ecInput || !ppmScale || !ppmOutput) return;
    const ec = parseFloat(ecInput.value);
    const scale = parseFloat(ppmScale.value);
    
    if (isNaN(ec) || isNaN(scale)) return;
    
    const ppm = ec * scale;
    const scaleText = scale === 500 ? "500 Scale" : "700 Scale";
    
    ppmOutput.textContent = `${ppm.toFixed(0)} PPM (${scaleText})`;
  }
  
  function calculateCost() {
    // Guard against missing elements
    if (!costOnetimeTent || !costOnetimeLight || !costOnetimeOther || !costRecurringSeeds || 
        !costRecurringSoil || !costRecurringNutrients || !costLightWatts || !costKwhRate || 
        !costTotalDays || !costYieldGrams || !costDispensaryPrice || !outputOnetimeCost || 
        !outputElectricCost || !outputRecurringCost || !outputTotalCost || !outputCostPerGram || 
        !outputCostPerGramFuture || !outputHarvestValue || !outputTotalSavings) {
      // console.warn("Cost calculator elements not ready.");
      return;
    }

    const onetime = (parseFloat(costOnetimeTent.value) || 0) + (parseFloat(costOnetimeLight.value) || 0) + (parseFloat(costOnetimeOther.value) || 0);
    const consumables = (parseFloat(costRecurringSeeds.value) || 0) + (parseFloat(costRecurringSoil.value) || 0) + (parseFloat(costRecurringNutrients.value) || 0);
    
    const watts = parseFloat(costLightWatts.value) || 0;
    const rate = (parseFloat(costKwhRate.value) || 0) / 100; // convert cents to dollars
    const days = parseFloat(costTotalDays.value) || 0;
    const yieldGrams = parseFloat(costYieldGrams.value) || 1; // Avoid division by zero
    const dispoPrice = parseFloat(costDispensaryPrice.value) || 0;
    
    // Assume 4 weeks (28 days) of Veg @ 18/6, rest is Flower @ 12/12
    const vegDays = Math.min(days, 28);
    const flowerDays = Math.max(0, days - 28);
    
    const vegHours = vegDays * 18;
    const flowerHours = flowerDays * 12;
    
    const totalKwh = (watts * (vegHours + flowerHours)) / 1000;
    const electricCost = totalKwh * rate;
    
    const recurringCost = consumables + electricCost;
    const totalFirstCost = onetime + recurringCost;
    const costPerGram = totalFirstCost / yieldGrams;
    const costPerGramFuture = recurringCost / yieldGrams;

    const harvestValue = (yieldGrams || 0) * dispoPrice;
    const totalSavings = harvestValue - recurringCost; // Savings after first grow
    
    // Update UI
    outputOnetimeCost.textContent = `$${onetime.toFixed(2)}`;
    outputElectricCost.textContent = `$${electricCost.toFixed(2)}`;
    outputRecurringCost.textContent = `$${recurringCost.toFixed(2)}`;
    outputTotalCost.textContent = `$${totalFirstCost.toFixed(2)}`;
    outputCostPerGram.textContent = `$${costPerGram.toFixed(2)} / gram`;
    outputCostPerGramFuture.textContent = `$${costPerGramFuture.toFixed(2)} / gram`;
    outputHarvestValue.textContent = `$${harvestValue.toFixed(2)}`;
    outputTotalSavings.textContent = `$${totalSavings.toFixed(2)}`;
  }

  function runAllCalculations() {
    calculateVPD();
    calculateDLI();
    calculatePPM();
    calculateCost();
  }

  // Add listeners to all calc inputs to re-run calculations
  const allCalcInputs = document.querySelectorAll('.calculator-container input, .calculator-container select, .cost-calculator-container input');
  allCalcInputs.forEach(input => {
    input.addEventListener('input', runAllCalculations);
  });
  
  // Run once on load
  runAllCalculations();

  // --- FAQ Section ---
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      item.classList.toggle('open');
    });
  });

  // Show the home section by default
  showSection('home');

});

// --- Utility Functions ---
function escapeHTML(str) {
  if (str === null || str === undefined) {
    return '';
  }
  // Basic sanitization to prevent HTML injection from user posts
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * @description Simple debounce utility to limit the rate of function calls.
 */
function debounce(func, timeout = 1000) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCohZppMXwTkCUxq-bpcKtOwhQmhiZvW34",
  authDomain: "grohio-3amigos.firebaseapp.com",
  projectId: "grohio-3amigos",
  storageBucket: "grohio-3amigos.firebasestorage.app",
  messagingSenderId: "985498353759",
  appId: "1:985498353759:web:954433dce5869ab60fdbea",
  measurementId: "G-N6R2H9PWN6"
};
