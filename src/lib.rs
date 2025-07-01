pub mod db;
pub mod models;
pub mod tracker;

#[cfg(test)]
mod tests {
    use crate::tracker::{get_active_window, get_active_window_info};

    #[test]
    fn test_get_active_window_info() {
        let result = get_active_window();
        println!("Active window: {:?}", result);

        let info_result = get_active_window_info(result.unwrap());
        println!("Active window info: {:?}", info_result);
    }
}
