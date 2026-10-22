/**
 * Cities with coordinates and timezone for the location dropdown.
 * Add more entries as needed; keep id stable for saved settings.
 */
export type City = {
  id: string;
  name: string;
  cityName: string;
  state: string;
  lat: number;
  lng: number;
  /** IANA timezone (e.g. America/Detroit). Used when this city is selected. */
  timezone: string;
};

export const CITIES: City[] = [
  { id: 'center-line-mi', name: 'Center Line, MI', cityName: 'Center Line', state: 'MI', lat: 42.485, lng: -83.0277, timezone: 'America/Detroit' },
  { id: 'warren-mi', name: 'Warren, MI', cityName: 'Warren', state: 'MI', lat: 42.5145, lng: -83.0147, timezone: 'America/Detroit' },
  { id: 'detroit-mi', name: 'Detroit, MI', cityName: 'Detroit', state: 'MI', lat: 42.3314, lng: -83.0458, timezone: 'America/Detroit' },
  { id: 'dearborn-mi', name: 'Dearborn, MI', cityName: 'Dearborn', state: 'MI', lat: 42.3223, lng: -83.1763, timezone: 'America/Detroit' },
  { id: 'sterling-heights-mi', name: 'Sterling Heights, MI', cityName: 'Sterling Heights', state: 'MI', lat: 42.5803, lng: -83.0302, timezone: 'America/Detroit' },
  { id: 'troy-mi', name: 'Troy, MI', cityName: 'Troy', state: 'MI', lat: 42.6056, lng: -83.1499, timezone: 'America/Detroit' },
  { id: 'ann-arbor-mi', name: 'Ann Arbor, MI', cityName: 'Ann Arbor', state: 'MI', lat: 42.2808, lng: -83.743, timezone: 'America/Detroit' },
  { id: 'livonia-mi', name: 'Livonia, MI', cityName: 'Livonia', state: 'MI', lat: 42.3684, lng: -83.3527, timezone: 'America/Detroit' },
  { id: 'farmington-hills-mi', name: 'Farmington Hills, MI', cityName: 'Farmington Hills', state: 'MI', lat: 42.4989, lng: -83.3677, timezone: 'America/Detroit' },
  { id: 'westland-mi', name: 'Westland, MI', cityName: 'Westland', state: 'MI', lat: 42.3242, lng: -83.4002, timezone: 'America/Detroit' },
];

/** Value for "Other (enter coordinates)" in the dropdown; no city selected. */
export const OTHER_CITY_ID = '';

export function cityStateOptions(cities: City[] = CITIES): string[] {
  return [...new Set(cities.map((city) => city.state).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function citiesInState(cities: City[], state: string): City[] {
  if (!state) return [];
  return cities
    .filter((city) => city.state === state)
    .slice()
    .sort((a, b) => a.cityName.localeCompare(b.cityName));
}
