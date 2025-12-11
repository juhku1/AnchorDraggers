/**
 * Vessel Track Management
 * Handles 24-hour historical track visualization
 */

const activeTracks = new Map(); // mmsi -> { layerId, sourceId, data }

async function fetchVesselTrack(mmsi, hoursBack = 24) {
  try {
    const now = Date.now();
    const from = now - (hoursBack * 60 * 60 * 1000);
    const url = `https://meri.digitraffic.fi/api/ais/v1/locations?mmsi=${mmsi}&from=${from}&to=${now}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.features || [];
  } catch (error) {
    console.error(`Failed to fetch track for MMSI ${mmsi}:`, error);
    return [];
  }
}

function showVesselTrack(mmsi, color = '#00eaff') {
  if (activeTracks.has(mmsi)) {
    console.log(`Track already visible for MMSI ${mmsi}`);
    return;
  }

  // Get map reference from global scope
  const mapInstance = window.map;
  if (!mapInstance) {
    console.error('Map not initialized yet');
    return;
  }

  fetchVesselTrack(mmsi, 24).then(positions => {
    if (positions.length === 0) {
      console.warn(`No track data available for MMSI ${mmsi}`);
      return;
    }

    // Sort by time
    positions.sort((a, b) => {
      const timeA = a.properties?.timestampExternal || 0;
      const timeB = b.properties?.timestampExternal || 0;
      return timeA - timeB;
    });

    const coords = positions.map(p => p.geometry.coordinates);
    
    const sourceId = `track-source-${mmsi}`;
    const lineLayerId = `track-line-${mmsi}`;
    const pointLayerId = `track-points-${mmsi}`;

    // Add source
    mapInstance.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords
        }
      }
    });

    // Add line layer
    mapInstance.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 2,
        'line-opacity': 0.6
      }
    });

    // Add point layer for position markers
    mapInstance.addLayer({
      id: pointLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 3,
        'circle-color': color,
        'circle-opacity': 0.4,
        'circle-stroke-width': 1,
        'circle-stroke-color': color,
        'circle-stroke-opacity': 0.8
      }
    });

    activeTracks.set(mmsi, {
      sourceId,
      lineLayerId,
      pointLayerId,
      positions,
      color
    });

    console.log(`Track displayed for MMSI ${mmsi}: ${positions.length} positions`);
  });
}

function hideVesselTrack(mmsi) {
  const track = activeTracks.get(mmsi);
  if (!track) return;

  const mapInstance = window.map;
  if (!mapInstance) return;

  // Remove layers
  if (mapInstance.getLayer(track.lineLayerId)) {
    mapInstance.removeLayer(track.lineLayerId);
  }
  if (mapInstance.getLayer(track.pointLayerId)) {
    mapInstance.removeLayer(track.pointLayerId);
  }

  // Remove source
  if (mapInstance.getSource(track.sourceId)) {
    mapInstance.removeSource(track.sourceId);
  }

  activeTracks.delete(mmsi);
  console.log(`Track removed for MMSI ${mmsi}`);
}

function toggleVesselTrack(mmsi, color) {
  if (activeTracks.has(mmsi)) {
    hideVesselTrack(mmsi);
    return false; // Now hidden
  } else {
    showVesselTrack(mmsi, color);
    return true; // Now visible
  }
}

function isTrackVisible(mmsi) {
  return activeTracks.has(mmsi);
}
