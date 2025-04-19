#pragma once

#include "platform.h"

// Common ODBC utility functions and constants
namespace mssql {

    // ODBC Environment helper function
    inline bool CheckSQLError(SQLRETURN ret) {
        return SQL_SUCCEEDED(ret);
    }
    
    // Helper class for RAII-style mutex locking
    class ScopedMutexLock {
    public:
        explicit ScopedMutexLock(PlatformMutex& mutex) : mutex_(mutex) {
            LockMutex(&mutex_);
        }
        
        ~ScopedMutexLock() {
            UnlockMutex(&mutex_);
        }
        
        // Prevent copying
        ScopedMutexLock(const ScopedMutexLock&) = delete;
        ScopedMutexLock& operator=(const ScopedMutexLock&) = delete;
        
    private:
        PlatformMutex& mutex_;
    };
    
    // Helper for UTF-8 to UTF-16 conversion
    inline std::vector<uint16_t> ConvertToUTF16(const std::string& utf8String) {
        std::vector<uint16_t> utf16String;
        
        #ifdef PLATFORM_WINDOWS
            // Windows implementation using MultiByteToWideChar
            int length = MultiByteToWideChar(CP_UTF8, 0, utf8String.c_str(), -1, nullptr, 0);
            if (length > 0) {
                utf16String.resize(length);
                MultiByteToWideChar(CP_UTF8, 0, utf8String.c_str(), -1, 
                                  reinterpret_cast<LPWSTR>(utf16String.data()), length);
                // Remove null terminator if present
                if (!utf16String.empty() && utf16String.back() == 0) {
                    utf16String.pop_back();
                }
            }
        #else
            // Cross-platform implementation using C++11 codecvt
            std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
            std::u16string utf16 = converter.from_bytes(utf8String);
            utf16String.assign(
                reinterpret_cast<const uint16_t*>(utf16.data()),
                reinterpret_cast<const uint16_t*>(utf16.data() + utf16.size())
            );
        #endif
        
        return utf16String;
    }
    
    #ifdef PLATFORM_WINDOWS
    // Convert wide string to UTF-8
    inline std::string ConvertToUTF8(const std::wstring& wstr) {
        if (wstr.empty()) return std::string();
        
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, 
                                             wstr.c_str(), 
                                             static_cast<int>(wstr.size()),
                                             nullptr, 0, nullptr, nullptr);
        
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), 
                          static_cast<int>(wstr.size()),
                          &strTo[0], size_needed, 
                          nullptr, nullptr);
        
        return strTo;
    }
#endif
}