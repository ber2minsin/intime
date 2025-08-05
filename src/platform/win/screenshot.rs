use image::ImageBuffer;
use image::Rgba;
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC,
        DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, HBITMAP, HDC, ReleaseDC, SRCCOPY,
        SelectObject,
    },
    UI::WindowsAndMessaging::GetClientRect,
};

pub fn screenshot_window(hwnd: HWND) -> Option<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    unsafe {
        let hdc_window = GetDC(Some(hwnd));
        let (width, height) = get_window_size(hwnd)?;
        let hdc_mem = CreateCompatibleDC(Some(hdc_window));
        let hbitmap = create_bitmap(hdc_window, hdc_mem, width, height)?;
        let buffer = extract_bitmap_data(hdc_mem, hbitmap, width, height)?;
        let img = construct_image(width, height, buffer);

        // Cleanup
        let _ = DeleteObject(hbitmap.into());
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd), hdc_window);

        img
    }
}

fn get_window_size(hwnd: HWND) -> Option<(i32, i32)> {
    unsafe {
        let mut rect = RECT::default();
        if GetClientRect(hwnd, &mut rect).is_ok() {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            Some((width, height))
        } else {
            None
        }
    }
}

fn create_bitmap(hdc_window: HDC, hdc_mem: HDC, width: i32, height: i32) -> Option<HBITMAP> {
    unsafe {
        let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
        if hbitmap.0 == std::ptr::null_mut() {
            return None;
        }
        SelectObject(hdc_mem, windows::Win32::Graphics::Gdi::HGDIOBJ(hbitmap.0));
        let _ = BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            Some(hdc_window),
            0,
            0,
            SRCCOPY,
        );
        Some(hbitmap)
    }
}

fn extract_bitmap_data(hdc_mem: HDC, hbitmap: HBITMAP, width: i32, height: i32) -> Option<Vec<u8>> {
    unsafe {
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buffer = vec![0u8; (width * height * 4) as usize];
        let res = GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        if res == 0 { None } else { Some(buffer) }
    }
}

fn construct_image(
    width: i32,
    height: i32,
    buffer: Vec<u8>,
) -> Option<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width as u32, height as u32, buffer)
}
