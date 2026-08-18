import { get, put } from "@vercel/blob";
import duckdb from "duckdb";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const runtime = "nodejs";
export const maxDuration = 60;

const DB_BLOB = "crop-intelligence/weather-history.duckdb";
const DB_FILE = "/tmp/weather-history.duckdb";
const locations = [
  ["DEU","Lower Saxony",52.8,9.4],["USA","Iowa",42.0,-93.5],
  ["BRA","Mato Grosso",-12.7,-55.9],["ARG","Pampas",-34.5,-61.0],
  ["FRA","Grand Est",48.7,5.7],["UKR","Central Ukraine",49.0,31.5],
  ["IND","Punjab",30.9,75.8],["CHN","Henan",34.3,113.7],
  ["AUS","New South Wales",-32.2,147.0],["ZAF","Free State",-28.5,26.8],
  ["CAN","Saskatchewan",52.9,-106.5],
] as const;

function run(db: duckdb.Database, sql: string) {
  return new Promise<void>((resolve,reject)=>db.run(sql,(error)=>error?reject(error):resolve()));
}

async function restoreDatabase(){
  await mkdir("/tmp",{recursive:true});
  const existing=await get(DB_BLOB,{access:"private",useCache:false});
  if(existing?.statusCode===200){
    const bytes=Buffer.from(await new Response(existing.stream).arrayBuffer());
    await writeFile(DB_FILE,bytes);
  }
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
  const issue=new Date(); let inserted=0;
  for(const [iso3,adm1,latitude,longitude] of locations){
    const query=new URL("https://api.open-meteo.com/v1/forecast");
    query.searchParams.set("latitude",String(latitude)); query.searchParams.set("longitude",String(longitude));
    query.searchParams.set("daily","temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max");
    query.searchParams.set("forecast_days","16"); query.searchParams.set("timezone","UTC");
    const response=await fetch(query,{cache:"no-store"});
    if(!response.ok) throw new Error(`Weather provider returned ${response.status}`);
    const payload=await response.json();
    const series:Record<string,number[]>={temperature_max:payload.daily.temperature_2m_max,temperature_min:payload.daily.temperature_2m_min,precipitation:payload.daily.precipitation_sum,wind:payload.daily.wind_speed_10m_max};
    for(const [variable,values] of Object.entries(series)) for(let index=0;index<values.length;index++){
      const value=Number(values[index]); if(!Number.isFinite(value)) continue;
      const date=payload.daily.time[index]; const lead=index+1;
      const confidence=Math.max(45,96-lead*2.4);
      const safeAdm1=adm1.replaceAll("'","''");
      await run(db,`INSERT OR REPLACE INTO forecast_archive VALUES(
        TIMESTAMP '${issue.toISOString()}', DATE '${date}', ${lead}, '${iso3}', '${safeAdm1}',
        ${latitude}, ${longitude}, '${variable}', ${value}, ${value}, NULL, ${confidence},
        'open-meteo', 'crop-intelligence-demo-v1')`); inserted++;
    }
  }
  await new Promise<void>((resolve,reject)=>db.close(error=>error?reject(error):resolve()));
  const bytes=await readFile(DB_FILE);
  const blob=await put(DB_BLOB,bytes,{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/vnd.duckdb"});
  return {ok:true,inserted,issue_time:issue.toISOString(),archive:blob.pathname};
}

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(secret&&request.headers.get("authorization")!==`Bearer ${secret}`) return Response.json({error:"Unauthorized"},{status:401});
  try{return Response.json(await refresh())}catch(error){return Response.json({error:error instanceof Error?error.message:"Refresh failed"},{status:500})}
}

