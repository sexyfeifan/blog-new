//! Blog handlers

use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    Json,
};
use std::net::SocketAddr;

use crate::error::{ApiError, ApiResponse, PaginatedData};
use crate::middleware::auth::AuthUser;
use crate::models::blog::{
    BlogDetail, BlogListItem, BlogQueryParams, BlogResponse, CreateBlogRequest,
    DraftsQuery, ImportMarkdownRequest, UpdateBlogRequest,
};
use crate::repositories::blog_repo::BlogRepository;
use crate::repositories::tag_repo::TagRepository;
use crate::services::blog_service::BlogService;
use crate::services::cache_service::{cache_keys, cache_ttl};
use crate::utils::markdown::render_markdown;
use crate::AppState;

/// Extract client IP from request headers or connection info
fn get_client_ip_from_headers(headers: &HeaderMap, addr: &SocketAddr) -> String {
    // Try X-Forwarded-For header first (for proxied requests)
    if let Some(forwarded) = headers.get("x-forwarded-for") {
        if let Ok(value) = forwarded.to_str() {
            // Take the first IP in the chain
            if let Some(ip) = value.split(',').next() {
                return ip.trim().to_string();
            }
        }
    }

    // Try X-Real-IP header
    if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(value) = real_ip.to_str() {
            return value.to_string();
        }
    }

    // Fall back to connection info
    addr.ip().to_string()
}

/// GET /api/v1/blogs
///
/// Get paginated list of published blogs (public endpoint)
pub async fn list_blogs(
    State(state): State<AppState>,
    Query(params): Query<BlogQueryParams>,
) -> Result<Json<ApiResponse<PaginatedData<BlogListItem>>>, ApiError> {
    let page = params.page();
    let page_size = params.page_size();

    // Only use cache for simple queries without filters
    let use_cache = params.category_id.is_none() && params.tag_id.is_none();
    let cache_key = cache_keys::blog_list(page, page_size);

    // Try to get from cache first
    if use_cache {
        if let Ok(Some(cached)) = state
            .cache
            .get::<PaginatedData<BlogListItem>>(&cache_key)
            .await
        {
            tracing::debug!(
                "Cache hit for blog list (page {}, size {})",
                page,
                page_size
            );
            return Ok(Json(ApiResponse::success(cached)));
        }
    }

    let (blogs, total) = BlogRepository::find_with_filters(
        &state.db,
        page,
        page_size,
        params.category_id,
        params.tag_id,
        Some(true), // Only published blogs for public endpoint
    )
    .await?;

    let paginated = PaginatedData::new(blogs, total, page, page_size);

    // Cache the result if it's a simple query
    if use_cache {
        if let Err(e) = state
            .cache
            .set(&cache_key, &paginated, cache_ttl::BLOG_LIST)
            .await
        {
            tracing::warn!("Failed to cache blog list: {}", e);
        }
    }

    tracing::debug!(
        "Retrieved {} blogs from database (page {}, total {})",
        paginated.items.len(),
        page,
        total
    );

    Ok(Json(ApiResponse::success(paginated)))
}

/// GET /api/v1/blogs/drafts?key=xxx
///
/// List draft blogs, protected by a simple query key
pub async fn list_drafts(
    State(state): State<AppState>,
    Query(params): Query<DraftsQuery>,
) -> Result<Json<ApiResponse<PaginatedData<BlogListItem>>>, ApiError> {
    let configured_key = state.config.drafts_access_key.as_deref();
    match configured_key {
        None => {
            return Err(ApiError::Forbidden(
                "Drafts access is not configured".to_string(),
            ));
        }
        Some(expected) => {
            let provided = params
                .key
                .as_deref()
                .ok_or_else(|| ApiError::Unauthorized("Missing drafts key".to_string()))?;
            if provided != expected {
                return Err(ApiError::Unauthorized("Invalid drafts key".to_string()));
            }
        }
    }

    let page = params.page();
    let page_size = params.page_size();

    let (blogs, total) = BlogRepository::list_drafts(&state.db, page, page_size).await?;
    let paginated = PaginatedData::new(blogs, total, page, page_size);

    Ok(Json(ApiResponse::success(paginated)))
}

/// GET /api/v1/blogs/:id
///
/// Get a single blog by ID (public endpoint)
pub async fn get_blog(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    let cache_key = cache_keys::blog_detail(id);

    // Try to get from cache first
    if let Ok(Some(cached)) = state.cache.get::<BlogResponse>(&cache_key).await {
        tracing::debug!("Cache hit for blog detail (id {})", id);

        // Still increment view count even for cached responses
        let client_ip = get_client_ip_from_headers(&headers, &addr);
        let _ = BlogService::increment_view_count(&state.db, &state.cache, id, &client_ip).await;

        return Ok(Json(ApiResponse::success(cached)));
    }

    let blog = BlogRepository::find_detail_by_id(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    // Only return published blogs for public endpoint
    if !blog.is_published {
        return Err(ApiError::NotFound(format!("Blog with id {} not found", id)));
    }

    let response = BlogResponse::from(blog);

    // Cache the result
    if let Err(e) = state
        .cache
        .set(&cache_key, &response, cache_ttl::BLOG_DETAIL)
        .await
    {
        tracing::warn!("Failed to cache blog detail: {}", e);
    }

    // Increment view count with rate limiting
    let client_ip = get_client_ip_from_headers(&headers, &addr);
    let _ = BlogService::increment_view_count(&state.db, &state.cache, id, &client_ip).await;

    Ok(Json(ApiResponse::success(response)))
}

/// GET /api/v1/blogs/slug/:slug
///
/// Get a single blog by slug (public endpoint)
pub async fn get_blog_by_slug(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    let cache_key = cache_keys::blog_slug(&slug);

    // Try to get from cache first
    if let Ok(Some(cached)) = state.cache.get::<BlogResponse>(&cache_key).await {
        tracing::debug!("Cache hit for blog by slug (slug {})", slug);

        // Still increment view count even for cached responses
        let client_ip = get_client_ip_from_headers(&headers, &addr);
        let _ =
            BlogService::increment_view_count(&state.db, &state.cache, cached.id, &client_ip).await;

        return Ok(Json(ApiResponse::success(cached)));
    }

    let blog = BlogRepository::find_detail_by_slug(&state.db, &slug)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with slug '{}' not found", slug)))?;

    // Only return published blogs for public endpoint
    if !blog.is_published {
        return Err(ApiError::NotFound(format!(
            "Blog with slug '{}' not found",
            slug
        )));
    }

    let response = BlogResponse::from(blog);

    // Cache the result
    if let Err(e) = state
        .cache
        .set(&cache_key, &response, cache_ttl::BLOG_DETAIL)
        .await
    {
        tracing::warn!("Failed to cache blog by slug: {}", e);
    }

    // Increment view count with rate limiting
    let client_ip = get_client_ip_from_headers(&headers, &addr);
    let _ =
        BlogService::increment_view_count(&state.db, &state.cache, response.id, &client_ip).await;

    Ok(Json(ApiResponse::success(response)))
}

/// GET /api/v1/admin/blogs
///
/// Get paginated list of all blogs (admin endpoint)
pub async fn admin_list_blogs(
    State(state): State<AppState>,
    Query(params): Query<BlogQueryParams>,
) -> Result<Json<ApiResponse<PaginatedData<BlogListItem>>>, ApiError> {
    let page = params.page();
    let page_size = params.page_size();

    let (blogs, total) = BlogRepository::find_with_filters(
        &state.db,
        page,
        page_size,
        params.category_id,
        params.tag_id,
        params.is_published, // Admin can filter by published status
    )
    .await?;

    tracing::debug!(
        "Admin retrieved {} blogs (page {}, total {})",
        blogs.len(),
        page,
        total
    );

    Ok(Json(ApiResponse::success(PaginatedData::new(
        blogs, total, page, page_size,
    ))))
}

/// GET /api/v1/admin/blogs/:id
///
/// Get a single blog by ID (admin endpoint - includes unpublished)
pub async fn admin_get_blog(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<BlogDetail>>, ApiError> {
    let blog = BlogRepository::find_detail_by_id(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    Ok(Json(ApiResponse::success(blog)))
}

/// POST /api/v1/admin/blogs
///
/// Create a new blog (admin endpoint)
pub async fn create_blog(
    State(state): State<AppState>,
    Json(req): Json<CreateBlogRequest>,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    // Validate input
    if req.title.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Blog title is required".to_string(),
        ));
    }

    if req.content.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Blog content is required".to_string(),
        ));
    }

    // Check if slug already exists (if provided)
    if let Some(ref slug) = req.slug {
        if !slug.is_empty() && BlogRepository::slug_exists(&state.db, slug, None).await? {
            return Err(ApiError::ValidationError(format!(
                "Blog with slug '{}' already exists",
                slug
            )));
        }
    }

    // Render markdown to HTML
    let html = render_markdown(&req.content);

    // Create blog
    let blog = BlogRepository::create(&state.db, &req, Some(html)).await?;

    // Fetch the full blog detail with category and tags
    let blog_detail = BlogRepository::find_detail_by_id(&state.db, blog.id)
        .await?
        .ok_or_else(|| ApiError::InternalError("Failed to fetch created blog".to_string()))?;

    // Invalidate related caches
    if let Err(e) =
        BlogService::invalidate_blog_cache(&state.cache, blog.id, blog.slug.as_deref()).await
    {
        tracing::warn!("Failed to invalidate blog cache: {}", e);
    }

    tracing::info!("Created blog: {} (id: {})", blog.title, blog.id);

    Ok(Json(ApiResponse::success(BlogResponse::from(blog_detail))))
}

/// PUT /api/v1/admin/blogs/:id
///
/// Update an existing blog (admin endpoint)
pub async fn update_blog(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateBlogRequest>,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    // Check if blog exists and get old slug for cache invalidation
    let old_blog = BlogRepository::find_by_id(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    // Validate title if provided
    if let Some(ref title) = req.title {
        if title.trim().is_empty() {
            return Err(ApiError::ValidationError(
                "Blog title cannot be empty".to_string(),
            ));
        }
    }

    // Check if slug already exists (if being updated)
    if let Some(ref slug) = req.slug {
        if !slug.is_empty() && BlogRepository::slug_exists(&state.db, slug, Some(id)).await? {
            return Err(ApiError::ValidationError(format!(
                "Blog with slug '{}' already exists",
                slug
            )));
        }
    }

    // Render markdown to HTML if content is being updated
    let html = req.content.as_ref().map(|content| render_markdown(content));

    // Update blog
    let blog = BlogRepository::update(&state.db, id, &req, html)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    // Fetch the full blog detail with category and tags
    let blog_detail = BlogRepository::find_detail_by_id(&state.db, blog.id)
        .await?
        .ok_or_else(|| ApiError::InternalError("Failed to fetch updated blog".to_string()))?;

    // Invalidate related caches (both old and new slug if changed)
    if let Err(e) =
        BlogService::invalidate_blog_cache(&state.cache, blog.id, blog.slug.as_deref()).await
    {
        tracing::warn!("Failed to invalidate blog cache: {}", e);
    }

    // Also invalidate old slug cache if slug was changed
    if old_blog.slug != blog.slug {
        if let Some(old_slug) = old_blog.slug.as_deref() {
            if let Err(e) = state.cache.delete(&cache_keys::blog_slug(old_slug)).await {
                tracing::warn!("Failed to invalidate old slug cache: {}", e);
            }
        }
    }

    tracing::info!("Updated blog: {} (id: {})", blog.title, blog.id);

    Ok(Json(ApiResponse::success(BlogResponse::from(blog_detail))))
}

/// DELETE /api/v1/admin/blogs/:id
///
/// Delete a blog (admin endpoint)
pub async fn delete_blog(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    // Check if blog exists
    let blog = BlogRepository::find_by_id(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    // Delete blog (tags will be automatically removed due to CASCADE)
    let deleted = BlogRepository::delete(&state.db, id).await?;
    if !deleted {
        return Err(ApiError::NotFound(format!("Blog with id {} not found", id)));
    }

    // Invalidate related caches
    if let Err(e) = BlogService::invalidate_blog_cache(&state.cache, id, blog.slug.as_deref()).await
    {
        tracing::warn!("Failed to invalidate blog cache: {}", e);
    }

    tracing::info!("Deleted blog: {} (id: {})", blog.title, id);

    Ok(Json(ApiResponse {
        code: 0,
        message: "Blog deleted successfully".to_string(),
        data: None,
    }))
}

use serde::Serialize;

/// Batch convert result
#[derive(Debug, Serialize)]
pub struct BatchConvertResult {
    pub total: i64,
    pub converted: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

/// POST /api/v1/admin/blogs/convert-markdown
///
/// Batch convert all blogs' markdown content to HTML
/// Force converts ALL blogs (re-renders existing HTML)
pub async fn batch_convert_markdown(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<BatchConvertResult>>, ApiError> {
    let mut result = BatchConvertResult {
        total: 0,
        converted: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    // Get ALL blogs for force conversion
    let blogs = sqlx::query_as::<_, (i64, String, Option<String>)>(
        r#"SELECT id, content, html FROM blogs"#,
    )
    .fetch_all(&state.db)
    .await?;

    result.total = blogs.len() as i64;

    for (id, content, _html) in blogs {
        if content.trim().is_empty() {
            result.skipped += 1;
            continue;
        }

        // Convert markdown to HTML
        let html = render_markdown(&content);

        // Update the blog
        match sqlx::query(r#"UPDATE blogs SET html = $1, updated_at = NOW() WHERE id = $2"#)
            .bind(&html)
            .bind(id)
            .execute(&state.db)
            .await
        {
            Ok(_) => result.converted += 1,
            Err(e) => {
                result.errors.push(format!("Blog {}: {}", id, e));
            }
        }
    }

    // Invalidate all blog caches
    let _ = state.cache.delete_pattern("blog:*").await;

    tracing::info!(
        "Batch converted {} blogs, skipped {}, errors: {}",
        result.converted,
        result.skipped,
        result.errors.len()
    );

    Ok(Json(ApiResponse::success(result)))
}

fn parse_front_matter(content: &str) -> (Option<String>, Option<String>, Option<Vec<String>>, Option<Vec<String>>, String) {
    if !content.starts_with("---") {
        return (None, None, None, None, content.to_string());
    }

    let after_first = &content[3..];
    let end_idx = if let Some(pos) = after_first.find("\n---") {
        pos
    } else if after_first.starts_with("\r\n---") {
        return (None, None, None, None, content.to_string());
    } else {
        return (None, None, None, None, content.to_string());
    };

    let front_matter = &after_first[..end_idx];
    let body_start = end_idx + 4; // \n---
    let body = if body_start < after_first.len() {
        let rest = &after_first[body_start..];
        if rest.starts_with('\n') {
            &rest[1..]
        } else if rest.starts_with("\r\n") {
            &rest[2..]
        } else {
            rest
        }
    } else {
        ""
    };

    let mut title = None;
    let mut date = None;
    let mut tags = None;
    let mut categories = None;

    for line in front_matter.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();

            match key {
                "title" => {
                    let v = value.trim_matches(|c| c == '"' || c == '\'');
                    if !v.is_empty() {
                        title = Some(v.to_string());
                    }
                }
                "date" => {
                    if !value.is_empty() {
                        date = Some(value.to_string());
                    }
                }
                "tags" => {
                    let parsed = parse_yaml_list(value);
                    if !parsed.is_empty() {
                        tags = Some(parsed);
                    }
                }
                "categories" => {
                    let parsed = parse_yaml_list(value);
                    if !parsed.is_empty() {
                        categories = Some(parsed);
                    }
                }
                _ => {}
            }
        }
    }

    (title, date, tags, categories, body.to_string())
}

fn parse_yaml_list(value: &str) -> Vec<String> {
    let value = value.trim();

    // Inline list: [tag1, tag2]
    if value.starts_with('[') && value.ends_with(']') {
        let inner = &value[1..value.len() - 1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }

    // Single value
    if !value.is_empty() {
        return vec![value.trim_matches(|c| c == '"' || c == '\'').to_string()];
    }

    Vec::new()
}

/// POST /api/v1/admin/blogs/import-markdown
///
/// Import a blog post from markdown content with YAML front matter
pub async fn import_markdown(
    State(state): State<AppState>,
    AuthUser { .. }: AuthUser,
    Json(req): Json<ImportMarkdownRequest>,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    if req.content.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Markdown content is required".to_string(),
        ));
    }

    let (fm_title, _date, fm_tags, _categories, body) = parse_front_matter(&req.content);

    let title = fm_title.ok_or_else(|| {
        ApiError::ValidationError(
            "No title found in front matter. Add 'title: ...' to the YAML header.".to_string(),
        )
    })?;

    if body.trim().is_empty() {
        return Err(ApiError::ValidationError(
            "Markdown body is empty after parsing front matter".to_string(),
        ));
    }

    let is_published = req
        .status
        .as_deref()
        .map(|s| s == "published")
        .unwrap_or(false);

    // Resolve tag names to IDs (create tags if they don't exist)
    let tag_ids = if let Some(ref tag_names) = fm_tags {
        let mut ids = Vec::new();
        for name in tag_names {
            let tag = if let Some(existing) = TagRepository::find_by_name(&state.db, name).await? {
                existing
            } else {
                TagRepository::create(&state.db, &crate::models::tag::CreateTagRequest {
                    name: name.clone(),
                })
                .await?
            };
            ids.push(tag.id);
        }
        Some(ids)
    } else {
        None
    };

    let create_req = CreateBlogRequest {
        title,
        slug: None,
        author: None,
        content: body,
        summary: None,
        thumbnail: None,
        category_id: req.category_id,
        tag_ids,
        is_published: Some(is_published),
        references: None,
    };

    let html = render_markdown(&create_req.content);
    let blog = BlogRepository::create(&state.db, &create_req, Some(html)).await?;

    let blog_detail = BlogRepository::find_detail_by_id(&state.db, blog.id)
        .await?
        .ok_or_else(|| ApiError::InternalError("Failed to fetch created blog".to_string()))?;

    if let Err(e) =
        BlogService::invalidate_blog_cache(&state.cache, blog.id, blog.slug.as_deref()).await
    {
        tracing::warn!("Failed to invalidate blog cache: {}", e);
    }

    tracing::info!("Imported blog from markdown: {} (id: {})", blog.title, blog.id);

    Ok(Json(ApiResponse::success(BlogResponse::from(blog_detail))))
}

/// GET /api/v1/blogs/drafts/{id}?key=xxx
///
/// Get a single draft blog by ID (requires drafts key)
pub async fn get_draft(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(params): Query<DraftsQuery>,
) -> Result<Json<ApiResponse<BlogResponse>>, ApiError> {
    let config = &state.config;
    let expected_key = match &config.drafts_access_key {
        Some(key) => key,
        None => {
            return Err(ApiError::Forbidden(
                "Drafts access is not configured".to_string(),
            ));
        }
    };

    let provided = params
        .key
        .as_deref()
        .ok_or_else(|| ApiError::Unauthorized("Missing drafts key".to_string()))?;
    if provided != expected_key {
        return Err(ApiError::Unauthorized("Invalid drafts key".to_string()));
    }

    let blog = BlogRepository::find_detail_by_id(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Blog with id {} not found", id)))?;

    let response = BlogResponse::from(blog);
    Ok(Json(ApiResponse::success(response)))
}
