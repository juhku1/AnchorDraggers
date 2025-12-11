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
  console.log(`[TRACK] Attempting to show track for MMSI ${mmsi} with color ${color}`);
  
  if (activeTracks.has(mmsi)) {
    console.log(`[TRACK] Track already visible for MMSI ${mmsi}`);
    return;
  }

  // Get map reference from global scope
  const mapInstance = window.map;
  if (!mapInstance) {
    console.error('[TRACK] Map not initialized yet');
    return;
  }
  console.log('[TRACK] Map instance found, fetching data...');

  fetchVesselTrack(mmsi, 24).then(positions => {
    console.log(`[TRACK] Received ${positions.length} positions for MMSI ${mmsi}`);
    
    if (positions.length === 0) {
      console.warn(`[TRACK] No track data available for MMSI ${mmsi}`);
      return;
    }

    // Sort by time
    positions.sort((a, b) => {
      const timeA = a.properties?.timestampExternal || 0;
      const timeB = b.properties?.timestampExternal || 0;
      return timeA - timeB;
    });

    const coords = positions.map(p => p.geometry.coordinates);
    console.log(`[TRACK] First coordinate:`, coords[0]);
    console.log(`[TRACK] Last coordinate:`, coords[coords.length - 1]);
    console.log(`[TRACK] Total coordinates:`, coords.length);
    
    const sourceId = `track-source-${mmsi}`;
    const lineLayerId = `track-line-${mmsi}`;
    const pointLayerId = `track-points-${mmsi}`;

    // Add source
    console.log(`[TRACK] Adding source ${sourceId}...`);
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
    console.log(`[TRACK] Adding line layer ${lineLayerId}...`);
    mapInstance.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.8
      }
    });

    // Add point layer for position markers
    console.log(`[TRACK] Adding point layer ${pointLayerId}...`);
    mapInstance.addLayer({
      id: pointLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 4,
        'circle-color': color,
        'circle-opacity': 0.6,
        'circle-stroke-width': 1,
        'circle-stroke-color': color,
        'circle-stroke-opacity': 1
      }
    });

    activeTracks.set(mmsi, {
      sourceId,
      lineLayerId,
      pointLayerId,
      positions,
      color
    });

    console.log(`[TRACK] ✓ Track displayed for MMSI ${mmsi}: ${positions.length} positions, ${coords.length} coordinates`);
  }).catch(error => {
    console.error(`[TRACK] Error displaying track for MMSI ${mmsi}:`, error);
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
