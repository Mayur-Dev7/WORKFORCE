import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Input, Button, Space, message, Typography } from 'antd';
import { SearchOutlined, CompassOutlined, AimOutlined } from '@ant-design/icons';

const { Text } = Typography;

// Custom styled modern map marker icon using Leaflet DivIcon
const customMarkerIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
      background: #1677ff;
      border: 3px solid #ffffff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      cursor: pointer;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      "></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

interface MapPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
}

export const MapPicker: React.FC<MapPickerProps> = ({
  latitude,
  longitude,
  radiusMeters = 150,
  onChange,
  height = 360,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center on valid coords or fallback
    const validLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 37.774929;
    const validLon = typeof longitude === 'number' && !isNaN(longitude) ? longitude : -122.419416;

    const map = L.map(mapContainerRef.current, {
      center: [validLat, validLon],
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    mapInstanceRef.current = map;

    // OpenStreetMap standard tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Add Draggable Marker
    const marker = L.marker([validLat, validLon], {
      icon: customMarkerIcon,
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // Add Geofence Radius Circle
    const circle = L.circle([validLat, validLon], {
      radius: radiusMeters,
      color: '#1677ff',
      fillColor: '#1677ff',
      fillOpacity: 0.15,
      weight: 2,
      dashArray: '4, 6',
    }).addTo(map);
    circleRef.current = circle;

    // Marker Drag event
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      circle.setLatLng(position);
      const newLat = parseFloat(position.lat.toFixed(6));
      const newLon = parseFloat(position.lng.toFixed(6));
      onChange(newLat, newLon);
    });

    // Map Click event - click anywhere to move pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      const newLat = parseFloat(lat.toFixed(6));
      const newLon = parseFloat(lng.toFixed(6));
      onChange(newLat, newLon);
    });

    // Invalidate map size after render to avoid grey tile glitches in modals
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Update marker position & circle when latitude / longitude props change
  useEffect(() => {
    if (!markerRef.current || !circleRef.current || !mapInstanceRef.current) return;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) return;

    const currentPos = markerRef.current.getLatLng();
    if (
      Math.abs(currentPos.lat - latitude) > 0.00001 ||
      Math.abs(currentPos.lng - longitude) > 0.00001
    ) {
      markerRef.current.setLatLng([latitude, longitude]);
      circleRef.current.setLatLng([latitude, longitude]);
      mapInstanceRef.current.panTo([latitude, longitude]);
    }
  }, [latitude, longitude]);

  // Update geofence radius circle when radiusMeters prop changes
  useEffect(() => {
    if (circleRef.current && radiusMeters > 0) {
      circleRef.current.setRadius(radiusMeters);
    }
  }, [radiusMeters]);

  // Address search using OpenStreetMap Nominatim API
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const result = data[0];
        const newLat = parseFloat(parseFloat(result.lat).toFixed(6));
        const newLon = parseFloat(parseFloat(result.lon).toFixed(6));

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          mapInstanceRef.current.setView([newLat, newLon], 16);
          markerRef.current.setLatLng([newLat, newLon]);
          circleRef.current.setLatLng([newLat, newLon]);
          onChange(newLat, newLon);
          message.success(`Found location: ${result.display_name.split(',').slice(0, 2).join(',')}`);
        }
      } else {
        message.warning('Location not found. Try searching a city, street, or landmark.');
      }
    } catch {
      message.error('Failed to search location. Check your internet connection.');
    } finally {
      setSearching(false);
    }
  };

  // Fly to user current location
  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) {
      message.error('Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = parseFloat(pos.coords.latitude.toFixed(6));
        const newLon = parseFloat(pos.coords.longitude.toFixed(6));
        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          mapInstanceRef.current.setView([newLat, newLon], 17);
          markerRef.current.setLatLng([newLat, newLon]);
          circleRef.current.setLatLng([newLat, newLon]);
          onChange(newLat, newLon);
          message.success(`Centered to your current GPS position (±${Math.round(pos.coords.accuracy)}m)`);
        }
        setLocating(false);
      },
      (err) => {
        message.error(`GPS Error: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div style={{ width: '100%', marginBottom: 12 }}>
      {/* Map Control Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Input
          placeholder="Search place, city or address (e.g. Bangalore, Connaught Place)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onPressEnter={handleSearch}
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          style={{ flex: 1, minWidth: 220 }}
          allowClear
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={searching}
        >
          Search
        </Button>
        <Button
          icon={<CompassOutlined />}
          onClick={handleLocateMe}
          loading={locating}
        >
          My Location
        </Button>
      </div>

      {/* Interactive Map Box */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height,
          borderRadius: 8,
          border: '1px solid #d9d9d9',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Map Info Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
          padding: '4px 8px',
          background: '#f9f9f9',
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        <Space>
          <AimOutlined style={{ color: '#1677ff' }} />
          <Text strong>Selected Geofence Center:</Text>
          <Text code>
            {latitude?.toFixed?.(6) ?? latitude}, {longitude?.toFixed?.(6) ?? longitude}
          </Text>
        </Space>
        <Text type="secondary">
          Click map or drag the blue pin to reposition • Perimeter: {radiusMeters}m
        </Text>
      </div>
    </div>
  );
};
