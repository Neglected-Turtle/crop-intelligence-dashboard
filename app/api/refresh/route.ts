import { get, put } from "@vercel/blob";
import { geoCentroid } from "d3-geo";
import duckdb from "duckdb";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

const DB_BLOB = "crop-intelligence/weather-history.duckdb";
const SUMMARY_BLOB = "crop-intelligence/latest-global-forecast.json";
const DB_FILE = "/tmp/weather-history.duckdb";

type Country = { iso3:string; name:string; continent:string; latitude:number; longitude:number };

function run(db:duckdb.Database,sql:string){return new Promise<void>((resolve,reject)=>db.run(sql,error=>error?reject(error):resolve()))}
function sqlText(value:string){return `'${value.replaceAll("'","''")}'`}

async function countries():Promise<Country[]>{
  const geo=JSON.parse(await readFile(join(process.cwd(),"public","countries.geojson"),"utf8"));
  return geo.features.flatMap((item:any)=>{
    const p=item.properties||{};
    if(p.CONTINENT==="Antarctica"||p.CONTINENT==="Seven seas (open ocean)") return [];
    const iso3=String(p.ADM0_A3||p.ISO_A3||"");
    if(!/^[A-Z]{3}$/.test(iso3)) return [];
    const [longitude,latitude]=geoCentroid(item);
    return [{iso3,name:String(p.NAME_EN||p.NAME||p.ADMIN||iso3),continent:String(p.CONTINENT||"Other"),latitude,longitude}];
  });
}

async function restoreDatabase(){
  await mkdir("/tmp",{recursive:true});
  const existing=await get(DB_BLOB,{access:"private",useCache:false});
  if(existing?.statusCode===200) await writeFile(DB_FILE,Buffer.from(await new Response(existing.stream).arrayBuffer()));
}

async function refresh(){
  await restoreDatabase();
  const db=new duckdb.Database(DB_FILE);
  await run(db,`CREATE TABLE IF NOT EXISTS forecast_archive(
    issue_time TIMESTAMP, valid_date DATE, lead_day INTEGER,
    iso3 VARCHAR, adm1 VARCHAR, latitude DOUBLE, longitude DOUBLE,
    variable VARCHAR, raw_value DOUBLE, filled_value DOUBLE,
    extended_value DOUBLE, confidence DOUBLE, source VARCHAR,
    model_version VARCHAR,
    UNIQUE(issue_time,valid_date,iso3,adm1,variable)
  )`);
  const issue=new Date(), locations=await countries();
  const summary:any={issue_time:issue.toISOString(),country_count:locations.length,countries:{}};
  let inserted=0;
  for(let offset=0;offset<locations.length;offset+=20){
    const batch=locations.slice(offset,offset+20);
    const query=new URL("https://api.open-meteo.com/v1/forecast");
    query.searchParams.set("latitude",batch.map(x=>x.latitude.toFixed(4)).join(","));
    query.searchParams.set("longitude",batch.map(x=>x.longitude.toFixed(4)).join(","));
    query.searchParams.set("daily","temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max");
    query.searchParams.set("forecast_days","16"); query.searchParams.set("timezone","UTC");
    const response=await fetch(query,{cache:"no-store"});
    if(!response.ok) throw new Error(`Weather provider returned ${response.status}`);
    const result=await response.json(), payloads=Array.isArray(result)?result:[result];
    const rows:string[]=[];
    payloads.forEach((payload:any,batchIndex:number)=>{
      const place=batch[batchIndex]; if(!place||!payload.daily) return;
      const series:Record<string,number[]>={temperature_max:payload.daily.temperature_2m_max,temperature_min:payload.daily.temperature_2m_min,precipitation:payload.daily.precipitation_sum,wind:payload.daily.wind_speed_10m_max};
      summary.countries[place.iso3]={name:place.name,continent:place.continent,latitude:place.latitude,longitude:place.longitude,days:{}};
      for(const [variable,values] of Object.entries(series)) for(let index=0;index<values.length;index++){
        const value=Number(values[index]); if(!Number.isFinite(value)) continue;
        const date=payload.daily.time[index], lead=index+1, confidence=Math.max(45,96-lead*2.4);
        summary.countries[place.iso3].days[lead]??={date}; summary.countries[place.iso3].days[lead][variable]=value;
        rows.push(`(TIMESTAMP ${sqlText(issue.toISOString())},DATE ${sqlText(date)},${lead},${sqlText(place.iso3)},'COUNTRY_CENTROID',${place.latitude},${place.longitude},${sqlText(variable)},${value},${value},NULL,${confidence},'open-meteo','crop-intelligence-global-v2')`);
        inserted++;
      }
    });
    for(let index=0;index<rows.length;index+=500) await run(db,`INSERT OR REPLACE INTO forecast_archive VALUES ${rows.slice(index,index+500).join(",")}`);
  }
  await new Promise<void>((resolve,reject)=>db.close(error=>error?reject(error):resolve()));
  await put(DB_BLOB,await readFile(DB_FILE),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/vnd.duckdb"});
  await put(SUMMARY_BLOB,JSON.stringify(summary),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  return {ok:true,inserted,countries:locations.length,issue_time:issue.toISOString()};
}

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(secret&&request.headers.get("authorization")!==`Bearer ${secret}`) return Response.json({error:"Unauthorized"},{status:401});
  try{return Response.json(await refresh())}catch(error){return Response.json({error:error instanceof Error?error.message:"Refresh failed"},{status:500})}
}
