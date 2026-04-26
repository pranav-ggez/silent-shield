let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let isDarkMode = true;
let isSafeMapActive = false; 

let darkLayer, lightLayer;

// Voice Recording Variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let lastRecordedBlob = null; 

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
    map = L.map('map', { 
        zoomControl: false,
        attributionControl: false 
    }).setView([20.5937, 78.9629], 16);

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
                    const userIcon = L.divIcon({ 
                        className: 'custom-user-glow', 
                        html: `
                            <div class="relative flex items-center justify-center">
                                <div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div>
                                <div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div>
                            </div>
                        `,
                        iconSize: [16, 16] 
                    });
                    userMarker = L.marker(coords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
                    map.setView(coords, 16);

                    //BAD CODE but let it stay - autoLoadSafeZones(latitude, longitude);
                } else {
                    userMarker.setLatLng(coords);
                }
            },
            (err) => console.warn(`GPS Error: ${err.message}`),
            { enableHighAccuracy: true }
        );
    }
}

async function autoLoadSafeZones(lat, lng) {
    const query = `[out:json];(node["amenity"~"police|hospital|pharmacy"](around:2500,${lat},${lng}););out body;`;
    try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        data.elements.forEach(el => {
            const pos = [el.lat, el.lon];

            L.circle(pos, {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.1, 
                radius: 100,     
                weight: 0.5,      
                interactive: false 
            }).addTo(map);

            const icon = L.divIcon({
                className: 'custom-safe-icon', 
                html: `<div class="flex items-center justify-center w-full h-full text-emerald-600 drop-shadow-md">
                            <i class="fa-solid fa-shield-heart text-xl"></i>
                       </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15] 
            });

            L.marker(pos, { 
                icon: icon,
                zIndexOffset: 500 
            }).addTo(map).bindPopup(el.tags.name || "Safe Point");
        });
    } catch (e) { 
        console.log("Map decoration failed"); 
    }
}

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

function toggleAlarm() {
    const btn = document.getElementById('alarm-btn').firstElementChild;
    if (alarmAudio.paused) {
        alarmAudio.play().then(() => {
            btn.classList.replace('bg-amber-100', 'bg-rose-500');
            btn.classList.replace('dark:bg-amber-500/20', 'dark:bg-rose-500');
            btn.classList.replace('text-amber-600', 'text-white');
            btn.classList.replace('dark:text-amber-400', 'dark:text-white');
            btn.classList.add('animate-pulse');
        }).catch(err => console.log("Audio play blocked"));
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

async function findSafepoints() {
    if (!userLocation) return alert("Waiting for live GPS fix...");
    
    const btn = document.getElementById('safemap-btn').firstElementChild;

    if (!isSafeMapActive) {
        isSafeMapActive = true;
        btn.classList.replace('bg-emerald-100', 'bg-emerald-500');
        btn.classList.replace('dark:bg-emerald-500/20', 'dark:bg-emerald-500');
        btn.classList.replace('text-emerald-600', 'text-white');
        btn.classList.replace('dark:text-emerald-400', 'dark:text-white');
        btn.classList.add('animate-pulse');

        const query = `[out:json][timeout:25];(node["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng});way["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng}););out center;`;
        
        try {
            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            data.elements.forEach(el => {
                const lat = el.lat || (el.center && el.center.lat);
                const lon = el.lon || (el.center && el.center.lon);
                if (lat && lon) {
                    const safeIcon = L.divIcon({ 
                        className: 'safepoint-marker', 
                        html: '<i class="fa-solid fa-shield-halved text-emerald-500 shadow-sm"></i>', 
                        iconSize: [30, 30] 
                    });
                    L.marker([lat, lon], { icon: safeIcon }).addTo(map).bindPopup(`<b>${el.tags.name || el.tags.amenity.toUpperCase()}</b>`);
                }
            });
            map.setZoom(13);
        } catch (e) { 
            console.error(e);
        }
    } else {
        isSafeMapActive = false;
        btn.classList.replace('bg-emerald-500', 'bg-emerald-100');
        btn.classList.replace('dark:bg-emerald-500', 'dark:bg-emerald-500/20');
        btn.classList.replace('text-white', 'text-emerald-600');
        btn.classList.replace('dark:text-white', 'dark:text-emerald-400');
        btn.classList.remove('animate-pulse');
    }
}

async function toggleRecording() {
    const btnIcon = document.getElementById('record-icon');
    const btnText = document.getElementById('record-text');
    const btnBox = document.getElementById('record-box');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Audio recording not supported");
        return;
    }

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };

            mediaRecorder.onstop = () => {
                lastRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                btnText.innerText = "SAVED";
                setTimeout(() => btnText.innerText = "RECORD", 2000);
            };

            mediaRecorder.start();
            isRecording = true;
            btnIcon.classList.replace('fa-microphone', 'fa-stop');
            btnBox.classList.replace('bg-purple-100', 'bg-rose-500');
            btnBox.classList.add('text-white', 'animate-pulse');
            btnText.innerText = "STOP";
        } catch (err) { alert("Mic access denied"); }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btnIcon.classList.replace('fa-stop', 'fa-microphone');
        btnBox.classList.replace('bg-rose-500', 'bg-purple-100');
        btnBox.classList.remove('text-white', 'animate-pulse');
        btnText.innerText = "RECORD";
    }
}

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

function setupSOSDoubleTap() {
    const btn = document.getElementById('sos-btn');
    let lastTap = 0;
    btn.addEventListener('touchend', (e) => {
        let currentTime = new Date().getTime();
        if (currentTime - lastTap < 500 && currentTime - lastTap > 0) {
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
        textContainer.children[1].innerText = "Alerting Server...";
    }

    toggleAlarm();
    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);

    const formData = new FormData();
    formData.append('lat', userLocation ? userLocation.lat : "21.1458");
    formData.append('lng', userLocation ? userLocation.lng : "79.0882");
    formData.append('contacts', JSON.stringify([
        { name: "Dad", email: "blizzardhellfire@gmail.com" },
        { name: "Support", email: "vedasawant2005@gmail.com" }
    ]));
    if (lastRecordedBlob) { formData.append('evidence', lastRecordedBlob, 'evidence.webm'); }

    try {
        const response = await fetch('http://localhost:3000/api/sos', { method: 'POST', body: formData });
        const data = await response.json();
        if (textContainer) {
            textContainer.children[1].innerText = data.success ? "Emails Dispatched" : "Server Error";
        }
    } catch (error) {
        if (textContainer) textContainer.children[1].innerText = "Network Error";
    } finally {
        // ✅ Reset after 4 seconds regardless of success/failure
        setTimeout(() => {
            isSOSActive = false;
            btn.classList.remove('sos-active');
            if (textContainer) {
                textContainer.children[0].innerText = "SOS";
                textContainer.children[1].innerText = "Tap Twice!";
            }
        }, 4000);
    }
}

function hideActivatedBadge() {
    const activatedBadge = document.getElementById('activatedBadge'); // Make sure this matches your HTML ID
    
    if (!activatedBadge) return;

    // Optional: Fade out smoothly before hiding (if using CSS class)
    activatedBadge.classList.add('opacity-0', 'transition-opacity', 'duration-1000');

    // Wait 5 seconds (5000ms) then remove from display
    setTimeout(() => {
        activatedBadge.style.display = 'none'; 
        
        // Reset styles for next activation (optional)
        setTimeout(() => {
            activatedBadge.classList.remove('opacity-0');
            activatedBadge.style.opacity = ''; // Clear inline style
        }, 1000); // Wait for transition to finish
        
    }, 5000); 
}


function shareLocation() {
    if (!userLocation) return alert("Waiting for GPS...");
    const url = `http://googleusercontent.com/maps.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    if (navigator.share) { navigator.share({ title: 'My Live Location', url: url }); }
    else { navigator.clipboard.writeText(url); alert("Link copied!"); }
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

function toggleContact() {
    const modal = document.getElementById('contact-modal');
    modal.classList.toggle('hidden');
}

function toggleHelplines() {
    const modal = document.getElementById('helpline-modal');
    const sheet = document.getElementById('helpline-sheet');

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        void sheet.offsetWidth; 
        sheet.classList.add('sheet-open');
    } else {
        sheet.classList.remove('sheet-open');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300); 
    }
}