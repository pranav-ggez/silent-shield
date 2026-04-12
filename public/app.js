// --- Global State ---
let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let sosTimer;
let isDarkMode = true;

// Map Layers
let darkLayer, lightLayer;

// Web Audio API State (Offline Siren Generation)
let audioCtx;
let oscillator;
let gainNode;
let isAlarmPlaying = false;
let sirenInterval;

// Load persisted danger zones
let dangerZones = JSON.parse(localStorage.getItem('ss_danger_zones_v2')) || [];

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupSOSHold();
    
    // Check system preference for theme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        toggleTheme();
    }
});

// --- Mapping & Live Tracking ---
function initMap() {
    // Default Map Config
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 15);

    // Define Tile Layers
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });

    if (document.documentElement.classList.contains('dark')) darkLayer.addTo(map);
    else lightLayer.addTo(map);

    plotDangerZones();

    // Start Live GPS Tracking
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                // GPS Success: Hide error banner if it was shown
                document.getElementById('gps-error').classList.add('hidden');
                document.getElementById('main-header').classList.remove('mt-8');

                const { latitude, longitude } = position.coords;
                userLocation = { lat: latitude, lng: longitude };
                const coords = [latitude, longitude];

                if (!userMarker) {
                    const userIcon = L.divIcon({ className: 'custom-user-marker', iconSize: [20, 20] });
                    userMarker = L.marker(coords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
                    map.setView(coords, 16);
                } else {
                    userMarker.setLatLng(coords);
                }
            },
            (err) => {
                console.warn(`GPS Error: ${err.message}`);
                // GPS Failure: Show Banner
                document.getElementById('gps-error').classList.remove('hidden');
                document.getElementById('main-header').classList.add('mt-8');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}

// --- Theme Toggle ---
function toggleTheme() {
    const html = document.documentElement;
    isDarkMode = !isDarkMode;
    
    if (isDarkMode) {
        html.classList.add('dark');
        map.removeLayer(lightLayer);
        darkLayer.addTo(map);
    } else {
        html.classList.remove('dark');
        map.removeLayer(darkLayer);
        lightLayer.addTo(map);
    }
}

// --- Offline Synthesized Alarm (Web Audio API) ---
function toggleAlarm() {
    // Initialize audio context purely on user interaction to bypass browser autoplay blocks
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const btn = document.getElementById('alarm-btn').firstElementChild;

    if (!isAlarmPlaying) {
        isAlarmPlaying = true;
        
        // UI Updates
        btn.classList.replace('bg-amber-100', 'bg-rose-500');
        btn.classList.replace('dark:bg-amber-500/20', 'dark:bg-rose-500');
        btn.classList.replace('text-amber-600', 'text-white');
        btn.classList.replace('dark:text-amber-400', 'dark:text-white');
        btn.classList.add('animate-pulse');

        // Synthesize Siren
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'square'; // Harsh, loud sound
        gainNode.gain.value = 0.5; // Volume
        oscillator.start();

        // Oscillate frequency to sound like a siren
        let freqHigh = true;
        sirenInterval = setInterval(() => {
            oscillator.frequency.setValueAtTime(freqHigh ? 800 : 500, audioCtx.currentTime);
            freqHigh = !freqHigh;
        }, 400);

    } else {
        isAlarmPlaying = false;
        
        // UI Updates
        btn.classList.replace('bg-rose-500', 'bg-amber-100');
        btn.classList.replace('dark:bg-rose-500', 'dark:bg-amber-500/20');
        btn.classList.replace('text-white', 'text-amber-600');
        btn.classList.replace('dark:text-white', 'dark:text-amber-400');
        btn.classList.remove('animate-pulse');

        // Stop Audio
        clearInterval(sirenInterval);
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
        }
    }
}

// --- Features: Utility Actions ---
function triggerFakeCall() { 
    document.getElementById('fake-call').classList.remove('hidden'); 
    const callerText = document.getElementById('caller-status');
    callerText.innerText = "Mobile";
    callerText.classList.add('text-emerald-500', 'animate-pulse');
    callerText.classList.remove('text-white');
}

function startFakeConversation() {
    const callerText = document.getElementById('caller-status');
    callerText.innerText = "00:01 - Call Connected";
    callerText.classList.replace('text-emerald-500', 'text-white');
    callerText.classList.remove('animate-pulse');
}

function closeFakeCall() { 
    document.getElementById('fake-call').classList.add('hidden'); 
}

// Dummy Contacts now need Emails instead of Phone Numbers
let dummyContacts = [
    { name: "Dad", email: "blizzardhellfire@gmail.com" },
    { name: "Local Police", email: "vedasawant2005@gmail.com" }
];

async function triggerRealBackendAlert() {
    const toast = document.getElementById('sms-toast');
    const toastText = document.getElementById('sms-toast-text');
    
    toast.classList.remove('opacity-0', 'translate-y-[-20px]');
    toast.classList.add('opacity-100', 'translate-y-0');
    toastText.innerHTML = `Connecting to server...`;

    const payload = {
        contacts: dummyContacts,
        lat: userLocation ? userLocation.lat : "Unknown",
        lng: userLocation ? userLocation.lng : "Unknown"
    };

    try {
        // Send data to our Node.js Backend
        const response = await fetch('http://localhost:3000/api/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            toastText.innerHTML = `<span class="text-emerald-400">Emergency Emails Dispatched! <i class="fa-solid fa-check-double"></i></span>`;
        } else {
            throw new Error("Server failed to send");
        }
    } catch (error) {
        toastText.innerHTML = `<span class="text-rose-400">Network Error. Retrying... <i class="fa-solid fa-triangle-exclamation"></i></span>`;
        console.error(error);
    }

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
    }, 4000);
}

// Make sure your triggerSOS() function calls triggerRealBackendAlert() instead of the old simulation!

function shareLocation() {
    if (!userLocation) return alert("Waiting for GPS signal...");
    const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'My Live Location',
            text: 'Here is my current location:',
            url: url
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(`My location: ${url}`);
        alert("Location link copied to clipboard!");
    }
}

// --- Feature: Real-time Safepoints ---
async function findSafepoints() {
    if (!userLocation) return alert("Waiting for live GPS fix...");
    document.getElementById('safe-loader').classList.remove('hidden');

    const query = `
        [out:json][timeout:15];
        (
          node["amenity"="police"](around:5000,${userLocation.lat},${userLocation.lng});
          node["amenity"="hospital"](around:5000,${userLocation.lat},${userLocation.lng});
        );
        out body;
    `;
    
    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("API Rate Limited");
        
        const data = await response.json();
        let count = 0;
        const safeIcon = L.divIcon({ className: 'safepoint-marker', html: '<i class="fa-solid fa-shield-cat text-[12px]"></i>', iconSize: [28, 28] });

        data.elements.forEach(el => {
            if (el.lat && el.lon) {
                L.marker([el.lat, el.lon], { icon: safeIcon })
                 .addTo(map).bindPopup(`<b class="text-gray-800">${el.tags.name || el.tags.amenity.toUpperCase()}</b>`);
                count++;
            }
        });

        if (count > 0) map.setZoom(13);
        else alert("No registered safepoints found nearby.");

    } catch (e) { 
        alert("Safepoints API is currently busy. Please try again in a moment."); 
    } finally { 
        document.getElementById('safe-loader').classList.add('hidden'); 
    }
}

// --- Feature: Report Danger ---
function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('report-sheet').classList.add('sheet-open'), 10);
}

function closeReportModal() {
    document.getElementById('report-sheet').classList.remove('sheet-open');
    setTimeout(() => document.getElementById('report-modal').classList.add('hidden'), 300);
}

function submitDanger(type) {
    const targetLocation = map.getCenter();
    const newDanger = {
        lat: targetLocation.lat,
        lng: targetLocation.lng,
        type: type,
        timestamp: new Date().getTime()
    };
    
    dangerZones.push(newDanger);
    localStorage.setItem('ss_danger_zones_v2', JSON.stringify(dangerZones));

    plotDangerZones();
    closeReportModal();
}

function plotDangerZones() {
    const icons = {
        'Harassment': 'fa-person-harassing',
        'Suspicious Person': 'fa-eye',
        'Poor Lighting': 'fa-lightbulb',
        'Deserted Area': 'fa-ghost'
    };

    dangerZones.forEach(zone => {
        const iconClass = icons[zone.type] || 'fa-triangle-exclamation';
        const dangerIcon = L.divIcon({
            className: 'danger-marker',
            html: `<i class="fa-solid ${iconClass} text-[14px]"></i>`,
            iconSize: [34, 34]
        });

        L.marker([zone.lat, zone.lng], { icon: dangerIcon })
         .addTo(map)
         .bindPopup(`<div class="font-bold text-rose-600">${zone.type}</div><div class="text-xs text-gray-500">Reported by user</div>`);
    });
}

// --- SOS Hold Logic (SMS Fallback) ---
function setupSOSHold() {
    const btn = document.getElementById('sos-btn');
    const startTrigger = (e) => {
        e.preventDefault();
        btn.classList.add('scale-95');
        sosTimer = setTimeout(triggerSOS, 2000); // 2 Second Hold
    };
    const endTrigger = () => {
        clearTimeout(sosTimer);
        btn.classList.remove('scale-95');
    };

    btn.addEventListener('mousedown', startTrigger);
    btn.addEventListener('mouseup', endTrigger);
    btn.addEventListener('mouseleave', endTrigger);
    btn.addEventListener('touchstart', startTrigger, {passive: false});
    btn.addEventListener('touchend', endTrigger);
}

async function triggerSOS() {
    if (isSOSActive) return;
    isSOSActive = true;
    
    // 1. UI Updates
    const btn = document.getElementById('sos-btn');
    btn.classList.add('sos-active');
    
    // Safely update text without using invalid Tailwind selectors
    const textContainer = btn.querySelector('.text-left');
    if (textContainer && textContainer.children.length >= 2) {
        textContainer.children[0].innerText = "ACTIVATED";
        textContainer.children[1].innerText = "Alerting Contacts...";
    }
    
    // 2. Local Effects
    if (!isAlarmPlaying) toggleAlarm();
    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 1000]);

    // 3. THE BACKEND CALL (Replacing Native SMS)
    const lat = userLocation ? userLocation.lat : "21.1458"; // Fallback for testing
    const lng = userLocation ? userLocation.lng : "79.0882";

    // Prepare the data for server.js
    const payload = {
        contacts: [
            { name: "Emergency Contact", email: "blizzardhellfire@gmail.com" } // Use your test email here
        ],
        lat: lat,
        lng: lng
    };

    try {
        console.log("Attempting to send SOS to backend...");
        const response = await fetch('http://localhost:3000/api/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            console.log("✅ Email sent via Node.js server!");
            textContainer.children[1].innerText = "Emails Dispatched";
        } else {
            console.error("❌ Server accepted request but failed to send email.");
        }
    } catch (error) {
        console.error("❌ Could not connect to the backend server. Is 'node server.js' running?", error);
        textContainer.children[1].innerText = "Server Offline";
    }
}