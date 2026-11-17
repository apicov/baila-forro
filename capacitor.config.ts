import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'xyz.apicov.forro',
  appName: 'Pico Forró',
  webDir: 'dist',
  android: {
    // Android 15 draws apps edge to edge: keep the web view clear of the status and navigation bars
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
