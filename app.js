// --- Global State ---
let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let sosTimer;
let isDarkMode = true;

// Map Layers
let darkLayer, lightLayer;

// Authentic Loud Siren Audio
const alarmAudio = new Audio('https://www.soundjay.com/mechanical/sounds/smoke-detector-1.mp3'); 
alarmAudio.loop = true;

// Load persisted danger zones
let dangerZones = JSON.parse(localStorage.getItem('ss_danger_zones_v2')) || [];

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupSOSHold();
    
    // Check system preference for theme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        toggleTheme(); // Switch to light if system prefers it
    }
});

// --- Mapping & Live Tracking ---
function initMap() {
    // Default Map Config
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 15);

    // Define Tile Layers
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });

    // Set Initial Theme
    if (document.documentElement.classList.contains('dark')) {
        darkLayer.addTo(map);
    } else {
        lightLayer.addTo(map);
    }

    plotDangerZones();

    // Start Live GPS Tracking
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

// --- Features: Utility Actions ---
function toggleAlarm() {
    const btn = document.getElementById('alarm-btn').firstElementChild;
    if (alarmAudio.paused) {
        alarmAudio.play();
        btn.classList.replace('bg-amber-100', 'bg-rose-500');
        btn.classList.replace('dark:bg-amber-500/20', 'dark:bg-rose-500');
        btn.classList.replace('text-amber-600', 'text-white');
        btn.classList.replace('dark:text-amber-400', 'dark:text-white');
        btn.classList.add('animate-pulse');
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

function triggerFakeCall() { document.getElementById('fake-call').classList.remove('hidden'); }
function closeFakeCall() { document.getElementById('fake-call').classList.add('hidden'); }

function shareLocation() {
    if (!userLocation) return alert("Waiting for GPS signal...");
    const url = `https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lng}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'My Location',
            text: 'Here is my current live location:',
            url: url
        }).catch(console.error);
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(`My location: ${url}`);
        alert("Location link copied to clipboard!");
    }
}

// --- Feature: Real-time Safepoints ---
async function findSafepoints() {
    if (!userLocation) return alert("Waiting for live GPS fix...");

    document.getElementById('safe-loader').classList.remove('hidden');

    const query = `
        [out:json][timeout:25];
        (
          node["amenity"="police"](around:5000,${userLocation.lat},${userLocation.lng});
          node["amenity"="hospital"](around:5000,${userLocation.lat},${userLocation.lng});
        );
        out body;
    `;
    
    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
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

    } catch (e) { alert("Network error. Could not load safepoints."); } 
    finally { document.getElementById('safe-loader').classList.add('hidden'); }
}

// --- Feature: Report Danger (Waze-style via Map Center) ---
function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('report-sheet').classList.add('sheet-open'), 10);
}

function closeReportModal() {
    document.getElementById('report-sheet').classList.remove('sheet-open');
    setTimeout(() => document.getElementById('report-modal').classList.add('hidden'), 300);
}

function submitDanger(type) {
    // FIX: Instead of IP geolocation, use the exact center of the map where the crosshair is!
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
    // Clear old markers if we were re-rendering (simplified here)
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

// --- SOS Hold Logic ---
function setupSOSHold() {
    const btn = document.getElementById('sos-btn');
    const startTrigger = (e) => {
        e.preventDefault();
        btn.classList.add('scale-95');
        sosTimer = setTimeout(triggerSOS, 2000);
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

function triggerSOS() {
    if (isSOSActive) return;
    isSOSActive = true;
    
    const btn = document.getElementById('sos-btn');
    btn.classList.add('sos-active');
    btn.querySelector('.text-lg').innerText = "ACTIVATED";
    btn.querySelector('.text-[9px]').innerText = "Help Notified";
    
    if (alarmAudio.paused) toggleAlarm();
    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000, 500, 1000]);
}