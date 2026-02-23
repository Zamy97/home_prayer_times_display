import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type GeoResult = { lat: number; lng: number };
export type GeoError = 'unsupported' | 'permission_denied' | 'position_unavailable' | 'timeout';

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /**
   * Requests the browser for current position. Returns one value then completes, or errors.
   * Only triggers the browser permission prompt when subscribed to.
   */
  getCurrentPosition(options?: PositionOptions): Observable<GeoResult> {
    return new Observable<GeoResult>((subscriber) => {
      if (!navigator?.geolocation) {
        subscriber.error('unsupported' as GeoError);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            subscriber.next({ lat, lng });
          } else {
            subscriber.error('position_unavailable' as GeoError);
          }
          subscriber.complete();
        },
        (err: GeolocationPositionError) => {
          const code: GeoError =
            err.code === err.PERMISSION_DENIED
              ? 'permission_denied'
              : err.code === err.POSITION_UNAVAILABLE
                ? 'position_unavailable'
                : err.code === err.TIMEOUT
                  ? 'timeout'
                  : 'position_unavailable';
          subscriber.error(code);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...options }
      );
    });
  }
}
