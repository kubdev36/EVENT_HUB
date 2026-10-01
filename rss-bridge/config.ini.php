; RSS-Bridge Configuration for Event Hub
; Documentation: https://rss-bridge.github.io/rss-bridge/General/Configuration.html

[system]
; Enable timezone
timezone = "Asia/Ho_Chi_Minh"

; Enable all bridges or specific whitelist
enabled_bridges[] = "FacebookBridge"
enabled_bridges[] = "TelegramBridge"
enabled_bridges[] = "YoutubeBridge"
enabled_bridges[] = "TikTokBridge"

[cache]
; Cache configuration (type: file, custom_timeout allows custom cache durations)
type = "file"
custom_timeout = true

[FacebookBridge]
; Facebook Cookie authentication to bypass login wall
; Get c_user and xs from browser DevTools (F12 -> Application -> Cookies -> facebook.com)
; c_user = "YOUR_C_USER_HERE"
; xs = "YOUR_XS_TOKEN_HERE"
