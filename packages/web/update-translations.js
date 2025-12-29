import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of all translation files to update
const localesPath = path.join(__dirname, 'src', 'i18n', 'locales');
const files = ['fr.json', 'de.json', 'he.json', 'it.json', 'ru.json'];

// Translation mappings for each language
const translations = {
  'fr.json': {
    report: "Rapport d'activité",
    sailing: { label: "Voile", hazardous: "Dangereux", hazardousDesc: "Rester au port. Conditions extrêmes.", challenging: "Difficile", challengingDesc: "Marins expérimentés seulement. Mer agitée.", calm: "Calme", calmDesc: "Vents légers. Moteur peut être nécessaire.", good: "Bon", goodDesc: "Conditions de navigation idéales. Vents favorables.", moderate: "Modéré", moderateDesc: "Conditions côtières standard." },
    surf: { label: "Surf", poor: "Mauvais", fair: "Correct", good: "Bon", epic: "Épique" },
    kite: { label: "Kite", optimal: "Optimal", light: "Léger" },
    beach: { label: "Plage", perfect: "Parfait", perfectDesc: "Conditions idéales pour bronzer et se détendre.", poor: "Mauvais", poorDesc: "Précipitations probables. Restez au sec.", windy: "Venteux", windyDesc: "Vents forts soufflant du sable.", chilly: "Frais", chillyDesc: "Apportez un pull. Pas de temps pour nager.", scorching: "Brûlant", scorchingDesc: "Chaleur extrême. Restez hydraté.", roughSurf: "Surf agité", roughSurfDesc: "Baignade non recommandée.", poorRain: "Mauvais (Pluie)", coolCloudy: "Frais et nuageux", cloudy: "Nuageux", cold: "Froid", cool: "Frais", great: "Super" },
    to: "à"
  },
  'de.json': {
    report: "Aktivitätsbericht",
    sailing: { label: "Segeln", hazardous: "Gefährlich", hazardousDesc: "Im Hafen bleiben. Extreme Bedingungen.", challenging: "Herausfordernd", challengingDesc: "Nur erfahrene Segler. Raue See.", calm: "Ruhig", calmDesc: "Leichte Winde. Motor kann benötigt werden.", good: "Gut", goodDesc: "Ideale Segelbedingungen. Günstige Winde.", moderate: "Mäßig", moderateDesc: "Standardmäßige Küstenbedingungen." },
    surf: { label: "Surfen", poor: "Schlecht", fair: "Mäßig", good: "Gut", epic: "Episch" },
    kite: { label: "Kite", optimal: "Optimal", light: "Leicht" },
    beach: { label: "Strandtag", perfect: "Perfekt", perfectDesc: "Ideale Bedingungen zum Sonnenbaden und Entspannen.", poor: "Schlecht", poorDesc: "Niederschlag wahrscheinlich. Bleiben Sie trocken.", windy: "Windig", windyDesc: "Starke Winde blasen Sand.", chilly: "Kühl", chillyDesc: "Bringen Sie einen Pullover mit. Kein Schwimmwetter.", scorching: "Brütend heiß", scorchingDesc: "Extreme Hitze. Bleiben Sie hydriert.", roughSurf: "Raue Brandung", roughSurfDesc: "Schwimmen nicht empfohlen.", poorRain: "Schlecht (Regen)", coolCloudy: "Kühl und bewölkt", cloudy: "Bewölkt", cold: "Kalt", cool: "Kühl", great: "Großartig" },
    to: "bis"
  },
  'he.json': {
    report: "דוח פעילות",
    sailing: { label: "שייט", hazardous: "מסוכן", hazardousDesc: "הישארו בנמל. תנאים קיצוניים.", challenging: "מאתגר", challengingDesc: "מלחים מנוסים בלבד. ים סוער.", calm: "שקט", calmDesc: "רוחות קלות. מנוע עשוי להידרש.", good: "טוב", goodDesc: "תנאי שייט אידיאליים. רוחות נוחות.", moderate: "מתון", moderateDesc: "תנאי חוף סטנדרטיים." },
    surf: { label: "גלישה", poor: "גרוע", fair: "בינוני", good: "טוב", epic: "אפי" },
    kite: { label: "עפיפון", optimal: "אופטימלי", light: "קל" },
    beach: { label: "יום חוף", perfect: "מושלם", perfectDesc: "תנאים אידיאליים לשיזוף ורגיעה.", poor: "גרוע", poorDesc: "גשם צפוי. הישארו יבשים.", windy: "סוער", windyDesc: "רוחות חזקות מנשבות חול.", chilly: "קריר", chillyDesc: "הביאו סוודר. לא מזג אוויר לשחייה.", scorching: "לוהט", scorchingDesc: "חום קיצוני. הישארו מצוננים.", roughSurf: "גלישה סוערת", roughSurfDesc: "שחייה לא מומלצת.", poorRain: "גרוע (גשם)", coolCloudy: "קריר ומעונן", cloudy: "מעונן", cold: "קר", cool: "קריר", great: "מעולה" },
    to: "עד"
  },
  'it.json': {
    report: "Rapporto attività",
    sailing: { label: "Vela", hazardous: "Pericoloso", hazardousDesc: "Rimanere in porto. Condizioni estreme.", challenging: "Impegnativo", challengingDesc: "Solo marinai esperti. Mare mosso.", calm: "Calmo", calmDesc: "Venti leggeri. Potrebbe essere necessario il motore.", good: "Buono", goodDesc: "Condizioni di navigazione ideali. Venti favorevoli.", moderate: "Moderato", moderateDesc: "Condizioni costiere standard." },
    surf: { label: "Surf", poor: "Scarso", fair: "Discreto", good: "Buono", epic: "Epico" },
    kite: { label: "Kite", optimal: "Ottimale", light: "Leggero" },
    beach: { label: "Giornata in spiaggia", perfect: "Perfetto", perfectDesc: "Condizioni ideali per abbronzarsi e rilassarsi.", poor: "Scarso", poorDesc: "Precipitazioni probabili. Rimanere asciutti.", windy: "Ventoso", windyDesc: "Forti venti che sollevano sabbia.", chilly: "Fresco", chillyDesc: "Portare un maglione. Non tempo per nuotare.", scorching: "Rovente", scorchingDesc: "Caldo estremo. Rimanere idratati.", roughSurf: "Surf mosso", roughSurfDesc: "Nuoto sconsigliato.", poorRain: "Scarso (Pioggia)", coolCloudy: "Fresco e nuvoloso", cloudy: "Nuvoloso", cold: "Freddo", cool: "Fresco", great: "Ottimo" },
    to: "a"
  },
  'ru.json': {
    report: "Отчет об активности",
    sailing: { label: "Парусный спорт", hazardous: "Опасно", hazardousDesc: "Оставайтесь в порту. Экстремальные условия.", challenging: "Сложно", challengingDesc: "Только для опытных моряков. Штормовое море.", calm: "Спокойно", calmDesc: "Слабые ветры. Может потребоваться мотор.", good: "Хорошо", goodDesc: "Идеальные условия для плавания. Попутный ветер.", moderate: "Умеренно", moderateDesc: "Стандартные прибрежные условия." },
    surf: { label: "Сёрфинг", poor: "Плохо", fair: "Удовлетворительно", good: "Хорошо", epic: "Эпично" },
    kite: { label: "Кайт", optimal: "Оптимально", light: "Лёгкий" },
    beach: { label: "Пляжный день", perfect: "Отлично", perfectDesc: "Идеальные условия для загара и отдыха.", poor: "Плохо", poorDesc: "Вероятны осадки. Оставайтесь сухими.", windy: "Ветрено", windyDesc: "Сильные ветры поднимают песок.", chilly: "Прохладно", chillyDesc: "Возьмите свитер. Не для купания.", scorching: "Жарко", scorchingDesc: "Экстремальная жара. Поддерживайте гидратацию.", roughSurf: "Бурный прибой", roughSurfDesc: "Плавание не рекомендуется.", poorRain: "Плохо (Дождь)", coolCloudy: "Прохладно и облачно", cloudy: "Облачно", cold: "Холодно", cool: "Прохладно", great: "Отлично" },
    to: "до"
  }
};

files.forEach(filename => {
  const filePath = path.join(localesPath, filename);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Update the activity section with nested structure
  const langData = translations[filename];
  data.activity = {
    report: langData.report,
    sailing: langData.sailing,
    surf: langData.surf,
    kite: langData.kite,
    beach: langData.beach
  };

  // Update seaState to add "to"
  if (data.seaState) {
    data.seaState.to = langData.to;
  }

  // Update directions to use lowercase keys
  if (data.directions) {
    const dirs = data.directions;
    data.directions = {
      north: dirs.north,
      northeast: dirs.northEast || dirs.northeast,
      east: dirs.east,
      southeast: dirs.southEast || dirs.southeast,
      south: dirs.south,
      southwest: dirs.southWest || dirs.southwest,
      west: dirs.west,
      northwest: dirs.northWest || dirs.northwest,
      northerly: dirs.northerly,
      northeasterly: dirs.northEasterly || dirs.northeasterly,
      easterly: dirs.easterly,
      southeasterly: dirs.southEasterly || dirs.southeasterly,
      southerly: dirs.southerly,
      southwesterly: dirs.southWesterly || dirs.southwesterly,
      westerly: dirs.westerly,
      northwesterly: dirs.northWesterly || dirs.northwesterly
    };
  }

  // Add missing weather keys
  if (data.weather) {
    data.weather.swellHeight = data.weather.swellHeight || data.weather.swell;
    data.weather.swellPeriod = data.weather.swellPeriod || data.weather.period;
    data.weather.wavePeriod = data.weather.wavePeriod || data.weather.period;
    data.weather.feelsLike = data.weather.feelsLike || data.weather.feels || "Feels Like";
    data.weather.currentUV = data.weather.currentUV || "Current UV";
    data.weather.height = data.weather.height || "Height";
  }

  // Add missing forecast keys
  if (data.forecast) {
    data.forecast.tideSchedule = data.forecast.tideSchedule || data.forecast.tideForecast;
    data.forecast.tideHeight = data.forecast.tideHeight || "Tide Height";
  }

  // Add missing table keys
  if (data.table) {
    data.table.seaState = data.table.seaState || data.table.seaStatus;
    data.table.swell = data.table.swell || "Swell";
  }

  // Add missing common keys
  if (data.common) {
    data.common.marineWeather = data.common.marineWeather || "Marine Weather";
    data.common.noData = data.common.noData || "No weather data available.";
  }

  // Add settings section if missing
  if (!data.settings) {
    data.settings = {
      alertConfig: data.dashboard?.alertConfig || "Alert Config",
      alertConfiguration: data.dashboard?.alertConfiguration || "Alert Configuration",
      waveThreshold: "Wave Threshold",
      windThreshold: "Wind Threshold",
      swellThreshold: "Swell Threshold",
      tsunamiSimulation: data.dashboard?.tsunamiSimulation || "Tsunami Alert Simulation"
    };
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${filename}`);
});

console.log('All translation files updated!');
