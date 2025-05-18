#pragma once

#include <memory>
#include <vector>
#include <string>
#include <sql.h>
#include <sqlext.h>
#include "odbc/bcp_plugin.h"
#include "odbc/bcp_storage.h"
#include "core/datum_storage.h"
#include "core/query_result.h"

namespace mssql {
    
    class BcpExecutor {
    private:
        std::shared_ptr<BcpPlugin> plugin;
        HDBC connection;
        std::string table_name;
        std::vector<std::shared_ptr<BcpStorage>> storage_buffers;
        bool initialized = false;
        
    public:
        BcpExecutor(std::shared_ptr<BcpPlugin> p, HDBC conn);
        ~BcpExecutor();
        
        // Initialize BCP for table
        bool init(const std::string& table, const std::vector<std::string>& columns = {});
        
        // Bind a column for bulk copy
        bool bindColumn(int column_num, 
                       const std::shared_ptr<DatumStorage>& storage,
                       const std::vector<SQLLEN>& indicators,
                       int sql_type,
                       size_t buffer_len);
        
        // Execute bulk copy
        std::pair<bool, std::string> execute();
        
        // Get number of rows sent
        int getRowCount() const;
        
    private:
        bool sendBatch();
        int mapSqlTypeToOdbcType(int sql_type);
    };
    
    // Factory function
    std::shared_ptr<BcpExecutor> createBcpExecutor(HDBC connection);
}