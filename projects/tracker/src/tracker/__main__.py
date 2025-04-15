import os
from pprint import pprint
import time
import win32con


if os.name == "nt":
    import app_inspect.windows.app_info as app_info
elif os.name == "posix":
    import app_inspect.linux.app_info as app_info
else:
    raise Exception("Unsupported operating system")


def on_window_change(event_name: str, window_info: app_info.WindowInfo):
    print(f"\nEvent received: {event_name}")
    if window_info:
        pprint(window_info.model_dump())
    else:
        print("No window info provided")


def main():
    # Get all apps (optional - for initial state)
    # all_apps: list[app_info.WindowInfo] = app_info.get_all_apps()
    # for app in all_apps:
    #     pprint(app.model_dump())

    active_app: app_info.WindowInfo = app_info.get_active_app()
    print("\nActive App:")
    pprint(active_app.model_dump())

    # Set up events to track
    events_to_track = {
        win32con.EVENT_SYSTEM_FOREGROUND,
        win32con.EVENT_OBJECT_NAMECHANGE,
    }

    print(f"Starting window change monitor with events: {events_to_track}")
    # Track if any events are received at all
    print(f"EVENT_SYSTEM_FOREGROUND: {win32con.EVENT_SYSTEM_FOREGROUND}")
    print(f"EVENT_OBJECT_NAMECHANGE: {win32con.EVENT_OBJECT_NAMECHANGE}")

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
