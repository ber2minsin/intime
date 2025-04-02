# Check the operating system
import os
from pprint import pprint
import time
import win32con


if os.name == "nt":
    import base_module.windows.app_info as app_info
elif os.name == "posix":
    import base_module.linux.app_info as app_info
else:
    raise Exception("Unsupported operating system")


def on_window_change(event_name: str, window_info: app_info.WindowInfo):
    if window_info and event_name == "Foreground":
        pprint(window_info.model_dump())


def main():

    all_apps: list[app_info.WindowInfo] = app_info.get_all_apps()
    for app in all_apps:
        pprint(app.model_dump())

    active_app: app_info.WindowInfo = app_info.get_active_app()
    print("\nActive App:")
    pprint(active_app.model_dump())

    events_to_track = {win32con.EVENT_SYSTEM_FOREGROUND}

    print("Starting window change monitor...")
    app_info.start_window_event_listener(on_window_change, events_to_track)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        app_info.stop_window_event_listener()


if __name__ == "__main__":
    main()
