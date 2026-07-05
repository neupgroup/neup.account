"use client";

// Provides the user's geolocation coordinates to the component tree via React context.
// Fetches once on mount with low accuracy and a 1-hour cache to avoid repeated prompts.
// Consumers call useContext(Geolocation) to read latitude, longitude, and any error.

import { createContext, useState, useEffect, type ReactNode } from 'react';

type GeolocationState = {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
};

export const Geolocation = createContext<GeolocationState | undefined>(undefined);

export const GeolocationProvider = ({ children }: { children: ReactNode }) => {
  const [location, setLocation] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation(l => ({ ...l, error: 'Geolocation is not supported by your browser.' }));
      return;
    }

    const successHandler = (position: GeolocationPosition) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        error: null,
      });
    };

    const errorHandler = (error: GeolocationPositionError) => {
      setLocation(l => ({ ...l, error: error.message }));
    };

    const options = {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 3600000 // cache the position for 1 hour before re-requesting
    };

    navigator.geolocation.getCurrentPosition(successHandler, errorHandler, options);
  }, []);

  return (
    <Geolocation.Provider value={location}>
      {children}
    </Geolocation.Provider>
  );
};
