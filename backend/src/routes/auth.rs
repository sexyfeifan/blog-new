//! Authentication routes

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::handlers::auth;
use crate::AppState;

/// Create authentication routes
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/refresh", post(auth::refresh_token))
        .route("/auth/check-admin", get(auth::check_admin_exists))
        .route("/auth/setup", post(auth::setup_admin))
}

/// Create admin authentication routes (requires authentication)
pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/account", put(auth::update_account))
        .route("/account/password", put(auth::change_password))
}
