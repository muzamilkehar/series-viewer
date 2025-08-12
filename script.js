// ===== CONFIG =====
const OMDB_API_KEY = '521d07c2';
const TMDB_API_KEY = 'fc784221e04b024bef00945308b0c4da';
const OMDB_BASE = 'https://www.omdbapi.com/';
const TMDB_TREND_URL = `https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_API_KEY}`;
const TMDB_MOVIE_TREND_URL = `https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`;
const TMDB_SERIES_TREND_URL = `https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`;

// ===== For automatic adding new year in footer //
document.getElementById('year').textContent = new Date().getFullYear();

// ===== DOM =====
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchSpinner = document.getElementById('searchSpinner');
const resultsContainer = document.getElementById('resultsContainer');
const messageEl = document.getElementById('message');
const loadMoreBtn = document.getElementById('loadMoreBtn'); // ensure present in HTML

const modal = document.getElementById('detailsModal');
const modalClose = document.getElementById('modalClose');
const modalPoster = document.getElementById('modalPoster');
const modalTitle = document.getElementById('modalTitle');
const modalPlot = document.getElementById('modalPlot');
const modalMeta = document.getElementById('modalMeta');
const chartSpinner = document.getElementById('chartSpinner');
const ratingsCanvas = document.getElementById('ratingsChart');

let chartInstance = null;
let epImdbMap = [];
let currentSection = 'home'; // 'home' | 'movies' | 'series'

// ===== UTIL =====
function placeholderPoster(){ return 'https://via.placeholder.com/400x600?text=No+Image'; }
function setLoading(val, text='') {
  if (searchBtn) searchBtn.disabled = val;
  if (val) { if (searchSpinner) searchSpinner.classList.remove('hidden'); if (messageEl) messageEl.textContent = text; }
  else { if (searchSpinner) searchSpinner.classList.add('hidden'); if (messageEl) messageEl.textContent = ''; }
}
function escapeHtml(s){ return s ? String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;') : ''; }
function quickPlaceholderGrid(count=12, append=false){
  if (!append) resultsContainer.innerHTML = '';
  for(let i=0;i<count;i++){
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div style="height:220px" class="skeleton"></div>
                     <div style="padding:10px">
                       <div class="skeleton" style="height:16px;width:70%;margin:8px auto"></div>
                       <div class="skeleton" style="height:12px;width:40%;margin:4px auto"></div>
                     </div>`;
    resultsContainer.appendChild(div);
  }
}

// Helper: ensure chart wrapper exists (chart-container) - create if missing
function ensureChartWrapper() {
  const parent = ratingsCanvas.parentElement;
  if (!parent) return ratingsCanvas;
  if (parent.classList.contains('chart-container')) return ratingsCanvas;
  // create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  // insert wrapper before canvas and move canvas into it
  parent.insertBefore(wrapper, ratingsCanvas);
  wrapper.appendChild(ratingsCanvas);
  return ratingsCanvas;
}

// ===== FETCH OMDb by a title (safe) =====
async function fetchOmdbByTitle(title, typeHint='') {
  if (!title) return null;
  // try by title and optional type hint
  const url = `${OMDB_BASE}?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}${typeHint ? `&type=${typeHint}` : ''}&plot=short`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    return j && j.Response === 'True' ? j : null;
  } catch (e) { return null; }
}

// ===== TRENDING LOADERS =====
async function loadTrending(type='all', append=false){
  if (!append) resultsContainer.innerHTML = '';
  quickPlaceholderGrid(append ? 6 : 18);
  setLoading(true, 'Loading trending...');
  try {
    let url = TMDB_TREND_URL;
    if(type === 'movie') url = TMDB_MOVIE_TREND_URL;
    if(type === 'series') url = TMDB_SERIES_TREND_URL;

    const res = await fetch(url);
    const data = await res.json();
    if (!data?.results?.length) { resultsContainer.innerHTML = '<p class="muted">No trending found.</p>'; setLoading(false); return; }

    // fetch top 24 items and map in parallel to OMDb
    const slice = data.results.slice(0, 24);
    const omdbPromises = slice.map(it => {
      const title = (it.media_type === 'movie') ? it.title : (it.name || it.title || '');
      const typeHint = (it.media_type === 'movie') ? 'movie' : 'series';
      return fetchOmdbByTitle(title, typeHint);
    });

    const omdbList = (await Promise.all(omdbPromises)).filter(Boolean);
    if (!omdbList.length) { resultsContainer.innerHTML = '<p class="muted">No results from OMDb.</p>'; setLoading(false); return; }
    displayResults(omdbList, append);
  } catch (e) {
    console.error(e);
    resultsContainer.innerHTML = '<p class="muted">Failed to load trending.</p>';
  } finally { setLoading(false); }
}

// ===== RANDOM MOVIE/SERIES LOADERS =====
async function fetchRandomFromTMDB(type='movie', count=6) {
  const page = Math.max(1, Math.floor(Math.random() * 50) + 1);
  const tmdbUrl = type === 'movie'
    ? `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&page=${page}`
    : `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&page=${page}`;

  try {
    const res = await fetch(tmdbUrl);
    const data = await res.json();
    if (!data?.results?.length) return [];
    const slice = data.results.slice(0, count);
    const omdbPromises = slice.map(it => {
      const title = type === 'movie' ? it.title : (it.name || it.original_name || '');
      return fetchOmdbByTitle(title, type === 'movie' ? 'movie' : 'series');
    });
    return (await Promise.all(omdbPromises)).filter(Boolean);
  } catch (e) {
    console.error('fetchRandomFromTMDB error', e);
    return [];
  }
}

async function loadRandomMovies(count=12, append=false) {
  if (!append) resultsContainer.innerHTML = '';
  quickPlaceholderGrid(Math.min(count, 8), append); // small placeholder if appending
  const movies = await fetchRandomFromTMDB('movie', count);
  displayResults(movies, append);
}

async function loadRandomSeries(count=12, append=false) {
  if (!append) resultsContainer.innerHTML = '';
  quickPlaceholderGrid(Math.min(count, 8), append);
  const series = await fetchRandomFromTMDB('series', count);
  displayResults(series, append);
}

async function loadRandomMixed(count=12, append=false) {
  if (!append) resultsContainer.innerHTML = '';
  quickPlaceholderGrid(Math.min(count, 8), append);
  // split roughly half-half
  const half = Math.ceil(count/2);
  const [movies, series] = await Promise.all([
    fetchRandomFromTMDB('movie', half),
    fetchRandomFromTMDB('series', count - half)
  ]);
  const combined = [...movies, ...series].filter(Boolean);
  // shuffle combined results
  combined.sort(() => Math.random() - 0.5);
  displayResults(combined, append);
}

// ===== DISPLAY RESULTS =====
function displayResults(list, append=false){
  if (!append) resultsContainer.innerHTML = '';
  list.forEach(item => {
    const poster = (item.Poster && item.Poster !== 'N/A') ? item.Poster : placeholderPoster();
    const card = document.createElement('div');
    card.className = 'card';
    // attach imdbID as dataset to be safe
    const imdbID = item.imdbID || item.imdbid || '';
    card.innerHTML = `
      <img src="${escapeHtml(poster)}" alt="${escapeHtml(item.Title)} poster">
      <div class="card__title">${escapeHtml(item.Title)}</div>
      <div class="card__sub">${escapeHtml(item.Year || '')} • ${escapeHtml(item.Type || '')}</div>
    `;
    card.addEventListener('click', () => openModalFor(imdbID));
    resultsContainer.appendChild(card);
  });
}

// ===== SEARCH =====
async function doSearch(q){
  resultsContainer.innerHTML = '';
  quickPlaceholderGrid(12);
  setLoading(true, `Searching "${q}"...`);
  try {
    const res = await fetch(`${OMDB_BASE}?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data || data.Response !== 'True' || !data.Search) { resultsContainer.innerHTML = `<p class="muted">No results for "${escapeHtml(q)}".</p>`; return; }
    // fetch details (parallel)
    const details = await Promise.all(data.Search.map(hit =>
      fetch(`${OMDB_BASE}?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(hit.imdbID)}&plot=short`)
        .then(r=>r.json()).catch(()=>null)
    ));
    displayResults(details.filter(d => d && d.Response === 'True'));
  } catch (e) {
    console.error(e);
    resultsContainer.innerHTML = '<p class="muted">Search failed.</p>';
  } finally { setLoading(false); }
}

// ===== SEARCH EVENTS =====
if (searchBtn) searchBtn.addEventListener('click', ()=>{ const q = (searchInput && searchInput.value || '').trim(); if(q) doSearch(q); });
if (searchInput) searchInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { e.preventDefault(); const q = (searchInput.value||'').trim(); if(q) doSearch(q); } });

// ===== NAV (requires navHome/navMovies/navSeries in HTML) =====
const navHome = document.getElementById('navHome');
const navMovies = document.getElementById('navMovies');
const navSeries = document.getElementById('navSeries');
if (navHome) navHome.addEventListener('click', ()=> { currentSection='home'; loadRandomMixed(); });
if (navMovies) navMovies.addEventListener('click', ()=> { currentSection='movies'; loadRandomMovies(); });
if (navSeries) navSeries.addEventListener('click', ()=> { currentSection='series'; loadRandomSeries(); });

// ===== LOAD MORE behavior (button required in HTML) =====
if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => {
  if (currentSection === 'home') {
    loadRandomMixed(8, true);
  } else if (currentSection === 'movies') {
    loadRandomMovies(8, true);
  } else if (currentSection === 'series') {
    loadRandomSeries(8, true);
  }
});

// ===== MODAL and CHART HANDLERS =====
if (modalClose) modalClose.addEventListener('click', closeModal);
window.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeModal(); });

function showModal(){ if (!modal) return; modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
function closeModal(){ if (!modal) return; modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow='auto'; if(chartInstance){ chartInstance.destroy(); chartInstance=null; } epImdbMap=[]; }

// Open modal and fetch details
function openModalFor(imdbID){
  if(!imdbID) return;
  if (modalPoster) modalPoster.src = placeholderPoster();
  if (modalTitle) modalTitle.textContent = 'Loading...';
  if (modalPlot) modalPlot.textContent = '';
  if (modalMeta) modalMeta.textContent = '';
  showModal();
  if (chartSpinner) chartSpinner.classList.remove('hidden');
  fetchDetailsAndBuild(imdbID);
}

async function fetchDetailsAndBuild(imdbID){
  try {
    const detRes = await fetch(`${OMDB_BASE}?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(imdbID)}&plot=full`);
    const details = await detRes.json();
    if(!details || details.Response==='False'){ if (modalTitle) modalTitle.textContent='Details unavailable'; if (chartSpinner) chartSpinner.classList.add('hidden'); return; }

    if (modalPoster) modalPoster.src = (details.Poster && details.Poster!=='N/A')?details.Poster:placeholderPoster();
    if (modalTitle) modalTitle.textContent = `${details.Title} ${details.Type?`(${details.Type})`:''}`;
    if (modalPlot) modalPlot.textContent = details.Plot || '';
    if (modalMeta) modalMeta.textContent = `${details.Genre || ''} • ${details.Year || ''} • IMDb: ${details.imdbRating || 'N/A'}`;

    if(details.Type === 'series'){
      await buildSeriesEpisodeChart(details);
    } else {
      buildMovieChart(details);
    }
  } catch(e){
    console.error(e);
    if (modalTitle) modalTitle.textContent = 'Failed to load details';
  } finally {
    if (chartSpinner) chartSpinner.classList.add('hidden');
  }
}

// ===== EPISODE chart (fetch seasons in parallel, sort) =====
async function buildSeriesEpisodeChart(details){
  epImdbMap = [];
  const totalSeasons = parseInt(details.totalSeasons,10) || 0;
  if(!totalSeasons){ renderBarChart(['No seasons'],[null], details.Title); return; }

  // fetch all seasons in parallel
  const seasonPromises = [];
  for(let s=1;s<=totalSeasons;s++){
    seasonPromises.push(fetch(`${OMDB_BASE}?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(details.imdbID)}&Season=${s}`)
      .then(r=>r.json()).catch(()=>null));
  }
  const seasons = await Promise.all(seasonPromises);

  // collect episodes
  const episodes = [];
  seasons.forEach((sd, idx) => {
    const sNum = idx + 1;
    if (sd && sd.Response === 'True' && Array.isArray(sd.Episodes)) {
      sd.Episodes.forEach((epObj, epIndex) => {
        // attempt numeric episode; fallback to index+1
        let eNum = parseInt(epObj.Episode, 10);
        if (!Number.isFinite(eNum)) eNum = epIndex + 1;
        episodes.push({
          season: sNum,
          episode: eNum,
          label: `S${sNum}E${eNum}`,
          rating: (epObj.imdbRating && epObj.imdbRating !== 'N/A') ? Number(epObj.imdbRating) : null,
          imdbID: epObj.imdbID || null
        });
      });
    }
  });

  // stable sort by season then episode
  episodes.sort((a,b) => (a.season - b.season) || (a.episode - b.episode));

  const labels = episodes.map(x => x.label);
  const values = episodes.map(x => x.rating);
  epImdbMap = episodes.map(x => x.imdbID || null);

  renderBarChart(labels, values, details.Title);
}

function buildMovieChart(details){
  const label = details.Title || 'Movie';
  const rating = (details.imdbRating && details.imdbRating!=='N/A') ? Number(details.imdbRating) : null;
  renderBarChart([label], [rating], details.Title);
}

// ===== COLORS (rating thresholds) =====
function getBarColor(v){
  if(v === null || v === undefined) return 'rgba(120,120,120,0.45)';
  if(v >= 9) return '#006400';       // dark green
  if(v >= 8) return '#228B22';       // green
  if(v >= 7) return '#FFD700';       // yellow
  if(v >= 5 && v < 7) return '#FF4500'; // orange/red
  return '#800080';                  // purple
}

// ===== VALUE LABEL PLUGIN =====
const valueLabelPlugin = {
  id: 'valueLabelPlugin',
  afterDatasetsDraw(chart){
    const ctx = chart.ctx;
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar, i) => {
        const val = dataset.data[i];
        const text = (val === null || val === undefined) ? 'N/A' : String(val);
        ctx.save();
        ctx.fillStyle = '#fff';
        // slightly larger font for readability
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        // bar.x/y provided by chartjs are in device-independent coordinates
        ctx.fillText(text, bar.x, bar.y - 6);
        ctx.restore();
      });
    });
  }
};

// ===== RENDER BAR CHART (auto width & scroll, crisp) =====
function renderBarChart(labels, dataValues, title=''){
  // destroy previous
  if (chartInstance) {
    try { chartInstance.destroy(); } catch(e) {}
    chartInstance = null;
  }

  // ensure wrapper presence
  ensureChartWrapper();
  const wrapper = ratingsCanvas.parentElement; // chart-container
  const chartArea = ratingsCanvas.closest('.chart-area') || wrapper.parentElement || document.body;

  const minBarWidth = 60; // px per bar - adjust to taste
  const totalWidthPx = Math.max(labels.length * minBarWidth, 400);

  // decide wrapper width vs viewport: if totalWidth < available width, use full width (no scroll)
  const available = (chartArea && chartArea.clientWidth) ? chartArea.clientWidth : Math.min(window.innerWidth, 1000);
  if (totalWidthPx <= available) {
    wrapper.style.width = '100%';
    wrapper.style.overflowX = 'hidden';
    ratingsCanvas.style.width = '100%';
  } else {
    wrapper.style.width = `${totalWidthPx}px`;
    wrapper.style.overflowX = 'auto';
    ratingsCanvas.style.width = '100%';
  }

  // fixed height
  const displayHeight = 420;
  ratingsCanvas.style.height = `${displayHeight}px`;

  // chart config: responsive true so Chart.js will use wrapper's computed width
  const bg = dataValues.map(v => getBarColor(v));

  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'IMDb Rating',
        data: dataValues,
        backgroundColor: bg,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              return v === null || v === undefined ? 'Rating: N/A' : `Rating: ${v}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color:'#dcdcdc', autoSkip: false, maxRotation: 90, minRotation: 45, font:{size:11} },
          grid: { display: false }
        },
        y: {
          suggestedMin: 0,
          suggestedMax: 10,
          ticks: { color:'#dcdcdc' },
          title: { display: true, text: 'Rating' }
        }
      },
      onClick: (ev, elems) => {
        if (!elems.length) return;
        const idx = elems[0].index;
        const imdb = (epImdbMap && epImdbMap[idx]) ? epImdbMap[idx] : null;
        if (imdb) window.open(`https://www.imdb.com/title/${imdb}/`, '_blank');
      }
    },
    plugins: [valueLabelPlugin]
  };

  chartInstance = new Chart(ratingsCanvas.getContext('2d'), cfg);

  // small improvement: ensure wrapper shows horizontal scrollbar when needed
  wrapper.style.overflowX = (wrapper.scrollWidth > wrapper.clientWidth) ? 'auto' : 'hidden';
}

// ===== START =====
document.addEventListener('DOMContentLoaded', ()=>{
  // default: Home shows mixed trending (you can change to loadTrending if you prefer TMDB trending)
  currentSection = 'home';
  loadRandomMixed(12, false);
});

