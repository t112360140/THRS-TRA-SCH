/**
 * Cloudflare Worker API for TRA/THSR Transfer Timetables
 *
 * This worker provides two endpoints:
 * 1. /TRA2THSR: Fetches and parses timetables for TRA to THSR transfers.
 * 2. /THSR2TRA: Fetches and parses timetables for THSR to TRA transfers.
 *
 * It parses the HTML response from the TRA website and returns a structured JSON array.
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests (OPTIONS)
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let targetUrl;
    let transferType;

    // --- 1. Routing Logic ---
    if (path === '/TRA2THSR') {
      targetUrl = "https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip117/sendTraTransferThsr";
      transferType = 'TRA2THSR';
    } else if (path === '/THSR2TRA') {
      targetUrl = "https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip117/sendThsrTransferTra";
      transferType = 'THSR2TRA';
    } else {
      const help = {
        message: "Invalid endpoint. Please use /TRA2THSR or /THSR2TRA.",
        example_TRA2THSR: "/TRA2THSR?startStation=1190-北新竹&endStation=1000&transferStation=1194",
        example_THSR2TRA: "/THSR2TRA?startStation=1000&endStation=1190-北新竹&transferStation=1194",
      };
      return new Response(JSON.stringify(help), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 2. Parameter Extraction (from GET or POST) ---
    let params;
    if (request.method === 'GET') {
      params = Object.fromEntries(url.searchParams.entries());
    } else if (request.method === 'POST') {
      try {
        params = await request.json();
      } catch (e) {
        return new Response('Invalid JSON body', { status: 400, headers: corsHeaders });
      }
    } else {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    // Parameter validation and defaulting
    const { startStation, endStation, transferStation } = params;
    let { queryDate } = params;
    if (!startStation || !endStation || !transferStation) {
      const errorBody = {
        error: 'Missing required parameters',
        required: ['startStation', 'endStation', 'transferStation'],
      };
      return new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!queryDate) {
      queryDate = getTodayDate();
    }

    // --- 3. Caching Logic ---
    // Standardize the cache key for both GET and POST requests
    const cacheKeyUrl = new URL(request.url);
    cacheKeyUrl.search = new URLSearchParams({
      startStation,
      endStation,
      transferStation,
      queryDate,
      transferType,
    }).toString();
    const cacheKey = new Request(cacheKeyUrl.toString());
    const cache = caches.default;

    // Try to find the cached response
    let response = await cache.match(cacheKey);

    if (response) {
        // Cache hit! Return the cached response
        console.log('Cache hit:', cacheKeyUrl.toString());
        return response;
    }

    console.log('Cache miss:', cacheKeyUrl.toString());
    
    // --- 4. Fetch original HTML from TRA website ---
    const traResponse = await fetchFromTRA(targetUrl, transferType, { startStation, endStation, queryDate, transferStation });
    if (!traResponse.ok) {
      return new Response('Failed to fetch from TRA server', { status: traResponse.status, headers: corsHeaders });
    }
    const html = await traResponse.text();

    // --- 5. Parse HTML and Transform to JSON ---
    try {
      const timeList = parseHtmlTimeTable(html, transferType);
      const jsonData = formatTimeListToJson(timeList, transferType, queryDate);

      // Create a new response with caching headers
      response = new Response(JSON.stringify(jsonData), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes (1800 seconds)
        },
      });

      // Put the response in the cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;
    } catch (error) {
       return new Response(JSON.stringify({ error: 'Failed to parse HTML response.', message: error.message }), {
         status: 500,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
    }
  },
};


// --- Helper Functions ---

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function getTodayDate() {
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = taiwanTime.getUTCFullYear();
  const month = (taiwanTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = taiwanTime.getUTCDate().toString().padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * Fetches the timetable HTML from the TRA server.
 */
async function fetchFromTRA(targetUrl, transferType, params) {
  const requestHeaders = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "content-type": "application/x-www-form-urlencoded",
    "Referer": "https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip117/query" // A more generic referer
  };

  const body = new URLSearchParams({
    '_csrf': crypto.randomUUID(),
    'queryWay': transferType === 'TRA2THSR' ? '0' : '1', // Your correct logic
    'startStation': params.startStation,
    'endStation': params.endStation,
    'queryDate': params.queryDate,
    'queryStartOrEnd': 's',
    'startTime': '00:00',
    'endTime': '23:59',
    'transferTime': '50',
    'hasTransferStation': 'true',
    '_hasTransferStation': 'on',
    'transferStation': params.transferStation,
  });

  return await fetch(targetUrl, {
    method: 'POST',
    headers: requestHeaders,
    body: body.toString(),
  });
}

/**
 * Parses the raw HTML string to extract timetable data, replicating the user's logic.
 * This function uses regular expressions and is brittle; it will break if the TRA website's HTML structure changes.
 */
function parseHtmlTimeTable(html, transferType) {
  const tableMatch = html.match(/<table class="itinerary-controls"[\s\S]*?>([\s\S]*?)<\/table>/);
  if (!tableMatch || !tableMatch[1]) {
    // Check for "查無資料" message
    if (html.includes("查無資料") || html.includes("查無符合條件之車次")) {
        return []; // Return an empty array if no data is found
    }
    throw new Error("Could not find the itinerary-controls table in the HTML.");
  }
  const tableBody = tableMatch[1];
  const trMatches = [...tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  
  // Regex to extract cell content and rowspan
  const tdRegex = /<td[^>]*rowspan="(\d+)"[^>]*>([\s\S]*?)<\/td>|<td[^>]*>([\s\S]*?)<\/td>/g;
  
  const rawRows = [];
  for (let i = 2; i < trMatches.length; i++) { // Skip first 2 header rows
    const trContent = trMatches[i][1];
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const rowspan = tdMatch[1] ? parseInt(tdMatch[1]) : 1;
      const content = (tdMatch[2] || tdMatch[3]).replace(/<[^>]+>/g, '').trim();
      cells.push({ content, rowspan });
    }
    rawRows.push(cells);
  }

  // Apply rowspan logic based on transfer type
  const time_list = [];
  let last_num = 0;
  let last_data = [];

  if (transferType === 'TRA2THSR') {
    for (const row of rawRows) {
      let new_time = [];
      if (last_num > 0) {
        new_time = new_time.concat(last_data);
        last_num--;
      } else {
        last_data = [];
      }
      for (const cell of row) {
        if (cell.rowspan > 1) {
          last_num = cell.rowspan - 1;
          last_data.push(cell.content);
        }
        new_time.push(cell.content);
      }
      time_list.push(new_time);
    }
  } else { // THSR2TRA
      console.log(rawRows)
    for (const row of rawRows) {
        let new_time = [], rowspan_have = false;
        if (last_num <= 0) {
            last_data = [];
        }
        for (const cell of row) {
            if (cell.rowspan > 1) {
                last_num = cell.rowspan - 1;
                last_data.push(cell.content);
                rowspan_have = true;
            }
            new_time.push(cell.content);
        }
        if (!rowspan_have && last_num > 0) {
            const total_spend_time = new_time.pop();
            new_time = new_time.concat(last_data.concat([total_spend_time]));
            last_num--;
        }
        time_list.push(new_time);
    }
  }
  return time_list;
}

/**
 * [FIXED] Formats the parsed list into the final structured JSON array.
 */
function formatTimeListToJson(timeList, type, date) {
    const results = [];

    // Helper to parse 'HH:MM StationName'
    const parseStationTime = (str) => {
        if (!str) return { time: null, station: null };
        const parts = str.split(/\s+/);
        // Handle cases where station name might have spaces (unlikely but safe)
        return { time: parts[0], station: parts.slice(1).join(' ') };
    };

    // Helper to parse 'XX時YY分' or 'ZZ 分鐘'
    const parseDuration = (str) => {
        if (!str) return null;
        let totalMinutes = 0;
        const hourMatch = str.match(/(\d+)\s*時/);
        const minMatch = str.match(/(\d+)\s*分/);
        if (hourMatch) totalMinutes += parseInt(hourMatch[1], 10) * 60;
        if (minMatch) totalMinutes += parseInt(minMatch[1], 10);
        return totalMinutes;
    };

    for (const item of timeList) {
        // A valid timetable row should have at least 9 columns.
        if (item.length < 9) continue; 
        
        let traData, thsrData;
        
        // Directly map columns based on their fixed, expected order.
        const firstTrain = {
            train_number: item[0]?.replace(/\s/g, '') || null,
            start: parseStationTime(item[1]),
            end: parseStationTime(item[2]),
            duration: parseDuration(item[3]),
        };

        const secondTrain = {
            train_number: item[4]?.replace(/\s/g, '') || null,
            start: parseStationTime(item[5]),
            end: parseStationTime(item[6]),
            duration: parseDuration(item[7]),
        };
        
        if (type === 'TRA2THSR') {
            traData = firstTrain;
            thsrData = secondTrain;
        } else { // THSR2TRA
            thsrData = firstTrain;
            traData = secondTrain;
        }

        const result = {
            type,
            THSR: {
                train_number: thsrData.train_number,
                start_time: thsrData.start.time,
                start_station: thsrData.start.station,
                end_time: thsrData.end.time,
                end_station: thsrData.end.station,
                spend_time: thsrData.duration,
            },
            TRA: {
                train_number: traData.train_number,
                start_time: traData.start.time,
                start_station: traData.start.station,
                end_time: traData.end.time,
                end_station: traData.end.station,
                spend_time: traData.duration,
            },
            // Use the last item in the array for total duration for better reliability.
            total_spend_time: parseDuration(item[item.length - 1]),
            date,
        };
        results.push(result);
    }
    return results;
}