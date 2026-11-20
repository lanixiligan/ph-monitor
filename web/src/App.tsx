// The whole page: a top bar, then three columns: on the left the panel for
// the clicked spot with the map legend under it (the legend can fold away),
// the map in the middle, and the live news and headlines on the right.
// The bottom line holds the "not official" notice and a link to the credits page.
// The top bar's view switch picks what the page focuses on (Overall, Heat, …):
// the map colours, the legend, the headline filter and the order of the status
// card follow it. A view is display only: it never changes the score.

import { useEffect, useMemo, useState } from 'react';
import { APP_NAME, DEFAULT_HEAT_MODEL, isViewAvailable } from '@ph-monitor/shared';
import type {
  FeedHealth,
  HazardLayerInfo,
  HeatMapData,
  HeatViewId,
  MapViewId,
  PlaceScores,
  QuakeMap,
  Storm,
} from '@ph-monitor/shared';
import { fetchHazards, fetchHeatMap, fetchPlaceScores, fetchProvinces, fetchQuakes, fetchStatus } from './api.ts';
import type { ProvinceCollection, Spot } from './api.ts';
import { Disclaimer } from './components/Disclaimer.tsx';
import { HeatMapPanel } from './components/HeatMapPanel.tsx';
import { Legend } from './components/Legend.tsx';
import { MapNote } from './components/MapNote.tsx';
import { NewsPanel } from './components/NewsPanel.tsx';
import { PlaceSearch } from './components/PlaceSearch.tsx';
import { ProvinceMap } from './components/ProvinceMap.tsx';
import { RainForecastPanel } from './components/RainForecastPanel.tsx';
import { Ladder } from './components/Ladder.tsx';
import { SpotHint } from './components/SpotHint.tsx';
import { StatusCard } from './components/StatusCard.tsx';
import type { PickedArea } from './components/StatusCard.tsx';
import { StreamsPanel } from './components/StreamsPanel.tsx';
import { ViewSwitch } from './components/ViewSwitch.tsx';
import { WarnIcon } from './components/WarnIcon.tsx';
import { loadedMapKinds } from './hazardLabels.ts';
import { heatForMap } from './heatColors.ts';
import { fill, LanguageSwitch, lookup, useStrings } from './i18n/index.ts';
import { mapNote, stormsUnsure } from './mapNotes.ts';
import { HAZARD_MIN_ZOOM } from './mapSettings.ts';
import type { MapLayers } from './mapSettings.ts';
import { ThemeSwitch } from './theme/index.ts';
import { useRainForecast } from './useRainForecast.ts';
import { changeLayers, initialViewState, mapViewById, pressView, tickLoadedMaps, turnOnLayer } from './viewLayers.ts';

// How often the map asks the server for new scores.
const REFRESH_MS = 5 * 60 * 1000;

/**
 * Lets a link open a spot straight away: /?lat=10.3157&lon=123.8854
 * Returns null when the address has no (valid) coordinates.
 */
function spotFromAddress(): Spot | null {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  // Number(null) is 0, which is not in the Philippines, so this also
  // rejects an address with no coordinates at all.
  const valid = lat >= 4 && lat <= 22 && lon >= 116 && lon <= 128;
  return valid ? { lat, lon } : null;
}

export function App() {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  // `useState` remembers a value between re-draws of the page.
  const [provinces, setProvinces] = useState<ProvinceCollection | null>(null);
  // Every town's score, for the map when zoomed in. null = not loaded (yet).
  const [placeScores, setPlaceScores] = useState<PlaceScores | null>(null);
  // The town (or province) the picked spot is in, outlined on the map. null = none yet.
  const [picked, setPicked] = useState<PickedArea | null>(null);
  // true when the last load failed; the message is looked up when drawn.
  const [failed, setFailed] = useState(false);
  // How each feed is doing. null = not loaded yet; 'failed' = the check itself failed.
  const [feeds, setFeeds] = useState<FeedHealth[] | 'failed' | null>(null);
  const [spot, setSpot] = useState<Spot | null>(spotFromAddress);
  // The pressed map view and the legend's tick boxes (the hazard maps start off).
  // They change together, by the rule in viewLayers.ts.
  const [viewState, setViewState] = useState(initialViewState);
  const mapView = viewState.view;
  const layers = viewState.layers;
  // The fixed hazard maps the server has loaded. null = not known yet.
  const [hazards, setHazards] = useState<HazardLayerInfo[] | null>(null);
  // The kinds the map can draw, for the view switch: none while unknown or after a failed load.
  const loadedMaps = useMemo(() => loadedMapKinds(hazards), [hazards]);
  // When the list arrives, a view pressed before it (Typhoon) ticks its hazard maps too.
  useEffect(() => {
    setViewState((current) => tickLoadedMaps(current, loadedMaps));
  }, [loadedMaps]);
  // The map's zoom level, for the legend's "zoom in to see zones".
  const [mapZoom, setMapZoom] = useState(0);
  // The headline filter (a kind of disaster, 'general' or 'all'), shared by the panel and the map dots.
  const [newsType, setNewsType] = useState('all');
  // Provinces picked from a headline, outlined on the map. A new object on
  // every click, so picking the same place twice still moves the map.
  const [focus, setFocus] = useState<{ psgcs: number[] } | null>(null);
  // A place picked in the search box, for the map to fly to. A new object on
  // every pick, so picking the same place twice still moves the map.
  const [goTo, setGoTo] = useState<Spot | null>(null);
  // What went wrong with "use my location", if anything.
  const [locateProblem, setLocateProblem] = useState<'outside' | 'failed' | null>(null);
  // The heat map's weather model, or 'average'. Remembered while other views are pressed.
  const [heatModel, setHeatModel] = useState<HeatViewId>(DEFAULT_HEAT_MODEL);
  // The model the map shows: only while Heat is pressed. null = the heat map is off.
  const heatChosen = mapView === 'heat' ? heatModel : null;
  // The heat map answer for `heatChosen`. null = off, or still loading.
  const [heat, setHeat] = useState<HeatMapData | null>(null);
  // true when the last heat map load failed.
  const [heatFailed, setHeatFailed] = useState(false);
  // The quakes for the quake markers (GET /api/quakes). null = not loaded yet.
  const [quakes, setQuakes] = useState<QuakeMap | null>(null);
  // true when the last quake list load failed (the legend says so).
  const [quakesFailed, setQuakesFailed] = useState(false);
  // The rain forecast field: Typhoon view only (a warm scale; the score colours are hidden there).
  const rain = useRainForecast(mapView === 'typhoon' && layers.rainForecast);
  // The storms the map draws (loaded by the map itself, mapOverlays.ts). null = not loaded yet.
  const [storms, setStorms] = useState<Storm[] | null>(null);
  // true when the last storm list load failed (the Typhoon view says so).
  const [stormsFailed, setStormsFailed] = useState(false);

  /** The map loaded the storm list, or failed to. A failure keeps the last list. */
  function onStorms(result: Storm[] | 'failed') {
    if (result === 'failed') {
      setStormsFailed(true);
      return;
    }
    setStorms(result);
    setStormsFailed(false);
  }

  /** Switches the heat map's source. */
  function chooseHeatModel(model: HeatViewId) {
    if (model === heatModel) return;
    setHeatModel(model);
    // The answer held now is for another model: drop it.
    setHeat(null);
    setHeatFailed(false);
  }

  /**
   * Presses a view in the top bar: ticks its layers (viewLayers.ts) and sets
   * the headline filter to its kind (Overall: all). Only this way round: picking
   * a headline filter by hand never changes the view.
   */
  function chooseView(id: MapViewId) {
    const view = mapViewById(id);
    if (view === undefined || !isViewAvailable(view, loadedMaps) || id === mapView) return;
    setViewState((current) => pressView(current, view, loadedMaps));
    setNewsType(view.newsType ?? 'all');
    // Any heat map answer held now is dropped; Heat loads a fresh one.
    setHeat(null);
    setHeatFailed(false);
  }

  /** A place picked by name (the search box or the ranking list): open it and fly the map there. */
  function pickPlace(picked: Spot) {
    setSpot(picked);
    setPicked(null);
    setFocus(null);
    // `{ ...picked }` makes a copy: a new object, so the map moves even for the same place.
    setGoTo({ ...picked });
    setLocateProblem(null);
  }

  function showOnMap(psgcs: number[]) {
    setFocus({ psgcs });
    // Make sure the dots are on, so the reader sees them (in Overall's ticks too).
    setViewState((current) => turnOnLayer(current, 'news'));
    // On a small screen the map may be scrolled away; bring it back into view.
    document.querySelector('.map-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Keep the address in step with the chosen spot, so it can be copied and
  // shared: /?lat=10.3157&lon=123.8854. `replaceState` changes the address
  // without reloading the page or adding a step to the Back button.
  useEffect(() => {
    const address = new URL(window.location.href);
    if (spot === null) {
      address.searchParams.delete('lat');
      address.searchParams.delete('lon');
    } else {
      // 4 decimals is about 10 metres, plenty for a spot on the map.
      address.searchParams.set('lat', spot.lat.toFixed(4));
      address.searchParams.set('lon', spot.lon.toFixed(4));
    }
    window.history.replaceState(null, '', address);
  }, [spot]);

  // The hazard maps change only when they are loaded again by hand, so ask once.
  // A failure means no hazard tick boxes, nothing worse.
  useEffect(() => {
    fetchHazards()
      .then(setHazards)
      .catch(() => setHazards([]));
  }, []);

  // Load the provinces now, then again every few minutes.
  useEffect(() => {
    async function load() {
      try {
        setProvinces(await fetchProvinces());
        setFailed(false);
      } catch {
        setFailed(true);
      }
      // Asked separately, so one failing does not hide the others.
      try {
        setPlaceScores(await fetchPlaceScores());
      } catch {
        // The map then keeps showing provinces only; the error line above covers a dead server.
      }
      try {
        setQuakes(await fetchQuakes());
        setQuakesFailed(false);
      } catch {
        // The markers keep the last list; the legend says the list could not be loaded.
        setQuakesFailed(true);
      }
      try {
        setFeeds((await fetchStatus()).feeds);
      } catch {
        setFeeds('failed');
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // While Heat is pressed: load the chosen model's answer now, then again every few minutes.
  useEffect(() => {
    if (heatChosen === null) return;
    const model = heatChosen;
    // Review Focus 4: the cleanup below sets this to false when the reader
    // switches source or leaves Heat, so an answer that arrives after
    // that (a slow, older request) is dropped instead of painting the map.
    let stillChosen = true;
    async function load() {
      try {
        const answer = await fetchHeatMap(model);
        if (!stillChosen) return;
        setHeat(answer);
        setHeatFailed(false);
      } catch {
        if (stillChosen) setHeatFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      stillChosen = false;
      clearInterval(timer);
    };
  }, [heatChosen]);

  // What the map colours by: null = the score; stripes while the answer loads.
  // heatForMap also ignores an answer whose model is not the one chosen now.
  // `useMemo` keeps the same object between re-draws, so the map recolours
  // only when the heat map really changes.
  const heatOnMap = useMemo(() => heatForMap(heatChosen, heat), [heatChosen, heat]);

  // The note over the map while the view has nothing (or not all) to show (mapNotes.ts).
  const note = mapNote({
    view: mapView,
    storms,
    stormsFailed,
    feeds,
    stormsTicked: layers.storms,
    surgeTicked: layers.stormSurge,
    zoom: mapZoom,
    surgeMinZoom: HAZARD_MIN_ZOOM.stormSurge,
  });

  // The names of the feeds that are out of date, in the reader's language.
  const staleFeeds = Array.isArray(feeds)
    ? feeds.filter((feed) => feed.isStale).map((feed) => lookup(t.feeds, feed.id))
    : [];

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          {/* A full ladder beside the name; score 100 fills every step. It keeps
              the light colours in both themes, since the bar is dark in both. */}
          <Ladder score={100} theme="light" />
          {APP_NAME}
        </h1>
        <p className="topbar-intro">{t.app.intro}</p>
        <ViewSwitch view={mapView} onPress={chooseView} loadedMaps={loadedMaps} />
        {/* Links that jump down the page on a small screen; `#news-title` is the id of a heading. */}
        <nav className="topbar-jump">
          <a href="#streams-title">{t.app.jumpStreams}</a>
          <a href="#news-title">{t.app.jumpHeadlines}</a>
        </nav>
        <LanguageSwitch />
        <ThemeSwitch />
      </header>

      {failed && (
        <div className="error notice">
          <WarnIcon /> {t.app.loadError}
        </div>
      )}

      {/* Names every feed that is out of date, so old data is never mistaken for calm. */}
      {!failed && feeds === 'failed' && (
        <div className="error notice" role="status">
          <WarnIcon /> {t.app.statusError}
        </div>
      )}
      {Array.isArray(feeds) && staleFeeds.length > 0 && (
        <div className="error notice" role="status">
          <WarnIcon /> {fill(t.app.staleBanner, { feeds: staleFeeds.join(', ') })}
        </div>
      )}

      {/* The columns are placed by CSS (grid areas), so on a small screen the
          map still comes first. */}
      <div className="workspace">
        <main className="map-area">
          <PlaceSearch
            onPick={pickPlace}
            note={
              locateProblem === 'outside'
                ? t.search.locateOutside
                : locateProblem === 'failed'
                  ? t.search.locateFailed
                  : null
            }
          />
          {/* The map plus what floats over it (the heat map panel while Heat is pressed,
              and a note when the pressed view has nothing to show). */}
          <div className="map-frame">
            <ProvinceMap
              data={provinces}
              placeScores={placeScores}
              heat={heatOnMap}
              view={mapView}
              quakes={quakes}
              spot={spot}
              picked={spot === null ? null : picked}
              // Picking a spot clears the headline outline and the old town outline.
              onSelect={(chosen) => {
                setSpot(chosen);
                setPicked(null);
                setFocus(null);
              }}
              layers={layers}
              focus={focus}
              goTo={goTo}
              onLocateResult={setLocateProblem}
              newsType={newsType}
              hazards={hazards}
              onZoom={setMapZoom}
              onStorms={onStorms}
              rain={rain.frame}
            />
            <MapNote note={note} />
            {mapView === 'typhoon' && layers.rainForecast && (
              <RainForecastPanel
                data={rain.data}
                failed={rain.failed}
                index={rain.index}
                onIndex={rain.setIndex}
                playing={rain.playing}
                onPlaying={rain.setPlaying}
              />
            )}
            {mapView === 'heat' && (
              <HeatMapPanel
                chosen={heatModel}
                data={heat !== null && heat.model === heatModel ? heat : null}
                failed={heatFailed}
                onChoose={chooseHeatModel}
                onClose={() => chooseView('overall')}
              />
            )}
          </div>
        </main>

        {/* Under the map on a small screen; bottom of the left column on a wide one. */}
        <Legend
          layers={layers}
          onChange={(next: MapLayers) => setViewState((current) => changeLayers(current, next))}
          newsType={newsType}
          hazards={hazards}
          zoom={mapZoom}
          view={mapView}
          heatModel={heatModel}
          quakes={quakes}
          quakesFailed={quakesFailed}
        />

        <div className="side side-spot">
          {spot !== null ? (
            <StatusCard
              spot={spot}
              onClose={() => setSpot(null)}
              onArea={setPicked}
              view={mapView}
              stormsUnsure={stormsUnsure(stormsFailed, feeds)}
            />
          ) : (
            <SpotHint provinces={provinces} onPick={pickPlace} />
          )}
        </div>

        <div className="side side-feeds">
          <StreamsPanel />
          <NewsPanel provinces={provinces} onShowOnMap={showOnMap} newsType={newsType} onNewsTypeChange={setNewsType} />
        </div>
      </div>

      {/* The notice stays here; the data credits have their own page (CreditsPage.tsx). */}
      <footer>
        <Disclaimer /> <a href="/credits">{t.app.creditsLink}</a>
      </footer>
    </div>
  );
}
