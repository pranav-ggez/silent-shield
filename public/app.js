// --- Global State ---
let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let isDarkMode = true;

// Map Layers
let darkLayer, lightLayer;

// Web Audio API State (Siren Generation)
let audioCtx;
let oscillator;
let gainNode;
let isAlarmPlaying = false;
let sirenInterval;

const alarmAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3'); 
alarmAudio.loop = true;

// Load persisted danger zones
let dangerZones = JSON.parse(localStorage.getItem('ss_danger_zones_v2')) || [];

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupSOSDoubleTap(); // Switched from Hold to Double Tap
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        toggleTheme();
    }
});

// --- Mapping & Live Tracking ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 15);
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });

    if (document.documentElement.classList.contains('dark')) darkLayer.addTo(map);
    else lightLayer.addTo(map);

    plotDangerZones();

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
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
            (err) => console.warn(`GPS Error: ${err.message}`),
            { enableHighAccuracy: true }
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

// --- Alarm Logic ---
function toggleAlarm() {
    const btn = document.getElementById('alarm-btn').firstElementChild;
    if (alarmAudio.paused) {
        alarmAudio.play().then(() => {
            btn.classList.replace('bg-amber-100', 'bg-rose-500');
            btn.classList.replace('dark:bg-amber-500/20', 'dark:bg-rose-500');
            btn.classList.replace('text-amber-600', 'text-white');
            btn.classList.replace('dark:text-amber-400', 'dark:text-white');
            btn.classList.add('animate-pulse');
        }).catch(err => console.log("Audio play blocked by browser"));
    } else {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        btn.classList.replace('bg-rose-500', 'bg-amber-100');
        btn.classList.replace('dark:bg-rose-500', 'dark:bg-amber-500/20');
        btn.classList.replace('text-white', 'text-amber-600');
        btn.classList.replace('dark:text-white', 'dark:text-amber-400');
        btn.classList.remove('animate-pulse');
    }
}

// --- Fake Call Features ---
function triggerFakeCall() { 
    document.getElementById('fake-call').classList.remove('hidden'); 
    const status = document.getElementById('caller-status');
    status.innerText = "Mobile";
    status.classList.add('text-emerald-500', 'animate-pulse');
}

function startFakeConversation() {
    const status = document.getElementById('caller-status');
    status.classList.replace('text-emerald-500', 'text-white');
    status.classList.remove('animate-pulse');
    
    let callSeconds = 0;
    setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        status.innerText = `${mins}:${secs}`;
    }, 1000);
}

function closeFakeCall() { document.getElementById('fake-call').classList.add('hidden'); }

// --- SOS Double Tap Logic ---
function setupSOSDoubleTap() {
    const btn = document.getElementById('sos-btn');
    let lastTap = 0;

    btn.addEventListener('touchend', (e) => {
        let currentTime = new Date().getTime();
        let tapLength = currentTime - lastTap;
        if (tapLength < 500 && tapLength > 0) {
            triggerSOS();
            e.preventDefault();
        }
        lastTap = currentTime;
    });

    btn.addEventListener('dblclick', triggerSOS);
}

// --- The Core SOS Function (Talks to Render Backend) ---
async function triggerSOS() {
    if (isSOSActive) return;
    isSOSActive = true;
    
    // 1. UI Updates
    const btn = document.getElementById('sos-btn');
    btn.classList.add('sos-active');
    
    const textContainer = btn.querySelector('.text-left');
    if (textContainer) {
        textContainer.children[0].innerText = "ACTIVATED";
        textContainer.children[1].innerText = "Alerting Server...";
    }
    
    // 2. Alarm & Vibration
    toggleAlarm();
    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);

    // 3. Prepare Real Data
    const payload = {
        contacts: [
            { name: "Dad", email: "blizzardhellfire@gmail.com" },
            { name: "Support", email: "vedasawant2005@gmail.com" }
        ],
        lat: userLocation ? userLocation.lat : "21.1458",
        lng: userLocation ? userLocation.lng : "79.0882"
    };

    // 4. Fetch to Hosted Render Backend
    try {
        const response = await fetch('https://silent-shield-ghtx.onrender.com/api/sos', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            textContainer.children[1].innerText = "Emails Dispatched";
        } else {
            textContainer.children[1].innerText = "Server Error";
        }
    } catch (error) {
        console.error("SOS Failed:", error);
        textContainer.children[1].innerText = "Network Error";
    }
}

// --- Utilities (Share, Map Report, Safepoints) ---
function shareLocation() {
    if (!userLocation) return alert("Waiting for GPS...");
    const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    if (navigator.share) {
        navigator.share({ title: 'My Live Location', url: url });
    } else {
        navigator.clipboard.writeText(url);
        alert("Link copied!");
    }
}

async function findSafepoints() {
    if (!userLocation) return alert("Waiting for live GPS fix...");
    document.getElementById('safe-loader').classList.remove('hidden');

    // Expanded query to include clinics and pharmacies
    const query = `
        [out:json][timeout:25];
        (
          node["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng});
          way["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng});
        );
        out center;
    `;
    
    try {
        // Using the Kumi mirror (more reliable)
        const response = await fetch(`https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("API Limit");
        
        const data = await response.json();
        let count = 0;

        // Clean old safepoints if necessary (optional)
        // map.eachLayer(layer => { if(layer.options.className === 'safepoint-marker') map.removeLayer(layer); });

        data.elements.forEach(el => {
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            
            if (lat && lon) {
                const safeIcon = L.divIcon({ 
                    className: 'safepoint-marker', 
                    html: '<i class="fa-solid fa-shield-halved"></i>', 
                    iconSize: [30, 30] 
                });

                L.marker([lat, lon], { icon: safeIcon })
                 .addTo(map)
                 .bindPopup(`<b class="text-gray-800">${el.tags.name || el.tags.amenity.toUpperCase()}</b>`);
                count++;
            }
        });

        if (count > 0) {
            map.setZoom(13);
        } else {
            alert("No registered safepoints found within 5km.");
        }

    } catch (e) { 
        console.error(e);
        alert("Safepoints API is currently busy. Please try again."); 
    } finally { 
        document.getElementById('safe-loader').classList.add('hidden'); 
    }
}

function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('report-sheet').classList.add('sheet-open'), 10);
}

function closeReportModal() {
    document.getElementById('report-sheet').classList.remove('sheet-open');
    setTimeout(() => document.getElementById('report-modal').classList.add('hidden'), 300);
}

function submitDanger(type) {
    const center = map.getCenter();
    dangerZones.push({ lat: center.lat, lng: center.lng, type, timestamp: Date.now() });
    localStorage.setItem('ss_danger_zones_v2', JSON.stringify(dangerZones));
    plotDangerZones();
    closeReportModal();
}

function plotDangerZones() {
    dangerZones.forEach(zone => {
        const icon = L.divIcon({ className: 'danger-marker', html: '<i class="fa-solid fa-skull"></i>', iconSize: [34, 34] });
        L.marker([zone.lat, zone.lng], { icon }).addTo(map).bindPopup(zone.type);
    });
}

function setupSOSDoubleTap() {
    const btn = document.getElementById('sos-btn');
    let lastTap = 0;

    // This handles mobile touches specifically
    btn.addEventListener('touchend', function(e) {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        // If two taps happen within 300ms, it's a double tap
        if (tapLength < 300 && tapLength > 0) {
            triggerSOS();
            e.preventDefault(); // Prevents the browser from doing anything else
        }
        lastTap = currentTime;
    });

    // Fallback for desktop testing
    btn.addEventListener('dblclick', triggerSOS);
}