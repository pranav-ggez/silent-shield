// --- Global State ---
let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let isDarkMode = true;
let darkLayer, lightLayer;

const alarmAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3'); 
alarmAudio.loop = true;
let dangerZones = JSON.parse(localStorage.getItem('ss_danger_zones_v2')) || [];

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupSOSDoubleTap();
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        toggleTheme();
    }
});

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 15);
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    lightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    (document.documentElement.classList.contains('dark') ? darkLayer : lightLayer).addTo(map);
    plotDangerZones();

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                userLocation = { lat: latitude, lng: longitude };
                if (!userMarker) {
                    userMarker = L.marker([latitude, longitude], { 
                        icon: L.divIcon({ className: 'custom-user-marker', iconSize: [20, 20] }) 
                    }).addTo(map);
                    map.setView([latitude, longitude], 16);
                } else {
                    userMarker.setLatLng([latitude, longitude]);
                }
            },
            (err) => console.warn(err),
            { enableHighAccuracy: true }
        );
    }
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    const html = document.documentElement;
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

function toggleAlarm() {
    const btn = document.getElementById('alarm-btn').firstElementChild;
    if (alarmAudio.paused) {
        alarmAudio.play();
        btn.classList.add('bg-rose-500', 'animate-pulse', 'text-white');
    } else {
        alarmAudio.pause();
        alarmAudio.classList.remove('bg-rose-500', 'animate-pulse', 'text-white');
    }
}

function setupSOSDoubleTap() {
    const btn = document.getElementById('sos-btn');
    let lastTap = 0;

    btn.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
            triggerSOS();
            e.preventDefault();
        }
        lastTap = currentTime;
    });
    btn.addEventListener('dblclick', triggerSOS);
}

async function triggerSOS() {
    if (isSOSActive) return;
    isSOSActive = true;

    const btn = document.getElementById('sos-btn');
    btn.classList.add('sos-active');
    const textContainer = btn.querySelector('.text-left');
    if (textContainer) {
        textContainer.children[0].innerText = "ACTIVATED";
        textContainer.children[1].innerText = "Dispatching Alerts...";
    }

    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);
    toggleAlarm();

    const payload = {
        contacts: [
            { name: "Dad", email: "blizzardhellfire@gmail.com" },
            { name: "Support", email: "vedasawant2005@gmail.com" }
        ],
        lat: userLocation ? userLocation.lat : "21.1458",
        lng: userLocation ? userLocation.lng : "79.0882"
    };

    try {
        const response = await fetch('https://silent-shield-ghtx.onrender.com/api/sos', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) textContainer.children[1].innerText = "Emails Sent!";
    } catch (error) {
        textContainer.children[1].innerText = "Network Error";
    }
}

function shareLocation() {
    if (!userLocation) return alert("No GPS fix.");
    // FIX: Added $ for template literals
    const url = `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    if (navigator.share) navigator.share({ title: 'My Location', url });
    else { navigator.clipboard.writeText(url); alert("Link copied!"); }
}

