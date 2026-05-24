package com.stocks;

import org.mindrot.jbcrypt.BCrypt;

import java.security.SecureRandom;
import java.sql.*;
import java.util.Base64;
import java.util.Optional;

public class AuthService {

    private static final SecureRandom RNG = new SecureRandom();

    public record AuthResult(boolean ok, String message, String token, String username) {}

    public static AuthResult register(String username, String password) {
        if (username == null || username.isBlank() || username.length() < 3)
            return new AuthResult(false, "Username must be at least 3 characters.", null, null);
        if (password == null || password.length() < 6)
            return new AuthResult(false, "Password must be at least 6 characters.", null, null);

        String hash = BCrypt.hashpw(password, BCrypt.gensalt(12));
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id")) {
            ps.setString(1, username.trim().toLowerCase());
            ps.setString(2, hash);
            ps.executeQuery();
            String token = createSession(c, username.trim().toLowerCase());
            return new AuthResult(true, "Account created.", token, username.trim().toLowerCase());
        } catch (SQLException e) {
            if (e.getSQLState().startsWith("23")) // unique violation
                return new AuthResult(false, "Username already taken.", null, null);
            return new AuthResult(false, "Registration failed: " + e.getMessage(), null, null);
        }
    }

    public static AuthResult login(String username, String password) {
        if (username == null || password == null)
            return new AuthResult(false, "Missing credentials.", null, null);
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT id, password_hash FROM users WHERE username = ?")) {
            ps.setString(1, username.trim().toLowerCase());
            ResultSet rs = ps.executeQuery();
            if (!rs.next()) return new AuthResult(false, "Invalid username or password.", null, null);
            if (!BCrypt.checkpw(password, rs.getString("password_hash")))
                return new AuthResult(false, "Invalid username or password.", null, null);
            String token = createSession(c, username.trim().toLowerCase());
            return new AuthResult(true, "Logged in.", token, username.trim().toLowerCase());
        } catch (SQLException e) {
            return new AuthResult(false, "Login failed: " + e.getMessage(), null, null);
        }
    }

    public static Optional<String> validateSession(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT u.username FROM sessions s " +
                     "JOIN users u ON u.id = s.user_id " +
                     "WHERE s.token = ? AND s.expires_at > NOW()")) {
            ps.setString(1, token);
            ResultSet rs = ps.executeQuery();
            return rs.next() ? Optional.of(rs.getString("username")) : Optional.empty();
        } catch (SQLException e) {
            return Optional.empty();
        }
    }

    public static void logout(String token) {
        if (token == null) return;
        try (Connection c = Database.connect();
             PreparedStatement ps = c.prepareStatement("DELETE FROM sessions WHERE token = ?")) {
            ps.setString(1, token);
            ps.executeUpdate();
        } catch (SQLException ignored) {}
    }

    private static String createSession(Connection c, String username) throws SQLException {
        byte[] bytes = new byte[36];
        RNG.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO sessions (token, user_id) " +
                "SELECT ?, id FROM users WHERE username = ?")) {
            ps.setString(1, token);
            ps.setString(2, username);
            ps.executeUpdate();
        }
        return token;
    }
}
