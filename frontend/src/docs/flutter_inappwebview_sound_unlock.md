# Flutter `flutter_inappwebview` → Web audio unlock (Restaurant order sound)

Browsers/WebViews block audio playback until the page receives a **user gesture**.  
The web app exposes a bridge you can call from Flutter to unlock audio after the first user tap.

## Web side

The restaurant web app sets:

- `window.__ABHIKARO_UNLOCK_SOUND__` (function)

Calling it will mark sound as unlocked and run a best-effort “silent” play to enable instant future sounds.

## Flutter side (example)

Call this **once**, after the first user interaction (e.g., first tap on the screen or when opening the Orders screen):

```dart
await controller.evaluateJavascript(source: """
  if (window.__ABHIKARO_UNLOCK_SOUND__) {
    window.__ABHIKARO_UNLOCK_SOUND__();
  }
""");
```

## Recommended InAppWebView settings

Ensure media playback isn’t blocked unnecessarily:

- `mediaPlaybackRequiresUserGesture: true` is OK **if** you call the JS function from a real gesture handler.
- Also allow audio focus / autoplay as needed for your app UX.

