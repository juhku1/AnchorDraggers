# AIS Data Collection

This directory contains historical AIS (Automatic Identification System) data collected from the Baltic Sea region.

## Data Structure

```
data/ais/
├── ais_history.db      # SQLite database with all historical data
└── latest.json         # Most recent collection (for web access)
```

## Database Schema

**vessel_positions** table:
- `mmsi`: Maritime Mobile Service Identity (vessel ID)
- `name`: Vessel name
- `longitude`, `latitude`: Position
- `sog`: Speed over ground (knots)
- `cog`: Course over ground (degrees)
- `heading`: Compass heading
- `nav_stat`: Navigation status
- `ship_type`: AIS ship type code
- `destination`: Reported destination
- `eta`: Estimated time of arrival
- `draught`: Vessel draught (meters)
- `timestamp`: Collection timestamp

**collection_summary** table:
- Summary statistics for each collection run

## Example Queries

```sql
-- Get vessel track for specific MMSI
SELECT timestamp, longitude, latitude, sog 
FROM vessel_positions 
WHERE mmsi = 230982000 
ORDER BY timestamp;

-- Count vessels by ship type
SELECT ship_type, COUNT(*) 
FROM vessel_positions 
WHERE timestamp > datetime('now', '-1 hour')
GROUP BY ship_type;

-- Find vessels near specific location
SELECT mmsi, name, sog
FROM vessel_positions
WHERE longitude BETWEEN 24.0 AND 25.0
  AND latitude BETWEEN 59.8 AND 60.2
  AND timestamp = (SELECT MAX(timestamp) FROM vessel_positions)
LIMIT 10;
```

## Collection

Data is automatically collected every 10 minutes via GitHub Actions.

Source: [Digitraffic Marine API](https://meri.digitraffic.fi)

Region: Baltic Sea (17-30.3°E, 58.5-66°N)

## Database Size

- ~2.4 MB per collection (9735 vessels)
- ~350 MB per day (144 collections)
- Indexes for fast queries by MMSI and timestamp
