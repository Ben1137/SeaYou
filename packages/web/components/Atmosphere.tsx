
import React, { useMemo } from 'react';
import { MarineWeatherData } from '@seame/core';
import { 
  Wind, Navigation, Sun, Moon, Eye, Droplets, 
  Gauge, Thermometer, Sunrise, Sunset, Cloud, ArrowUp, ArrowDown 
} from 'lucide-react';
import { format, parseISO, differenceInMinutes, startOfDay, addDays } from 'date-fns';

interface AtmosphereProps {
  weatherData: MarineWeatherData | null;
}

const Atmosphere: React.FC<AtmosphereProps> = ({ weatherData }) => {
  
  if (!weatherData || !weatherData.general || !weatherData.current) return null;
  const { general, current } = weatherData;

  // --- Sun Cycle Calculation ---
  const now = new Date();
  const sunrise = new Date(general.sunrise);
  const sunset = new Date(general.sunset);
  
  const dayDuration = differenceInMinutes(sunset, sunrise);
  const timeSinceSunrise = differenceInMinutes(now, sunrise);
  let sunProgress = 0;
  
  if (timeSinceSunrise < 0) sunProgress = 0; // Before sunrise
  else if (timeSinceSunrise > dayDuration) sunProgress = 100; // After sunset
  else sunProgress = (timeSinceSunrise / dayDuration) * 100;

  // --- Moon Cycle Calculation (Animation Position) ---
  let moonProgress = -1; // -1 means moon is not visible/not calculated for arc
  
  if (general.moonrise && general.moonset) {
      const moonrise = new Date(general.moonrise);
      const moonset = new Date(general.moonset);
      
      // Handle day crossing for moon (if set is before rise, it sets the next day)
      let effectiveMoonset = moonset;
      if (moonset < moonrise) effectiveMoonset = addDays(moonset, 1);
      
      // If now is between rise and set
      if (now >= moonrise && now <= effectiveMoonset) {
          const moonDuration = differenceInMinutes(effectiveMoonset, moonrise);
          const timeSinceMoonrise = differenceInMinutes(now, moonrise);
          moonProgress = (timeSinceMoonrise / moonDuration) * 100;
      }
  }

  // --- Pressure Scale ---
  const pressure = general.pressure;
  const pressurePercent = Math.min(100, Math.max(0, ((pressure - 980) / (1040 - 980)) * 100));
  let pressureLabel = "Normal";
  if (pressure < 1005) pressureLabel = "Low System";
  if (pressure > 1022) pressureLabel = "High Pressure";

  return (
    <div className="p-4 space-y-6 max-w-7xl mx-auto pb-24">
      
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Cloud className="text-blue-400" /> Atmosphere
        </h1>
        <p className="text-slate-400 text-sm">
          Astronomical cycles and detailed atmospheric conditions.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* --- SOLAR & LUNAR CYCLE --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden flex flex-col justify-between">
           <h2 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
             <Sun size={16} className="text-yellow-500" /> Solar Cycle
           </h2>

           {/* Sun Arc Animation */}
           <div className="relative h-24 mb-6">
              {/* Arc Line */}
              <div className="absolute bottom-0 left-0 right-0 h-24 border-t-2 border-l-2 border-r-2 border-slate-700 rounded-t-full opacity-30"></div>
              
              {/* Sun Icon Moving on Arc */}
              <div 
                className="absolute w-8 h-8 text-yellow-400 transition-all duration-1000 ease-out z-10"
                style={{
                    left: `${sunProgress}%`,
                    bottom: `${Math.sin((sunProgress / 100) * Math.PI) * 100}%`,
                    transform: 'translate(-50%, 50%)',
                    opacity: sunProgress > 0 && sunProgress < 100 ? 1 : 0.3
                }}
              >
                 <Sun size={32} fill="currentColor" className="animate-pulse shadow-yellow-500 drop-shadow-lg" />
              </div>
              
              {/* Time Labels */}
              <div className="absolute bottom-[-20px] left-0 text-xs text-slate-500 flex flex-col items-center">
                 <Sunrise size={16} />
                 <span>{format(sunrise, 'HH:mm')}</span>
              </div>
              <div className="absolute bottom-[-20px] right-0 text-xs text-slate-500 flex flex-col items-center">
                 <Sunset size={16} />
                 <span>{format(sunset, 'HH:mm')}</span>
              </div>
           </div>

           {/* Moon Arc Animation */}
           <div className="border-t border-slate-800 pt-6 mt-4">
               <h2 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                 <Moon size={16} className="text-slate-300" /> Lunar Cycle
               </h2>
               
               <div className="relative h-24 mb-2">
                  {/* Arc Line (Dashed for Moon) */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 border-t-2 border-l-2 border-r-2 border-slate-600 border-dashed rounded-t-full opacity-30"></div>
                  
                  {/* Moon Icon Moving on Arc */}
                  {moonProgress >= 0 ? (
                      <div 
                        className="absolute w-6 h-6 text-slate-200 transition-all duration-1000 ease-out z-10"
                        style={{
                            left: `${moonProgress}%`,
                            bottom: `${Math.sin((moonProgress / 100) * Math.PI) * 100}%`,
                            transform: 'translate(-50%, 50%)'
                        }}
                      >
                         <Moon size={24} fill="currentColor" className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                      </div>
                  ) : (
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10px] text-slate-600 uppercase font-bold tracking-widest bg-slate-900 px-2">
                          Moon Down
                      </div>
                  )}
                  
                  {/* Time Labels */}
                  <div className="absolute bottom-[-20px] left-0 text-xs text-slate-500 flex flex-col items-center">
                     <span className="text-[10px] uppercase flex items-center gap-1"><ArrowUp size={10}/> Rise</span>
                     <span className="font-mono">{general.moonrise ? format(parseISO(general.moonrise), 'HH:mm') : '--:--'}</span>
                  </div>
                  <div className="absolute bottom-[-20px] right-0 text-xs text-slate-500 flex flex-col items-center">
                     <span className="text-[10px] uppercase flex items-center gap-1"><ArrowDown size={10}/> Set</span>
                     <span className="font-mono">{general.moonset ? format(parseISO(general.moonset), 'HH:mm') : '--:--'}</span>
                  </div>
               </div>
           </div>

           <div className="bg-slate-950/50 rounded-lg p-3 mt-8 grid grid-cols-2 gap-4 border border-slate-800">
               {/* Moon Phase Details */}
               <div className="flex items-center gap-3">
                   <div className="relative">
                       <Moon size={32} className="text-slate-200" />
                       {/* Simple overlay to simulate phase visually if possible, otherwise rely on text */}
                       <div className="absolute inset-0 bg-slate-950/60 rounded-full mix-blend-multiply" style={{ width: `${100 - general.moonIllumination}%`, marginLeft: 'auto' }}></div> 
                   </div>
                   <div>
                       <div className="text-[10px] text-slate-500 uppercase">Phase</div>
                       <div className="text-white text-sm font-bold">{general.moonPhase}</div>
                       <div className="text-[10px] text-blue-400">{general.moonIllumination}% Illumination</div>
                   </div>
               </div>
               
               <div className="text-right flex flex-col justify-center">
                   <div className="text-[10px] text-slate-500 uppercase">Next Full Moon</div>
                   <div className="text-white text-sm font-mono">
                     {general.nextFullMoon ? format(parseISO(general.nextFullMoon), 'dd MMM') : '--'}
                   </div>
               </div>
           </div>
        </div>

        {/* --- WIND & GUSTS --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative">
            <h2 className="text-sm font-bold text-slate-400 uppercase mb-6 flex items-center gap-2">
             <Wind size={16} className="text-cyan-400" /> Wind Dynamics
           </h2>
           
           <div className="flex items-center justify-around">
               {/* Compass */}
               <div className="relative w-32 h-32 border-4 border-slate-800 rounded-full flex items-center justify-center bg-slate-950 shadow-inner">
                   <div className="absolute top-1 text-[10px] font-bold text-slate-600">N</div>
                   <div className="absolute bottom-1 text-[10px] font-bold text-slate-600">S</div>
                   <div className="absolute left-1 text-[10px] font-bold text-slate-600">W</div>
                   <div className="absolute right-1 text-[10px] font-bold text-slate-600">E</div>
                   
                   {/* Animated Arrow */}
                   <div 
                     className="transition-transform duration-1000 ease-out"
                     style={{ transform: `rotate(${current.windDirection}deg)` }}
                   >
                      <Navigation size={48} className="text-cyan-500 fill-cyan-500/20" />
                   </div>
               </div>

               {/* Metrics */}
               <div className="space-y-4">
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 w-36">
                      <div className="text-xs text-slate-400 mb-1">Wind Speed</div>
                      <div className="text-3xl font-bold text-white">{current.windSpeed.toFixed(1)} <span className="text-sm text-slate-500">km/h</span></div>
                  </div>
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 w-36">
                      <div className="text-xs text-slate-400 mb-1">Gusts</div>
                      <div className="text-3xl font-bold text-purple-400">{current.windGusts.toFixed(1)} <span className="text-sm text-slate-500">km/h</span></div>
                  </div>
               </div>
           </div>
           <div className="text-center mt-6 text-xs text-slate-500">
               Current Direction: <span className="text-white font-bold">{current.windDirection}°</span>
           </div>
        </div>

        {/* --- ATMOSPHERIC METRICS --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:col-span-2">
           <h2 className="text-sm font-bold text-slate-400 uppercase mb-6 flex items-center gap-2">
             <Gauge size={16} className="text-teal-400" /> Atmospheric Conditions
           </h2>

           <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
               
               {/* Visibility */}
               <div className="flex flex-col items-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                   <Eye size={24} className="text-blue-400 mb-2" />
                   <div className="text-xs text-slate-500 uppercase">Visibility</div>
                   <div className="text-2xl font-bold text-white mt-1">{(general.visibility / 1000).toFixed(1)} <span className="text-sm">km</span></div>
                   <div className="text-[10px] text-green-400 mt-1">
                      {general.visibility > 9000 ? 'Clear View' : 'Reduced Haze'}
                   </div>
               </div>

               {/* Humidity */}
               <div className="flex flex-col items-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                   <Droplets size={24} className="text-blue-500 mb-2" />
                   <div className="text-xs text-slate-500 uppercase">Humidity</div>
                   <div className="text-2xl font-bold text-white mt-1">{general.humidity}%</div>
                   <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                       <div className="bg-blue-500 h-full" style={{ width: `${general.humidity}%` }}></div>
                   </div>
               </div>

               {/* Pressure */}
               <div className="flex flex-col items-center p-4 bg-slate-950 rounded-xl border border-slate-800 col-span-2 md:col-span-1">
                   <Gauge size={24} className="text-orange-400 mb-2" />
                   <div className="text-xs text-slate-500 uppercase">Pressure</div>
                   <div className="text-2xl font-bold text-white mt-1">{Math.round(general.pressure)} <span className="text-sm">hPa</span></div>
                   <div className="text-[10px] text-orange-300 mt-1">{pressureLabel}</div>
                   {/* Bar Indicator */}
                   <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 relative">
                       <div className="absolute top-0 bottom-0 w-2 bg-white rounded-full transition-all duration-1000" style={{ left: `${pressurePercent}%` }}></div>
                   </div>
                   <div className="flex justify-between w-full text-[8px] text-slate-600 mt-1 px-1">
                       <span>Low</span><span>High</span>
                   </div>
               </div>

               {/* Today's Stats */}
               <div className="flex flex-col items-center p-4 bg-slate-950 rounded-xl border border-slate-800 col-span-2 md:col-span-1">
                   <Thermometer size={24} className="text-red-400 mb-2" />
                   <div className="text-xs text-slate-500 uppercase">Today's Summary</div>
                   <div className="w-full space-y-2 mt-2">
                       <div className="flex justify-between items-center text-sm">
                           <span className="text-slate-400">Current</span>
                           <span className="text-white font-bold">{general.temperature.toFixed(1)}°</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                           <span className="text-slate-400">High</span>
                           <span className="text-red-300 font-bold">{general.dailyForecast[0]?.tempMax}°</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                           <span className="text-slate-400">Low</span>
                           <span className="text-blue-300 font-bold">{general.dailyForecast[0]?.tempMin}°</span>
                       </div>
                   </div>
               </div>

           </div>
        </div>

      </div>
    </div>
  );
};

export default Atmosphere;
