package com.stocks;

import com.google.gson.*;
import com.sun.net.httpserver.*;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

public class StockServer {

    private static final int PORT = 8080;

    record DayRecord(String date, double open, double high, double low, double close,
                     long volume, double range, double o2c, double o2cPct) {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/api/stock",  StockServer::serveStockData);
        server.createContext("/api/search", StockServer::serveSearch);
        server.createContext("/api/chart",  StockServer::serveChart);
        server.createContext("/",           StockServer::serveStatic);
        server.setExecutor(null);
        server.start();
        System.out.println("Stock Analyzer running at http://localhost:" + PORT);
    }

    // ── Static files ──────────────────────────────────────────────────────

    private static void serveStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/")) path = "/index.html";
        try (InputStream is = StockServer.class.getResourceAsStream("/static" + path)) {
            if (is == null) { respond(ex, 404, "text/plain", "404 Not Found".getBytes()); return; }
            byte[] body = is.readAllBytes();
            ex.getResponseHeaders().set("Content-Type", mimeType(path));
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(body); }
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=UTF-8";
        if (path.endsWith(".css"))  return "text/css";
        if (path.endsWith(".js"))   return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        return "text/plain";
    }

    // ── /api/search ───────────────────────────────────────────────────────

    private static void serveSearch(HttpExchange ex) throws IOException {
        String q    = parseQuery(ex.getRequestURI().getQuery()).getOrDefault("q", "");
        String json;
        try { json = buildSearchJson(q); }
        catch (Exception e) { json = "{\"results\":[]}"; }
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        respond(ex, 200, "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private static String buildSearchJson(String q) throws Exception {
        if (q.isBlank()) return "{\"results\":[]}";
        String enc = URLEncoder.encode(q.strip(), StandardCharsets.UTF_8);
        String url = "https://query1.finance.yahoo.com/v1/finance/search?q=" + enc
                   + "&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false";

        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0").GET().build();
        HttpResponse<String> resp = httpClient().send(req, HttpResponse.BodyHandlers.ofString());

        JsonObject root   = JsonParser.parseString(resp.body()).getAsJsonObject();
        JsonArray  quotes = root.has("quotes") ? root.getAsJsonArray("quotes") : new JsonArray();

        JsonArray results = new JsonArray();
        for (JsonElement el : quotes) {
            JsonObject qt   = el.getAsJsonObject();
            String     type = qt.has("quoteType") ? qt.get("quoteType").getAsString() : "";
            if (!type.equals("EQUITY") && !type.equals("ETF")) continue;
            JsonObject item = new JsonObject();
            item.addProperty("symbol",   qt.get("symbol").getAsString());
            item.addProperty("name",     qt.has("shortname") ? qt.get("shortname").getAsString()
                                       : qt.has("longname")  ? qt.get("longname").getAsString() : "");
            item.addProperty("exchange", qt.has("exchange") ? qt.get("exchange").getAsString() : "");
            results.add(item);
        }
        JsonObject out = new JsonObject();
        out.add("results", results);
        return new Gson().toJson(out);
    }

    // ── /api/chart ────────────────────────────────────────────────────────

    private static void serveChart(HttpExchange ex) throws IOException {
        Map<String, String> params = parseQuery(ex.getRequestURI().getQuery());
        String symbol = params.getOrDefault("symbol", "AAPL").toUpperCase();
        String period  = params.getOrDefault("period", "daily");
        String json;
        try { json = buildChartJson(symbol, period); }
        catch (Exception e) { json = "{\"error\":\"" + safe(e.getMessage()) + "\"}"; }
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        respond(ex, 200, "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private static String buildChartJson(String symbol, String period) throws Exception {
        String enc = URLEncoder.encode(symbol, StandardCharsets.UTF_8);
        String url = period.equals("weekly")
            ? "https://query1.finance.yahoo.com/v8/finance/chart/" + enc + "?range=5d&interval=1d"
            : "https://query1.finance.yahoo.com/v8/finance/chart/" + enc + "?range=1d&interval=5m";

        JsonObject chart   = yahooFetch(url);
        JsonArray  results = chart.getAsJsonArray("result");
        if (results == null || results.size() == 0) throw new Exception("No chart data for: " + symbol);

        JsonObject result = results.get(0).getAsJsonObject();
        JsonArray  stamps = result.getAsJsonArray("timestamp");
        JsonObject quote  = result.getAsJsonObject("indicators")
                                  .getAsJsonArray("quote").get(0).getAsJsonObject();
        JsonArray closes  = quote.getAsJsonArray("close");
        JsonArray highs   = quote.getAsJsonArray("high");
        JsonArray lows    = quote.getAsJsonArray("low");

        JsonArray tsOut = new JsonArray(), pricesOut = new JsonArray(),
                  hOut  = new JsonArray(), lOut      = new JsonArray();

        for (int i = 0; i < stamps.size(); i++) {
            if (closes.get(i).isJsonNull()) continue;
            tsOut.add(stamps.get(i).getAsLong() * 1000L);
            pricesOut.add(closes.get(i).getAsDouble());
            hOut.add(highs.get(i).isJsonNull() ? closes.get(i) : highs.get(i));
            lOut.add(lows.get(i).isJsonNull()  ? closes.get(i) : lows.get(i));
        }

        JsonObject out = new JsonObject();
        out.addProperty("symbol", symbol);
        out.addProperty("period", period);
        out.add("timestamps", tsOut);
        out.add("prices",     pricesOut);
        out.add("highs",      hOut);
        out.add("lows",       lOut);
        return new Gson().toJson(out);
    }

    // ── /api/stock ────────────────────────────────────────────────────────

    private static void serveStockData(HttpExchange ex) throws IOException {
        String symbol = parseQuery(ex.getRequestURI().getQuery())
                            .getOrDefault("symbol", "AAPL").toUpperCase();
        String json;
        try { json = buildStockJson(symbol); }
        catch (Exception e) { json = "{\"error\":\"" + safe(e.getMessage()) + "\"}"; }
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        respond(ex, 200, "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private static String buildStockJson(String symbol) throws Exception {
        String enc = URLEncoder.encode(symbol, StandardCharsets.UTF_8);

        // Historical daily (10 years)
        JsonObject histChart = yahooFetch(
                "https://query1.finance.yahoo.com/v8/finance/chart/" + enc + "?range=10y&interval=1d");
        JsonArray results = histChart.getAsJsonArray("result");
        if (results == null || results.size() == 0) throw new Exception("No data found for: " + symbol);

        JsonObject histResult = results.get(0).getAsJsonObject();
        JsonArray  stamps     = histResult.getAsJsonArray("timestamp");
        JsonObject histQuote  = histResult.getAsJsonObject("indicators")
                                          .getAsJsonArray("quote").get(0).getAsJsonObject();

        JsonArray hOpens  = histQuote.getAsJsonArray("open");
        JsonArray hHighs  = histQuote.getAsJsonArray("high");
        JsonArray hLows   = histQuote.getAsJsonArray("low");
        JsonArray hCloses = histQuote.getAsJsonArray("close");
        JsonArray hVols   = histQuote.getAsJsonArray("volume");

        List<DayRecord> records = new ArrayList<>();
        for (int i = 0; i < stamps.size(); i++) {
            if (hOpens.get(i).isJsonNull() || hHighs.get(i).isJsonNull()
                    || hLows.get(i).isJsonNull() || hCloses.get(i).isJsonNull()) continue;
            String date  = LocalDate.ofEpochDay(stamps.get(i).getAsLong() / 86400).toString();
            double open  = hOpens.get(i).getAsDouble(),  high  = hHighs.get(i).getAsDouble(),
                   low   = hLows.get(i).getAsDouble(),   close = hCloses.get(i).getAsDouble();
            long   vol   = hVols.get(i).isJsonNull() ? 0 : hVols.get(i).getAsLong();
            records.add(new DayRecord(date, open, high, low, close, vol,
                    high - low, close - open, ((close - open) / open) * 100.0));
        }

        records.sort(Comparator.comparingDouble(DayRecord::range).reversed());
        DayRecord best   = records.get(0);
        DayRecord latest = records.stream().max(Comparator.comparing(DayRecord::date)).orElseThrow();

        // Today's intraday (1-minute bars)
        JsonObject today = new JsonObject();
        try {
            JsonObject intra = yahooFetch(
                    "https://query1.finance.yahoo.com/v8/finance/chart/" + enc + "?range=1d&interval=1m");
            JsonArray ir = intra.getAsJsonArray("result");
            if (ir != null && ir.size() > 0) {
                JsonObject iq = ir.get(0).getAsJsonObject().getAsJsonObject("indicators")
                                  .getAsJsonArray("quote").get(0).getAsJsonObject();
                JsonArray iH = iq.getAsJsonArray("high"), iL = iq.getAsJsonArray("low"),
                          iC = iq.getAsJsonArray("close");

                double dayHigh = Double.NEGATIVE_INFINITY, dayLow = Double.POSITIVE_INFINITY, last = 0;
                for (int i = 0; i < iH.size(); i++) {
                    if (iH.get(i).isJsonNull() || iL.get(i).isJsonNull()) continue;
                    dayHigh = Math.max(dayHigh, iH.get(i).getAsDouble());
                    dayLow  = Math.min(dayLow,  iL.get(i).getAsDouble());
                    if (!iC.get(i).isJsonNull()) last = iC.get(i).getAsDouble();
                }

                if (dayHigh > Double.NEGATIVE_INFINITY) {
                    JsonObject meta = ir.get(0).getAsJsonObject().getAsJsonObject("meta");
                    double prev = meta.has("chartPreviousClose") ? meta.get("chartPreviousClose").getAsDouble() : 0;
                    today.addProperty("date",      LocalDate.now().toString());
                    today.addProperty("high",      dayHigh);
                    today.addProperty("low",       dayLow);
                    today.addProperty("lastPrice", last);
                    today.addProperty("range",     dayHigh - dayLow);
                    today.addProperty("prevClose", prev);
                    today.addProperty("changePct", prev > 0 ? ((last - prev) / prev) * 100.0 : 0);
                    today.addProperty("live",      true);
                } else {
                    today.addProperty("live", false);
                }
            }
        } catch (Exception ignored) { today.addProperty("live", false); }

        JsonObject out = new JsonObject();
        out.addProperty("symbol",    symbol);
        out.addProperty("totalDays", records.size());
        out.add("bestDay",   toJson(best));
        out.add("latestDay", toJson(latest));
        out.add("today",     today);
        JsonArray top = new JsonArray();
        records.subList(0, Math.min(10, records.size())).forEach(r -> top.add(toJson(r)));
        out.add("topDays", top);
        return new Gson().toJson(out);
    }

    // ── Shared helpers ────────────────────────────────────────────────────

    private static HttpClient httpClient() {
        return HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    private static JsonObject yahooFetch(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url))
                .header("User-Agent", "Mozilla/5.0")
                .header("Accept", "application/json")
                .GET().build();
        HttpResponse<String> resp = httpClient().send(req, HttpResponse.BodyHandlers.ofString());
        JsonObject root  = JsonParser.parseString(resp.body()).getAsJsonObject();
        JsonObject chart = root.getAsJsonObject("chart");
        JsonElement err  = chart.get("error");
        if (err != null && !err.isJsonNull())
            throw new Exception(err.getAsJsonObject().get("description").getAsString());
        return chart;
    }

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null) return map;
        for (String kv : query.split("&")) {
            String[] p = kv.split("=", 2);
            if (p.length == 2) {
                try { map.put(p[0], URLDecoder.decode(p[1], StandardCharsets.UTF_8)); }
                catch (Exception e) { map.put(p[0], p[1]); }
            }
        }
        return map;
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

    private static String safe(String msg) {
        return msg == null ? "Unknown error" : msg.replace("\"", "'");
    }

    private static void respond(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }
}
