export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  displayName: string;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress> {
  const query = address.trim();
  if (!query) throw new Error('Enter an address before calculating coordinates.');

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ca');
  url.searchParams.set('q', query);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Coordinate lookup is unavailable right now. Try again or enter coordinates manually.');
  }

  const results = await response.json() as NominatimResult[];
  const match = results[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);

  if (!match || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error('No coordinate match found for that address.');
  }

  return {
    latitude,
    longitude,
    displayName: match.display_name ?? query,
  };
}
