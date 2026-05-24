package com.stocks;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class Database {

    private static final String URL  = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/stockanalyzer");
    private static final String USER = System.getenv().getOrDefault("DB_USER", "postgres");
    private static final String PASS = System.getenv().getOrDefault("DB_PASS", "postgres");

    public static Connection connect() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASS);
    }
}
