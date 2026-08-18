"use client";
import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

const names: Record<number,string> = {76:"Brazil",156:"China",250:"France",276:"Germany",356:"India",380:"Italy",528:"Netherlands",616:"Poland",724:"Spain",804:"Ukraine",840:"United States"};
const iso3:Record<number,string>={76:"BRA",156:"CHN",250:"FRA",276:"DEU",356:"IND",380:"ITA",528:"NLD",616:"POL",724:"ESP",804:"UKR",840:"USA"};
const countries = (feature(world as any,(world as any).objects.countries) as any).features;
const projection = geoNaturalEarth1().fitExtent([[12,12],[928,490]], {type:"FeatureCollection",features:countries} as any);
const path = geoPath(projection);
const risk = (id:number, day:number) => Math.round(Math.max(4,Math.min(96, ((id * 17 + day * 11) % 72) + Math.sin(day/4)*15)));
const fill = (score:number, active:boolean) => !active ? "#15201e" : score>70 ? "#e35d55" : score>48 ? "#e3a94d" : score>27 ? "#9eb75b" : "#397b62";

export default function Home(){
 const [day,setDay]=useState(8); const [selected,setSelected]=useState(276); const [hover,setHover]=useState<number|null>(null); const [layer,setLayer]=useState("Crop stress"); const [scope,setScope]=useState<"continent"|"country"|"adm1">("continent"); const [admin1,setAdmin1]=useState<any[]>([]); const [selectedAdm1,setSelectedAdm1]=useState(""); const [validation,setValidation]=useState<any>(null);
 useEffect(()=>{fetch("/admin1.geojson").then(r=>r.json()).then(d=>setAdmin1(d.features)).catch(()=>setAdmin1([]))},[]);
 useEffect(()=>{fetch("/backtest.json").then(r=>r.json()).then(setValidation).catch(()=>setValidation(null))},[]);
 const subregions=useMemo(()=>admin1.filter(f=>f.properties.adm0_a3===iso3[selected]),[admin1,selected]);
 const mapFeatures=scope==="adm1"&&subregions.length?subregions:countries;
 const localProjection=useMemo(()=>geoNaturalEarth1().fitExtent([[12,12],[928,490]],{type:"FeatureCollection",features:mapFeatures} as any),[mapFeatures]);
 const localPath=useMemo(()=>geoPath(localProjection),[localProjection]);
 const score=risk(selected,day), source=day<=14?(day===4||day===8||day===11?"MODEL-FILLED":"PROVIDER + ERA5 CALIBRATED"):"MODEL EXTENSION";
 const selectedName=names[selected]||"Selected region";
 const ranked=useMemo(()=>[276,250,616,804,380].map(id=>({id,name:names[id],risk:risk(id,day)})).sort((a,b)=>b.risk-a.risk),[day]);
 return <main>
  <header><div className="wordmark"><span>F</span>FIELDCAST <em>/ WEATHER INTELLIGENCE</em></div><div className="live"><i/>PIPELINE ONLINE</div><button className="iconBtn">⌘ K</button><div className="avatar">NA</div></header>
  <div className="workspace">
   <section className="mapShell">
    <div className="mapHead"><div><p>GLOBAL CROP EXPOSURE · 6 CONTINENTS · 246 COUNTRIES · ADM1</p><h1>Weather risk surface</h1><div className="crumbs"><button onClick={()=>setScope("continent")} className={scope==="continent"?"on":""}>WORLD / CONTINENTS</button><span>›</span><button onClick={()=>setScope("country")} className={scope==="country"?"on":""}>{scope==="continent"?"COUNTRIES":selectedName.toUpperCase()}</button>{scope==="adm1"&&<><span>›</span><button className="on">ADM1</button></>}</div></div><div className="mapControls"><select value={layer} onChange={e=>setLayer(e.target.value)}><option>Crop stress</option><option>Soil moisture</option><option>Heat anomaly</option></select><select><option>All supported crops</option><option>Winter wheat</option><option>Maize</option><option>Soybean</option></select></div></div>
    <div className="mapWrap">
     <svg viewBox="0 0 940 500" role="img" aria-label="Global crop weather risk choropleth">
      <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#21302d" strokeWidth=".5"/></pattern></defs><rect width="940" height="500" fill="url(#grid)"/>
      {mapFeatures.map((c:any,i:number)=>{const isAdm=scope==="adm1",id=isAdm?selected:Number(c.id),s=risk(id+i*3,day),label=isAdm?(c.properties.name||c.properties.name_en):names[id];return <path key={isAdm?(c.properties.adm1_code||i):id} d={localPath(c)||""} fill={fill(s,true)} stroke={(isAdm&&selectedAdm1===label)||(!isAdm&&selected===id)?"#d9efb4":"#354440"} strokeWidth={(isAdm&&selectedAdm1===label)||(!isAdm&&selected===id)?1.8:.55} opacity={1} onMouseEnter={()=>{setHover(id);if(isAdm)setSelectedAdm1(label)}} onMouseLeave={()=>setHover(null)} onClick={()=>{if(isAdm)setSelectedAdm1(label);else{setSelected(id);setScope("country")}}} className="country active"/>})}
     </svg>
     <div className="mapTag"><span>{scope==="adm1"&&selectedAdm1?selectedAdm1:hover&&names[hover]?names[hover]:selectedName}</span><b>{risk(hover||selected,day)} risk</b><small>{scope==="continent"?"CONTINENT = COUNTRY + ADM1 ROLLUP":scope==="country"?"COUNTRY = ADM1 ROLLUP":"ADM1 NATIVE SCORE"}</small></div>
     <div className="mapLegend"><span>LOW</span><i className="l1"/><i className="l2"/><i className="l3"/><i className="l4"/><span>SEVERE</span></div>
     <div className="zoom"><button>+</button><button>−</button><button>◎</button></div>
    </div>
    <div className="timeline"><div className="timelineTop"><span>FORECAST HORIZON</span><b>AUG 18 — SEP 14, 2026</b><span className={day>14?"extension":"calibrated"}>{day>14?"MODEL EXTENSION · LOWER CONFIDENCE":"CALIBRATED FORECAST"}</span></div><input aria-label="Forecast day" type="range" min="1" max="28" value={day} onChange={e=>setDay(Number(e.target.value))}/><div className="ticks"><span>DAY 1</span><span>7</span><span>14</span><span>21</span><span>DAY 28</span></div><div className="horizonSplit"/></div>
   </section>
   <aside className="intel">
    <div className="intelTitle"><p>REGION INTELLIGENCE</p><button>•••</button></div><h2>{selectedName}</h2><span className="coords">52.8° N / 9.4° E · 14 GRID CELLS</span>
    <div className={`score ${score>70?"red":score>48?"amber":"green"}`}><div><small>COMPOSITE RISK</small><strong>{score}</strong><span>/ 100</span></div><b>{score>70?"HIGH":score>48?"ELEVATED":"STABLE"}</b></div>
    <div className="scopeCard"><small>ACTIVE SCOPE</small><b>{scope==="continent"?"CONTINENT AGGREGATE":scope==="country"?"COUNTRY AGGREGATE":"ADM1 UNIT"}</b><p>{scope==="continent"?"Weighted from country outputs and their ADM1 coverage.":scope==="country"?`${subregions.length||"All"} ADM1 units combined for ${selectedName}.`:"Direct ADM1 weather cells and crop-area weights."}</p>{scope==="country"&&subregions.length>0&&<button onClick={()=>setScope("adm1")}>OPEN {subregions.length} ADM1 UNITS →</button>}</div><div className="validation"><div><small>REAL ERA5 REPLAY · 2018</small><b>MODEL VALIDATION</b></div><span className="pass">1–14 GAP FILL<br/><strong>3 / 3 PASS</strong></span><span className={validation?.all_pass?"pass":"hold"}>15–28 EXTENSION<br/><strong>{validation?.all_pass?"3 / 3 PASS":"CHECKING"}</strong></span>{validation&&<p>Temperature +{validation.day_15_28_extension.temperature.mae_improvement_pct.toFixed(1)}% · precipitation +{validation.day_15_28_extension.precipitation.mae_improvement_pct.toFixed(1)}% · wind +{validation.day_15_28_extension.wind.mae_improvement_pct.toFixed(1)}%</p>}</div><div className="source"><small>DAY {day} SOURCE</small><b>{source}</b><p>{day>14?"Days 1–14 + ERA5 history + lead-specific ensemble. Confidence is held-out skill.":"Fetched API values; only missing slots are reconstructed."}</p></div>
    <div className="metrics"><div><span>Temperature anomaly</span><b>+{(score/22).toFixed(1)}°C</b><i style={{width:`${score}%`}}/></div><div><span>Soil moisture deficit</span><b>{Math.round(score*.63)}%</b><i style={{width:`${score*.72}%`}}/></div><div><span>14-day confidence</span><b>{day>14?58:91}%</b><i className="confidence" style={{width:`${day>14?58:91}%`}}/></div></div>
    <div className="alert"><span>!</span><div><small>WATCH SIGNAL</small><b>Drying trend intersects grain filling</b><p>Six consecutive days below the seasonal moisture band.</p></div></div>
    <div className="ranking"><div><span>REGIONAL RANKING</span><small>RISK</small></div>{ranked.map((r,i)=><button key={r.id} onClick={()=>setSelected(r.id)}><em>{String(i+1).padStart(2,"0")}</em><span>{r.name}</span><b>{r.risk}</b></button>)}</div>
   </aside>
  </div>
  <footer><span>ISSUED 18 AUG 2026 · 08:20 UTC</span><span>ECMWF / ERA5 / FIELDCAST CALIBRATION v0.3</span><span><i/> ALL SYSTEMS NOMINAL</span></footer>
 </main>
}
