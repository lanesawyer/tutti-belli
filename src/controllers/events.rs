#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]
use axum::debug_handler;
use loco_rs::prelude::*;

use crate::models::events;

#[debug_handler]
pub async fn index(State(ctx): State<AppContext>) -> Result<Response> {
    let res = events::Entity::find().all(&ctx.db).await?;
    format::json(res)
}

pub fn routes() -> Routes {
    Routes::new().prefix("api/events/").add("/", get(index))
}
