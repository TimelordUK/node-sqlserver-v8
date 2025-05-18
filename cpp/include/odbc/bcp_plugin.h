#pragma once

#include <memory>
#include <vector>
#include <string>
#include <type_traits>

#ifdef LINUX_BUILD
#include <dlfcn.h>
#endif

#ifdef WINDOWS_BUILD
#include <windows.h>
#endif

#include <sql.h>
#include <sqlext.h>

#ifdef WINDOWS_BUILD
#include <sqlncli.h>
#else
#include <sqlncli-linux.h>
#endif

namespace mssql {
    
    class OdbcError;
    
    // BCP constants are already defined in msodbcsql.h
    // DB_IN = 1, DB_OUT = 2, SQL_VARLEN_DATA = -10

    // BCP function signatures
    typedef RETCODE (*plug_bcp_init)(HDBC, const SQLWCHAR*, const SQLWCHAR*, const SQLWCHAR*, int);
    typedef RETCODE (*plug_bcp_bind)(HDBC, const void*, int, SQLLEN, const void*, int, int, int);
    typedef SQLLEN (*plug_bcp_sendrow)(HDBC);
    typedef SQLLEN (*plug_bcp_done)(HDBC);
    typedef RETCODE (*plug_bcp_batch)(HDBC);
    typedef RETCODE (*plug_bcp_control)(HDBC, int, void*);

    class BcpPlugin {
    private:
        void* hinstLib = nullptr;
        static std::shared_ptr<BcpPlugin> instance;
        bool loaded = false;
        
        // Private constructor for singleton
        BcpPlugin() = default;
        
    public:
        ~BcpPlugin();
        
        // Singleton access
        static std::shared_ptr<BcpPlugin> getInstance();
        
        bool load(const std::string& shared_lib, std::vector<std::shared_ptr<OdbcError>>& errors);
        bool isLoaded() const { return loaded; }
        
        // Template method to get function pointers
        template<typename FuncType>
        FuncType getFunction() const {
            if (!hinstLib) return nullptr;
            
            std::string func_name;
            if (std::is_same<FuncType, plug_bcp_init>::value) func_name = "bcp_initW";
            else if (std::is_same<FuncType, plug_bcp_bind>::value) func_name = "bcp_bind";
            else if (std::is_same<FuncType, plug_bcp_sendrow>::value) func_name = "bcp_sendrow";
            else if (std::is_same<FuncType, plug_bcp_done>::value) func_name = "bcp_done";
            else if (std::is_same<FuncType, plug_bcp_batch>::value) func_name = "bcp_batch";
            else if (std::is_same<FuncType, plug_bcp_control>::value) func_name = "bcp_control";
            else return nullptr;
            
#ifdef LINUX_BUILD
            void* func = dlsym(hinstLib, func_name.c_str());
            if (!func) {
                const char* error = dlerror();
                // For debugging:
                // std::cout << "Failed to load " << func_name << ": " << (error ? error : "unknown error") << std::endl;
            }
            return reinterpret_cast<FuncType>(func);
#else
            return reinterpret_cast<FuncType>(GetProcAddress(reinterpret_cast<HMODULE>(hinstLib), func_name.c_str()));
#endif
        }
    };
}