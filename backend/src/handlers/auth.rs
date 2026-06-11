//! Authentication handlers

use axum::{extract::State, Json};

use crate::error::{ApiError, ApiResponse};
use crate::middleware::auth::AuthUser;
use crate::models::user::{
    ChangePasswordRequest, CreateUserRequest, LoginRequest, LoginResponse, RefreshTokenRequest,
    RefreshTokenResponse, UpdateAccountRequest, UserResponse,
};
use crate::repositories::user_repo::UserRepository;
use crate::services::auth_service::AuthService;
use crate::AppState;

/// POST /api/v1/auth/login
///
/// Authenticate user and return JWT tokens
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, ApiError> {
    // Validate input
    if req.username.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Username is required".to_string(),
        ));
    }
    if req.password.is_empty() {
        return Err(ApiError::ValidationError(
            "Password is required".to_string(),
        ));
    }

    // Find user by username
    let user = UserRepository::find_by_username(&state.db, &req.username)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("Invalid username or password".to_string()))?;

    // Verify password
    let is_valid = UserRepository::verify_password(&req.password, &user.password_hash)?;
    if !is_valid {
        return Err(ApiError::Unauthorized(
            "Invalid username or password".to_string(),
        ));
    }

    // Generate tokens
    let auth_service = AuthService::new(state.config.jwt.clone());
    let response = auth_service.create_login_response(user)?;

    tracing::info!("User '{}' logged in successfully", req.username);

    Ok(Json(ApiResponse::success(response)))
}

/// POST /api/v1/auth/refresh
///
/// Refresh access token using refresh token
pub async fn refresh_token(
    State(state): State<AppState>,
    Json(req): Json<RefreshTokenRequest>,
) -> Result<Json<ApiResponse<RefreshTokenResponse>>, ApiError> {
    // Validate input
    if req.refresh_token.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Refresh token is required".to_string(),
        ));
    }

    // Verify refresh token
    let auth_service = AuthService::new(state.config.jwt.clone());
    let claims = auth_service.verify_refresh_token(&req.refresh_token)?;

    // Find user to ensure they still exist
    let user = UserRepository::find_by_id(&state.db, claims.sub)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("User not found".to_string()))?;

    // Generate new access token
    let response = auth_service.create_refresh_response(&user)?;

    tracing::debug!("Token refreshed for user '{}'", user.username);

    Ok(Json(ApiResponse::success(response)))
}

use serde::Serialize;

/// Check if any admin exists response
#[derive(Debug, Serialize)]
pub struct AdminExistsResponse {
    pub exists: bool,
}

/// GET /api/v1/auth/check-admin
///
/// Check if any admin user exists in the system
/// This is a public endpoint used to determine if setup is needed
pub async fn check_admin_exists(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<AdminExistsResponse>>, ApiError> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(ApiResponse::success(AdminExistsResponse {
        exists: count > 0,
    })))
}

/// POST /api/v1/auth/setup
///
/// Register the first admin user (only works when no users exist)
pub async fn setup_admin(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, ApiError> {
    // Check if any user already exists
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    if count > 0 {
        return Err(ApiError::ValidationError(
            "Admin user already exists. Please use login instead.".to_string(),
        ));
    }

    // Validate input
    if req.username.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Username is required".to_string(),
        ));
    }
    if req.password.len() < 6 {
        return Err(ApiError::ValidationError(
            "Password must be at least 6 characters".to_string(),
        ));
    }

    // Create the admin user
    let user = UserRepository::create(&state.db, &req).await?;

    // Generate tokens and return login response
    let auth_service = AuthService::new(state.config.jwt.clone());
    let response = auth_service.create_login_response(user)?;

    tracing::info!("First admin user '{}' created successfully", req.username);

    Ok(Json(ApiResponse::success(response)))
}

/// PUT /api/v1/admin/account
///
/// Update current user's account info (username, nickname, email)
pub async fn update_account(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<UpdateAccountRequest>,
) -> Result<Json<ApiResponse<UserResponse>>, ApiError> {
    // Validate username if provided
    if let Some(ref username) = req.username {
        if username.trim().is_empty() {
            return Err(ApiError::ValidationError(
                "Username cannot be empty".to_string(),
            ));
        }
        // Check if username is taken by another user
        if UserRepository::username_exists_exclude(&state.db, username, user_id).await? {
            return Err(ApiError::ValidationError(format!(
                "Username '{}' is already taken",
                username
            )));
        }
    }

    let user = UserRepository::update_account(
        &state.db,
        user_id,
        req.username.as_deref(),
        req.nickname.as_deref(),
        req.email.as_deref(),
    )
    .await?;

    tracing::info!("Updated account for user '{}'", user.username);

    Ok(Json(ApiResponse::success(UserResponse::from(user))))
}

/// PUT /api/v1/admin/account/password
///
/// Change current user's password
pub async fn change_password(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    // Validate input
    if req.current_password.is_empty() {
        return Err(ApiError::ValidationError(
            "Current password is required".to_string(),
        ));
    }
    if req.new_password.len() < 6 {
        return Err(ApiError::ValidationError(
            "New password must be at least 6 characters".to_string(),
        ));
    }

    // Get current user
    let user = UserRepository::find_by_id(&state.db, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".to_string()))?;

    // Verify current password
    let is_valid = UserRepository::verify_password(&req.current_password, &user.password_hash)?;
    if !is_valid {
        return Err(ApiError::Unauthorized(
            "Current password is incorrect".to_string(),
        ));
    }

    // Update password
    UserRepository::update_password(&state.db, user_id, &req.new_password).await?;

    tracing::info!("Password changed for user '{}'", user.username);

    Ok(Json(ApiResponse::ok()))
}
