// src/module-bridge.ts
import { NativeModule, loadNativeModule } from './native-module'

// Load the native module
const nativeModule: NativeModule = loadNativeModule()

// Re-export everything from the native module
export default nativeModule
export const Connection = nativeModule.Connection
export const setLogLevel = nativeModule.setLogLevel
export const enableConsoleLogging = nativeModule.enableConsoleLogging
export const setLogFile = nativeModule.setLogFile

// Re-export all types from native-module.ts
export * from './native-module'
