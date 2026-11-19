import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { CheckCircle2, ExternalLink, Loader2, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { BUSINESS } from '../data/menu';
import { useGeolocation, type GeolocationErrorCode } from '../hooks/useGeolocation';
import type { GeoLocation, Language } from '../types';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const DEFAULT_VIEWPORT_CENTER: GeoLocation = { lat: 24.7136, lng: 46.6753 };
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

interface LatLngPoint {
  lat: () => number;
  lng: () => number;
}

interface PlacePredictionItem {
  placeId?: string;
  text: { text: string };
  toPlace: () => {
    location?: LatLngPoint | null;
    viewport?: unknown;
    displayName?: string | null;
    formattedAddress?: string | null;
    fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
  };
}

interface AutocompleteSuggestionItem {
  placePrediction?: PlacePredictionItem;
}

interface SearchByTextResponse {
  places?: Array<{
    displayName?: string | null;
    formattedAddress?: string | null;
    location?: LatLngPoint | null;
    googleMapsURI?: string | null;
  }>;
}

function checkQuotaError(err: unknown) {
  const msg = String(err ?? '');
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429') ||
    msg.includes('QuotaExceeded')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export function MapsApiWrapper({
  lang,
  children,
}: {
  lang: Language;
  children: ReactNode;
}) {
  if (!MAPS_API_KEY) {
    return <>{children}</>;
  }

  return (
    <APIProvider apiKey={MAPS_API_KEY} language={lang} region="SA">
      {children}
    </APIProvider>
  );
}

interface DeliveryMapPickerProps {
  lang: Language;
  location?: GeoLocation;
  onLocationChange: (loc: GeoLocation, suggestedAddress?: string) => void;
  heightClass?: string;
  showGpsButton?: boolean;
}

function formatGpsNotice(code: GeolocationErrorCode | null, lang: Language): string | null {
  if (!code) return null;
  if (code === 'unsupported') {
    return lang === 'ar'
      ? 'المتصفح لا يدعم تحديد الموقع التلقائي. يمكنك البحث أو النقر على الخريطة لتحديد موقعك.'
      : 'Geolocation is unsupported here. Search your area or tap directly on the Google Map below.';
  }
  if (code === 'denied') {
    return lang === 'ar'
      ? 'تم رفض إذن الموقع من المتصفح أو الإطار. فعّل الموقع من إعدادات المتصفح أو انقر على الخريطة / ابحث عن حيّك أدناه لتحديد موقعك بدقة.'
      : 'Location permission was blocked by the browser/device. Allow Location in browser site settings, OR simply search/tap anywhere on the Google Map below to drop your pin.';
  }
  if (code === 'timeout') {
    return lang === 'ar'
      ? 'انتهت مهلة تحديد GPS. انقر على الخريطة أو اسحب الدبوس لتحديد موقعك.'
      : 'GPS lookup timed out. Tap on the map or drag the pin to set your exact drop-off point.';
  }
  return lang === 'ar'
    ? 'تعذر الحصول على إشارة GPS. يمكنك النقر مباشرة على الخريطة أو البحث عن عنوانك.'
    : 'GPS signal unavailable. Tap anywhere on the map or search your address below.';
}

function DeliveryMapInner({
  lang,
  location,
  onLocationChange,
  heightClass = 'h-[240px] sm:h-[280px]',
  showGpsButton = true,
}: DeliveryMapPickerProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [searching, setSearching] = useState(false);
  const { loading: locating, error: geoError, getCurrentLocation, clearError } = useGeolocation();
  const sessionTokenRef = useRef<unknown>(null);

  const reverseGeocode = useCallback(
    (loc: GeoLocation) => {
      clearError();
      onLocationChange(loc);

      const win = window as unknown as {
        google?: {
          maps?: {
            Geocoder: new () => {
              geocode: (
                req: { location: { lat: number; lng: number } },
                callback: (results: Array<{ formatted_address?: string }> | null, status: string) => void,
              ) => void;
            };
          };
        };
      };

      if (win.google?.maps?.Geocoder) {
        const geocoder = new win.google.maps.Geocoder();
        geocoder.geocode(
          { location: { lat: loc.lat, lng: loc.lng } },
          (results: Array<{ formatted_address?: string }> | null, status: string) => {
            if (status === 'OK' && results && results[0]?.formatted_address) {
              const address = results[0].formatted_address;
              setSearchText(address);
              onLocationChange(loc, address);
            }
          },
        );
      }
    },
    [onLocationChange, clearError],
  );

  useEffect(() => {
    if (!placesLib || !searchText.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(() => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib as unknown as {
        AutocompleteSessionToken: new () => unknown;
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (req: {
            input: string;
            sessionToken?: unknown;
            includedRegionCodes?: string[];
          }) => Promise<{ suggestions?: AutocompleteSuggestionItem[] }>;
        };
      };
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }
      setSearching(true);
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: searchText.trim(),
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['sa'],
      })
        .then((res) => {
          setSuggestions(res?.suggestions ?? []);
        })
        .catch((err: unknown) => {
          checkQuotaError(err);
          setSuggestions([]);
        })
        .finally(() => {
          setSearching(false);
        });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [placesLib, searchText]);

  useEffect(() => {
    if (map && location) {
      map.panTo(location);
      const zoom = map.getZoom();
      if (!zoom || zoom < 15) {
        map.setZoom(16);
      }
    }
  }, [map, location]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: AutocompleteSuggestionItem) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });

        sessionTokenRef.current = null;
        setSuggestions([]);

        const pos = place.location;
        if (pos) {
          const nextLoc: GeoLocation = {
            lat: Number(pos.lat().toFixed(6)),
            lng: Number(pos.lng().toFixed(6)),
          };
          const addressLabel =
            place.formattedAddress || place.displayName || suggestion.placePrediction.text.text;
          setSearchText(addressLabel || '');
          clearError();
          onLocationChange(nextLoc, addressLabel || undefined);

          if (map) {
            if (place.viewport) {
              map.fitBounds(place.viewport as Parameters<typeof map.fitBounds>[0]);
            } else {
              map.panTo(nextLoc);
              map.setZoom(17);
            }
          }
        }
      } catch (err) {
        checkQuotaError(err);
      }
    },
    [placesLib, map, onLocationChange, clearError],
  );

  const handleGetCurrentLocation = async () => {
    const nextLoc = await getCurrentLocation();
    if (nextLoc) {
      onLocationChange(nextLoc);
      if (map) {
        map.panTo(nextLoc);
        map.setZoom(17);
      }
    }
  };

  const gpsNotice = formatGpsNotice(geoError, lang);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A6457]" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'ابحث عن الحي أو الشارع في خرائط جوجل...'
                : 'Search street, district, or landmark on Google Maps...'
            }
            className="h-11 w-full rounded-xl border border-[#1A3C2F]/20 bg-white ps-9 pe-3 text-xs sm:text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
          />

          {suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-[#1A3C2F]/15 bg-white shadow-xl divide-y divide-[#1A3C2F]/10">
              {suggestions.map((sug, idx) => (
                <li key={sug.placePrediction?.placeId || idx}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(sug)}
                    className="flex w-full items-start gap-2 px-3.5 py-2.5 text-start text-xs font-semibold text-[#1A3C2F] hover:bg-[#EAE2D0] cursor-pointer"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9E7C16]" />
                    <span className="line-clamp-2">{sug.placePrediction?.text.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searching && (
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#6E603A]">
              ...
            </span>
          )}
        </div>

        {showGpsButton && (
          <button
            type="button"
            onClick={() => void handleGetCurrentLocation()}
            disabled={locating}
            className="palm-btn-forest inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-70"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#C9A227]" />
            ) : (
              <Navigation className="h-4 w-4 text-[#C9A227]" />
            )}
            <span>
              {locating
                ? lang === 'ar'
                  ? 'جاري تحديد موقعي...'
                  : 'Locating...'
                : lang === 'ar'
                  ? 'تحديد موقعي الحالي (GPS)'
                  : 'Get Current Location'}
            </span>
          </button>
        )}
      </div>

      {showGpsButton && gpsNotice && (
        <p
          role="alert"
          className="rounded-xl border border-[#C9A227]/50 bg-[#FFF8E1] px-3.5 py-2.5 text-xs font-bold text-[#7A5B06] leading-relaxed"
        >
          {gpsNotice}
        </p>
      )}

      <div
        className={`relative w-full ${heightClass} overflow-hidden rounded-2xl border-2 border-[#1A3C2F]/20 bg-[#EAE2D0] shadow-inner`}
      >
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={ATTRIBUTION_IDS}
          defaultCenter={location ?? DEFAULT_VIEWPORT_CENTER}
          defaultZoom={location ? 16 : 12}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          onClick={(e) => {
            const coords = e.detail.latLng;
            if (!coords) return;
            const nextLoc: GeoLocation = {
              lat: Number(coords.lat.toFixed(6)),
              lng: Number(coords.lng.toFixed(6)),
            };
            reverseGeocode(nextLoc);
          }}
        >
          {location && (
            <AdvancedMarker
              position={location}
              draggable
              title={lang === 'ar' ? 'موقع التوصيل' : 'Delivery Pin'}
              onDragEnd={(e) => {
                const pos = e.latLng;
                if (!pos) return;
                const nextLoc: GeoLocation = {
                  lat: Number(pos.lat().toFixed(6)),
                  lng: Number(pos.lng().toFixed(6)),
                };
                reverseGeocode(nextLoc);
              }}
            >
              <Pin
                background="#1A3C2F"
                borderColor="#C9A227"
                glyphColor="#C9A227"
                scale={1.15}
              />
            </AdvancedMarker>
          )}
        </GoogleMap>

        <div className="pointer-events-none absolute bottom-2.5 start-2.5 end-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-lg bg-[#132D23]/90 px-2.5 py-1 text-[11px] font-bold text-[#F5F0E6] backdrop-blur-sm shadow">
            {location
              ? `${location.lat}, ${location.lng}`
              : lang === 'ar'
                ? 'اضغط على الخريطة أو اسحب الدبوس لتحديد الموقع'
                : 'Tap map or drag pin to set exact location'}
          </span>
          {location && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#C9A227] px-2.5 py-1 text-[11px] font-extrabold text-[#142A20] shadow">
              <LocateFixed className="h-3 w-3" />
              <span>{lang === 'ar' ? 'تم التثبيت' : 'Pin Set'}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeliveryMapPicker(props: DeliveryMapPickerProps) {
  const { loading: locating, error: geoError, getCurrentLocation } = useGeolocation();

  if (!MAPS_API_KEY) {
    if (props.showGpsButton === false) {
      return null;
    }

    const fallbackError = formatGpsNotice(geoError, props.lang);

    const handleFallbackGps = async () => {
      const coords = await getCurrentLocation();
      if (coords) {
        props.onLocationChange(coords);
      }
    };

    return (
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => void handleFallbackGps()}
          disabled={locating}
          className="palm-btn-forest flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer disabled:opacity-70"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#C9A227]" />
          ) : (
            <Navigation className="h-4 w-4 text-[#C9A227]" />
          )}
          <span>
            {locating
              ? props.lang === 'ar'
                ? 'جاري تحديد موقعي...'
                : 'Locating...'
              : props.lang === 'ar'
                ? 'تحديد موقعي الحالي (GPS)'
                : 'Get Current Location'}
          </span>
        </button>
        {props.location && (
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#1E6B38]">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {props.location.lat}, {props.location.lng}
            </span>
          </p>
        )}
        {fallbackError && (
          <p role="alert" className="text-xs font-bold text-[#B42318]">
            {fallbackError}
          </p>
        )}
      </div>
    );
  }

  return <DeliveryMapInner {...props} />;
}

interface StorePlaceDetails {
  name: string;
  address?: string;
  location: GeoLocation;
  mapsUri?: string;
}

function StoreLocationMapInner({ lang }: { lang: Language }) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [storePlace, setStorePlace] = useState<StorePlaceDetails | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);

  useEffect(() => {
    if (!placesLib) return;
    let cancelled = false;

    const { Place } = placesLib as unknown as {
      Place: {
        searchByText: (req: {
          textQuery: string;
          fields: string[];
          maxResultCount: number;
        }) => Promise<SearchByTextResponse>;
      };
    };

    Place.searchByText({
      textQuery: 'Palm Metric coffee',
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
      maxResultCount: 1,
    })
      .then((res) => {
        if (cancelled) return;
        const found = res?.places?.[0];
        if (found?.location) {
          const loc: GeoLocation = {
            lat: found.location.lat(),
            lng: found.location.lng(),
          };
          setStorePlace({
            name: found.displayName || 'Palm Metric',
            address: found.formattedAddress || undefined,
            location: loc,
            mapsUri: found.googleMapsURI || BUSINESS.mapsUrl,
          });
          map?.panTo(loc);
          map?.setZoom(15);
        }
      })
      .catch((err: unknown) => {
        checkQuotaError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, map]);

  return (
    <div className="relative h-64 sm:h-72 w-full overflow-hidden bg-[#1D4435]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={ATTRIBUTION_IDS}
        defaultCenter={DEFAULT_VIEWPORT_CENTER}
        defaultZoom={11}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
      >
        {storePlace && (
          <>
            <AdvancedMarker
              ref={markerRef}
              position={storePlace.location}
              title={storePlace.name}
              onClick={() => setInfoOpen(true)}
            >
              <Pin
                background="#C9A227"
                borderColor="#142A20"
                glyphColor="#142A20"
                scale={1.25}
              />
            </AdvancedMarker>
            {infoOpen && marker && (
              <InfoWindow
                anchor={marker}
                maxWidth={260}
                onCloseClick={() => setInfoOpen(false)}
              >
                <div className="p-1 text-[#1A3C2F] space-y-1">
                  <p className="text-sm font-extrabold">{storePlace.name}</p>
                  {storePlace.address && (
                    <p className="text-xs text-[#4A6457]">{storePlace.address}</p>
                  )}
                  <a
                    href={storePlace.mapsUri || BUSINESS.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 pt-1 text-xs font-extrabold text-[#1E6B38] underline"
                  >
                    <span>{lang === 'ar' ? 'فتح الاتجاهات' : 'Directions'}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </InfoWindow>
            )}
          </>
        )}
      </GoogleMap>
    </div>
  );
}

export function StoreLocationMap({ lang }: { lang: Language }) {
  if (!MAPS_API_KEY) {
    return null;
  }
  return <StoreLocationMapInner lang={lang} />;
}
