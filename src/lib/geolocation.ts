/**
 * Current position for a geofenced check-in/out. Asks for a precise GPS
 * fix first; if the phone can't get one in time (common indoors, or on
 * slower phones with GPS cold), falls back to a quicker network-based fix
 * instead of failing outright. The server allows for the reported
 * accuracy (capped) when it checks the outlet radius.
 */
export function getCheckInPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Your browser doesn't support location access"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(error);
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 60_000,
          timeout: 15_000,
        });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  });
}
