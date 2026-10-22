import { CITIES, citiesInState, cityStateOptions } from './cities';

describe('city location filters', () => {
  it('lists unique states', () => {
    expect(cityStateOptions()).toEqual(['MI']);
  });

  it('lists only cities in the chosen state', () => {
    expect(citiesInState(CITIES, '').map((city) => city.id)).toEqual([]);
    expect(citiesInState(CITIES, 'OH').map((city) => city.id)).toEqual([]);
    expect(citiesInState(CITIES, 'MI').map((city) => city.cityName)).toEqual([
      'Ann Arbor',
      'Center Line',
      'Dearborn',
      'Detroit',
      'Farmington Hills',
      'Livonia',
      'Sterling Heights',
      'Troy',
      'Warren',
      'Westland',
    ]);
  });
});
