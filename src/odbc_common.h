#pragma once

#include "platform.h"

// Common ODBC utility functions and constants
namespace mssql {

    using namespace std;

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


    class odbcstr {
        public:
        static string swcvec2str(vector<SQLWCHAR> &v, const size_t l)
        {
            vector<char> c_str;
            c_str.reserve(l + 1);
            c_str.resize(l + 1);
            constexpr auto c = static_cast<int>(sizeof(SQLWCHAR));
            const auto *ptr = reinterpret_cast<const char *>(v.data());
            for (size_t i = 0, j = 0; i < l * c; i += c, j++)
            {
                c_str[j] = ptr[i];
            }
            if (l > 0)
                c_str.resize(l - 1);
            string s(c_str.data());
            return s;
        }
	};

}