use core::{db, tracker::window_processor::WindowEventProcessor};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set in environment");
    let db_pool = db::pool::create_pool(&db_url).await?;

    let processor = WindowEventProcessor::new(db_pool);
    processor.start();
    tokio::signal::ctrl_c().await?;
    Ok(())
}
