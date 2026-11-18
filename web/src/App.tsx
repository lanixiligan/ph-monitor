// The whole page: a top bar, then three columns: on the left the panel for
// the clicked spot with the map legend under it (the legend can fold away),
// the map in the middle, and the live news and headlines on the right.
// The bottom line holds the "not official" notice and a link to the credits page.

import { useEffect, useState } from 'react';
import { APP_NAME } from '@ph-monitor/shared';
import type { FeedHealth, PlaceScores } from '@ph-monitor/shared';
import { fetchPlaceScores, fetchProvinces, fetchStatus } from './api.ts';
import type { ProvinceCollection, Spot } from './api.ts';
import { Disclaimer } from './components/Disclaimer.tsx';
import { Legend } from './components/Legend.tsx';
import { NewsPanel } from './components/NewsPanel.tsx';
import { PlaceSearch } from './components/PlaceSearch.tsx';
import { ProvinceMap } from './components/ProvinceMap.tsx';
import { Ladder } from './components/Ladder.tsx';
import { SpotHint } from './components/SpotHint.tsx';
import { StatusCard } from './components/StatusCard.tsx';
import type { PickedArea } from './components/StatusCard.tsx';
import { StreamsPanel } from './components/StreamsPanel.tsx';
import { WarnIcon } from './components/WarnIcon.tsx';
import { fill, LanguageSwitch, lookup, useStrings } from './i18n/index.ts';
import { ALL_LAYERS_ON } from './mapSettings.ts';
import { ThemeSwitch } from './theme/index.ts';

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
  // Which map layers the legend's tick boxes have switched on.
  const [layers, setLayers] = useState(ALL_LAYERS_ON);
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
    // Make sure the dots are on, so the reader sees them.
    setLayers((current) => ({ ...current, news: true }));
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
        setFeeds((await fetchStatus()).feeds);
      } catch {
        setFeeds('failed');
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

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
          <ProvinceMap
            data={provinces}
            placeScores={placeScores}
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
          />
        </main>

        {/* Under the map on a small screen; bottom of the left column on a wide one. */}
        <Legend layers={layers} onChange={setLayers} newsType={newsType} />

        <div className="side side-spot">
          {spot !== null ? (
            <StatusCard spot={spot} onClose={() => setSpot(null)} onArea={setPicked} />
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
