#include "odbc/bcp_plugin.h"
#include "odbc/OdbcError.h"
#include <sstream>

namespace mssql {
    
    // Initialize singleton instance
    std::shared_ptr<BcpPlugin> BcpPlugin::instance = nullptr;
    
    std::shared_ptr<BcpPlugin> BcpPlugin::getInstance() {
        if (!instance) {
            instance = std::shared_ptr<BcpPlugin>(new BcpPlugin());
        }
        return instance;
    }
    
    BcpPlugin::~BcpPlugin() {
        if (hinstLib) {
#ifdef LINUX_BUILD
            dlclose(hinstLib);
#else
            FreeLibrary((HMODULE)hinstLib);
#endif
        }
    }
    
    bool BcpPlugin::load(const std::string& shared_lib, std::vector<std::shared_ptr<OdbcError>>& errors) {
        if (loaded) return true; // Already loaded
        
#ifdef LINUX_BUILD
        hinstLib = dlopen(shared_lib.c_str(), RTLD_LAZY | RTLD_GLOBAL);
        if (!hinstLib) {
            const char* err = dlerror();
            errors.push_back(std::make_shared<OdbcError>("HY000", err ? err : "Unknown error", -1, 1, "", "", 0));
            return false;
        }
#else
        hinstLib = LoadLibraryA(shared_lib.c_str());
        if (!hinstLib) {
            DWORD error = GetLastError();
            std::stringstream ss;
            ss << "Failed to load library: " << shared_lib << " Error: " << error;
            errors.push_back(std::make_shared<OdbcError>("HY000", ss.str().c_str(), error, 1, "", "", 0));
            return false;
        }
#endif
        
        // On successful library load, mark as loaded
        // The actual symbol resolution will happen when functions are called
        loaded = true;
        return true;
    }
}