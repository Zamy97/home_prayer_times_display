import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/** Open-Meteo current weather response (no API key required). */
interface OpenMeteoCurrent {
  current?: { temperature_2m?: number };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly base = 'https://api.open-meteo.com/v1/forecast';

  constructor(private readonly http: HttpClient) {}

  /**
   * Fetches current temperature in Fahrenheit for the given coordinates.
   * Returns null on error or missing coords.
   */
  getCurrentTempF(lat: number, lng: number): Observable<number | null> {
    const url = `${this.base}?latitude=${lat}&longitude=${lng}&current=temperature_2m&temperature_unit=fahrenheit`;
    return this.http.get<OpenMeteoCurrent>(url).pipe(
      map((res) => res.current?.temperature_2m ?? null),
      catchError(() => of(null))
    );
  }
}
