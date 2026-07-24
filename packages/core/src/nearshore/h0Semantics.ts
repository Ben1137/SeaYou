/**
 * P6.2.7 H0 Semantics Check — double-shoaling investigation.
 *
 * Run: npx tsx packages/core/src/nearshore/h0Semantics.ts
 *
 * Tests whether Open-Meteo wave_height at the NEARSHORE coordinate (Scripps / CDIP-201)
 * is already depth-influenced vs a genuinely offshore cell. If H0_nearshore < H0_offshore
 * systematically, the engine double-shoals: it receives a partially-shoaled H0 and sholes
 * it again → systematic over-prediction → constant negative residual exactly like Scripps'.
 *
 * Comparison:
 *   A: H0 from Open-Meteo at NEARSHORE coordinate (32.868N / -117.267W) → nearshoreTransform → vs CDIP-201
 *   B: H0 from Open-Meteo at OFFSHORE coordinate (~1° west in deep water) → nearshoreTransform → vs CDIP-201
 *
 * If A < B and residual_B closer to 0 → double-shoaling confirmed → INPUT FIX (use offshore cell).
 * If A ≈ B → H0 semantics fine; offset has another cause.
 *
 * Control: same A/B comparison for Cape Henry VA (spot.depthM == buoy.depthM = 18m, positive bias).
 *
 * Analysis only. transform.ts READ-ONLY. Oracle 0.00%.
 */

import { nearshoreTransform } from './transform.js';
import { CALIBRATION_SPOTS } from './calibration-spots.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const envPaths = [path.join(PROJECT_ROOT, '.env'), path.join(PROJECT_ROOT, 'packages/web/.env')];
  for (const p of envPaths) {
    if (supabaseUrl && supabaseKey) break;
    try {
      for (const line of fs.readFileSync(p,'utf8').split('\n')) {
        const eq=line.indexOf('='); if(eq<1) continue;
        const k=line.slice(0,eq).trim(); const v=line.slice(eq+1).trim();
        if(k==='SUPABASE_URL'&&!supabaseUrl) supabaseUrl=v;
        if(k==='VITE_SUPABASE_URL'&&!supabaseUrl) supabaseUrl=v;
        if(k==='SUPABASE_SERVICE_ROLE_KEY'&&!supabaseKey) supabaseKey=v;
      }
    } catch { /* ignore */ }
  }
  return { supabaseUrl, supabaseKey };
}

function mean(a: number[]): number { return a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN; }
function fmt(v: number, d=3): string { return isNaN(v)?'n/a':v.toFixed(d); }
type Band='short'|'mid'|'long';
function band(p: number|null): Band|null { if(!p)return null; if(p<8)return'short'; if(p<=12)return'mid'; return'long'; }

interface ModelHour { ts: string; waveHeight: number|null; wavePeriod: number|null; }
async function fetchModel(lat:number,lon:number,start:string,end:string):Promise<ModelHour[]>{
  const url=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}`+
    `&hourly=wave_height,wave_period&start_date=${start}&end_date=${end}&timezone=GMT&models=best_match`;
  try{
    const res=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!res.ok)return[];
    const d=await res.json() as{hourly?:{time:string[];wave_height:(number|null)[];wave_period:(number|null)[]}};
    const t=d.hourly?.time??[],h=d.hourly?.wave_height??[],p=d.hourly?.wave_period??[];
    return t.map((ts,i)=>({ts,waveHeight:h[i]??null,wavePeriod:p[i]??null})).filter(x=>x.waveHeight!=null);
  }catch{return[];}
}

interface CDIPHour { ts: string; Hs: number; Tp: number; }
async function fetchCDIP(stationId:string,start:string,end:string):Promise<CDIPHour[]>{
  const id=stationId.padStart(3,'0');
  const url=`https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json`+
    `?time,waveHs,waveTp&station_id="${id}"&time>=${start}T00:00:00Z&time<=${end}T23:59:59Z&orderBy("time")`;
  try{
    const res=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!res.ok)return[];
    const d=await res.json() as{table:{rows:[string,number,number][]}};
    const rows=d?.table?.rows??[];
    const byHour=new Map<string,{Hs:number[];Tp:number[]}>();
    for(const [ts,Hs,Tp] of rows){
      if(Hs==null||Hs>20)continue;
      const key=ts.slice(0,13);
      const slot=byHour.get(key)??{Hs:[],Tp:[]};
      slot.Hs.push(Hs);slot.Tp.push(Tp);byHour.set(key,slot);
    }
    const m=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
    return[...byHour.entries()].map(([key,s])=>({ts:key+':00:00',Hs:m(s.Hs),Tp:m(s.Tp)}))
      .sort((a,b)=>a.ts.localeCompare(b.ts));
  }catch{return[];}
}

interface SpotResult {
  nearshoreH0: Record<Band,number[]>;
  offshoreH0:  Record<Band,number[]>;
  residualA:   Record<Band,number[]>;  // nearshore H0 → engine → vs buoy
  residualB:   Record<Band,number[]>;  // offshore  H0 → engine → vs buoy
}

async function runComparison(
  spotName: string,
  nearLat: number, nearLon: number,
  offLat:  number, offLon:  number,
  buoyId:  string, depthM:  number,
  start: string, end: string,
  lines: string[],
): Promise<void> {
  console.log(`  ${spotName}: fetching buoy + A + B...`);
  const buoy = await fetchCDIP(buoyId, start, end);
  const modA  = await fetchModel(nearLat, nearLon, start, end);  // nearshore cell
  const modB  = await fetchModel(offLat,  offLon,  start, end);  // offshore cell
  console.log(`  ${spotName}: buoy=${buoy.length} modA=${modA.length} modB=${modB.length}`);

  const buoyMap = new Map(buoy.map(h=>[h.ts.slice(0,13).replace(' ','T'),h]));
  const modBMap = new Map(modB.map(h=>[h.ts.slice(0,13).replace(' ','T'),h]));

  const res: SpotResult = {
    nearshoreH0: {short:[],mid:[],long:[]},
    offshoreH0:  {short:[],mid:[],long:[]},
    residualA:   {short:[],mid:[],long:[]},
    residualB:   {short:[],mid:[],long:[]},
  };

  let pairsAB=0;
  let skipped=0;
  for(const mA of modA){
    const key=mA.ts.slice(0,13).replace(' ','T');
    const buoyH=buoyMap.get(key);
    const mB=modBMap.get(key);
    if(!buoyH||mA.waveHeight==null)continue;
    // Canonical: T = wave_period (total peak period). No buoy-Tp fallback — missing T skips row.
    const T=mA.wavePeriod;
    if(T==null){skipped++;continue;}
    const trA=nearshoreTransform(mA.waveHeight,T,depthM);
    const b=band(T); if(!b)continue;
    res.nearshoreH0[b].push(mA.waveHeight);
    res.residualA[b].push(trA.H-buoyH.Hs);
    if(mB?.waveHeight!=null){
      const trB=nearshoreTransform(mB.waveHeight,T,depthM);
      res.offshoreH0[b].push(mB.waveHeight);
      res.residualB[b].push(trB.H-buoyH.Hs);
      pairsAB++;
    }
  }

  console.log(`  ${spotName}: pairsAB=${pairsAB} skipped(no wave_period)=${skipped}`);
  lines.push(`### ${spotName}`);
  lines.push(`Nearshore cell: (${nearLat}, ${nearLon}) | Offshore cell: (${offLat}, ${offLon})`);
  lines.push(`Buoy: ${buoyId} at depth ${depthM}m | Pairs with both A+B: ${pairsAB} | Skipped (no wave_period): ${skipped}`);
  lines.push('');
  lines.push('| Band | n | H0_A (near) | H0_B (off) | H0_A−H0_B | Resid_A | Resid_B | Verdict |');
  lines.push('|------|---|------------|-----------|-----------|---------|---------|---------|');
  for(const b of['short','mid','long'] as Band[]){
    const nA=res.nearshoreH0[b].length, nB=res.offshoreH0[b].length;
    const mA=mean(res.nearshoreH0[b]),  mB=mean(res.offshoreH0[b]);
    const diff=mA-mB;
    const rA=mean(res.residualA[b]),    rB=mean(res.residualB[b]);
    const n=Math.min(nA,nB)||nA;
    let verdict='unclear';
    if(!isNaN(diff)&&!isNaN(rA)&&!isNaN(rB)){
      const doubleShoal = diff < -0.05 && Math.abs(rB) < Math.abs(rA)-0.05;
      const hMatch = Math.abs(diff) < 0.03;
      if(doubleShoal) verdict='DOUBLE-SHOALING (nearshore cell already depth-influenced)';
      else if(hMatch)  verdict='H0 consistent — depth effect not the cause';
      else if(diff>0.05) verdict='Near > Off — nearshore cell carries more energy (unexpected)';
      else               verdict='ambiguous';
    }
    lines.push(`| ${b} | ${n} | ${fmt(mA)} | ${fmt(mB)} | ${fmt(diff)} | ${fmt(rA)} | ${fmt(rB)} | ${verdict} |`);
  }
  lines.push('');
}

async function main(){
  // loadEnv is available but not needed for this purely HTTP-based analysis
  loadEnv();

  console.log('\n=== P6.2.7 H0 Semantics Check ===\n');
  const lines:string[]=[
    '# P6.2.7 H0 Semantics / Double-Shoaling Check',
    '',
    `**Generated:** ${new Date().toISOString()}  `,
    '','---','',
    '## Design',
    '- **A (nearshore):** Open-Meteo best_match at the NEARSHORE coordinate → nearshoreTransform(H0_A, T, depthM)',
    '- **B (offshore):** Open-Meteo best_match ~1° west/offshore in deep water → nearshoreTransform(H0_B, T, depthM)',
    '- Both compared against the same buoy. Period band: buoy Tp.',
    '- **Double-shoaling signal:** H0_A < H0_B AND |residual_B| < |residual_A| → nearshore cell already depth-influenced.',
    '','---','',
    '## Scripps CA (primary suspect)',
    '',
  ];

  const scrippsBuoy = CALIBRATION_SPOTS.find(s=>s.name==='Scripps CA')?.buoy;
  const START='2022-01-01'; const END='2023-12-31';
  const scrippsBuoyDepth = scrippsBuoy?.depthM ?? 41;

  await runComparison(
    'Scripps CA',
    32.868, -117.267,    // A: nearshore (Scripps coordinate)
    32.868, -118.267,    // B: ~1° west — deeper SoCal Bight water (~1500m basin)
    scrippsBuoy?.id ?? '201',
    scrippsBuoyDepth,
    START, END,
    lines,
  );

  lines.push('---','','## Cape Henry VA (control — spot.depthM == buoy.depthM = 18m, positive bias)','');

  const capeHenryBuoy = CALIBRATION_SPOTS.find(s=>s.name==='Cape Henry VA')?.buoy;
  if(capeHenryBuoy){
    await runComparison(
      'Cape Henry VA',
      36.908, -75.845,   // A: nearshore (Cape Henry coordinate)
      36.908, -76.845,   // B: ~1° west in deeper Chesapeake/shelf water
      capeHenryBuoy.id,
      capeHenryBuoy.depthM ?? 18,
      START, END,
      lines,
    );
  }

  lines.push('---','','## Interpretation','');
  lines.push('If H0_A < H0_B AND residual_B closer to 0 at Scripps:');
  lines.push('→ **H0 DOUBLE-SHOALING CONFIRMED** — sampling H0 from the nearshore cell ingests a partially-shoaled value.');
  lines.push('→ Fix: source H0 from an offshore cell (or use `swell_wave_height` which is more representative of open-ocean swell energy).');
  lines.push('→ No physics change to transform.ts.');
  lines.push('');
  lines.push('If H0_A ≈ H0_B:');
  lines.push('→ H0 semantics are fine at this resolution; the −0.170m offset has another cause (refraction, shadow, representativeness).');
  lines.push('');
  lines.push('_Analysis only — transform.ts untouched, oracle 0.00%._');

  const reportPath=path.join(PROJECT_ROOT,'calibration-h0-semantics-report.md');
  fs.writeFileSync(reportPath,lines.join('\n'),'utf8');
  console.log(`\nReport written → calibration-h0-semantics-report.md`);
  console.log('\n=== Done ===\n');
}

main().catch(err=>{console.error('Fatal:',err);process.exit(1);});
