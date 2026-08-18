import { get } from "@vercel/blob";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=3600;
const SUMMARY_BLOB="crop-intelligence/latest-global-forecast.json";

export async function GET(){
  try{
    const blob=await get(SUMMARY_BLOB,{access:"private",useCache:false});
    if(!blob||blob.statusCode!==200) return Response.json({error:"Forecast archive is not initialized"},{status:503});
    return new Response(blob.stream,{headers:{"content-type":"application/json","cache-control":"public, s-maxage=3600, stale-while-revalidate=86400"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Forecast unavailable"},{status:500})}
}
