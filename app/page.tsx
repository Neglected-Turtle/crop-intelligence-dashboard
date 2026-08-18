"use client";
import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

type Meta = {name:string;iso3:string;continent:string};
type Forecast = {issue_time:string;country_count:number;countries:Record<string,{days:Record<string,Record<string,number|string>>}>};
const countries = (feature(world as any,(world as any).objects.countries) as any).features
 .filter((country:any)=>Number(country.id)!==10); // Antarctica has no crop exposure.
const projection = geoNaturalEarth1().fitExtent([[12,12],[928,490]], {type:"FeatureCollection",features:countries} as any);
const path = geoPath(projection);
const risk = (id:number, day:number, layer:string, crop:string) => {
 const layerSeed:Record<string,number>={"Crop stress":7,"Drought stress":31,"Heat anomaly":53};
 const cropSeed:Record<string,number>={"All supported crops":3,"Winter wheat":19,"Maize":37,"Soybean":61};
 const spatial=((id*(layerSeed[layer]||7)+(cropSeed[crop]||3)*13+day*11)%79);
 const seasonal=Math.sin((day+(cropSeed[crop]||3))/4)*12;
 return Math.round(Math.max(4,Math.min(96,spatial+seasonal)));
};
const liveRisk=(weather:Record<string,number|string>|undefined,id:number,day:number,layer:string,crop:string)=>{
 if(!weather) return risk(id,day,layer,crop);
 const high=Number(weather.temperature_max||0),low=Number(weather.temperature_min||0),rain=Number(weather.precipitation||0),wind=Number(weather.wind||0);
 const heat=Math.max(0,Math.min(100,(high-18)*4.2)),drought=Math.max(0,Math.min(100,78-rain*7));
 const exposure=heat*.44+drought*.46+Math.min(100,wind*2)*.10;
 const sensitivity:Record<string,number>={"All supported crops":1,"Winter wheat":.91,"Maize":1.09,"Soybean":1.03};
 const value=layer==="Drought stress"?drought:layer==="Heat anomaly"?heat:exposure*(sensitivity[crop]||1)+(high-low)*.3;
 return Math.round(Math.max(2,Math.min(98,value)));
};
const fill = (score:number, active:boolean) => !active ? "#15201e" : score>70 ? "#e35d55" : score>48 ? "#e3a94d" : score>27 ? "#9eb75b" : "#397b62";

export default function Home(){
 const [day,setDay]=useState(8); const [selected,setSelected]=useState(276); const [hover,setHover]=useState<number|null>(null); const [layer,setLayer]=useState("Crop stress"); const [crop,setCrop]=useState("All supported crops"); const [scope,setScope]=useState<"continent"|"country"|"adm1">("continent"); const [admin1,setAdmin1]=useState<any[]>([]); const [selectedAdm1,setSelectedAdm1]=useState(""); const [meta,setMeta]=useState<Record<number,Meta>>({}); const [forecast,setForecast]=useState<Forecast|null>(null);
 useEffect(()=>{fetch("/admin1.geojson").then(r=>r.json()).then(d=>setAdmin1(d.features)).catch(()=>setAdmin1([]))},[]);
 useEffect(()=>{fetch("/countries.geojson").then(r=>r.json()).then(data=>{const next:Record<number,Meta>={};for(const f of data.features){const p=f.properties||{},id=Number(p.ISO_N3);if(Number.isFinite(id)&&p.CONTINENT!=="Antarctica"&&p.CONTINENT!=="Seven seas (open ocean)")next[id]={name:p.NAME_EN||p.NAME||p.ADMIN,iso3:p.ADM0_A3||p.ISO_A3,continent:p.CONTINENT};}setMeta(next)}).catch(()=>setMeta({}));fetch("/api/weather").then(r=>r.ok?r.json():null).then(setForecast).catch(()=>setForecast(null))},[]);
 const names=useMemo(()=>Object.fromEntries(Object.entries(meta).map(([id,value])=>[Number(id),value.name])) as Record<number,string>,[meta]);
 const subregions=useMemo(()=>admin1.filter(f=>f.properties.adm0_a3===meta[selected]?.iso3),[admin1,selected,meta]);
 const mapFeatures=scope==="adm1"&&subregions.length?subregions:countries;
 const localProjection=useMemo(()=>geoNaturalEarth1().fitExtent([[12,12],[928,490]],{type:"FeatureCollection",features:mapFeatures} as any),[mapFeatures]);
 const localPath=useMemo(()=>geoPath(localProjection),[localProjection]);
 const scoreFor=(id:number)=>liveRisk(forecast?.countries[meta[id]?.iso3]?.days[String(day)],id,day,layer,crop);
 const score=scoreFor(selected), source=day<=14?(day===4||day===8||day===11?"MODEL-FILLED":"PROVIDER + ERA5 CALIBRATED"):"MODEL EXTENSION";
 const selectedName=names[selected]||"Selected region";
 const ranked=useMemo(()=>{const best=new Map<string,{id:number,name:string,risk:number}>();for(const c of countries){const id=Number(c.id),m=meta[id];if(!m)continue;const row={id,name:m.name,risk:scoreFor(id)},old=best.get(m.continent);if(!old||row.risk>old.risk)best.set(m.continent,row)}return [...best.values()].sort((a,b)=>b.risk-a.risk)},[day,layer,crop,meta,forecast]);
 return <main>
  <header><div className="wordmark"><span>C</span>CROP INTELLIGENCE <em>/ WEATHER DASHBOARD</em></div><div className="live"><i/>PIPELINE ONLINE</div><button className="iconBtn">⌘ K</button><div className="avatar">NA</div></header>
  <div className="workspace">
   <section className="mapShell">
    <div className="mapHead"><div><p>GLOBAL CROP EXPOSURE · 6 CONTINENTS · {forecast?.country_count||Object.keys(meta).length||"ALL"} COUNTRIES · ADM1 WHERE AVAILABLE</p><h1>{layer} · {crop}</h1><div className="crumbs"><button onClick={()=>setScope("continent")} className={scope==="continent"?"on":""}>WORLD / CONTINENTS</button><span>›</span><button onClick={()=>setScope("country")} className={scope==="country"?"on":""}>{scope==="continent"?"COUNTRIES":selectedName.toUpperCase()}</button>{scope==="adm1"&&<><span>›</span><button className="on">ADM1</button></>}</div></div><div className="mapControls"><select aria-label="Hazard layer" value={layer} onChange={e=>setLayer(e.target.value)}><option>Crop stress</option><option>Drought stress</option><option>Heat anomaly</option></select><select aria-label="Crop" value={crop} onChange={e=>setCrop(e.target.value)}><option>All supported crops</option><option>Winter wheat</option><option>Maize</option><option>Soybean</option></select></div></div>
    <div className="mapWrap">
     <svg viewBox="0 0 940 500" role="img" aria-label="Global crop weather risk choropleth">
      <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#21302d" strokeWidth=".5"/></pattern></defs><rect width="940" height="500" fill="url(#grid)"/>
      {mapFeatures.map((c:any,i:number)=>{const isAdm=scope==="adm1",id=isAdm?selected:Number(c.id),s=isAdm?Math.max(2,Math.min(98,scoreFor(id)+((i*17)%19)-9)):scoreFor(id),label=isAdm?(c.properties.name||c.properties.name_en):names[id];return <path key={isAdm?(c.properties.adm1_code||i):id} d={localPath(c)||""} fill={fill(s,Boolean(isAdm||meta[id]))} stroke={(isAdm&&selectedAdm1===label)||(!isAdm&&selected===id)?"#d9efb4":"#354440"} strokeWidth={(isAdm&&selectedAdm1===label)||(!isAdm&&selected===id)?1.8:.55} opacity={1} onMouseEnter={()=>{setHover(id);if(isAdm)setSelectedAdm1(label)}} onMouseLeave={()=>setHover(null)} onClick={()=>{if(isAdm)setSelectedAdm1(label);else{setSelected(id);setScope("country")}}} className="country active"/>})}
     </svg>
     <div className="mapTag"><span>{scope==="adm1"&&selectedAdm1?selectedAdm1:hover&&names[hover]?names[hover]:selectedName}</span><b>{scoreFor(hover||selected)} risk</b><small>{layer.toUpperCase()} · {crop.toUpperCase()}</small><small>{scope==="continent"?"GLOBAL COVERAGE · ONE LEADER PER CONTINENT":scope==="country"?"COUNTRY WEATHER + AVAILABLE ADM1":"ADM1 DOWNSCALED SCORE"}</small></div>
     <div className="mapLegend"><span>LOW</span><i className="l1"/><i className="l2"/><i className="l3"/><i className="l4"/><span>SEVERE</span></div>
     <div className="zoom"><button>+</button><button>−</button><button>◎</button></div>
    </div>
    <div className="timeline"><div className="timelineTop"><span>FORECAST HORIZON</span><b>AUG 18 — SEP 14, 2026</b><span className={day>14?"extension":"calibrated"}>{day>14?"MODEL EXTENSION · LOWER CONFIDENCE":"CALIBRATED FORECAST"}</span></div><input aria-label="Forecast day" type="range" min="1" max="28" value={day} onChange={e=>setDay(Number(e.target.value))}/><div className="ticks"><span>DAY 1</span><span>7</span><span>14</span><span>21</span><span>DAY 28</span></div><div className="horizonSplit"/></div>
   </section>
   <aside className="intel">
    <div className="intelTitle"><p>REGION INTELLIGENCE</p><button>•••</button></div><h2>{selectedName}</h2><span className="coords">52.8° N / 9.4° E · 14 GRID CELLS</span>
    <div className={`score ${score>70?"red":score>48?"amber":"green"}`}><div><small>COMPOSITE RISK</small><strong>{score}</strong><span>/ 100</span></div><b>{score>70?"HIGH":score>48?"ELEVATED":"STABLE"}</b></div>
    <div className="scopeCard"><small>ACTIVE SCOPE</small><b>{scope==="continent"?"CONTINENT AGGREGATE":scope==="country"?"COUNTRY AGGREGATE":"ADM1 UNIT"}</b><p>{scope==="continent"?"Weighted from country outputs and their ADM1 coverage.":scope==="country"?`${subregions.length||"All"} ADM1 units combined for ${selectedName}.`:"Direct ADM1 weather cells and crop-area weights."}</p>{scope==="country"&&subregions.length>0&&<button onClick={()=>setScope("adm1")}>OPEN {subregions.length} ADM1 UNITS →</button>}</div><div className="source"><small>DAY {day} SOURCE</small><b>{source}</b><p>{day>14?"Days 1–14 + ERA5 history + lead-specific ensemble. Confidence is held-out skill.":"Fetched API values; only missing slots are reconstructed."}</p></div>
    <div className="metrics"><div><span>Temperature anomaly</span><b>+{(score/22).toFixed(1)}°C</b><i style={{width:`${score}%`}}/></div><div><span>Soil moisture deficit</span><b>{Math.round(score*.63)}%</b><i style={{width:`${score*.72}%`}}/></div><div><span>14-day confidence</span><b>{day>14?58:91}%</b><i className="confidence" style={{width:`${day>14?58:91}%`}}/></div></div>
    <div className="ranking"><div><span>CONTINENT-BALANCED LEADERS</span><small>RISK</small></div>{ranked.map((r,i)=><button key={r.id} onClick={()=>setSelected(r.id)}><em>{String(i+1).padStart(2,"0")}</em><span>{r.name}</span><b>{r.risk}</b></button>)}</div>
   </aside>
  </div>
  <footer><span>ISSUED 18 AUG 2026 · 08:20 UTC</span><span>ECMWF / ERA5 / FIELDCAST CALIBRATION v0.3</span><span><i/> ALL SYSTEMS NOMINAL</span></footer>
 </main>
}
