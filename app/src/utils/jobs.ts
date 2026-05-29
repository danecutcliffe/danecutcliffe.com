import type { JobCode, JobSite, TimeEntry } from '../domain/types';

export function jobSiteById(jobSites: JobSite[]) {
  return new Map(jobSites.map((site) => [site.id, site]));
}

export function jobDisplayName(job: JobCode | null | undefined, site?: JobSite | null) {
  if (!job) return 'No job code';
  const label = job.code ? `${job.code} ${job.name}` : job.name;
  return site ? `${site.name} | ${label}` : label;
}

export function jobCodeLabel(job: JobCode | null | undefined) {
  if (!job) return 'No job code';
  return job.name;
}

export function employeeJobDisplayName(job: JobCode | null | undefined, site?: JobSite | null) {
  if (!job) return 'No job code';
  return site ? `${site.name} | ${job.name}` : job.name;
}

export function jobPropertyName(job: JobCode | null | undefined, site?: JobSite | null) {
  if (!job) return '';
  return site?.name ?? 'No property';
}

export function isSelectableJobCode(job: JobCode) {
  return job.isActive && !job.isArchived;
}

export function isSelectableJobSite(site: JobSite) {
  return site.isActive && !site.isArchived;
}

export function jobDisplayNameById(jobCodeId: string | null | undefined, jobById: Map<string, JobCode>, siteById: Map<string, JobSite>) {
  const job = jobCodeId ? jobById.get(jobCodeId) : null;
  const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
  return jobDisplayName(job, site);
}

export function isJobCodeUsed(job: JobCode, entries: TimeEntry[]) {
  return entries.some((entry) => entry.jobCodeId === job.id);
}

export function gpsDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(haversine));
}

export function getEntryGpsVerification(entry: TimeEntry, job?: JobCode | null, site?: JobSite | null) {
  if (!entry.clockInLat || !entry.clockInLng) return { status: 'missing' as const, label: 'No GPS' };
  if (!site?.latitude || !site.longitude) return { status: 'unconfigured' as const, label: 'GPS captured' };

  const distanceMeters = gpsDistanceMeters(
    { lat: entry.clockInLat, lng: entry.clockInLng },
    { lat: site.latitude, lng: site.longitude },
  );
  const radius = site.geofenceRadiusMeters || 250;

  if (distanceMeters <= radius) {
    return { status: 'inside' as const, label: `On site (${Math.round(distanceMeters)}m)` };
  }
  return { status: 'outside' as const, label: `Off site (${Math.round(distanceMeters)}m)` };
}

export function googleMapsSearchUrl(addressOrName: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOrName)}`;
}

export function googleMapsCoordinatesUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
