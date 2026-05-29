import type { GpsPoint } from '../domain/types';

export async function requestGpsPoint(): Promise<GpsPoint> {
  if (!navigator.geolocation) return { status: 'unsupported' };

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        status: 'captured',
      }),
      (error) => resolve({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'missing' }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
