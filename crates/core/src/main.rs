use core::{db, tracker::window_processor::WindowEventProcessor};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();

    let config = core::config::Config::load().unwrap_or_default();
    let db_url = config.database_url;
    println!("Using database URL: {}", db_url);
    let db_pool = db::pool::create_pool(&db_url).await?;

    let processor = WindowEventProcessor::new(db_pool);
    processor.start();
    tokio::signal::ctrl_c().await?;
    Ok(())
}
