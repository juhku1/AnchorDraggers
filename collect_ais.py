#!/usr/bin/env python3
"""
AIS Data Collector for Baltic Sea Region
Fetches vessel data from Digitraffic API and stores it in SQLite database
"""

import json
import requests
from datetime import datetime, timezone
import sqlite3
from pathlib import Path

# Baltic Sea bounding box (same as map bounds)
BBOX = {
    'min_lon': 17.0,
    'max_lon': 30.3,
    'min_lat': 58.5,
    'max_lat': 66.0
}

DB_PATH = Path('data/ais/ais_history.db')

def init_database():
    """Initialize SQLite database with schema"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create vessels table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vessel_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            mmsi INTEGER NOT NULL,
            name TEXT,
            longitude REAL NOT NULL,
            latitude REAL NOT NULL,
            sog REAL,
            cog REAL,
            heading INTEGER,
            nav_stat INTEGER,
            ship_type INTEGER,
            destination TEXT,
            eta TEXT,
            draught REAL,
            pos_acc BOOLEAN,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create indexes for fast queries
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_mmsi ON vessel_positions(mmsi)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_timestamp ON vessel_positions(timestamp)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_mmsi_timestamp ON vessel_positions(mmsi, timestamp)
    ''')
    
    # Create summary table for statistics
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS collection_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            vessel_count INTEGER NOT NULL,
            collection_time_ms INTEGER
        )
    ''')
    
    conn.commit()
    conn.close()
    
    print(f"Database initialized: {DB_PATH}")

def fetch_ais_data():
    """Fetch current AIS data from Digitraffic API"""
    url = "https://meri.digitraffic.fi/api/ais/v1/locations"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        print(f"Error fetching AIS data: {e}")
        return None

def fetch_vessel_metadata(mmsi_list):
    """Fetch vessel metadata (names, types, etc.) from Digitraffic"""
    url = "https://meri.digitraffic.fi/api/ais/v1/vessels"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        vessels = response.json()
        
        # Create lookup dict
        metadata = {}
        for vessel in vessels:
            mmsi = vessel.get('mmsi')
            if mmsi in mmsi_list:
                metadata[mmsi] = {
                    'name': vessel.get('name', '').strip(),
                    'ship_type': vessel.get('shipType'),
                    'destination': vessel.get('destination', '').strip(),
                    'eta': vessel.get('eta'),
                    'draught': vessel.get('draught')
                }
        
        return metadata
    except Exception as e:
        print(f"Warning: Could not fetch vessel metadata: {e}")
        return {}

def filter_vessels(data):
    """Filter vessels within Baltic Sea region"""
    if not data or 'features' not in data:
        return []
    
    filtered = []
    for feature in data['features']:
        coords = feature['geometry']['coordinates']
        lon, lat = coords[0], coords[1]
        
        # Check if within bounding box
        if (BBOX['min_lon'] <= lon <= BBOX['max_lon'] and 
            BBOX['min_lat'] <= lat <= BBOX['max_lat']):
            filtered.append(feature)
    
    return filtered

def save_to_database(vessels, vessel_metadata, timestamp, collection_time_ms):
    """Save vessel data to SQLite database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    timestamp_str = timestamp.isoformat()
    
    # Insert vessel positions
    for feature in vessels:
        props = feature['properties']
        coords = feature['geometry']['coordinates']
        mmsi = props.get('mmsi')
        
        # Get metadata if available
        meta = vessel_metadata.get(mmsi, {})
        
        cursor.execute('''
            INSERT INTO vessel_positions 
            (timestamp, mmsi, name, longitude, latitude, sog, cog, heading, 
             nav_stat, ship_type, destination, eta, draught, pos_acc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            timestamp_str,
            mmsi,
            meta.get('name'),
            coords[0],  # longitude
            coords[1],  # latitude
            props.get('sog'),
            props.get('cog'),
            props.get('heading'),
            props.get('navStat'),
            meta.get('ship_type'),
            meta.get('destination'),
            meta.get('eta'),
            meta.get('draught'),
            props.get('posAcc')
        ))
    
    # Insert summary
    cursor.execute('''
        INSERT INTO collection_summary (timestamp, vessel_count, collection_time_ms)
        VALUES (?, ?, ?)
    ''', (timestamp_str, len(vessels), collection_time_ms))
    
    conn.commit()
    conn.close()
    
    print(f"Saved {len(vessels)} vessels to database")

def export_latest_json(vessels, vessel_metadata, timestamp):
    """Export latest data as JSON for web access"""
    latest_file = Path('data/ais/latest.json')
    
    # Build simplified vessel list
    vessel_list = []
    for feature in vessels:
        props = feature['properties']
        coords = feature['geometry']['coordinates']
        mmsi = props.get('mmsi')
        meta = vessel_metadata.get(mmsi, {})
        
        vessel_list.append({
            'mmsi': mmsi,
            'name': meta.get('name'),
            'lon': coords[0],
            'lat': coords[1],
            'sog': props.get('sog'),
            'cog': props.get('cog'),
            'heading': props.get('heading'),
            'ship_type': meta.get('ship_type'),
            'destination': meta.get('destination')
        })
    
    output = {
        'timestamp': timestamp.isoformat(),
        'vessel_count': len(vessel_list),
        'vessels': vessel_list
    }
    
    with open(latest_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Exported latest.json with {len(vessel_list)} vessels")

def main():
    """Main collection routine"""
    print("=" * 60)
    print("AIS Data Collection Started")
    print("=" * 60)
    
    start_time = datetime.now(timezone.utc)
    timestamp = start_time
    print(f"Collection time: {timestamp.isoformat()}")
    
    # Initialize database
    init_database()
    
    # Fetch data
    print("Fetching AIS data from Digitraffic...")
    data = fetch_ais_data()
    
    if not data:
        print("Failed to fetch data")
        return
    
    # Filter to Baltic region
    print("Filtering vessels in Baltic Sea region...")
    vessels = filter_vessels(data)
    print(f"Found {len(vessels)} vessels in region")
    
    # Fetch vessel metadata (names, types, etc.)
    print("Fetching vessel metadata...")
    mmsi_list = [f['properties']['mmsi'] for f in vessels]
    vessel_metadata = fetch_vessel_metadata(mmsi_list)
    print(f"Retrieved metadata for {len(vessel_metadata)} vessels")
    
    # Calculate collection time
    collection_time = datetime.now(timezone.utc) - start_time
    collection_time_ms = int(collection_time.total_seconds() * 1000)
    
    # Save to database
    save_to_database(vessels, vessel_metadata, timestamp, collection_time_ms)
    
    # Export latest JSON
    export_latest_json(vessels, vessel_metadata, timestamp)
    
    print(f"Collection complete in {collection_time_ms}ms!")
    print("=" * 60)

if __name__ == '__main__':
    main()
