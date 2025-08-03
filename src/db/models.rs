use sqlx::FromRow;

#[derive(Debug, FromRow)]
pub struct DBApp {
    pub id: Option<i64>,
    pub name: String,
    pub path: String,
    pub icon: Option<Vec<u8>>,
}
