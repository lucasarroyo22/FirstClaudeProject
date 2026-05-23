package com.stocks;

import com.google.gson.*;
import com.sun.net.httpserver.*;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class StockServer {

    private static final String API_KEY = System.getenv().getOrDefault("ALPHA_VANTAGE_KEY", "demo");
    private static final String BASE_URL = "https://www.alphavantage.co/query";
    private static final int PORT = 8080;

    record DayRecord(String date, double open, double high, double low, double close,
                     long volume, double range, double o2c, double o2cPct) {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/", StockServer::serveHtml);
        server.createContext("/api/stock", StockServer::serveStockData);
        server.setExecutor(null);
        server.start();
        System.out.println("Stock Analyzer running at http://localhost:" + PORT);
    }

    private static void serveHtml(HttpExchange ex) throws IOException {
        respond(ex, 200, "text/html; charset=UTF-8", HTML.getBytes(StandardCharsets.UTF_8));
    }

    private static void serveStockData(HttpExchange ex) throws IOException {
        String symbol = parseSymbol(ex.getRequestURI().getQuery());
        String json;
        try {
            json = buildStockJson(symbol);
        } catch (Exception e) {
            json = "{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        }
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        respond(ex, 200, "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private static String parseSymbol(String query) {
        if (query == null) return "IBM";
        for (String kv : query.split("&")) {
            String[] parts = kv.split("=", 2);
            if (parts.length == 2 && parts[0].equals("symbol")) return parts[1].toUpperCase();
        }
        return "IBM";
    }

    private static String buildStockJson(String symbol) throws Exception {
        String url = BASE_URL + "?function=TIME_SERIES_DAILY&symbol=" + symbol + "&outputsize=full&apikey=" + API_KEY;
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());

        JsonObject json = JsonParser.parseString(resp.body()).getAsJsonObject();
        if (json.has("Error Message")) throw new Exception("Invalid symbol: " + symbol);
        if (json.has("Information"))   throw new Exception("API rate limit reached — set ALPHA_VANTAGE_KEY env var.");
        if (!json.has("Time Series (Daily)")) throw new Exception("Unexpected API response.");

        JsonObject ts = json.getAsJsonObject("Time Series (Daily)");
        List<DayRecord> records = new ArrayList<>();

        for (Map.Entry<String, JsonElement> entry : ts.entrySet()) {
            JsonObject d = entry.getValue().getAsJsonObject();
            double open  = d.get("1. open").getAsDouble();
            double high  = d.get("2. high").getAsDouble();
            double low   = d.get("3. low").getAsDouble();
            double close = d.get("4. close").getAsDouble();
            long   vol   = d.get("5. volume").getAsLong();
            double range = high - low;
            double o2c   = close - open;
            double pct   = (o2c / open) * 100.0;
            records.add(new DayRecord(entry.getKey(), open, high, low, close, vol, range, o2c, pct));
        }

        records.sort(Comparator.comparingDouble(DayRecord::range).reversed());
        DayRecord best   = records.get(0);
        DayRecord latest = records.stream().max(Comparator.comparing(DayRecord::date)).orElseThrow();

        JsonObject result = new JsonObject();
        result.addProperty("symbol", symbol);
        result.addProperty("totalDays", records.size());
        result.add("bestDay",   toJson(best));
        result.add("latestDay", toJson(latest));

        JsonArray top = new JsonArray();
        records.subList(0, Math.min(10, records.size())).forEach(r -> top.add(toJson(r)));
        result.add("topDays", top);

        return new Gson().toJson(result);
    }

    private static JsonObject toJson(DayRecord r) {
        JsonObject o = new JsonObject();
        o.addProperty("date",   r.date());
        o.addProperty("open",   r.open());
        o.addProperty("high",   r.high());
        o.addProperty("low",    r.low());
        o.addProperty("close",  r.close());
        o.addProperty("volume", r.volume());
        o.addProperty("range",  r.range());
        o.addProperty("o2c",    r.o2c());
        o.addProperty("o2cPct", r.o2cPct());
        return o;
    }

    private static void respond(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    private static final String HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stock Analyzer</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Courier New',Courier,monospace;min-height:100vh;padding:48px 24px}
  .wrap{max-width:960px;margin:0 auto}

  header{border-bottom:2px solid #fff;padding-bottom:20px;margin-bottom:32px}
  h1{font-size:22px;letter-spacing:6px;text-transform:uppercase}
  .sub{font-size:11px;color:#555;letter-spacing:3px;margin-top:4px}

  .search{display:flex;margin-bottom:32px}
  .search input{
    flex:1;background:#000;color:#fff;border:1px solid #fff;
    padding:14px 16px;font-family:inherit;font-size:15px;
    text-transform:uppercase;outline:none;letter-spacing:2px
  }
  .search input::placeholder{color:#444}
  .search button{
    background:#fff;color:#000;border:1px solid #fff;
    padding:14px 28px;font-family:inherit;font-size:13px;
    font-weight:bold;cursor:pointer;letter-spacing:3px;
    transition:background .1s
  }
  .search button:hover{background:#ccc}

  .card{border:1px solid #333;padding:28px;margin-bottom:20px}
  .card-title{font-size:10px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:20px;border-bottom:1px solid #1a1a1a;padding-bottom:10px}

  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:24px}
  .stat-label{font-size:9px;letter-spacing:3px;color:#555;text-transform:uppercase;margin-bottom:6px}
  .stat-value{font-size:18px;font-weight:bold}
  .stat-value.xl{font-size:30px}
  .neg{color:#888}

  table{width:100%;border-collapse:collapse;font-size:13px}
  thead tr{border-bottom:1px solid #fff}
  th{padding:8px 12px;text-align:right;font-size:9px;letter-spacing:2px;color:#555;text-transform:uppercase;font-weight:normal}
  th:first-child{text-align:left}
  td{padding:10px 12px;text-align:right;border-bottom:1px solid #111}
  td:first-child{text-align:left}
  tbody tr:first-child td{background:#0d0d0d;font-weight:bold}
  tbody tr:hover td{background:#0a0a0a}

  .status{text-align:center;padding:60px;color:#444;letter-spacing:3px;font-size:12px}
  .err{border:1px solid #fff;padding:20px;letter-spacing:1px;font-size:13px}

  footer{margin-top:48px;border-top:1px solid #1a1a1a;padding-top:16px;font-size:10px;color:#333;text-align:center;letter-spacing:2px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Stock Analyzer</h1>
    <div class="sub">Highest Single-Day Price Swing &mdash; Powered by Alpha Vantage</div>
  </header>

  <div class="search">
    <input id="sym" type="text" placeholder="Enter ticker symbol..." value="IBM" maxlength="10"/>
    <button onclick="load()">SEARCH</button>
  </div>

  <div id="out"><div class="status">ENTER A TICKER AND PRESS SEARCH</div></div>

  <footer>Data via Alpha Vantage &bull; Free tier supports IBM without an API key &bull; Set ALPHA_VANTAGE_KEY for any ticker</footer>
</div>

<script>
document.getElementById('sym').addEventListener('keydown', e => { if (e.key === 'Enter') load(); });

function $(n){ return Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function p(n){ return (n>=0?'+':'')+Number(n).toFixed(2)+'%'; }
function neg(n){ return n<0?'neg':''; }

async function load() {
  const sym = document.getElementById('sym').value.trim().toUpperCase();
  if (!sym) return;
  document.getElementById('out').innerHTML = '<div class="status">LOADING ' + sym + ' &hellip;</div>';
  try {
    const d = await fetch('/api/stock?symbol=' + encodeURIComponent(sym)).then(r => r.json());
    if (d.error) { document.getElementById('out').innerHTML = '<div class="err">ERROR: ' + d.error + '</div>'; return; }
    render(d);
  } catch(e) {
    document.getElementById('out').innerHTML = '<div class="err">ERROR: Could not reach server.</div>';
  }
}

function render(d) {
  const b = d.bestDay, l = d.latestDay;
  document.getElementById('out').innerHTML = `
  <div class="card">
    <div class="card-title">Champion Day &mdash; Highest Intraday Swing &mdash; ${d.symbol} &mdash; ${d.totalDays.toLocaleString()} trading days analyzed</div>
    <div class="grid">
      <div><div class="stat-label">Date</div><div class="stat-value">${b.date}</div></div>
      <div><div class="stat-label">Intraday Range</div><div class="stat-value xl">$${$(b.range)}</div></div>
      <div><div class="stat-label">Open &rarr; Close</div><div class="stat-value ${neg(b.o2cPct)}">${p(b.o2cPct)}</div></div>
      <div><div class="stat-label">Open</div><div class="stat-value">$${$(b.open)}</div></div>
      <div><div class="stat-label">High</div><div class="stat-value">$${$(b.high)}</div></div>
      <div><div class="stat-label">Low</div><div class="stat-value">$${$(b.low)}</div></div>
      <div><div class="stat-label">Close</div><div class="stat-value">$${$(b.close)}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Top 10 Highest-Swing Days</div>
    <table>
      <thead><tr>
        <th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Range (Hi&minus;Lo)</th><th>Open&rarr;Close</th>
      </tr></thead>
      <tbody>${d.topDays.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>$${$(r.open)}</td>
          <td>$${$(r.high)}</td>
          <td>$${$(r.low)}</td>
          <td>$${$(r.close)}</td>
          <td>$${$(r.range)}</td>
          <td class="${neg(r.o2cPct)}">${p(r.o2cPct)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="card-title">Most Recent Session &mdash; ${l.date}</div>
    <div class="grid">
      <div><div class="stat-label">Open</div><div class="stat-value">$${$(l.open)}</div></div>
      <div><div class="stat-label">High</div><div class="stat-value">$${$(l.high)}</div></div>
      <div><div class="stat-label">Low</div><div class="stat-value">$${$(l.low)}</div></div>
      <div><div class="stat-label">Close</div><div class="stat-value">$${$(l.close)}</div></div>
      <div><div class="stat-label">Range</div><div class="stat-value">$${$(l.range)}</div></div>
    </div>
  </div>`;
}

window.onload = load;
</script>
</body>
</html>
""";
}
