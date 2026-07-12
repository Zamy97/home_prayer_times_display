import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type WeatherReading = {
  tempF: number;
  /** Apparent / feels-like °F when the provider supplies it */
  feelsLikeF: number | null;
};

/** Response from our /api/weather proxy. */
interface WeatherTempResponse {
  temp?: number;
  feelsLike?: number | null;
}

/** Open-Meteo current weather (local-dev direct calls). */
interface OpenMeteoCurrent {
  current?: { temperature_2m?: number; apparent_temperature?: number };
}

/** OpenWeather One Call 3.0 current block (local-dev fallback). */
interface OneCallCurrent {
  current?: { temp?: number; feels_like?: number };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetches current + feels-like temperature in Fahrenheit.
   * Production: `/api/weather` (Open-Meteo first, OWM fallback on the server).
   * Local: Open-Meteo direct, then OWM if `environment.openWeatherApiKey` is set.
   * Retries transient failures; does not swallow errors — callers keep last known temp.
   */
  getCurrentWeather(lat: number, lng: number): Observable<WeatherReading> {
    const request$ = environment.production
      ? this.fetchViaProxy(lat, lng)
      : this.fetchLocalWithFallback(lat, lng);

    return request$.pipe(
      retry({
        count: 2,
        delay: (error, retryCount) => {
          if (!this.isRetryable(error)) {
            return throwError(() => error);
          }
          return timer(1000 * retryCount);
        },
      })
    );
  }

  private fetchViaProxy(lat: number, lng: number): Observable<WeatherReading> {
    const url = `/api/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;
    return this.http.get<WeatherTempResponse>(url).pipe(
      map((res) => this.toReading(res.temp, res.feelsLike))
    );
  }

  /** Local ng serve: free Open-Meteo first, paid OWM only if that fails. */
  private fetchLocalWithFallback(lat: number, lng: number): Observable<WeatherReading> {
    const key = environment.openWeatherApiKey?.trim();
    return this.fetchOpenMeteoDirect(lat, lng).pipe(
      catchError((err) => {
        if (!key) return throwError(() => err);
        return this.fetchOpenWeatherDirect(lat, lng, key);
      })
    );
  }

  private fetchOpenMeteoDirect(lat: number, lng: number): Observable<WeatherReading> {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lng))}` +
      '&current=temperature_2m,apparent_temperature' +
      '&temperature_unit=fahrenheit';

    return this.http.get<OpenMeteoCurrent>(url).pipe(
      map((res) =>
        this.toReading(res.current?.temperature_2m, res.current?.apparent_temperature)
      )
    );
  }

  private fetchOpenWeatherDirect(lat: number, lng: number, appid: string): Observable<WeatherReading> {
    const url =
      'https://api.openweathermap.org/data/3.0/onecall' +
      `?lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      '&exclude=minutely,hourly,daily,alerts' +
      '&units=imperial' +
      `&appid=${encodeURIComponent(appid)}`;
    return this.http.get<OneCallCurrent>(url).pipe(
      map((res) => this.toReading(res.current?.temp, res.current?.feels_like))
    );
  }

  private toReading(temp: number | undefined, feelsLike?: number | null): WeatherReading {
    if (typeof temp !== 'number' || Number.isNaN(temp)) {
      throw new Error('Temperature missing from weather response');
    }
    const feels =
      typeof feelsLike === 'number' && !Number.isNaN(feelsLike) ? feelsLike : null;
    return { tempF: temp, feelsLikeF: feels };
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) return true;
    const status = error.status;
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }
}
