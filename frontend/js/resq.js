// Support running pages via the backend server (recommended) or opening HTML directly via file://
// In file:// mode, the API must be absolute to reach the local backend.
const API_BASE = (location.protocol === 'file:' ? 'http://127.0.0.1:4000/api' : '/api');
const APP_STATE_KEY = 'resq-ui-state-v1';

function currentPage() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(APP_STATE_KEY)) || { isDark: false, checklist: {} };
  } catch {
    return { isDark: false, checklist: {} };
  }
}

function saveState() {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(window.__resqState));
}

window.__resqState = loadState();

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', !!window.__resqState.isDark);
  const track = document.getElementById('toggle-track');
  const label = document.getElementById('theme-label');
  if (track) track.classList.toggle('on', !!window.__resqState.isDark);
  if (label) label.textContent = window.__resqState.isDark ? 'LIGHT' : 'DARK';
}

function toggleTheme() {
  window.__resqState.isDark = !window.__resqState.isDark;
  saveState();
  applyTheme();
  toast(window.__resqState.isDark ? 'Dark mode enabled' : 'Light mode enabled');
}

// Enhanced animations and interactions
function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  
  const range = end - start;
  const minTimer = 50;
  let stepTime = Math.abs(Math.floor(duration / range));
  stepTime = Math.max(stepTime, minTimer);
  const startTime = new Date().getTime();
  const endTime = startTime + duration;
  
  function run() {
    const now = new Date().getTime();
    const remaining = Math.max((endTime - now) / duration, 0);
    const value = Math.round(end - (remaining * range));
    obj.textContent = value.toLocaleString();
    if (value !== end) {
      requestAnimationFrame(run);
    }
  }
  
  requestAnimationFrame(run);
}

// Simulate real-time data updates
function startLiveUpdates() {
  // Update people at risk counter
  setInterval(() => {
    const current = parseInt(document.getElementById('people-risk')?.textContent.replace(/,/g, '') || 45200);
    const change = Math.floor(Math.random() * 200) - 100;
    const newValue = Math.max(40000, Math.min(50000, current + change));
    animateValue('people-risk', current, newValue, 1000);
  }, 8000);
  
  // Update alerts sent counter
  setInterval(() => {
    const current = parseInt(document.getElementById('alerts-sent')?.textContent.replace(/,/g, '') || 32418);
    const increment = Math.floor(Math.random() * 500) + 100;
    const newValue = current + increment;
    animateValue('alerts-sent', current, newValue, 1500);
  }, 12000);
  
  // Update SOS reports occasionally
  setInterval(() => {
    const current = parseInt(document.getElementById('sos-count')?.textContent || 12);
    if (Math.random() > 0.7) {
      const change = Math.random() > 0.5 ? 1 : -1;
      const newValue = Math.max(5, Math.min(25, current + change));
      animateValue('sos-count', current, newValue, 800);
    }
  }, 15000);
}

// Interactive alert items
function setupAlertInteractions() {
  document.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      toast('Alert details: ' + item.querySelector('.alert-title')?.textContent);
    });
  });
}

// Enhanced navigation
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (!tab.href || tab.href === '#') {
        e.preventDefault();
        toast(`Navigation to ${tab.textContent} - Feature coming soon`);
      }
    });
  });
}

// Community Map Functions
function submitReport() {
  const type = document.getElementById('report-type')?.value;
  const location = document.getElementById('report-loc')?.value;
  const severity = document.getElementById('report-sev')?.value;
  const description = document.getElementById('report-desc')?.value;
  
  if (!location || !description) {
    toast('Please fill in location and description');
    return;
  }
  
  // Add new report to feed
  const feed = document.getElementById('community-feed');
  if (feed) {
    const newReport = document.createElement('div');
    newReport.className = 'alert-item';
    newReport.innerHTML = `
      <div class="alert-dot ${severity === 'Critical' ? 'd' : 'w'}"></div>
      <div>
        <div class="alert-title">${description} - ${location}</div>
        <div class="alert-meta">APP · PENDING · just now</div>
      </div>
    `;
    feed.insertBefore(newReport, feed.firstChild);
    
    // Remove oldest report if too many
    const items = feed.querySelectorAll('.alert-item');
    if (items.length > 5) {
      items[items.length - 1].remove();
    }
  }
  
  // Clear form
  document.getElementById('report-loc').value = '';
  document.getElementById('report-desc').value = '';
  
  toast('Report submitted successfully!');
}

// Detect location for community reports
function detectReportLocation() {
  if (!navigator.geolocation) {
    toast('Geolocation not supported by your browser');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      // Populate form fields
      const latField = document.getElementById('report-lat');
      const lngField = document.getElementById('report-lng');
      
      if (latField) latField.value = lat.toFixed(4);
      if (lngField) lngField.value = lng.toFixed(4);
      
      // Reverse geocode to get address
      reverseGeocode(lat, lng);
      
      toast(`📍 Location detected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    },
    (error) => {
      console.warn('Location detection failed:', error);
      toast('Unable to detect location. Please enable location access.');
    },
    { timeout: 8000, maximumAge: 0 }
  );
}

// Reverse geocode coordinates to address using Nominatim
function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  
  fetch(url)
    .then(response => response.json())
    .then(data => {
      const addressDiv = document.getElementById('detected-address');
      const addressText = document.getElementById('address-text');
      
      if (data.address) {
        const address = data.address;
        // Build a readable address from components
        const parts = [];
        if (address.road) parts.push(address.road);
        if (address.village) parts.push(address.village);
        if (address.town) parts.push(address.town);
        if (address.county) parts.push(address.county);
        if (address.state) parts.push(address.state);
        
        const displayAddress = parts.length > 0 ? parts.join(', ') : 'Address not found';
        
        addressText.textContent = displayAddress;
        addressText.style.color = 'inherit';
        if (addressDiv) addressDiv.style.display = 'block';
      } else if (data.display_name) {
        addressText.textContent = data.display_name;
        addressText.style.color = 'inherit';
        if (addressDiv) addressDiv.style.display = 'block';
      }
    })
    .catch(error => {
      console.warn('Reverse geocoding failed:', error);
      // Silently fail - address is optional
    });
}

// Fetch address when lat/lng fields change
function onLatLngChange() {
  const latField = document.getElementById('report-lat');
  const lngField = document.getElementById('report-lng');
  
  if (latField && lngField && latField.value && lngField.value) {
    const lat = parseFloat(latField.value);
    const lng = parseFloat(lngField.value);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      reverseGeocode(lat, lng);
    }
  }
}

// Community map zoom functions
function mapZoom(action) {
  const map = document.getElementById('community-map');
  if (!map) return;
  
  const currentScale = map.getAttribute('data-scale') || '1';
  let newScale = parseFloat(currentScale);
  
  switch(action) {
    case 'in':
      newScale = Math.min(newScale + 0.2, 3);
      break;
    case 'out':
      newScale = Math.max(newScale - 0.2, 0.5);
      break;
    case 'reset':
      newScale = 1;
      break;
  }
  
  map.style.transform = `scale(${newScale})`;
  map.setAttribute('data-scale', newScale.toString());
  toast(`Map zoom: ${Math.round(newScale * 100)}%`);
}

// Geolocation and Current Location Display
function latLngToMapCoords(lat, lng, mapSize) {
  // Map bounds for Assam region (approximate)
  const minLat = 26.0, maxLat = 27.5;
  const minLng = 91.0, maxLng = 95.5;
  
  // Normalize coordinates to 0-1 range
  const normLat = (maxLat - lat) / (maxLat - minLat); // inverted because y increases downward
  const normLng = (lng - minLng) / (maxLng - minLng);
  
  // Convert to map SVG coordinates
  const x = normLng * mapSize.width;
  const y = normLat * mapSize.height;
  
  return { x: Math.max(0, Math.min(mapSize.width, x)), y: Math.max(0, Math.min(mapSize.height, y)) };
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      { timeout: 8000, maximumAge: 0 }
    );
  });
}

function addLocationMarker(mapId, coords, mapSize) {
  const map = document.getElementById(mapId);
  if (!map) return;
  
  // Convert lat/lng to SVG coordinates
  const svgCoords = latLngToMapCoords(coords.lat, coords.lng, mapSize);
  
  // Create marker group
  const markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  markerGroup.id = 'current-location-marker';
  
  // Add marker circle
  const markerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  markerCircle.setAttribute('cx', svgCoords.x);
  markerCircle.setAttribute('cy', svgCoords.y);
  markerCircle.setAttribute('r', '12');
  markerCircle.setAttribute('fill', '#00A8FF');
  markerCircle.setAttribute('opacity', '0.8');
  
  // Add outer pulse animation
  const pulseCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  pulseCircle.setAttribute('cx', svgCoords.x);
  pulseCircle.setAttribute('cy', svgCoords.y);
  pulseCircle.setAttribute('r', '0');
  pulseCircle.setAttribute('fill', 'none');
  pulseCircle.setAttribute('stroke', '#00A8FF');
  pulseCircle.setAttribute('stroke-width', '2');
  
  // Add animation to pulse circle
  const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
  animate.setAttribute('attributeName', 'r');
  animate.setAttribute('values', '12;28;12');
  animate.setAttribute('dur', '2s');
  animate.setAttribute('repeatCount', 'indefinite');
  
  const animateOpacity = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
  animateOpacity.setAttribute('attributeName', 'opacity');
  animateOpacity.setAttribute('values', '0.8;0;0.8');
  animateOpacity.setAttribute('dur', '2s');
  animateOpacity.setAttribute('repeatCount', 'indefinite');
  
  pulseCircle.appendChild(animate);
  pulseCircle.appendChild(animateOpacity);
  
  // Add label
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', svgCoords.x);
  label.setAttribute('y', svgCoords.y - 22);
  label.setAttribute('fill', '#00A8FF');
  label.setAttribute('font-size', '11');
  label.setAttribute('font-family', 'monospace');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-weight', 'bold');
  label.textContent = 'YOU';
  
  markerGroup.appendChild(pulseCircle);
  markerGroup.appendChild(markerCircle);
  markerGroup.appendChild(label);
  
  // Remove existing marker if present
  const existing = map.querySelector('#current-location-marker');
  if (existing) existing.remove();
  
  // Add new marker to map
  map.appendChild(markerGroup);
}

function displayCurrentLocation() {
  getCurrentLocation()
    .then((coords) => {
      // Add marker to community map if it exists
      const communityMap = document.getElementById('community-map');
      if (communityMap) {
        const mapSize = { width: 800, height: 600 };
        addLocationMarker('community-map', coords, mapSize);
      }
      
      // Add marker to main map (overview) if it exists
      const mainMap = document.getElementById('main-map');
      if (mainMap) {
        const mapSize = { width: 600, height: 520 };
        addLocationMarker('main-map', coords, mapSize);
      }
      
      toast(`📍 Current location detected: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    })
    .catch((error) => {
      console.warn('Location detection failed:', error);
      // Silently fail - location is optional feature
    });
}

// Initialize Leaflet map with automatic location detection
function initializeOverviewMap() {
  const mapElement = document.getElementById('overview-map');
  if (!mapElement) return;

  // Center on Assam region, disable attribution watermark
  const map = L.map('overview-map', { attributionControl: false }).setView([26.5, 92.8], 9);

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: null,
    maxZoom: 19
  }).addTo(map);

  // Add red circle for flood zones (approximate locations)
  L.circle([26.47, 94.91], { radius: 20000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Dibrugarh');
  L.circle([26.75, 94.20], { radius: 25000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Jorhat');

  // Add yellow circle for warning zones
  L.circle([26.95, 94.55], { radius: 18000, color: '#ffaa00', fillOpacity: 0.2 }).addTo(map)
    .bindPopup('Flood watch area: Sibsagar');

  // Add green markers for shelters
  const shelters = [
    { name: 'Guwahati-5 (St. Xavier)', coords: [26.2, 91.74] },
    { name: 'Guwahati-3 (District Hall)', coords: [26.15, 91.71] },
    { name: 'Jorhat Center', coords: [26.75, 94.20] },
    { name: 'Dibrugarh Relief', coords: [26.47, 94.91] }
  ];

  shelters.forEach(shelter => {
    L.marker(shelter.coords, {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="%2300cc88" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      })
    }).addTo(map).bindPopup(`🏠 ${shelter.name}`);
  });

  // Add legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.style.background = 'white';
    div.style.padding = '12px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    div.style.fontSize = '13px';
    div.style.fontFamily = 'monospace';
    div.style.maxWidth = '200px';

    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">LEGEND</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #0088ff; border-radius: 50%;"></div>
        <span>Your Location</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #00cc88; border-radius: 50%;"></div>
        <span>Active Shelters</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #ff3b3b; border-radius: 50%; opacity: 0.5;"></div>
        <span>High-Risk Flood</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; background-color: #ffaa00; border-radius: 50%; opacity: 0.4;"></div>
        <span>Flood Watch</span>
      </div>
    `;
    return div;
  };
  legend.addTo(map);

  // Auto-detect user location and add marker
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        // Add blue marker for user location
        L.marker([userLat, userLng], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="%2300A8FF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/></svg>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map).bindPopup(`📍 Your Location<br/>Lat: ${userLat.toFixed(4)}<br/>Lng: ${userLng.toFixed(4)}`);

        // Center map on user location
        map.setView([userLat, userLng], 10);
        toast(`📍 Current location detected and displayed on map`);
      },
      (error) => {
        console.warn('Location detection failed:', error);
        toast('Location access denied - showing region view');
      },
      { timeout: 8000, maximumAge: 0 }
    );
  }
}

// Initialize Leaflet map for Community Reports page
function initializeReportsMap() {
  const mapElement = document.getElementById('report-map');
  if (!mapElement) return;

  // Center on Assam region, disable attribution watermark
  const map = L.map('report-map', { attributionControl: false }).setView([26.5, 92.8], 9);

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: null,
    maxZoom: 19
  }).addTo(map);

  // Add red circle for flood zones (approximate locations)
  L.circle([26.47, 94.91], { radius: 20000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Dibrugarh');
  L.circle([26.75, 94.20], { radius: 25000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Jorhat');

  // Add yellow circle for warning zones
  L.circle([26.95, 94.55], { radius: 18000, color: '#ffaa00', fillOpacity: 0.2 }).addTo(map)
    .bindPopup('Flood watch area: Sibsagar');

  // Add green markers for shelters
  const shelters = [
    { name: 'Guwahati-5 (St. Xavier)', coords: [26.2, 91.74] },
    { name: 'Guwahati-3 (District Hall)', coords: [26.15, 91.71] },
    { name: 'Jorhat Center', coords: [26.75, 94.20] },
    { name: 'Dibrugarh Relief', coords: [26.47, 94.91] }
  ];

  shelters.forEach(shelter => {
    L.marker(shelter.coords, {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="%2300cc88" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      })
    }).addTo(map).bindPopup(`🏠 ${shelter.name}`);
  });

  // Add legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.style.background = 'white';
    div.style.padding = '12px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    div.style.fontSize = '13px';
    div.style.fontFamily = 'monospace';
    div.style.maxWidth = '200px';

    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">LEGEND</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #0088ff; border-radius: 50%;"></div>
        <span>Your Location</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #00cc88; border-radius: 50%;"></div>
        <span>Active Shelters</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #ff3b3b; border-radius: 50%; opacity: 0.5;"></div>
        <span>High-Risk Flood</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; background-color: #ffaa00; border-radius: 50%; opacity: 0.4;"></div>
        <span>Flood Watch</span>
      </div>
    `;
    return div;
  };
  legend.addTo(map);

  // Auto-detect user location and add marker
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        // Add blue marker for user location
        L.marker([userLat, userLng], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="%2300A8FF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/></svg>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map).bindPopup(`📍 Your Location<br/>Lat: ${userLat.toFixed(4)}<br/>Lng: ${userLng.toFixed(4)}`);

        // Center map on user location
        map.setView([userLat, userLng], 10);
        toast(`📍 Current location detected and displayed on map`);
      },
      (error) => {
        console.warn('Location detection failed:', error);
        toast('Location access denied - showing region view');
      },
      { timeout: 8000, maximumAge: 0 }
    );
  }
}

// Initialize Leaflet map for Community Map page
function initializeCommunityMap() {
  const mapElement = document.getElementById('community-map');
  if (!mapElement) return;

  // Center on Assam region, disable attribution watermark
  const map = L.map('community-map', { attributionControl: false }).setView([26.5, 92.8], 9);

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: null,
    maxZoom: 19
  }).addTo(map);

  // Add red circle for flood zones (approximate locations)
  L.circle([26.47, 94.91], { radius: 20000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Dibrugarh');
  L.circle([26.75, 94.20], { radius: 25000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Jorhat');

  // Add yellow circle for warning zones
  L.circle([26.95, 94.55], { radius: 18000, color: '#ffaa00', fillOpacity: 0.2 }).addTo(map)
    .bindPopup('Flood watch area: Sibsagar');

  // Add green markers for shelters
  const shelters = [
    { name: 'Guwahati-5 (St. Xavier)', coords: [26.2, 91.74] },
    { name: 'Guwahati-3 (District Hall)', coords: [26.15, 91.71] },
    { name: 'Jorhat Center', coords: [26.75, 94.20] },
    { name: 'Dibrugarh Relief', coords: [26.47, 94.91] }
  ];

  shelters.forEach(shelter => {
    L.marker(shelter.coords, {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="%2300cc88" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      })
    }).addTo(map).bindPopup(`🏠 ${shelter.name}`);
  });

  // Add legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.style.background = 'white';
    div.style.padding = '12px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    div.style.fontSize = '13px';
    div.style.fontFamily = 'monospace';
    div.style.maxWidth = '200px';

    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">LEGEND</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #0088ff; border-radius: 50%;"></div>
        <span>Your Location</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #00cc88; border-radius: 50%;"></div>
        <span>Active Shelters</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #ff3b3b; border-radius: 50%; opacity: 0.5;"></div>
        <span>High-Risk Flood</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; background-color: #ffaa00; border-radius: 50%; opacity: 0.4;"></div>
        <span>Flood Watch</span>
      </div>
    `;
    return div;
  };
  legend.addTo(map);

  // Auto-detect user location and add marker
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        // Add blue marker for user location
        L.marker([userLat, userLng], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="%2300A8FF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/></svg>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map).bindPopup(`📍 Your Location<br/>Lat: ${userLat.toFixed(4)}<br/>Lng: ${userLng.toFixed(4)}`);

        // Center map on user location
        map.setView([userLat, userLng], 10);
        toast(`📍 Current location detected and displayed on map`);
      },
      (error) => {
        console.warn('Location detection failed:', error);
        toast('Location access denied - showing region view');
      },
      { timeout: 8000, maximumAge: 0 }
    );
  }
}

// Initialize Leaflet map for Evacuation page
function initializeEvacuationMap() {
  const mapElement = document.getElementById('evac-map');
  if (!mapElement) return;

  // Center on Assam region, disable attribution watermark
  window.__evacMap = L.map('evac-map', { attributionControl: false }).setView([26.5, 92.8], 9);
  const map = window.__evacMap;

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: null,
    maxZoom: 19
  }).addTo(map);

  // Add red circle for flood zones (approximate locations)
  L.circle([26.47, 94.91], { radius: 20000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Dibrugarh');
  L.circle([26.75, 94.20], { radius: 25000, color: '#ff3b3b', fillOpacity: 0.3 }).addTo(map)
    .bindPopup('High-risk flood zone: Jorhat');

  // Add yellow circle for warning zones
  L.circle([26.95, 94.55], { radius: 18000, color: '#ffaa00', fillOpacity: 0.2 }).addTo(map)
    .bindPopup('Flood watch area: Sibsagar');

  // Add green markers for shelters
  const shelters = [
    { name: 'Guwahati-5 (St. Xavier)', coords: [26.2, 91.74] },
    { name: 'Guwahati-3 (District Hall)', coords: [26.15, 91.71] },
    { name: 'Jorhat Center', coords: [26.75, 94.20] },
    { name: 'Dibrugarh Relief', coords: [26.47, 94.91] }
  ];

  shelters.forEach(shelter => {
    L.marker(shelter.coords, {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="%2300cc88" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      })
    }).addTo(map).bindPopup(`🏠 ${shelter.name}`);
  });

  // Add legend
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.style.background = 'white';
    div.style.padding = '12px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
    div.style.fontSize = '13px';
    div.style.fontFamily = 'monospace';
    div.style.maxWidth = '200px';

    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">LEGEND</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #0088ff; border-radius: 50%;"></div>
        <span>Your Location</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #00cc88; border-radius: 50%;"></div>
        <span>Active Shelters</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 16px; height: 16px; background-color: #ff3b3b; border-radius: 50%; opacity: 0.5;"></div>
        <span>High-Risk Flood</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; background-color: #ffaa00; border-radius: 50%; opacity: 0.4;"></div>
        <span>Flood Watch</span>
      </div>
    `;
    return div;
  };
  legend.addTo(map);

  // Auto-detect user location and add marker
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        // Add blue marker for user location
        L.marker([userLat, userLng], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="%2300A8FF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/></svg>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map).bindPopup(`📍 Your Location<br/>Lat: ${userLat.toFixed(4)}<br/>Lng: ${userLng.toFixed(4)}`);

        // Center map on user location and populate form
        map.setView([userLat, userLng], 10);
        const latField = document.getElementById('from-lat');
        const lngField = document.getElementById('from-lng');
        if (latField) latField.value = userLat.toFixed(4);
        if (lngField) lngField.value = userLng.toFixed(4);
        toast(`📍 Current location detected and displayed on map`);
      },
      (error) => {
        console.warn('Location detection failed:', error);
        toast('Location access denied - showing region view');
      },
      { timeout: 8000, maximumAge: 0 }
    );
  }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  startLiveUpdates();
  setupAlertInteractions();
  setupNavigation();
  
  // Add entrance animations
  document.querySelectorAll('.stat-card, .panel').forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    setTimeout(() => {
      card.style.transition = 'all 0.6s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, index * 100);
  });
  
  // Setup map interactions
  document.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      toast('Report details: ' + item.querySelector('.alert-title')?.textContent);
    });
  });
  
  // Setup map controls
  document.querySelectorAll('#map-controls text').forEach((control, index) => {
    const actions = ['in', 'out', 'reset'];
    control.addEventListener('click', () => {
      mapZoom(actions[index]);
    });
  });
  
  // Display current location and initialize maps
  const page = currentPage();
  if (page === 'index.html') {
    initializeOverviewMap();
  } else if (page === 'community-map.html') {
    initializeCommunityMap();
  } else if (page === 'community-reports.html') {
    initializeReportsMap();
  } else if (page === 'evacuation.html') {
    initializeEvacuationMap();
  }
});

// Additional utility functions
function setActiveNav() {
  const page = currentPage();
  document.querySelectorAll('[data-page]').forEach((el) => {
    const match = el.dataset.page === page || (page === 'index.html' && el.dataset.page === 'index.html');
    el.classList.toggle('active', match);
  });
}

function toggleMoreMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('nav-more');
  if (menu) menu.classList.toggle('open');
}

function closeMoreMenu() {
  const menu = document.getElementById('nav-more');
  if (menu) menu.classList.remove('open');
}

function wireDropdown() {
  document.addEventListener('click', (event) => {
    const menu = document.getElementById('nav-more');
    if (menu && !menu.contains(event.target)) menu.classList.remove('open');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMoreMenu();
  });
}

function fmtDate(value) {
  return new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
}

function reportHref(id) {
  return `report.html?id=${encodeURIComponent(id)}`;
}

function reportDotClass(report) {
  const type = (report.type || '').toLowerCase();
  if (type.includes('sos') || type.includes('rescue') || (report.severity || '').toLowerCase().includes('critical')) return 'd';
  if (type.includes('safe')) return 's';
  return 'w';
}

function reportHeading(report) {
  return report.reportName || `${report.type || 'Report'} — ${report.location || 'Unknown location'}`;
}

async function bootstrap() {
  try {
    return await api('/bootstrap');
  } catch {
    return null;
  }
}

// Initialize remaining functionality
setActiveNav();
wireDropdown();

async function renderOverview(data) {
  if (!data) return;
  const stats = data.stats || {};
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('people-risk', (stats.peopleAtRisk || 45200).toLocaleString());
  setText('alerts-sent', (stats.alertsSent || 32418).toLocaleString());
  setText('shelters-active', stats.sheltersActive || 7);
  setText('sos-count', stats.sosUnresolved || 12);
  setText('capacity-free', (stats.shelterCapacityFree || 2847).toLocaleString());
  const feed = document.getElementById('overview-feed');
  if (feed) {
    const reports = (data.reports || []).slice(0, 5);
    feed.innerHTML = reports.length ? reports.map((r) => `<div class="item"><div class="dot ${r.type.toLowerCase().includes('sos') ? 'd' : 'w'}"></div><div><div class="item-title">${r.type} — ${r.location}</div><div class="item-meta">${r.severity} · ${fmtDate(r.createdAt)}</div></div></div>`).join('') : '<div class="item"><div class="dot s"></div><div><div class="item-title">No new community reports</div><div class="item-meta">Ready for incoming submissions</div></div></div>';
  }
}

async function renderReportsList() {
  const feed = document.getElementById('community-feed');
  if (!feed) return;
  try {
    const reports = await api('/reports');
    feed.innerHTML = reports.slice(0, 20).map((report) => `<div class="item"><div class="dot ${reportDotClass(report)}"></div><div><div class="item-title"><a class="report-link" href="${reportHref(report.id)}">${reportHeading(report)}</a></div><div class="item-meta">${report.type || '-'} · ${report.source || 'APP'} · ${report.status || 'pending'} · ${fmtDate(report.createdAt)}</div></div></div>`).join('') || '<div class="item"><div class="dot s"></div><div><div class="item-title">No reports yet</div><div class="item-meta">Use the form below to submit a report</div></div></div>';
  } catch {
    feed.innerHTML = '<div class="item"><div class="dot s"></div><div><div class="item-title">Backend unavailable</div><div class="item-meta">Reports can still be submitted once the server is running</div></div></div>';
  }
}

async function renderOverviewCommunity(data) {
  const feed = document.getElementById('overview-community-feed');
  if (!feed) return;
  try {
    const reports = data?.reports || await api('/reports');
    const latest = reports.slice(0, 5);
    feed.innerHTML = latest.length
      ? latest.map((report) => `<div class="alert-item"><div class="alert-dot ${reportDotClass(report)}"></div><div><div class="alert-title"><a class="report-link" href="${reportHref(report.id)}">${reportHeading(report)}</a></div><div class="alert-meta">${report.type || '-'} · ${report.source || 'APP'} · ${report.status || 'pending'} · ${fmtDate(report.createdAt)}</div></div></div>`).join('')
      : '<div class="alert-item"><div class="alert-dot s"></div><div><div class="alert-title">No community reports yet</div><div class="alert-meta">New submissions will appear here</div></div></div>';
  } catch {
    feed.innerHTML = '<div class="alert-item"><div class="alert-dot s"></div><div><div class="alert-title">Backend unavailable</div><div class="alert-meta">Community reports will load when server is online</div></div></div>';
  }
}

async function renderReportDetail() {
  const container = document.getElementById('report-detail');
  if (!container) return;

  const reportId = new URLSearchParams(window.location.search).get('id');
  if (!reportId) {
    container.innerHTML = '<div class="panel-body"><div class="item-title">Missing report id</div><div class="item-meta">Open this page from a report link on Overview or Community Reports.</div></div>';
    return;
  }

  try {
    let report;
    try {
      report = await api(`/reports/${encodeURIComponent(reportId)}`);
    } catch {
      // Backward compatibility for older backend instances without /reports/:id
      const allReports = await api('/reports');
      report = (allReports || []).find((r) => r.id === reportId);
      if (!report) throw new Error('report_not_found');
    }

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('detail-heading', reportHeading(report));
    set('detail-type', report.type || '-');
    set('detail-location', report.locationDescription || report.location || '-');
    set('detail-severity', report.severity || '-');
    set('detail-status', report.status || 'pending');
    set('detail-source', report.source || 'APP');
    set('detail-date', report.createdAt ? fmtDate(report.createdAt) : '-');
    set('detail-description', report.description || '-');

    const lat = Number(report.latitude);
    const lng = Number(report.longitude);
    const coordsEl = document.getElementById('detail-coords');
    if (coordsEl) coordsEl.textContent = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Not provided';

    const pin = document.getElementById('detail-pin');
    if (pin) {
      let x = 400;
      let y = 170;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const minLat = 24.0;
        const maxLat = 28.0;
        const minLng = 89.0;
        const maxLng = 97.0;
        const clampedLat = Math.max(minLat, Math.min(maxLat, lat));
        const clampedLng = Math.max(minLng, Math.min(maxLng, lng));
        x = ((clampedLng - minLng) / (maxLng - minLng)) * 760 + 20;
        y = ((maxLat - clampedLat) / (maxLat - minLat)) * 280 + 20;
      }
      pin.setAttribute('transform', `translate(${x} ${y})`);
    }

    container.dataset.ready = 'true';
  } catch {
    container.innerHTML = '<div class="panel-body"><div class="item-title">Report not found</div><div class="item-meta">This report may have been removed.</div></div>';
  }
}

function updatePrediction() {
  const rainEl = document.getElementById('sl-rain');
  const riverEl = document.getElementById('sl-river');
  const soilEl = document.getElementById('sl-soil');
  const windEl = document.getElementById('sl-wind');

  const rainRaw = +(rainEl?.value || 0);
  const riverRaw = +(riverEl?.value || 0);
  const wind = +(windEl?.value || 0);

  const rainIsScale = rainEl && Number(rainEl.max) <= 10;
  const riverIsScale = riverEl && Number(riverEl.max) <= 10;

  const rain = rainIsScale ? Math.round((rainRaw / 10) * 200) : rainRaw;
  const river = riverIsScale ? Math.round((riverRaw / 10) * 120) : riverRaw;

  const soil = soilEl
    ? +(soilEl.value || 0)
    : Math.max(0, Math.min(100, Math.round(25 + (rainRaw / 10) * 55 + (riverRaw / 10) * 20)));

  const score = rain / 200 * 0.4 + soil / 100 * 0.3 + river / 120 * 0.25 + wind / 100 * 0.05;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('sv-rain', rainIsScale ? `${rainRaw}/10` : `${rain} mm/hr`);
  set('sv-soil', `${soil}%`);
  set('sv-river', riverIsScale ? `${riverRaw}/10` : `${river}%`);
  set('sv-wind', `${wind} km/h`);
  const needle = document.getElementById('flood-needle'); if (needle) needle.style.left = Math.min(95, score * 100) + '%';
  const status = score > 0.75 ? ['⬛ FLOOD EMERGENCY', 'danger', 'EMERGENCY (T3)'] : score > 0.5 ? ['⚠ FLOOD WARNING', 'warn', 'WARNING (T2)'] : score > 0.25 ? ['◆ FLOOD WATCH', 'warn', 'WATCH (T1)'] : ['● LOW RISK', 's', 'NORMAL'];
  set('p-status', status[0]); set('p-tier', status[2]);
  const statusEl = document.getElementById('p-status'); const tierEl = document.getElementById('p-tier');
  if (statusEl) statusEl.className = 'badge ' + (status[1] === 'danger' ? 'danger' : status[1] === 'warn' ? 'warn' : '');
  if (tierEl) tierEl.className = 'badge ' + (status[1] === 'danger' ? 'danger' : status[1] === 'warn' ? 'warn' : '');
  set('p-time', ((score > 0.7 ? 1.5 + (1 - score) * 2 : 8 - score * 6).toFixed(1)) + ' hours');
  set('p-area', '~' + Math.round(score * 400) + ' km²');
  set('p-pop', Math.round(score * 52000).toLocaleString() + ' people');
  set('p-conf', (75 + score * 20).toFixed(1) + '%');
}

function updateFire() {
  const ndvi = +document.getElementById('sl-ndvi')?.value || 0;
  const hum = +document.getElementById('sl-hum')?.value || 0;
  const needle = document.getElementById('fire-needle');
  if (needle) needle.style.left = Math.min(93, (ndvi / 100 * 0.6 + (1 - hum / 100) * 0.4) * 100) + '%';
  const ndviEl = document.getElementById('sv-ndvi'); if (ndviEl) ndviEl.textContent = (ndvi / 100).toFixed(2);
  const humEl = document.getElementById('sv-hum'); if (humEl) humEl.textContent = hum + '%';
}

async function submitReport() {
  const reportName = document.getElementById('report-name')?.value.trim() || '';
  const type = document.getElementById('report-type')?.value || '';
  const location = document.getElementById('report-loc')?.value.trim() || '';
  const severity = document.getElementById('report-sev')?.value || 'High';
  const description = document.getElementById('report-desc')?.value.trim() || '';
  const latitudeRaw = document.getElementById('report-lat')?.value?.trim() || '';
  const longitudeRaw = document.getElementById('report-lng')?.value?.trim() || '';
  const latitude = latitudeRaw === '' ? null : Number(latitudeRaw);
  const longitude = longitudeRaw === '' ? null : Number(longitudeRaw);

  if (!type || !location || !description) return toast('Enter location and description first.');
  if ((latitudeRaw !== '' && !Number.isFinite(latitude)) || (longitudeRaw !== '' && !Number.isFinite(longitude))) {
    return toast('Latitude and longitude must be valid numbers.');
  }
  try {
    await api('/reports', { method: 'POST', body: JSON.stringify({ reportName, type, location, severity, description, latitude, longitude, source: 'APP' }) });
    toast('Report submitted to the verification queue.');
    renderReportsList();
    renderOverviewCommunity();
  } catch {
    toast('Backend unavailable. Report was not saved.');
  }
  if (document.getElementById('report-name')) document.getElementById('report-name').value = '';
  if (document.getElementById('report-loc')) document.getElementById('report-loc').value = '';
  if (document.getElementById('report-desc')) document.getElementById('report-desc').value = '';
  if (document.getElementById('report-lat')) document.getElementById('report-lat').value = '';
  if (document.getElementById('report-lng')) document.getElementById('report-lng').value = '';
}

function mapZoom(direction) {
  const svg = document.querySelector('.map-box svg');
  if (!svg) return;
  const current = Number(svg.dataset.scale || 1);
  const next = direction === 'in' ? Math.min(1.7, current + 0.15) : direction === 'out' ? Math.max(1, current - 0.15) : 1;
  svg.dataset.scale = String(next);
  svg.style.transformOrigin = 'center center';
  svg.style.transform = `scale(${next})`;
}

async function addResource() {
  const name = document.getElementById('res-name')?.value.trim() || '';
  const category = document.getElementById('res-category')?.value || 'Food';
  const stock = +(document.getElementById('res-stock')?.value || 0);
  const unit = document.getElementById('res-unit')?.value.trim() || 'units';
  const location = document.getElementById('res-location')?.value.trim() || '';
  if (!name || !location || stock <= 0) return toast('Fill out all resource fields.');
  try {
    await api('/resources', { method: 'POST', body: JSON.stringify({ name, category, stock, unit, location }) });
    toast('Resource added.');
    renderResources();
  } catch {
    toast('Backend unavailable. Resource not saved.');
  }
}

async function removeResource(id) {
  try { await api('/resources/' + id, { method: 'DELETE' }); toast('Resource removed.'); renderResources(); } catch { toast('Delete failed.'); }
}

async function renderResources() {
  const body = document.getElementById('resource-table');
  if (!body) return;
  try {
    const resources = await api('/resources');
    body.innerHTML = resources.map((r) => `<tr><td>${r.name}</td><td><span class="badge">${r.category}</span></td><td><span class="badge ${r.stock < 100 ? 'danger' : r.stock < 300 ? 'warn' : ''}">${r.stock} ${r.unit}</span></td><td>${r.location}</td><td><button class="btn secondary" onclick="removeResource('${r.id}')">Remove</button></td></tr>`).join('');
    const badge = document.getElementById('resource-count-badge'); if (badge) badge.textContent = resources.length + ' ITEMS';
  } catch {
    body.innerHTML = '<tr><td colspan="5">Backend unavailable</td></tr>';
  }
}

async function addVolunteer() {
  const name = document.getElementById('vol-name')?.value.trim() || '';
  const phone = document.getElementById('vol-phone')?.value.trim() || '';
  const skill = document.getElementById('vol-skill')?.value || 'General';
  const shift = document.getElementById('vol-shift')?.value || 'Any Shift';
  const location = document.getElementById('vol-location')?.value.trim() || '';
  if (!name || !phone || !location) return toast('Fill out all volunteer fields.');
  try {
    await api('/volunteers', { method: 'POST', body: JSON.stringify({ name, phone, skill, shift, location }) });
    toast('Volunteer added.');
    renderVolunteers();
  } catch {
    toast('Backend unavailable. Volunteer not saved.');
  }
}

async function removeVolunteer(id) {
  try { await api('/volunteers/' + id, { method: 'DELETE' }); toast('Volunteer removed.'); renderVolunteers(); } catch { toast('Delete failed.'); }
}

async function renderVolunteers() {
  const body = document.getElementById('volunteer-table');
  if (!body) return;
  try {
    const volunteers = await api('/volunteers');
    body.innerHTML = volunteers.map((v) => `<tr><td>${v.name}<div class="page-note">${v.phone}</div></td><td><span class="badge">${v.skill}</span></td><td><span class="badge warn">${v.shift}</span></td><td>${v.location}</td><td><button class="btn secondary" onclick="removeVolunteer('${v.id}')">Remove</button></td></tr>`).join('');
    const badge = document.getElementById('volunteer-count-badge'); if (badge) badge.textContent = volunteers.length + ' ACTIVE';
  } catch {
    body.innerHTML = '<tr><td colspan="5">Backend unavailable</td></tr>';
  }
}

async function toggleChecklist(box) {
  if (!box || !box.dataset.check) return;
  window.__resqState.checklist[box.dataset.check] = box.checked;
  saveState();
  await api('/checklist', { method: 'PUT', body: JSON.stringify(window.__resqState.checklist) }).catch(() => {});
}

async function dispatchAlert() {
  const title = document.getElementById('alert-title')?.value.trim() || '';
  const message = document.getElementById('alert-message')?.value.trim() || '';
  const severity = document.getElementById('alert-severity')?.value || 'WARNING';
  const population = +(document.getElementById('alert-pop')?.value || 1000);
  const channels = Array.from(document.querySelectorAll('[data-channel]:checked')).map((el) => el.dataset.channel);
  if (!title || !message) return toast('Enter an alert title and message.');
  try {
    await api('/alerts/dispatch', { method: 'POST', body: JSON.stringify({ title, message, severity, channels, targetPopulation: population }) });
    toast('Alert dispatched successfully.');
    renderLogs();
  } catch {
    toast('Dispatch failed.');
  }
}

async function renderLogs() {
  const body = document.getElementById('log-feed');
  if (!body) return;
  try {
    const logs = await api('/logs?limit=12');
    body.innerHTML = logs.map((log) => `<div class="item"><div class="dot ${log.level === 'WARN' ? 'w' : log.level === 'ALERT' ? 'd' : 's'}"></div><div><div class="item-title">[${log.level}] ${log.message}</div><div class="item-meta">${fmtDate(log.createdAt)}</div></div></div>`).join('');
  } catch {
    body.innerHTML = '<div class="item"><div class="dot s"></div><div><div class="item-title">No logs available</div><div class="item-meta">Start the backend to stream live events</div></div></div>';
  }
}

function hydrateChecklist() {
  document.querySelectorAll('[data-check]').forEach((el) => {
    el.checked = !!window.__resqState.checklist[el.dataset.check];
  });
}

async function init() {
  applyTheme();
  setActiveNav();
  wireDropdown();
  hydrateChecklist();
  const data = await bootstrap();
  if (document.getElementById('people-risk')) renderOverview(data);
  if (document.getElementById('overview-community-feed')) renderOverviewCommunity(data);
  if (document.getElementById('community-feed')) renderReportsList();
  if (document.getElementById('report-detail')) renderReportDetail();
  if (document.getElementById('resource-table')) renderResources();
  if (document.getElementById('volunteer-table')) renderVolunteers();
  if (document.getElementById('log-feed')) renderLogs();
  updatePrediction();
  updateFire();
}

document.addEventListener('DOMContentLoaded', init);

window.toggleTheme = toggleTheme;
window.toggleMoreMenu = toggleMoreMenu;
window.toast = toast;
window.updatePrediction = updatePrediction;
window.updateFire = updateFire;
window.submitReport = submitReport;
window.mapZoom = mapZoom;
window.addResource = addResource;
window.removeResource = removeResource;
window.addVolunteer = addVolunteer;
window.removeVolunteer = removeVolunteer;
window.toggleChecklist = toggleChecklist;
window.dispatchAlert = dispatchAlert;
