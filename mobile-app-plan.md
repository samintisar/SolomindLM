# SolomindLM Hybrid Mobile App Implementation Plan

## Context

Building a hybrid WebView/Native mobile app for SolomindLM to enable App Store and Google Play distribution while maintaining the exact mobile UI/UX that's already working well in the web app. The approach uses Expo Router with mixed native and WebView screens, allowing gradual migration to native where it provides the most value.

**Problem**: Need mobile app store distribution for better discoverability and user acquisition
**Solution**: Hybrid approach - native shell with WebView content, progressive native enhancement
**Success**: App store submission within 1 week, approval within 2 weeks, first downloads within 15 days

## Architecture

### Hybrid Pattern
- **Native**: Tab bar navigation, auth screens, platform integrations
- **WebView**: Content screens (notebooks, chat, sources, studio)
- **Migration Path**: Gradual native conversion based on performance metrics

### Project Structure
```
apps/mobile/
├── src/
│   ├── app/                      # Expo Router (file-based routing)
│   │   ├── (tabs)/               # Native tab navigation
│   │   │   ├── _layout.tsx       # Tab navigator configuration
│   │   │   ├── index.tsx         # Home (native notebooks list)
│   │   │   ├── notebook.tsx      # Notebook (WebView interface)
│   │   │   └── settings.tsx      # Settings (WebView)
│   │   └── _layout.tsx           # Root navigator + providers
│   ├── components/
│   ├── web/                      # WebView components
│   │   ├── WebViewScreen.tsx     # Reusable WebView wrapper
│   │   └── AuthInjector.tsx      # Auth token injection
│   ├── navigation/               # Navigation components
│   │   └── TabBar.tsx            # Custom tab bar
│   └── auth/                     # Auth components
│       ├── NativeSignIn.tsx      # Native sign-in UI
│       └── NativeSignUp.tsx      # Native sign-up UI
├── services/
│   ├── auth/                     # Auth services
│   │   ├── nativeAuth.ts         # Native auth implementation
│   │   └── tokenStorage.ts       # Secure token storage
│   ├── convex/                   # Convex integration
│   │   ├── client.ts             # Convex client setup
│   │   └── queries.ts            # Auth queries
│   └── platform/                 # Platform services
│       └── deepLinking.ts        # Deep linking handler
├── context/
│   └── AuthContext.tsx           # Native auth state management
├── hooks/
│   ├── useAuth.ts                # Auth hook
│   ├── useConvexAuth.ts          # Convex auth integration
│   └── useWebViewNavigation.ts   # WebView navigation
├── utils/
│   ├── constants.ts              # App constants
│   ├── platformDetection.ts      # Platform utilities
│   └── logger.ts                 # Logging utilities
├── app.json                      # Expo configuration
├── eas.json                      # EAS build configuration
├── package.json                  # Dependencies
└── .env.local                    # Environment variables
```

## Week 1 Implementation: App Store Submission

### Day 1: Project Setup & Monorepo Configuration

**Tasks**:
1. Initialize Expo SDK 55 app with Router template
2. Configure Metro for monorepo workspace resolution
3. Set up EAS Build configuration
4. Configure crash reporting (Sentry)

**Commands**:
```bash
cd apps
bunx create-expo-app mobile --template default
cd mobile
bunx expo install --fix  # Aligns all packages to SDK 55
bun add expo-router expo-secure-store expo-notifications expo-updates
bun add expo-image-picker expo-document-picker expo-linking
bun add expo-audio  # expo-audio (not expo-av)
bun add convex
bun add @sentry/react-native
bun add -D @types/react-native
```

**Note**: `@convex-dev/auth` is **beta** for React Native - using WebView-based auth for Week 1 avoids beta dependencies.

**Critical Metro Configuration** (`apps/mobile/metro.config.js`):
```javascript
// SDK 55+ auto-configures Metro for monorepos - no manual config needed
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
```

**Note**: After creating this file, run `bunx expo start --clear` once to clear Metro cache.

**Environment Variables** (`apps/mobile/.env.local`):
```
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
EXPO_PUBLIC_WEB_URL=https://your-web-app.com
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
AUTH_GOOGLE_ID=your-google-oauth-client-id
# NO AUTH_GOOGLE_SECRET in mobile - uses PKCE
```

**Dependencies** (SDK 55 versioning):
- `expo@^55.0.0`
- `expo-router@^7.0.0` (v7 ships with SDK 55)
- `expo-secure-store@^55.0.0`
- `expo-notifications@^55.0.0`
- `expo-updates@^55.0.0`
- `expo-image-picker@^55.0.0`
- `expo-document-picker@^55.0.0`
- `expo-audio@^55.0.0` (NOT expo-av - removed in SDK 55)
- `react-native-webview@^14.1+` (New Architecture compatible)
- `@convex-dev/auth@^0.0.90`
- `@sentry/react-native@^6.0.0`

### Day 2: WebView-Based Authentication & Convex Integration

**Tasks**:
1. Implement WebView-based auth (let web app handle session)
2. Configure cookie persistence for iOS/Android
3. Set up Convex client in mobile app
4. Initialize crash reporting

**Core Components**:
- `components/web/WebViewScreen.tsx`: WebView with cookie persistence
- `services/convex/client.ts`: Convex client setup
- `context/AuthContext.tsx`: Auth state from WebView

**WebView Auth Configuration**:
```typescript
// components/web/WebViewScreen.tsx
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";
import { EXPO_PUBLIC_WEB_URL } from "@env";

export function WebViewScreen({ path }: { path: string }) {
  const url = `${EXPO_PUBLIC_WEB_URL}${path}`;

  return (
    <WebView
      source={{ uri: url }}
      // Enable cookie persistence
      sharedCookiesEnabled={Platform.OS === "ios"}
      // Handle external links properly
      onShouldStartLoadWithRequest={(req) => {
        if (!req.url.startsWith(EXPO_PUBLIC_WEB_URL)) {
          Linking.openURL(req.url);
          return false;
        }
        return true;
      }}
      // Enable file access for uploads
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
    />
  );
}
```

**Why WebView-First Auth Works**:
- Web app already has robust @convex-dev/auth implementation
- Cookies persist automatically (iOS sharedCookiesEnabled, Android per-domain)
- No need to manage JWT refresh tokens on native side
- Simpler Week 1, can add native auth screens in v2

**Native Auth Future Path** (Week 2-3):
- Use `@convex-dev/auth` RN integration with expo-secure-store (currently **beta**)
- Pass auth token via postMessage to WebView
- Verify exact API against current SolomindLM auth setup before implementing
- Alternative: Consider third-party auth integrations if beta status is concern

**App Store Submission Requirements**:
- Provide working demo account or fully functional demo mode
- Ensure backend services are live during review period
- Include App Review notes explaining:
  - Which screens are native vs WebView-backed
  - How file upload works natively
  - Test steps for notebook/chat flows
  - Any gated content or features

### Day 3: Tab Navigation & Screen Structure

**Tasks**:
1. Create tab navigator with 3 tabs (Home, Notebook, Settings)
2. Build native Home screen with notebooks list
3. Create WebView wrapper for Notebook screen
4. Implement safe area handling

**Core Components**:
- `app/(tabs)/_layout.tsx`: Tab navigator configuration
- `app/(tabs)/index.tsx`: Native Home screen (notebooks list)
- `app/(tabs)/notebook.tsx`: WebView screen for notebook interface
- `app/(tabs)/settings.tsx`: WebView screen for settings/billing
- `components/navigation/TabBar.tsx`: Custom tab bar UI

**Why 3 Tabs (Not 4)**:
- **Home**: Native list of notebooks/folders
- **Notebook**: WebView for active notebook (chat, sources, studio)
- **Settings**: WebView for billing/account settings

**Tab Structure**:
```typescript
// src/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "blue" }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Home" }}
      />
      <Tabs.Screen
        name="notebook"
        options={{ title: "Notebook" }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings" }}
      />
    </Tabs>
  );
}
```

**Note**: SDK 55 tab layouts include default safe area handling automatically - no manual `SafeAreaProvider` wrapper needed in tab layouts. Keep it in root `_layout.tsx`.

**Native Home Screen** (`app/(tabs)/index.tsx`):
```typescript
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();
  const notebooks = useQuery(api.notebooks.list);

  return (
    <ScrollView>
      {notebooks?.map(notebook => (
        <TouchableOpacity
          key={notebook._id}
          onPress={() => router.push(`/notebook?id=${notebook._id}`)}
        >
          <Text>{notebook.title}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
```

### Day 4: Native File Upload & Camera Integration

**Tasks**:
1. Implement native file picker integration
2. Add camera access for document scanning
3. Create upload service with progress tracking
4. Test file uploads to Convex storage

**Core Components**:
- `services/fileUpload/nativeFilePicker.ts`: Native file picker wrapper
- `services/fileUpload/uploadService.ts`: Upload to Convex storage
- `components/fileUpload/FileUploadButton.tsx`: Native upload UI

**Why Native File Picker in Week 1**:
- **App Store Compliance**: Shows app is not "just a website"
- **Better UX**: Native file picker is smoother than WebView
- **iOS WebView Bug**: `<input type="file">` doesn't work well in iOS WebView
- **User Value**: Mobile users want to upload photos/docs directly

**Implementation**:
```typescript
// services/fileUpload/nativeFilePicker.ts
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export async function pickFile() {
  // Request permissions
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Camera permission denied");
  }

  // Show picker
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
  });

  if (result.canceled) return null;

  // Upload to Convex storage
  const file = result.assets[0];
  return await uploadToConvex(file);
}

async function uploadToConvex(file: DocumentPicker.DocumentPickerAsset) {
  // Implement Convex storage upload
  // Use generateUploadUrl and uploadFile mutations
}
```

### Day 5: Push Notifications & OTA Updates

**Tasks**:
1. Set up push notifications with expo-notifications
2. Configure EAS Update for over-the-air updates
3. Implement notification token registration
4. Test push notification flow

**Push Notifications** (`services/push/pushService.ts`):
```typescript
import * as Notifications from "expo-notifications";
import { api } from "@convex/_generated/api";

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync();
  // Register token with Convex
  await convex.mutations.push.registerToken(token.data);
  return token.data;
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

**EAS Updates** (`app.json`):
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "enableBsdiffPatchSupport": true
    }
  }
}
```

**EAS Build Configuration** (`eas.json`):
```json
{
  "build": {
    "production": {
      "ios": {
        "image": "latest"
      },
      "android": {
        "image": "latest"
      }
    }
  }
}
```

**Note**: EAS Build defaults to Xcode 26.2 for SDK 55 profiles. Minimum Xcode version is 26.

**Why Push in Week 1**:
- Critical for async research workflows
- Differentiates from PWA
- Enables engagement (chat responses, generation completion)

### Day 6: Platform Detection & Web App Adaptations

**Tasks**:
1. Add platform detection utilities to web app
2. Implement `__IS_NATIVE_SHELL__` flag detection
3. Hide web navbar in native shell
4. Configure universal links / app links
5. Test deep linking and navigation

**Web App Updates**:
- `apps/web/src/utils/platformDetection.ts` (NEW): Platform detection utilities
- `apps/web/src/features/auth/AuthContext.tsx`: Read mobile auth token
- `apps/web/src/features/notebooks/components/views/NotebookView.tsx`: Hide navbar in native shell
- `apps/web/src/shared/ui/Header.tsx`: Conditional rendering for native shell

**Platform Detection Utility**:
```typescript
// apps/web/src/utils/platformDetection.ts
export const isNativeShell = (): boolean => {
  return typeof window !== "undefined" &&
         !!(window as any).__IS_NATIVE_SHELL__;
};

export const getMobileAuthToken = (): string | null => {
  if (!isNativeShell()) return null;
  return (window as any).__MOBILE_AUTH_TOKEN__ || null;
};
```

**Auth Context Update**:
```typescript
// apps/web/src/features/auth/AuthContext.tsx
import { getMobileAuthToken } from "@/utils/platformDetection";

export function AuthProvider({ children }) {
  // ... existing code

  useEffect(() => {
    if (isNativeShell()) {
      const mobileToken = getMobileAuthToken();
      if (mobileToken) {
        // Use mobile auth token instead of web session
        initializeConvexWithToken(mobileToken);
      }
    }
  }, []);

  // ... rest of implementation
}
```

### Day 7: App Assets & Universal Links

**Tasks**:
1. Design and create app icons
2. Create splash screens for all sizes
3. Configure universal links (iOS) and app links (Android)
4. Set up deep linking to notebooks
5. Internal TestFlight build

**Universal Links Configuration**:
```json
// apps/mobile/.well-known/apple-app-site-association
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.com.yourcompany.solomindlm"],
        "paths": ["/notebook/*", "/share/*"]
      }
    ]
  }
}
```

**Day 8-10: App Store Submission**

**Tasks**:
1. Write app store descriptions and keywords
2. Prepare screenshots and marketing materials
3. Configure app store listings
4. **Set up reviewer demo account** (Apple requirement)
5. **Write App Review notes** (test steps, native vs WebView explanations)
6. Ensure backend services are live during review
7. Submit to Apple App Store and Google Play
8. Set up TestFlight external testing

**Deliverables**:
- App icon (1024x1024 PNG)
- Splash screens for all screen sizes
- App store screenshots (6.5" and 5.5" iPhone)
- App descriptions and keywords
- Privacy policy URL
- **Reviewer demo account** (working credentials or demo mode)
- **App Review notes** (explanation of hybrid architecture, test steps)
- App store submission complete

**App Review Notes Template**:
```
SolomindLM is a hybrid app combining native mobile features with web-based content:

Native Features:
- Tab bar navigation (Home, Notebook, Settings)
- File upload with camera integration
- Push notifications for research updates
- Deep linking to shared notebooks

WebView Features:
- Notebook interface (chat, sources, studio)
- Settings and billing management
- Full access to web app features

Testing Steps:
1. Launch app → sign in with demo account [credentials]
2. Navigate to Home → select a notebook
3. In Notebook tab → try chat interface
4. Test sources → upload a document using native file picker
5. Test deep links → open shared notebook link

All in-app browsing uses WebKit-backed react-native-webview per Apple guidelines.
```

## Native Screen Migration Strategy

### Week 2-3: Native Chat Screen

**Priority**: High - streaming UX feels better in native

**Implementation**:
1. Create native chat screen with message list
2. Implement streaming message handling
3. Add keyboard-aware input
4. Integrate with existing Convex chat functions
5. Replace WebView chat screen

**Files**:
- `app/(tabs)/chat.tsx`: Replace with native implementation
- `components/chat/`: Native chat components
- `hooks/useChatStream.ts`: Chat streaming hook

**Convex Integration**:
```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function useChat(notebookId: string) {
  const messages = useQuery(api.chat.listMessages, { notebookId });
  const sendMessage = useMutation(api.chat.sendMessage);

  return { messages, sendMessage };
}
```

### Week 4: Native File Upload

**Priority**: High - camera and photo library integration

**Implementation**:
1. Create native file picker
2. Implement camera integration
3. Add photo library access
4. Progress tracking for uploads
5. Replace WebView upload functionality

**Files**:
- `components/sources/`: Native upload components
- `services/fileUpload.ts`: File upload service
- `hooks/useFileUpload.ts`: Upload hook

**Permissions** (SDK 55 approach):
```json
// app.json
{
  "expo": {
    "plugins": [
      ["expo-status-bar", { "style": "auto" }],
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera",
          "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow $(PRODUCT_NAME) to access your photos"
        }
      ]
    ]
  }
}
```

**iOS Permissions** (`ios/SolomindLMMobile/Info.plist`):
- `NSCameraUsageDescription`: Camera access for document scanning
- `NSPhotoLibraryUsageDescription`: Photo library access for uploads
- `NSPhotoLibraryAddUsageDescription`: Save generated content

**Android Permissions** (`android/app/src/main/AndroidManifest.xml`):
- `CAMERA`: Camera access
- `READ_MEDIA_IMAGES`: Read images (modern scoped storage)

**Note**: Edge-to-edge is mandatory on Android 16+. No manual `edgeToEdgeEnabled` needed. Use scoped storage APIs instead of legacy `WRITE_EXTERNAL_STORAGE`.

### Week 5-6: Native Sources Panel & Dashboard

**Priority**: Medium - better UX but not critical

**Implementation**:
1. Native sources list with better scrolling
2. Native dashboard with pull-to-refresh
3. Better performance for large lists
4. Swipe actions for source management

### Week 7+: Studio Panel & Advanced Features

**Priority**: Low - current WebView implementation works well

**Features**:
- Native studio output viewers
- Better rendering for reports, flashcards, etc.
- Advanced native features

## Critical Implementation Files

### Mobile App Core Files

**Configuration**:
- `apps/mobile/app.json`: Expo configuration with SDK 55 plugins
- `apps/mobile/eas.json`: Build configuration (Xcode 26+ for iOS)
- `apps/mobile/metro.config.js`: Minimal (SDK 55 auto-configures monorepos)
- `apps/mobile/package.json`: Dependencies
- `apps/mobile/tsconfig.json`: TypeScript configuration

**Core Components**:
- `apps/mobile/src/app/_layout.tsx`: Root navigator with providers + SafeAreaProvider
- `apps/mobile/src/app/(tabs)/_layout.tsx`: Tab navigator (3 tabs: Home, Notebook, Settings)
- `apps/mobile/src/app/(tabs)/index.tsx`: Native Home screen with notebooks list
- `apps/mobile/src/app/(tabs)/notebook.tsx`: WebView screen for notebook interface
- `apps/mobile/src/components/web/WebViewScreen.tsx`: WebView wrapper with sharedCookiesEnabled
- `apps/mobile/src/components/navigation/TabBar.tsx`: Custom tab bar UI (optional)

**Services**:
- `apps/mobile/src/services/convex/client.ts`: Convex client setup
- `apps/mobile/src/services/fileUpload/nativeFilePicker.ts`: Native file picker integration
- `apps/mobile/src/services/fileUpload/uploadService.ts`: Upload to Convex storage
- `apps/mobile/src/services/push/pushService.ts`: Push notification registration
- `apps/mobile/src/services/audio/audioService.ts`: Audio playback using expo-audio (NOT expo-av)
- `apps/mobile/src/utils/platformDetection.ts`: Platform utilities

**iOS Configuration**:
- `apps/mobile/ios/SolomindLMMobile/Info.plist`: iOS permissions (NSCameraUsageDescription, etc.)
- `.well-known/apple-app-site-association`: Universal links configuration

**Android Configuration**:
- `apps/mobile/android/app/src/main/AndroidManifest.xml`: Android permissions
- `apps/mobile/.well-known/assetlinks.json`: App links configuration

### Web App Updates

**Platform Detection** (NEW):
- `apps/web/src/utils/platformDetection.ts`: Platform detection utilities

**Auth Updates**:
- `apps/web/src/features/auth/AuthContext.tsx`: Read `__IS_NATIVE_SHELL__` flag (if needed)

**UI Adaptations**:
- `apps/web/src/features/notebooks/components/views/NotebookView.tsx`: Hide navbar in native shell
- `apps/web/src/shared/ui/Header.tsx`: Conditional rendering for native shell
- `apps/web/src/features/sources/components/`: Disable drag-drop, use native file picker

### Monorepo Configuration

**Root package.json**:
```json
{
  "workspaces": [
    "apps/*",
    "convex"
  ]
}
```

**Critical metro.config.js** (SDK 55+):
```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
```

**Important**: After creating this file, run `bunx expo start --clear` once to clear Metro cache. SDK 55+ auto-configures Metro for monorepos - no manual `watchFolders` needed.

## Testing Strategy

### Unit Testing
- Auth service tests
- Token storage tests
- Platform detection tests
- Convex integration tests

### Integration Testing
- WebView auth injection
- Tab navigation
- Deep linking
- Platform switching

### E2E Testing
- Auth flow (sign-in, sign-out)
- Navigation between tabs
- WebView loading and interaction
- Token persistence

### Performance Testing
- App load time (< 3 seconds)
- WebView load time (< 2 seconds)
- Memory usage (< 200MB)
- Crash rate (< 1%)

## Build & Deployment

### Development Build
```bash
cd apps/mobile
bunx expo start --dev-client
```

### Production Build (EAS)
```bash
bunx eas build --platform ios --production
bunx eas build --platform android --production
```

### Submit to App Stores
```bash
bunx eas submit --platform ios
bunx eas submit --platform android
```

## Success Metrics

**Week 1 Targets**:
- ✅ App store submission by Day 10
- ✅ Approval within 2-3 days (current average)
- ✅ First download by Day 15

**Performance Targets** (measured after profiling):
- App load time: < 3 seconds
- WebView load time: < 2 seconds
- Memory usage: Profile real usage (no artificial limit)
- Crash rate: < 1%

**App Store Compliance Requirements**:
- ✅ Native file upload/camera integration (not just WebView)
- ✅ Native push notifications
- ✅ Native tab bar navigation
- ✅ Platform-specific features (safe areas, haptics)
- ✅ No broken WebView functionality (iOS file input, etc.)
- ✅ All in-app browsing uses WebKit-backed react-native-webview (iOS)
- ✅ Reviewer demo account + App Review notes
- ✅ Backend services live during review

**Migration Metrics**:
- Track WebView performance
- Monitor user engagement per screen
- Identify native conversion candidates
- Measure native vs WebView performance

**Scope Reality Check**:
- This is a **submission MVP**, not a polished mobile platform
- Focus on app store approval and core functionality
- Defer experimental features (inbound share, widgets) to v2
- Progressive enhancement after launch

## Risk Mitigation

**App Store Rejection (2.1 App Completeness, 2.3 Metadata, 2.5.2 Self-contained)**: **CRITICAL RISK**
- **Mitigation**: Native file picker, camera, push notifications, native tabs, review notes
- **Testing**: TestFlight internal testing before submission
- **Fallback**: Add more native features if initial review fails
- **WebKit Requirement**: All in-app browsing must use WebKit-backed `react-native-webview` on iOS

**Auth Complexity**: WebView cookie persistence may have edge cases
- **Solution**: Test extensively on both iOS and Android, `@convex-dev/auth` RN is beta (avoid in v1)

**WebView Performance**: Some screens may perform poorly
- **Solution**: Performance monitoring, prioritize native conversion of high-usage screens

**iOS File Upload Bug**: WebView file input doesn't work well
- **Solution**: Native file picker in Week 1 (already planned)

**Metro Configuration**: SDK 55 auto-configures monorepos
- **Solution**: Keep Metro minimal, run `bunx expo start --clear` once after setup

**Platform Detection Race**: Web app may load before native flag
- **Solution**: Inject flag before any content loads via injectedJavaScript

**Maintenance Overhead**: Maintaining two platforms
- **Solution**: Maximize code reuse, EAS Updates for quick fixes, gradual migration

**Timeline Overruns**: First-time app store setup takes time
- **Solution**: Add buffer days, start Apple Developer/Google Play setup early

**Experimental Features**: `expo-sharing` inbound share is experimental
- **Solution**: Not in Week 1 critical path, defer to v2

## Verification

### Pre-Submission Checklist
- [ ] All auth flows work (sign-in, sign-out, cookie persistence)
- [ ] Tab navigation works smoothly
- [ ] WebView screens load correctly with sharedCookiesEnabled
- [ ] Native file picker works on both iOS and Android
- [ ] Camera integration works (permissions, upload to Convex)
- [ ] Push notifications registered and received
- [ ] Platform detection works in web app
- [ ] Deep linking works for notebook sharing (universal/app links)
- [ ] External links open in external browser
- [ ] iOS file input bug mitigated (native picker)
- [ ] Safe area handling works (notch, gesture bar)
- [ ] EAS Updates configured and tested
- [ ] Sentry crash reporting tested
- [ ] Performance meets targets
- [ ] No critical bugs
- [ ] App store assets complete (icons, splashes, screenshots)
- [ ] Privacy policy URL configured
- [ ] Terms of service URL configured

### iOS-Specific Testing
- [ ] Cookie persistence works with sharedCookiesEnabled
- [ ] File upload uses native picker (not WebView input)
- [ ] Universal links configured in apple-app-site-association
- [ ] Push notifications work on iOS devices
- [ ] Safe area insets handled correctly

### Android-Specific Testing
- [ ] Cookie persistence works per-domain
- [ ] File picker works with DocumentPicker
- [ ] App links configured in assetlinks.json
- [ ] Push notifications work on Android devices
- [ ] Permissions requested correctly

### Post-Launch Monitoring
- App store reviews and ratings
- Crash reports (Sentry)
- Performance metrics (EAS Update analytics)
- User feedback channels
- Analytics (screen usage, drop-off points, WebView vs native)

## Strategic Considerations

### Audio Player Opportunity

**Current Web Implementation**: The web app has excellent audio overview support with mini player
- `apps/web/src/features/audio/AudioPlayerContext.tsx`: Audio player context
- `apps/web/src/features/notebooks/components/views/NotebookView.tsx`: Mini player integration

**Mobile Native Audio Advantage**: Audio is genuinely better on mobile
- Headphones + walking/driving use cases
- Background playback with lock-screen controls
- Better UX than web audio API

**Recommendation**: Consider adding native audio player in Week 2-3
- Use `expo-audio@^55.0.0` (NOT `expo-av` - removed in SDK 55)
- Implement background mode for audio
- Add lock-screen controls with Now Playing center
- Hit existing TTS endpoint from Convex

**Implementation** (SDK 55):
```typescript
import { Audio } from 'expo-audio';

const audio = new Audio.AudioPlayer();
audio.addEventListener('PlaybackStateChange', (event) => {
  if (event.playingState === 'PLAYING') {
    // Handle playback state
  }
});
```

**Files to Reference**:
- `apps/web/src/features/audio/`: Existing audio implementation
- `convex/studio/audio/`: Convex audio generation functions

## References

**Existing Web Implementation**:
- `apps/web/src/App.tsx`: Router configuration
- `apps/web/src/features/auth/AuthContext.tsx`: Auth implementation
- `apps/web/src/features/notebooks/components/views/NotebookView.tsx`: Mobile tab navigation
- `convex/auth.ts`: Convex auth configuration

**Key Dependencies** (SDK 55):
- `expo@^55.0.0`
- `expo-router@^7.0.0` (v7 ships with SDK 55)
- `expo-secure-store@^55.0.0`
- `expo-notifications@^55.0.0`
- `expo-updates@^55.0.0` (with `enableBsdiffPatchSupport: true`)
- `expo-image-picker@^55.0.0`
- `expo-document-picker@^55.0.0`
- `expo-audio@^55.0.0` (NOT expo-av - removed in SDK 55)
- `react-native-webview@^14.1+` (New Architecture compatible, WebKit-backed on iOS)
- `convex@^1.31.6`
- `@sentry/react-native@^6.0.0`
- `react-native-safe-area-context@^4.x`

**Excluded from Week 1**:
- `expo-sharing` (inbound share is **experimental**, defer to v2)
- `expo-widgets` (alpha, not submission-critical)
- `@convex-dev/auth` (beta for RN, using WebView-based auth)
- Hermes v1 (Android monorepo issues, not blocking)

**New Architecture**:
- Mandatory in SDK 55 (Legacy Architecture dropped)
- All packages must be New Architecture compatible
- `react-native-webview@^14.1+` confirmed compatible

**Documentation**:
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [Expo SDK 55 Release Notes](https://blog.expo.dev/expo-sdk-55-0-0-28a21623d1e7)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)
- [Convex React Native](https://docs.convex.dev/client/react-native)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [iOS Universal Links](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content)
- [Android App Links](https://developer.android.com/training/app-links)

## SDK 55 Additions & Opportunities

### Week 2-3 Considerations (Not Week 1 Critical)

**expo-widgets (Alpha)**: iOS widgets + Live Activities without Swift
- "Research in Progress" live activity could be strong differentiator
- Uses `@expo/ui` SwiftUI components
- Alpha stage - not submission-critical

**expo-sharing (Inbound Share)**: Share PDFs from other apps directly into SolomindLM
- High-value for a research tool
- **Experimental** inbound share support in SDK 55
- iOS share extension opens main target in way Expo says is not officially supported by Apple
- Could stop working in future iOS release
- Use `+native-intent.ts` + `useIncomingShare()` if implementing
- Defer to v2 due to experimental status

**Hermes v1 (Opt-In)**: Performance gains but monorepo caution
- Performance improvements confirmed
- Avoid on Android in monorepos until [reactwg/react-native-releases#1235](https://github.com/reactwg/react-native-releases/issues/1235) resolved
- Consider for iOS only in v2

### Week 1 Infrastructure

**Expo MCP Server**: CI/CD debugging tools
- EAS Build, Workflows, TestFlight crash analysis tools
- Wire into Serena MCP workflow for debugging builds
- Available in SDK 55

**EAS Updates Bytecode Diffing**: ~75% smaller OTA updates
- Enable with `enableBsdiffPatchSupport: true`
- High value for WebView-heavy apps with frequent updates
- Available in SDK 55

## Architecture Decision: Go with Submission MVP

**Verdict**: ✅ **GO** - This architecture is realistic for fast first-store submission

**Critical Path Decisions**:
1. **WebView-first auth** (Week 1) - Avoids beta `@convex-dev/auth` RN, minimizes native auth surface
2. **Hybrid approach** - Native shell + WebView content gets to market quickly
3. **Scoped Week 1** - Focus on app store approval, defer experimental features

**Week 1 Scope (Kept)**:
- Native shell, 3 tabs, WebView notebook/settings
- Native file picker/camera
- Push notifications registration
- Sentry crash reporting
- Deep links/universal links
- App store assets
- Reviewer demo account + App Review notes

**Week 1 Scope (Removed/Delayed)**:
- ~~Inbound share~~ (experimental, iOS concerns)
- ~~Native auth~~ (beta status, WebView works)
- ~~Widgets~~ (alpha, not submission-critical)
- ~~Hermes v1~~ (Android monorepo issues)

**Biggest Remaining Risks**:
1. App Store rejection (2.1, 2.3, 2.5.2, 2.5.6) - mitigated with native features + review notes
2. Auth edge cases - extensive testing planned
3. Timeline overruns - buffer days added

**After Launch Strategy**:
- Gradual native conversion based on performance metrics
- Consider experimental features for v2
- Progressive enhancement, not big rewrites
- Let user feedback drive native investment