// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:3000';

// ─── ROTATING QUOTES DATA ─────────────────────────────────────────────────────
const safetyQuotes = [
    "Your safety is non-negotiable.",
    "Walk with purpose, and be aware of your surroundings.",
    "Trust your intuition. It's often right.",
    "Awareness is your first line of defense.",
    "Empower yourself to be safe.",
    "Your life is your most precious possession. Protect it.",
    "Safety is not an option, it's a necessity.",
    "Be the master of your own environment.",
    "Knowledge is your armor.",
    "Walk tall, speak confidently, and be prepared.",
    "Prevention is the best cure for danger.",
    "Strength isn't just physical; it's being prepared.",
    "A woman's place is wherever she feels safe.",
    "Self-protection is not selfishness; it's a duty.",
    "Empowerment begins with safety.",
    "No one can protect you better than you can.",
    "A woman's safety is not a request; it's a right.",
    "Safety is not an afterthought.",
    "The first step to safety is self-care.",
    "Walk with confidence, for your safety is your priority."
];

// ─── AUTH HELPER ──────────────────────────────────────────────────────────────
function authFetch(url, options = {}) {
    const token = sessionStorage.getItem('ss_token');
    return fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        }
    });
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let map, userMarker;
let userLocation = null;
let isSOSActive = false;
let isDarkMode = true;
let isSafeMapActive = false;
let safeMarkers = [];
let currentUser = null;
let emergencyContacts = [];

let darkLayer, lightLayer;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let lastRecordedBlob = null;

let callTimer = null;

const alarmAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3');
alarmAudio.loop = true;

let dangerZones = JSON.parse(localStorage.getItem('ss_danger_zones_v2')) || [];

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initQuoteRotation(); // Start the quotes immediately on auth screen
    
    const saved = sessionStorage.getItem('ss_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        bootApp();
    }
});

// ─── ROTATING QUOTES LOGIC ────────────────────────────────────────────────────
function initQuoteRotation() {
    const quoteEl = document.getElementById('safety-quote');
    if (!quoteEl) return;
    
    let currentQuoteIdx = 0;
    
    setInterval(() => {
        // Fade out
        quoteEl.style.opacity = 0;
        
        setTimeout(() => {
            // Change text
            currentQuoteIdx = (currentQuoteIdx + 1) % safetyQuotes.length;
            quoteEl.innerText = `"${safetyQuotes[currentQuoteIdx]}"`;
            
            // Fade in
            quoteEl.style.opacity = 1;
        }, 1000); // Matches the Tailwind duration-1000 class (1 second)
    }, 6000); // Trigger a change every 6 seconds
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('form-login').classList.toggle('hidden', !isLogin);
    document.getElementById('form-register').classList.toggle('hidden', isLogin);
    document.getElementById('tab-login').className = isLogin
        ? 'auth-tab-active text-sm font-bold transition-all flex-1 text-center'
        : 'auth-tab-inactive text-sm font-bold transition-all flex-1 text-center';
    document.getElementById('tab-register').className = !isLogin
        ? 'auth-tab-active text-sm font-bold transition-all flex-1 text-center'
        : 'auth-tab-inactive text-sm font-bold transition-all flex-1 text-center';
    clearAuthError();
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearAuthError() {
    document.getElementById('auth-error').classList.add('hidden');
}

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return showAuthError('Please fill in all fields.');
    try {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) return showAuthError(data.error || 'Login failed.');
        currentUser = data.user;
        sessionStorage.setItem('ss_user', JSON.stringify(currentUser));
        sessionStorage.setItem('ss_token', data.token);
        bootApp();
    } catch {
        showAuthError('Cannot reach server. Is it running?');
    }
}

async function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const age = document.getElementById('reg-age').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!name || !age || !email || !phone || !password) return showAuthError('All fields are required.');
    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age, email, phone, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) return showAuthError(data.error || 'Registration failed.');
        currentUser = data.user;
        sessionStorage.setItem('ss_user', JSON.stringify(currentUser));
        sessionStorage.setItem('ss_token', data.token);
        bootApp();
    } catch {
        showAuthError('Cannot reach server. Is it running?');
    }
}

function bootApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('settings-name').textContent = currentUser.name;
    document.getElementById('settings-email').textContent = currentUser.email;
    initMap();
    setupSOSDoubleTap();
    loadContacts();
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        toggleTheme();
    }
}

function handleLogout() {
    sessionStorage.removeItem('ss_user');
    sessionStorage.removeItem('ss_token');
    currentUser = null;
    location.reload();
}

async function handleDeactivate() {
    if (!confirm('This will permanently delete your account. Are you sure?')) return;
    try {
        await authFetch('/api/deactivate', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email })
        });
    } catch {}
    handleLogout();
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    const sheet = document.getElementById('settings-sheet');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        void sheet.offsetWidth;
        sheet.classList.add('sheet-open');
    } else {
        sheet.classList.remove('sheet-open');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// ─── EMERGENCY CONTACTS ───────────────────────────────────────────────────────
async function loadContacts() {
    try {
        const res = await authFetch('/api/contacts');
        const data = await res.json();
        if (data.success) emergencyContacts = data.contacts;
    } catch {}
}

function toggleContacts() {
    const modal = document.getElementById('contacts-modal');
    const sheet = document.getElementById('contacts-sheet');
    if (modal.classList.contains('hidden')) {
        renderContactsList();
        modal.classList.remove('hidden');
        void sheet.offsetWidth;
        sheet.classList.add('sheet-open');
    } else {
        sheet.classList.remove('sheet-open');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function renderContactsList() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    if (emergencyContacts.length === 0) {
        list.innerHTML = `<p class="text-center text-sm text-gray-400 dark:text-slate-500 py-4">No contacts yet. Add one below.</p>`;
        return;
    }
    emergencyContacts.forEach((c, i) => {
        list.innerHTML += `
            <div class="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 p-3 rounded-2xl border dark:border-slate-700">
                <div class="w-9 h-9 bg-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-user text-rose-500 text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <input value="${c.name || ''}" placeholder="Name"
                        class="w-full bg-transparent text-sm font-bold dark:text-white outline-none border-b border-transparent focus:border-rose-400 pb-0.5 transition"
                        onchange="emergencyContacts[${i}].name = this.value">
                    <input value="${c.email || ''}" placeholder="Email address"
                        class="w-full bg-transparent text-[11px] text-gray-400 outline-none border-b border-transparent focus:border-rose-400 pb-0.5 transition mt-0.5"
                        onchange="emergencyContacts[${i}].email = this.value">
                </div>
                <button onclick="deleteContact(${i})" class="w-8 h-8 bg-rose-100 dark:bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center flex-shrink-0 active:scale-90 transition">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>`;
    });
}

function addContactRow() {
    emergencyContacts.push({ name: '', email: '', id: Date.now().toString() });
    renderContactsList();
    const inputs = document.querySelectorAll('#contacts-list input');
    if (inputs.length) inputs[inputs.length - 2].focus();
}

function deleteContact(index) {
    emergencyContacts.splice(index, 1);
    renderContactsList();
}

async function saveContacts() {
    try {
        const res = await authFetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: emergencyContacts })
        });
        const data = await res.json();
        if (data.success) toggleContacts();
    } catch {
        alert('Failed to save. Check server.');
    }
}

// ─── MAP ──────────────────────────────────────────────────────────────────────
function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([20.5937, 78.9629], 16);

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
                        html: `<div class="relative flex items-center justify-center">
                                   <div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div>
                                   <div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div>
                               </div>`,
                        iconSize: [16, 16]
                    });
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

// ─── SAFE MAP ─────────────────────────────────────────────────────────────────
async function findSafepoints() {
    if (!userLocation) return alert('Waiting for live GPS fix...');

    const btn = document.getElementById('safemap-btn').firstElementChild;
    const safeBar = document.getElementById('safe-bar');
    const safeBarText = document.getElementById('safe-bar-text');

    if (!isSafeMapActive) {
        isSafeMapActive = true;
        btn.classList.replace('bg-emerald-100', 'bg-emerald-500');
        btn.classList.replace('dark:bg-emerald-500/20', 'dark:bg-emerald-500');
        btn.classList.replace('text-emerald-600', 'text-white');
        btn.classList.replace('dark:text-emerald-400', 'dark:text-white');
        btn.classList.add('animate-pulse');

        safeBar.classList.remove('hidden');
        safeBarText.textContent = 'Finding safe places...';

        const query = `[out:json][timeout:25];(node["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng});way["amenity"~"police|hospital|clinic|pharmacy"](around:5000,${userLocation.lat},${userLocation.lng}););out center;`;

        try {
            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await response.json();
            let count = 0;

            data.elements.forEach(el => {
                const lat = el.lat || (el.center && el.center.lat);
                const lon = el.lon || (el.center && el.center.lon);
                if (lat && lon) {
                    const safeIcon = L.divIcon({
                        className: 'safepoint-marker',
                        html: '<i class="fa-solid fa-shield-halved text-emerald-500 shadow-sm"></i>',
                        iconSize: [30, 30]
                    });
                    const marker = L.marker([lat, lon], { icon: safeIcon })
                        .addTo(map)
                        .bindPopup(`<b>${el.tags.name || el.tags.amenity.toUpperCase()}</b>`);
                    safeMarkers.push(marker);
                    count++;
                }
            });

            safeBarText.textContent = `${count} safe place${count !== 1 ? 's' : ''} found nearby`;
            btn.classList.remove('animate-pulse');
            map.setZoom(13);
        } catch (e) {
            safeBarText.textContent = 'Could not load safe places.';
            console.error(e);
        }
    } else {
        isSafeMapActive = false;
        safeMarkers.forEach(m => map.removeLayer(m));
        safeMarkers = [];
        safeBar.classList.add('hidden');
        btn.classList.replace('bg-emerald-500', 'bg-emerald-100');
        btn.classList.replace('dark:bg-emerald-500', 'dark:bg-emerald-500/20');
        btn.classList.replace('text-white', 'text-emerald-600');
        btn.classList.replace('dark:text-white', 'dark:text-emerald-400');
        btn.classList.remove('animate-pulse');
    }
}

// ─── ALARM ────────────────────────────────────────────────────────────────────
function toggleAlarm() {
    const btn = document.getElementById('alarm-btn').firstElementChild;
    if (alarmAudio.paused) {
        alarmAudio.play().then(() => {
            btn.classList.replace('bg-amber-100', 'bg-rose-500');
            btn.classList.replace('text-amber-600', 'text-white');
            btn.classList.add('animate-pulse');
        }).catch(() => {});
    } else {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        btn.classList.replace('bg-rose-500', 'bg-amber-100');
        btn.classList.replace('text-white', 'text-amber-600');
        btn.classList.remove('animate-pulse');
    }
}

// ─── RECORDING ────────────────────────────────────────────────────────────────
async function toggleRecording() {
    const btnIcon = document.getElementById('record-icon');
    const btnText = document.getElementById('record-text');
    const btnBox = document.getElementById('record-box');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Audio recording not supported on this device.'); return;
    }

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                lastRecordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());
                if (!isSOSActive) {
                    btnText.innerText = 'SAVED';
                    setTimeout(() => btnText.innerText = 'RECORD', 2000);
                }
            };
            mediaRecorder.start();
            isRecording = true;
            btnIcon.classList.replace('fa-microphone', 'fa-stop');
            btnBox.classList.replace('bg-purple-100', 'bg-rose-500');
            btnBox.classList.add('text-white', 'animate-pulse');
            btnText.innerText = 'STOP';
        } catch { alert('Microphone access denied.'); }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btnIcon.classList.replace('fa-stop', 'fa-microphone');
        btnBox.classList.replace('bg-rose-500', 'bg-purple-100');
        btnBox.classList.remove('text-white', 'animate-pulse');
        btnText.innerText = 'RECORD';
    }
}

// ─── FAKE CALL ────────────────────────────────────────────────────────────────
function triggerFakeCall() {
    document.getElementById('fake-call').classList.remove('hidden');
    const status = document.getElementById('caller-status');
    status.innerText = 'Mobile';
    status.classList.add('text-emerald-500', 'animate-pulse');
}

function startFakeConversation() {
    const status = document.getElementById('caller-status');
    status.classList.replace('text-emerald-500', 'text-white');
    status.classList.remove('animate-pulse');

    if (callTimer) clearInterval(callTimer);

    let callSeconds = 0;
    callTimer = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        status.innerText = `${mins}:${secs}`;
    }, 1000);
}

function closeFakeCall() {
    if (callTimer) { clearInterval(callTimer); callTimer = null; }
    document.getElementById('fake-call').classList.add('hidden');
}

// ─── SOS ──────────────────────────────────────────────────────────────────────
function setupSOSDoubleTap() {
    const btn = document.getElementById('sos-btn');
    let lastTap = 0;
    btn.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 500 && now - lastTap > 0) { triggerSOS(); e.preventDefault(); }
        lastTap = now;
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
        textContainer.children[0].innerText = 'ACTIVATED';
        textContainer.children[1].innerText = 'Alerting contacts...';
    }

    toggleAlarm();
    if (navigator.vibrate) navigator.vibrate([1000, 500, 1000]);

    if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        await new Promise(resolve => {
            mediaRecorder.addEventListener('stop', () => {
                setTimeout(resolve, 50); 
            }, { once: true });
            
            mediaRecorder.stop();
            isRecording = false;
            
            const btnIcon = document.getElementById('record-icon');
            const btnText = document.getElementById('record-text');
            const btnBox = document.getElementById('record-box');
            if (btnIcon) btnIcon.classList.replace('fa-stop', 'fa-microphone');
            if (btnBox) { btnBox.classList.replace('bg-rose-500', 'bg-purple-100'); btnBox.classList.remove('text-white', 'animate-pulse'); }
            if (btnText) btnText.innerText = 'RECORD';
        });
    }

    const contactsToAlert = emergencyContacts.filter(c => c.email && c.email.includes('@'));
    if (contactsToAlert.length === 0) {
        if (textContainer) textContainer.children[1].innerText = 'No contacts saved!';
        alert('⚠️ Add emergency contacts in Settings before using SOS.');
        isSOSActive = false;
        btn.classList.remove('sos-active');
        if (textContainer) {
            textContainer.children[0].innerText = 'SOS';
            textContainer.children[1].innerText = 'Tap Twice!';
        }
        return;
    }

    const formData = new FormData();
    formData.append('lat', userLocation ? userLocation.lat : '');
    formData.append('lng', userLocation ? userLocation.lng : '');
    formData.append('contacts', JSON.stringify(contactsToAlert));
    formData.append('userName', currentUser.name);
    formData.append('userPhone', currentUser.phone || '');
    if (lastRecordedBlob) formData.append('evidence', lastRecordedBlob, 'evidence.webm');

    try {
        const response = await fetch(`${API_BASE}/api/sos`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('ss_token')}` },
            body: formData
        });
        const data = await response.json();
        if (textContainer) textContainer.children[1].innerText = data.success ? '✓ Contacts Alerted' : 'Server Error!';
    } catch {
        if (textContainer) textContainer.children[1].innerText = 'Network Error!';
    } finally {
        setTimeout(() => {
            isSOSActive = false;
            btn.classList.remove('sos-active');
            if (textContainer) {
                textContainer.children[0].innerText = 'SOS';
                textContainer.children[1].innerText = 'Tap Twice!';
            }
        }, 4000);
    }
}

// ─── SHARE ────────────────────────────────────────────────────────────────────
function shareLocation() {
    if (!userLocation) return alert('Waiting for GPS...');
    const url = `http://googleusercontent.com/maps.google.com/maps?q=${userLocation.lat},${userLocation.lng}`;
    if (navigator.share) { navigator.share({ title: 'My Live Location', url }); }
    else { navigator.clipboard.writeText(url); alert('Location link copied!'); }
}

// ─── DANGER ZONES ─────────────────────────────────────────────────────────────
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

// ─── MODALS ───────────────────────────────────────────────────────────────────
function toggleContact() {
    document.getElementById('contact-modal').classList.toggle('hidden');
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
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}