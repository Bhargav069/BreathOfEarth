import { useState, useRef, useEffect } from 'react';
import * as mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';

// Your API keys
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYmhhcmdhdjA2OTkiLCJhIjoiY21nYzVxZmUyMG8wMjJrcXVwajBpb2UyOCJ9.M1Xe1MBGN_fWX8rzIF9gNA';
const WAQI_API_TOKEN = '16e95bdb96fe47457798ea2e47b7bfe1541ada5a';

// HELPER FUNCTION
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

// --- MAIN APP COMPONENT ---
function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [aqiData, setAqiData] = useState(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [markerCoords, setMarkerCoords] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState('none');

  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        projection: 'globe',
        center: [-90, 40],
        zoom: 1.5,
        accessToken: MAPBOX_ACCESS_TOKEN
    });

    map.current.on('load', () => {
        map.current.setFog({
            'color': 'rgb(30, 30, 70)',
            'high-color': 'rgb(0, 0, 0)',
            'horizon-blend': 0.03,
            'space-color': 'rgb(10, 10, 20)',
            'star-intensity': 0.2
        });
        
        map.current.on('click', (e) => {
            const { lng, lat } = e.lngLat;
            setMarkerCoords([lng, lat]);
            fetchAirQualityData(lat, lng);
            map.current.flyTo({ center: [lng, lat], zoom: map.current.getZoom() < 5 ? 5 : map.current.getZoom() });
        });
    });

    return () => {
        if (map.current) {
            map.current.remove();
            map.current = null;
        }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const mapInstance = map.current;
    const layerId = 'waqi-heatmap-layer';
    const sourceId = 'waqi-heatmap-source';

    if (mapInstance.getLayer(layerId)) {
        mapInstance.removeLayer(layerId);
    }
    if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
    }

    if (selectedLayer !== 'none') {
        mapInstance.addSource(sourceId, {
            'type': 'raster',
            'tiles': [`https://tiles.waqi.info/tiles/${selectedLayer}/{z}/{x}/{y}.png?token=${WAQI_API_TOKEN}`],
            'tileSize': 256
        });

        mapInstance.addLayer({
            'id': layerId,
            'type': 'raster',
            'source': sourceId,
            'paint': { 'raster-opacity': 0.7 }
        });
    }
  }, [selectedLayer]);

  // --- UPDATED: useEffect to manage the CUSTOM marker ---
  useEffect(() => {
    if (markerCoords && map.current) {
        // Create a parent container for the marker
        const el = document.createElement('div');
        el.className = 'custom-marker-container';

        // Create the pulsing dot as a child element
        const dot = document.createElement('div');
        dot.className = 'pulse-dot';
        el.appendChild(dot);
        
        if (!marker.current) {
            marker.current = new mapboxgl.Marker(el)
                .setLngLat(markerCoords)
                .addTo(map.current);
        } else {
            marker.current.setLngLat(markerCoords);
        }
    }
  }, [markerCoords]);

  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length < 3) { setSuggestions([]); return; }
    if (!map.current) return;
    const center = map.current.getCenter();
    const proximity = `${center.lng},${center.lat}`;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=place&proximity=${proximity}`;
    const response = await fetch(url);
    const data = await response.json();
    setSuggestions(data.features);
  };

  const handleSuggestionClick = (feature) => {
    const [lon, lat] = feature.center;
    setSearchQuery(feature.place_name);
    setSuggestions([]);
    setMarkerCoords([lon, lat]);
    map.current.flyTo({ center: [lon, lat], zoom: 9, essential: true });
    fetchAirQualityData(lat, lon);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    document.querySelector('.search-input').focus();
  };

  const fetchAirQualityData = async (lat, lon) => {
    const waqiUrl = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_API_TOKEN}`;
    try {
        const response = await fetch(waqiUrl);
        const data = await response.json();
        if (data.status === 'ok') {
            const station = data.data;
            const distance = getDistance(lat, lon, station.city.geo[0], station.city.geo[1]);
            setAqiData({ type: 'data', content: station, distance: distance });
        } else {
            setAqiData({ type: 'error', content: `<h3>No station found.</h3><p>${data.data}</p>` });
        }
        setIsPanelVisible(true);
    } catch (error) {
        console.error("Error fetching air quality data:", error);
        setAqiData({ type: 'error', content: '<h3>Error fetching data.</h3>' });
        setIsPanelVisible(true);
    }
  };

  return (
    <div>
      <div className="layer-switcher">
        <label htmlFor="layer-select">Data Layer</label>
        <select id="layer-select" value={selectedLayer} onChange={(e) => setSelectedLayer(e.target.value)}>
          <option value="none">None</option>
          <option value="usepa-pm25">PM2.5 Heatmap</option>
          <option value="usepa-pm10">PM10 Heatmap</option>
          <option value="usepa-o3">Ozone Heatmap</option>
          <option value="usepa-no2">NO₂ Heatmap</option>
          <option value="usepa-so2">SO₂ Heatmap</option>
          <option value="usepa-co">CO Heatmap</option>
        </select>
      </div>
      <div className="search-container">
        <div className="search-input-wrapper">
          <input type="text" className="search-input" placeholder="Search for a city..." value={searchQuery} onChange={handleSearchChange} />
          <button className={`clear-search-btn ${searchQuery.length > 0 ? 'visible' : ''}`} onClick={clearSearch}>×</button>
        </div>
        {suggestions.length > 0 && (
          <div className="suggestions-box">
            {suggestions.map((feature) => (
              <div key={feature.id} className="suggestion-item" onClick={() => handleSuggestionClick(feature)}>
                {feature.place_name}
              </div>
            ))}
          </div>
        )}
      </div>
      <AqiPanel isVisible={isPanelVisible} data={aqiData} onClose={() => setIsPanelVisible(false)} />
      <div ref={mapContainer} className="map-container" />
    </div>
  );
}

// --- AQI PANEL COMPONENT ---
const AqiPanel = ({ isVisible, data, onClose }) => {
    if (!data) return null;
    let panelContent = null;
    const MAX_DISTANCE_KM = 100;
    if (data.type === 'error') {
        panelContent = <div dangerouslySetInnerHTML={{ __html: data.content }} />;
    } else {
        const stationData = data.content;
        const distance = data.distance;
        const aqi = stationData.aqi;
        const lastUpdated = new Date(stationData.time.s).toLocaleString();
        const getAqiCategory = (aqiValue) => {
            if (aqiValue <= 50) return { title: 'Good', description: 'Air quality is considered satisfactory.' };
            if (aqiValue <= 100) return { title: 'Moderate', description: 'Some pollutants may be a moderate health concern.' };
            if (aqiValue <= 150) return { title: 'Unhealthy for Sensitive Groups', description: 'Members of sensitive groups may experience health effects.' };
            if (aqiValue <= 200) return { title: 'Unhealthy', description: 'Everyone may begin to experience health effects.' };
            if (aqiValue <= 300) return { title: 'Very Unhealthy', description: 'Health alert: everyone may experience more serious health effects.' };
            return { title: 'Hazardous', description: 'Health warnings of emergency conditions.' };
        };
        const aqiCategory = getAqiCategory(aqi);
        const pollutantNames = { pm25: "PM2.5", pm10: "PM10", o3: "Ozone", no2: "NO₂", so2: "SO₂", co: "CO" };
        const pollutantUnits = { pm25: "µg/m³", pm10: "µg/m³", o3: "ppb", no2: "ppb", so2: "ppb", co: "ppm" };
        
        panelContent = (
            <>
                <div className="panel-header">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>Air Quality Monitor</span>
                </div>
                <div className="location-info">
                    <span>{stationData.city.name}</span>
                </div>
                
                <div className="main-aqi-value">{aqi}</div>
                <div className="main-aqi-label">Air Quality Index</div>
                <div className="aqi-category"><div className="aqi-category-title">{aqiCategory.title}</div></div>
                <p className="aqi-category-description">{aqiCategory.description}</p>
                <div className="pollutant-levels">
                    <h4>Pollutant Levels</h4>
                    {Object.keys(pollutantNames).map(key => {
                        const pollutantData = stationData.iaqi[key];
                        const value = pollutantData ? pollutantData.v : '--';
                        const showWarning = distance > MAX_DISTANCE_KM && value !== '--';
                        return (
                            <div className="pollutant-item" key={key}>
                                <span className="pollutant-name">{pollutantNames[key]}</span>
                                <span className="pollutant-value">
                                    {value}
                                    {value !== '--' && ` ${pollutantUnits[key] || ''}`}
                                    {showWarning && (
                                        <span className="tooltip-container">
                                            ⚠️
                                            <span className="tooltip-text">
                                                Station is {Math.round(distance)} km away. Data may be inaccurate.
                                            </span>
                                        </span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className="timestamp">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>Updated: {lastUpdated}</span>
                </div>
                <div className="cta-button"><span>▶ Play Breath of Earth</span></div>
            </>
        );
    }
    return (
        <div className={`aqi-panel ${isVisible ? 'is-visible' : ''}`}>
            <button className="close-panel-btn" onClick={onClose}>×</button>
            <div className="aqi-panel-content">{panelContent}</div>
        </div>
    );
};

export default App;