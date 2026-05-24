package com.stocks;

import com.google.gson.*;

import java.sql.*;
import java.time.LocalDate;

public class PortfolioService {

    public static JsonArray getInvestments(String username) throws SQLException {
        JsonArray arr = new JsonArray();
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT i.id, i.symbol, i.shares, i.purchase_price, i.purchase_date, i.notes, i.created_at " +
                     "FROM investments i JOIN users u ON u.id = i.user_id " +
                     "WHERE u.username = ? ORDER BY i.purchase_date DESC")) {
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();
            while (rs.next()) {
                JsonObject row = new JsonObject();
                row.addProperty("id",            rs.getInt("id"));
                row.addProperty("symbol",        rs.getString("symbol"));
                row.addProperty("shares",        rs.getDouble("shares"));
                row.addProperty("purchasePrice", rs.getDouble("purchase_price"));
                row.addProperty("purchaseDate",  rs.getDate("purchase_date").toString());
                row.addProperty("notes",         rs.getString("notes") != null ? rs.getString("notes") : "");
                arr.add(row);
            }
        }
        return arr;
    }

    public static int addInvestment(String username, String symbol, double shares,
                                    double purchasePrice, String purchaseDate, String notes)
            throws SQLException {
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO investments (user_id, symbol, shares, purchase_price, purchase_date, notes) " +
                     "SELECT id, ?, ?, ?, ?, ? FROM users WHERE username = ? RETURNING id")) {
            ps.setString(1, symbol.toUpperCase().strip());
            ps.setDouble(2, shares);
            ps.setDouble(3, purchasePrice);
            ps.setDate(4, Date.valueOf(LocalDate.parse(purchaseDate)));
            ps.setString(5, notes != null ? notes.strip() : "");
            ps.setString(6, username);
            ResultSet rs = ps.executeQuery();
            return rs.next() ? rs.getInt("id") : -1;
        }
    }

    public static boolean deleteInvestment(String username, int id) throws SQLException {
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "DELETE FROM investments i USING users u " +
                     "WHERE i.user_id = u.id AND u.username = ? AND i.id = ?")) {
            ps.setString(1, username);
            ps.setInt(2, id);
            return ps.executeUpdate() > 0;
        }
    }
}
