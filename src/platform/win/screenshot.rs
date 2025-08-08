use image::GenericImageView as _;
use image::ImageBuffer;
use image::Rgb;
use windows::Win32::Graphics::Gdi::HGDIOBJ;
use windows::Win32::Storage::Xps::PrintWindow;
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::UI::WindowsAndMessaging::PW_RENDERFULLCONTENT;
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC,
        DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, HBITMAP, HDC, ReleaseDC, SRCCOPY,
        SelectObject,
    },
};

pub fn screenshot_window(hwnd: HWND) -> Option<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    unsafe {
        let hdc_window = GetDC(Some(hwnd));
        let (width, height) = get_window_size(hwnd)?;
        let hdc_mem = CreateCompatibleDC(Some(hdc_window));
        let hbitmap = create_bitmap(hwnd, hdc_window, hdc_mem, width, height)?;
        let buffer = extract_bitmap_data(hdc_mem, hbitmap, width, height)?;
        let img = construct_image(width, height, buffer)?;
        let cleaned_img = remove_black_borders(&img);

        // Cleanup
        let _ = DeleteObject(hbitmap.into());
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd), hdc_window);

        Some(cleaned_img)
    }
}

fn get_window_size(hwnd: HWND) -> Option<(i32, i32)> {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_ok() {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            Some((width, height))
        } else {
            None
        }
    }
}

fn create_bitmap(
    hwnd: HWND,
    hdc_window: HDC,
    hdc_mem: HDC,
    width: i32,
    height: i32,
) -> Option<HBITMAP> {
    unsafe {
        let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
        if hbitmap.0 == std::ptr::null_mut() {
            println!("Failed to create compatible bitmap");
            return None;
        }

        let _old_bitmap = SelectObject(hdc_mem, HGDIOBJ(hbitmap.0));

        // Try PrintWindow first (better for modern apps)
        let print_success = PrintWindow(
            hwnd,
            hdc_mem,
            windows::Win32::Storage::Xps::PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT),
        );

        if !print_success.as_bool() {
            println!("PrintWindow failed, trying BitBlt...");
            let success = BitBlt(
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

            if success.is_ok() {
                println!("BitBlt succeeded");
            } else {
                println!("BitBlt failed");
                let _ = DeleteObject(hbitmap.into());
                return None;
            }
        }

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
) -> Option<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    // Convert BGRA to RGBA
    let mut rgba_buffer = Vec::with_capacity(buffer.len());

    for chunk in buffer.chunks_exact(4) {
        rgba_buffer.push(chunk[2]); // R (was B)
        rgba_buffer.push(chunk[1]); // G (stays G)
        rgba_buffer.push(chunk[0]); // B (was R)
        // rgba_buffer.push(chunk[3]); // A (stays A)
    }

    ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(width as u32, height as u32, rgba_buffer)
}

fn remove_black_borders(img: &ImageBuffer<Rgb<u8>, Vec<u8>>) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let (width, height) = img.dimensions();
    let mut top = 0;
    let mut bottom = height;
    let mut left = 0;
    let mut right = width;

    // Helper to check if a pixel is pure black
    let is_black = |p: &Rgb<u8>| p.0[0] == 0 && p.0[1] == 0 && p.0[2] == 0;

    // 4 loops are faster due to the nature of the search,
    // we only have outlines to check.

    // 'loop_name syntax names the loop so we can break
    // out of it in the inside loop.

    'outer_top: for y in 0..height {
        for x in 0..width {
            if !is_black(&img.get_pixel(x, y)) {
                top = y;
                break 'outer_top;
            }
        }
    }

    'outer_bottom: for y in (0..height).rev() {
        for x in 0..width {
            if !is_black(&img.get_pixel(x, y)) {
                bottom = y + 1; // +1 since it's exclusive
                break 'outer_bottom;
            }
        }
    }

    'outer_left: for x in 0..width {
        for y in top..bottom {
            if !is_black(&img.get_pixel(x, y)) {
                left = x;
                break 'outer_left;
            }
        }
    }

    'outer_right: for x in (0..width).rev() {
        for y in top..bottom {
            if !is_black(&img.get_pixel(x, y)) {
                right = x + 1; // +1 since it's exclusive
                break 'outer_right;
            }
        }
    }

    // Crop the image to the detected bounds
    img.view(left, top, right - left, bottom - top).to_image()
}
